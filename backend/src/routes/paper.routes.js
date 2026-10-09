import { Router } from "express";
import PaperAccount, { STARTING_CASH } from "../models/PaperAccount.js";
import TradeLog from "../models/TradeLog.js";
import { requireAuth } from "../middleware/auth.js";
import { feed } from "../services/feed.js";
import { isSymbol } from "../lib/symbols.js";
import { parseQty } from "../lib/validators.js";
import { executeOrder, TradeError } from "../lib/paperMath.js";
import {
  openLeverage,
  closeLeverage,
  settleLiquidations,
  positionPnl,
  LEVERAGE_OPTIONS,
} from "../lib/leverageMath.js";
import {
  spotEntry,
  leverageOpenEntry,
  leverageCloseEntry,
  resetEntry,
  legacyEntries,
  summarize,
  toCsv,
  flushOutbox,
  KIND_MARKET,
} from "../lib/journal.js";

const router = Router();
router.use(requireAuth);

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message) => res.status(status).json({ ok: false, message });

// Copies the account's pending journal entries into the TradeLog collection, then removes
// exactly those entries from the outbox. Each entry has a unique eventId, so if this runs
// twice for the same entry (a retry, or two requests at once) the second copy is ignored.
// If the copy fails, the entries stay in the outbox and the next request tries again.
function flushJournal(account) {
  return flushOutbox(account.journalOutbox, {
    user: account.user,
    insertMany: (docs) => TradeLog.insertMany(docs, { ordered: false }),
    removeFromOutbox: (ids) =>
      PaperAccount.updateOne({ _id: account._id }, { $pull: { journalOutbox: { eventId: { $in: ids } } } }),
    onError: (err) => console.error("Trade journal write failed; will retry on next request:", err.message),
  });
}

async function getAccount(userId) {
  let account = await PaperAccount.findOne({ user: userId });
  if (!account) {
    try {
      account = await PaperAccount.create({ user: userId, journalBackfilled: true });
    } catch (err) {
      if (err.code !== 11000) throw err; // created by a parallel request
      account = await PaperAccount.findOne({ user: userId });
    }
  }

  // One time per account: copy history recorded before the journal existed.
  if (!account.journalBackfilled) {
    for (const e of legacyEntries(account)) account.journalOutbox.push(e);
    account.journalBackfilled = true;
    try {
      await account.save();
    } catch (err) {
      if (err.name !== "VersionError") throw err;
    }
    account = await PaperAccount.findOne({ user: userId });
  }

  // Anything left over from an earlier failed copy goes first.
  if (account.journalOutbox?.length) {
    if (await flushJournal(account)) account = await PaperAccount.findOne({ user: userId });
  }
  return account;
}

const journalCtx = (account) => ({ cashAfter: account.cash, mode: feed.mode });

// Settles any position whose liquidation level the market has already crossed, using the
// latest snapshot. Saves and returns true only when something actually changed, so routes
// that don't need to re-read prices (like placing a spot order) can skip this.
async function settleAccount(account) {
  const prices = {};
  for (const [symbol, v] of Object.entries(feed.snapshot().prices)) prices[symbol] = v.c;
  const result = settleLiquidations(
    { cash: account.cash, leveragePositions: account.leveragePositions.map((p) => p.toObject?.() ?? p) },
    prices
  );
  if (!result) return false;
  account.cash = result.cash;
  account.leveragePositions = result.leveragePositions;
  account.leverageHistory.push(...result.liquidated);
  if (account.leverageHistory.length > 100) account.leverageHistory.splice(0, account.leverageHistory.length - 100);
  for (const p of result.liquidated) account.journalOutbox.push(leverageCloseEntry(p, journalCtx(account)));
  await account.save();
  await flushJournal(account);
  return true;
}

