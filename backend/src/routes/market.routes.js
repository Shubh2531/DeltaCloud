import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { feed } from "../services/feed.js";
import { SYMBOL_META, isSymbol } from "../lib/symbols.js";
import { computeInsights } from "../lib/indicators.js";

const router = Router();
router.use(requireAuth);

const DISCLAIMER =
  "These readings describe recent price movement using simple rules. They are for education only, do not predict what happens next, and are not investment advice.";

router.get("/symbols", (req, res) => {
  res.json({
    ok: true,
    symbols: Object.entries(SYMBOL_META).map(([id, m]) => ({ id, name: m.name, base: m.base })),
  });
});

router.get("/prices", (req, res) => {
  res.json({ ok: true, ...feed.snapshot() });
});

router.get("/history/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!isSymbol(symbol)) return res.status(404).json({ ok: false, message: "Unknown symbol." });
  res.json({ ok: true, mode: feed.mode, points: feed.getHistory(symbol, 150) });
});

router.get("/insights/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!isSymbol(symbol)) return res.status(404).json({ ok: false, message: "Unknown symbol." });
  const insights = computeInsights(feed.getHistory(symbol));
  res.json({
    ok: true,
    symbol,
    name: SYMBOL_META[symbol].name,
    mode: feed.mode,
    disclaimer: DISCLAIMER,
    insights,
  });
});

export default router;
