import { Router } from "express";
import PaperAccount, { STARTING_CASH } from "../models/PaperAccount.js";
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

const router = Router();
router.use(requireAuth);

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message) => res.status(status).json({ ok: false, message });

async function getAccount(userId) {
  let account = await PaperAccount.findOne({ user: userId });
  if (!account) {
    try {
      account = await PaperAccount.create({ user: userId });
    } catch (err) {
      if (err.code !== 11000) throw err; // created by a parallel request
      account = await PaperAccount.findOne({ user: userId });
    }
  }
  return account;
}

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
  await account.save();
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
    account.orders.push({ ...result.order, at: new Date() });
    if (account.orders.length > 200) account.orders.splice(0, account.orders.length - 200);

    try {
      await account.save();
    } catch (err) {
      if (err.name === "VersionError") {
        return fail(res, 409, "Your account changed at the same moment. Please try again.");
      }
      throw err;
    }
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

    try {
      await account.save();
    } catch (err) {
      if (err.name === "VersionError") {
        return fail(res, 409, "Your account changed at the same moment. Please try again.");
      }
      throw err;
    }
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

    try {
      await account.save();
    } catch (err) {
      if (err.name === "VersionError") {
        return fail(res, 409, "Your account changed at the same moment. Please try again.");
      }
      throw err;
    }
    res.json({ ok: true, mode: feed.mode, account: view(account) });
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
    await account.save();
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

export default router;
