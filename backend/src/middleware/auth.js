import { verifyAccess } from "../services/tokens.js";
import { markActive } from "../services/growth.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "Sign in to continue." });
  try {
    req.userId = verifyAccess(token).sub;
    markActive(req.userId); // counts this person as active today (once per day, never blocks)
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Your session has expired. Sign in again." });
  }
}