const view = (account) => {
  const prices = feed.snapshot().prices;
  return {
    startingCash: account.startingCash,
    cash: account.cash,
    holdings: account.holdings.map((h) => ({ symbol: h.symbol, qty: h.qty, avgCost: h.avgCost })),
    orders: account.orders
      .slice(-50)
      .reverse()
      .map((o) => ({
        id: String(o._id),
        symbol: o.symbol,
        side: o.side,
        qty: o.qty,
        price: o.price,
        total: o.total,
        realizedPnl: o.realizedPnl,
        at: o.at,
      })),
    leverageOptions: LEVERAGE_OPTIONS,
    leveragePositions: account.leveragePositions.map((p) => {
      const mark = prices[p.symbol]?.c;
      const priced = Number.isFinite(mark);
      const markPrice = priced ? mark : p.entryPrice;
      const pnl = positionPnl(p, markPrice);
      return {
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        qty: p.qty,
        entryPrice: p.entryPrice,
        leverage: p.leverage,
        margin: p.margin,
        liqPrice: p.liqPrice,
        openedAt: p.openedAt,
        markPrice,
        priced,
        pnl,
        pnlPct: p.margin ? (pnl / p.margin) * 100 : 0,
        equity: Math.max(0, p.margin + pnl),
      };
    }),
    leverageHistory: account.leverageHistory
      .slice(-50)
      .reverse()
      .map((p) => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        qty: p.qty,
        entryPrice: p.entryPrice,
        leverage: p.leverage,
        margin: p.margin,
        closePrice: p.closePrice,
        pnl: p.pnl,
        reason: p.reason,
        openedAt: p.openedAt,
        closedAt: p.closedAt,
      })),
  };
};

