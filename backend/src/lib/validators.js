// Input validation helpers. Every helper rejects non-strings first so that
// objects like { "$ne": null } can never reach a database query.

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// Returns an error message, or null when the password is acceptable.
export function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0) return "Enter a password";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (Buffer.byteLength(password) > 72) return "Password is too long (72 bytes at most)";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use at least one letter and one number";
  }
  return null;
}

export function isOtp(value) {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}

// Quantity: positive number, at most 8 decimal places, below one billion.
export function parseQty(value) {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const rounded = Math.round(n * 1e8) / 1e8;
  if (rounded <= 0 || rounded > 1e9) return null;
  return rounded;
}
