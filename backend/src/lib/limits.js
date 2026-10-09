// Rate-limit settings and keys.
//
// Many people can share one public IP address: a whole campus on the same Wi-Fi,
// an office, a mobile carrier. If limits are counted per IP alone, one busy
// classroom uses up everyone's allowance. So sign-in limits are counted per
// person (IP + the email they typed), with a much higher per-IP ceiling on top
// that only stops floods. Guessing codes is separately capped at 5 tries per
// code (see services/otp.js), so per-person counting doesn't weaken that.

export const LIMITS = {
  // Every /api request, counted per signed-in person (or per IP when signed out).
  apiPerClient: { windowMs: 60_000, limit: 300 },
  // Every /api request from one IP, however many people share it.
  apiPerIp: { windowMs: 60_000, limit: 5_000 },
  // Sign-in, sign-up and code steps, per person (IP + email).
  authPerPerson: { windowMs: 15 * 60_000, limit: 20 },
  // Sign-in, sign-up and code steps from one IP: enough for a large room signing up at once.
  authPerIp: { windowMs: 15 * 60_000, limit: 2_000 },
};

const clip = (value, max) => String(value ?? "").slice(0, max);

// The email the person typed, lightly cleaned. Not validated here; routes do that.
export function emailOf(req) {
  return clip(req?.body?.email, 254).trim().toLowerCase();
}

export function ipOf(req) {
  return clip(req?.ip || req?.socket?.remoteAddress || "unknown", 64);
}

// Key for the sign-in limits: one bucket per person on a given network.
export function authKey(req) {
  return `${ipOf(req)}|${emailOf(req)}`;
}

// Key for general API limits: the signed-in session if there is one, otherwise the IP.
// The token is only used as a label here (it is verified by the routes), and only
// its tail is kept so keys stay short.
export function apiKey(req) {
  const header = String(req?.headers?.authorization || "");
  const match = /^Bearer\s+(\S{20,})$/i.exec(header);
  return match ? `t:${match[1].slice(-32)}` : `ip:${ipOf(req)}`;
}