router.get(
  "/account",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
    await settleAccount(account);
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

router.post(
  "/orders",
  ah(async (req, res) => {
    const symbol = String(req.body?.symbol || "").toUpperCase();
    const side = String(req.body?.side || "").toUpperCase();
    const qty = parseQty(req.body?.qty);
    if (!isSymbol(symbol)) return fail(res, 400, "Choose a supported market.");
    if (side !== "BUY" && side !== "SELL") return fail(res, 400, "Choose buy or sell.");
    if (qty === null) return fail(res, 400, "Enter a valid quantity.");

    // The server decides the price. A client-supplied price is never trusted.
    const price = feed.getPrice(symbol);
    if (!price) return fail(res, 503, "Prices are unavailable right now. Try again in a moment.");

    const account = await getAccount(req.userId);
    let result;
    try {
      result = executeOrder(
        {
          cash: account.cash,
          holdings: account.holdings.map((h) => ({ symbol: h.symbol, qty: h.qty, avgCost: h.avgCost })),
        },
        { symbol, side, qty, price }
      );
    } catch (err) {
      if (err instanceof TradeError) return fail(res, err.status, err.message);
      throw err;
    }

    account.cash = result.cash;
    account.holdings = result.holdings;
    const at = new Date();
    account.orders.push({ ...result.order, at });
    if (account.orders.length > 200) account.orders.splice(0, account.orders.length - 200);
    account.journalOutbox.push(spotEntry(result.order, { ...journalCtx(account), at }));

    try {
      await account.save();
    } catch (err) {
      if (err.name === "VersionError") {
        return fail(res, 409, "Your account changed at the same moment. Please try again.");
      }
      throw err;
    }
    await flushJournal(account);
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

router.post(
  "/leverage/open",
  ah(async (req, res) => {
    const symbol = String(req.body?.symbol || "").toUpperCase();
    const side = String(req.body?.side || "").toUpperCase();
    const marginUsd = Number(req.body?.marginUsd);
    const leverage = Number(req.body?.leverage);
    if (!isSymbol(symbol)) return fail(res, 400, "Choose a supported market.");

    const price = feed.getPrice(symbol);
    if (!price) return fail(res, 503, "Prices are unavailable right now. Try again in a moment.");

    const account = await getAccount(req.userId);
    await settleAccount(account);

    let result;
    try {
      result = openLeverage(
        { cash: account.cash, leveragePositions: account.leveragePositions.map((p) => p.toObject?.() ?? p) },
        { symbol, side, marginUsd, leverage, price, nextId: String(++account.leverageSeq) }
      );
    } catch (err) {
      if (err instanceof TradeError) return fail(res, err.status, err.message);
      throw err;
    }

    account.cash = result.cash;
    account.leveragePositions = result.leveragePositions;
    account.journalOutbox.push(leverageOpenEntry(result.position, journalCtx(account)));

    try {
      await account.save();
    } catch (err) {
      if (err.name === "VersionError") {
        return fail(res, 409, "Your account changed at the same moment. Please try again.");
      }
      throw err;
    }
    await flushJournal(account);
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

router.post(
  "/leverage/close",
  ah(async (req, res) => {
    const id = String(req.body?.id || "");
    if (!id) return fail(res, 400, "Choose a position to close.");

    const account = await getAccount(req.userId);
    await settleAccount(account);

    const position = account.leveragePositions.find((p) => p.id === id);
    if (!position) return fail(res, 404, "That position isn't open. It may already be closed.");

    const price = feed.getPrice(position.symbol);
    if (!price) return fail(res, 503, "Prices are unavailable right now. Try again in a moment.");

    let result;
    try {
      result = closeLeverage(
        { cash: account.cash, leveragePositions: account.leveragePositions.map((p) => p.toObject?.() ?? p) },
        { id, price }
      );
    } catch (err) {
      if (err instanceof TradeError) return fail(res, err.status, err.message);
      throw err;
    }

    account.cash = result.cash;
    account.leveragePositions = result.leveragePositions;
    account.leverageHistory.push(result.closed);
    if (account.leverageHistory.length > 100) account.leverageHistory.splice(0, account.leverageHistory.length - 100);
    account.journalOutbox.push(leverageCloseEntry(result.closed, journalCtx(account)));

    try {
      await account.save();
    } catch (err) {
      if (err.name === "VersionError") {
        return fail(res, 409, "Your account changed at the same moment. Please try again.");
      }
      throw err;
    }
    await flushJournal(account);
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

// ---- Trade journal: the full, permanent history ----

const JOURNAL_FIELDS =
  "eventId kind market symbol side qty price entryPrice total leverage margin liqPrice pnl cashAfter positionId openedAt mode at";

function journalFilter(userId, query) {
  const filter = { user: userId };
  const market = String(query.market || "");
  if (market === "spot" || market === "leverage" || market === "account") filter.market = market;
  const symbol = String(query.symbol || "").toUpperCase();
  if (symbol && isSymbol(symbol)) filter.symbol = symbol;
  const kind = String(query.kind || "").toUpperCase();
  if (KIND_MARKET[kind]) filter.kind = kind;
  return filter;
}

const shapeEntry = (e) => ({
  id: String(e._id),
  eventId: e.eventId,
  kind: e.kind,
  market: e.market,
  symbol: e.symbol,
  side: e.side,
  qty: e.qty,
  price: e.price,
  entryPrice: e.entryPrice,
  total: e.total,
  leverage: e.leverage,
  margin: e.margin,
  liqPrice: e.liqPrice,
  pnl: e.pnl,
  cashAfter: e.cashAfter,
  positionId: e.positionId,
  openedAt: e.openedAt,
  mode: e.mode,
  at: e.at,
});

// Newest first, one page at a time. Pass the returned `next` as `before` for the next page.
router.get(
  "/journal",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
    await settleAccount(account);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = journalFilter(req.userId, req.query);
    const before = String(req.query.before || "");
    if (before) {
      const [atMs, id] = before.split("_");
      const at = new Date(Number(atMs));
      if (!Number.isFinite(at.getTime()) || !/^[a-f0-9]{24}$/.test(id || "")) {
        return fail(res, 400, "That page link is not valid.");
      }
      filter.$or = [{ at: { $lt: at } }, { at, _id: { $lt: id } }];
    }
    const rows = await TradeLog.find(filter, JOURNAL_FIELDS)
      .sort({ at: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    res.json({
      ok: true,
      items: page.map(shapeEntry),
      next: rows.length > limit && last ? `${new Date(last.at).getTime()}_${last._id}` : null,
    });
  })
);

router.get(
  "/journal/summary",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
    await settleAccount(account);
    const rows = await TradeLog.find({ user: req.userId }, "kind market symbol side total pnl at").lean();
    res.json({ ok: true, summary: summarize(rows) });
  })
);

router.get(
  "/journal/export",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
    await settleAccount(account);
    const rows = await TradeLog.find(journalFilter(req.userId, req.query), JOURNAL_FIELDS)
      .sort({ at: -1, _id: -1 })
      .lean();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="deltacloud-trades-${stamp}.csv"`);
    res.send(toCsv(rows));
  })
);

router.post(
  "/reset",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
    account.cash = STARTING_CASH;
    account.startingCash = STARTING_CASH;
    account.holdings = [];
    account.orders = [];
    account.leveragePositions = [];
    account.leverageHistory = [];
    account.leverageSeq = 0;
    account.journalOutbox.push(resetEntry(journalCtx(account)));
    await account.save();
    await flushJournal(account);
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

export default router;
