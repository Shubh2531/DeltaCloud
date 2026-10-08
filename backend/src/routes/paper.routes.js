import { Router } from "express";
import PaperAccount, { STARTING_CASH } from "../models/PaperAccount.js";
import { requireAuth } from "../middleware/auth.js";
import { feed } from "../services/feed.js";
import { isSymbol } from "../lib/symbols.js";
import { parseQty } from "../lib/validators.js";
import { executeOrder, TradeError } from "../lib/paperMath.js";

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

const view = (account) => ({
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
});

router.get(
  "/account",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
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
  "/reset",
  ah(async (req, res) => {
    const account = await getAccount(req.userId);
    account.cash = STARTING_CASH;
    account.startingCash = STARTING_CASH;
    account.holdings = [];
    account.orders = [];
    await account.save();
    res.json({ ok: true, mode: feed.mode, account: view(account) });
  })
);

export default router;
