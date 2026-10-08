import { verifyAccess } from "../services/tokens.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "Sign in to continue." });
  try {
    req.userId = verifyAccess(token).sub;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Your session has expired. Sign in again." });
  }
}
