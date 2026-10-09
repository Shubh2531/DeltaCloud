import { Router } from "express";
import User from "../models/User.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { inviteInfo, publicStats, founderMetrics } from "../services/growth.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Public: total confirmed users, for the landing page counter. Cached for a minute.
router.get(
  "/public",
  ah(async (req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json({ ok: true, ...(await publicStats()) });
  })
);

// Your own invite link and how many friends joined through it.
router.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const info = await inviteInfo(req.userId);
    if (!info) return res.status(404).json({ ok: false, message: "Account not found." });
    res.json({ ok: true, ...info, link: `${config.publicSiteUrl}/r/${info.code}` });
  })
);

async function requireFounder(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("email").lean();
    if (user && config.founderEmails.includes(String(user.email).toLowerCase())) return next();
    return res.status(404).json({ ok: false, message: "Not found." });
  } catch (err) {
    return next(err);
  }
}

// Founder only: the numbers for YC. Anyone else gets a plain "not found".
router.get(
  "/founder",
  requireAuth,
  requireFounder,
  ah(async (req, res) => {
    res.json({ ok: true, ...(await founderMetrics()) });
  })
);

export default router;
