import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export function signAccess(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, config.jwtSecret, {
    expiresIn: config.accessTtl,
  });
}

export function signRefresh(user) {
  return jwt.sign({ sub: String(user._id), type: "refresh", jti: crypto.randomUUID() }, config.refreshSecret, {
    expiresIn: config.refreshTtl,
  });
}

export const verifyAccess = (token) => jwt.verify(token, config.jwtSecret);

export function verifyRefresh(token) {
  const payload = jwt.verify(token, config.refreshSecret);
  if (payload.type !== "refresh") throw new Error("Not a refresh token");
  return payload;
}

// Issues a new access/refresh pair and remembers the refresh token's hash.
// `replacedHash` removes the token being rotated out. Keeps the latest 5 devices.
export async function startSession(user, replacedHash) {
  const token = signAccess(user);
  const refreshToken = signRefresh(user);
  const kept = (user.refreshHashes || []).filter((h) => h !== replacedHash);
  user.refreshHashes = [...kept, hashToken(refreshToken)].slice(-5);
  await user.save();
  return { token, refreshToken };
}
