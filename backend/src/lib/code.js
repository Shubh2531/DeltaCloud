import { randomInt } from "node:crypto";

// Six-digit one-time code from a cryptographically secure generator.
export function generateOtp(rand = randomInt) {
  return String(rand(0, 1_000_000)).padStart(6, "0");
}
