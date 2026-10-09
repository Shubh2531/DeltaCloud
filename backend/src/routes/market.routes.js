import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { feed } from "../services/feed.js";
import { getCandles, stockStatus, FEATURED_STOCKS } from "../services/stocks.js";
import { pricesFor, liveSnapshot } from "../services/prices.js";
import { getMarket, isSymbol, isStock, searchMarkets, marketCount, SYMBOLS } from "../lib/symbols.js";
import { computeInsights } from "../lib/indicators.js";

const router = Router();
router.use(requireAuth);

const DISCLAIMER =
  "These readings describe recent price movement using simple rules. They are for education only, do not predict what happens next, and are not investment advice.";

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicMarket = (m) => ({ id: m.id, kind: m.kind, name: m.name, base: m.base, exchange: m.exchange, tv: m.tv });

// Popular markets first: core coins, featured stocks, then coins by trading volume.
const rank = (id) => {
  const core = SYMBOLS.indexOf(id);
  if (core >= 0) return core;
  const featured = FEATURED_STOCKS.indexOf(id);
  if (featured >= 0) return 10 + featured;
  const vol = feed.dayVolume(id);
  return vol > 0 ? 1e6 / (1 + Math.log10(vol)) : 1e9;
};

// Search markets: ?q=apple&kind=stock|crypto&limit=20. Results include a price when one is
// already known (coins always; stocks only if recently fetched, to save stock-data credits).
router.get("/symbols", (req, res) => {
  const kind = req.query.kind === "stock" || req.query.kind === "crypto" ? req.query.kind : undefined;
  const list = searchMarkets({ q: req.query.q || "", kind, limit: req.query.limit || 20, rank });
  const prices = { ...feed.quotes(list.map((m) => m.id)), ...liveSnapshot().prices };
  res.json({
    ok: true,
    counts: { crypto: marketCount("crypto"), stock: marketCount("stock") },
    stocks: stockStatus(),
    symbols: list.map((m) => ({ ...publicMarket(m), price: prices[m.id] || null })),
  });
});

// One market's details.
router.get("/symbol/:id", (req, res) => {
  const m = getMarket(String(req.params.id).toUpperCase());
  if (!m) return res.status(404).json({ ok: false, message: "Unknown market." });
  res.json({ ok: true, market: publicMarket(m) });
});

// Without ?symbols: the featured live snapshot (same as the socket push).
// With ?symbols=A,B (up to 50): prices for exactly those markets, coins and stocks.
router.get(
  "/prices",
  ah(async (req, res) => {
    if (!req.query.symbols) return res.json({ ok: true, ...liveSnapshot() });
    const ids = String(req.query.symbols)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(isSymbol)
      .slice(0, 50);
    res.json({ ok: true, mode: feed.mode, ts: Date.now(), prices: await pricesFor(ids) });
  })
);

// Recent price points [{ t, p }] for mini charts and insights.
async function historyFor(symbol, limit) {
  if (isStock(symbol)) {
    const candles = await getCandles(symbol, "5min").catch(() => []);
    return candles.map((c) => ({ t: c.t, p: c.c })).slice(-limit);
  }
  return feed.getHistory(symbol, limit);
}

router.get(
  "/history/:symbol",
  ah(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    if (!isSymbol(symbol)) return res.status(404).json({ ok: false, message: "Unknown symbol." });
    res.json({ ok: true, mode: feed.mode, points: await historyFor(symbol, 150) });
  })
);

router.get(
  "/insights/:symbol",
  ah(async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    if (!isSymbol(symbol)) return res.status(404).json({ ok: false, message: "Unknown symbol." });
    const insights = computeInsights(await historyFor(symbol, 900));
    res.json({
      ok: true,
      symbol,
      name: getMarket(symbol).name,
      mode: feed.mode,
      disclaimer: DISCLAIMER,
      insights,
    });
  })
);

export default router;
