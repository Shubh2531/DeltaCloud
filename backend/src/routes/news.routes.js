import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { queryNews, newsMeta } from "../services/news.js";
import { isSymbol } from "../lib/symbols.js";

const router = Router();
router.use(requireAuth);

const DISCLAIMER =
  "Headlines and short snippets come from the publishers named on each story, and every story links to the original. Tone and tags are simple word rules, not predictions or advice.";

router.get("/", (req, res) => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
  if (symbol && !isSymbol(symbol)) return res.status(400).json({ ok: false, message: "Unknown market." });
  const sort = req.query.sort === "latest" ? "latest" : "top";
  const items = queryNews({ topic: req.query.topic ? String(req.query.topic) : undefined, symbol, q: req.query.q, limit: req.query.limit, sort });
  res.json({ ok: true, disclaimer: DISCLAIMER, ...newsMeta(), items });
});

export default router;
