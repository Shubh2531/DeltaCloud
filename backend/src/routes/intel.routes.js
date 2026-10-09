import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { explain, intelStatus, IntelError } from "../services/intel.js";
import { LIMITS, apiKey } from "../lib/limits.js";

const router = Router();
router.use(requireAuth);

// Each signed-in person can ask a limited number of questions, so one person can't use up
// the shared daily AI budget.
router.use(
  "/explain",
  rateLimit({
    ...LIMITS.intelPerUser,
    keyGenerator: apiKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "You've asked a lot of questions in a short time. Take a short break and try again." },
  })
);

router.get("/status", (req, res) => res.json({ ok: true, ...intelStatus() }));

// POST { symbol: "BTCUSDT" | "AAPL", question?: "Why is it down today?" }
router.post("/explain", async (req, res, next) => {
  const symbol = String(req.body?.symbol || "").trim().toUpperCase();
  const question = typeof req.body?.question === "string" ? req.body.question : "";
  try {
    res.json({ ok: true, ...(await explain(symbol, question)) });
  } catch (err) {
    if (err instanceof IntelError) return res.status(err.status).json({ ok: false, message: err.message });
    next(err);
  }
});

export default router;
