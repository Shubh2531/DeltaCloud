import bcrypt from "bcryptjs";
import { generateOtp } from "../lib/code.js";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

// Creates and stores a fresh code. Throws a 429 error (with retryAfter seconds)
// if one was sent less than a minute ago.
export async function issueOtp(user, purpose) {
  if (user.otpSentAt) {
    const wait = OTP_RESEND_MS - (Date.now() - user.otpSentAt.getTime());
    if (wait > 0) {
      throw Object.assign(new Error("A code was sent a moment ago."), {
        status: 429,
        retryAfter: Math.ceil(wait / 1000),
      });
    }
  }
  const otp = generateOtp();
  user.otpHash = await bcrypt.hash(otp, 8);
  user.otpPurpose = purpose;
  user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.otpAttempts = 0;
  user.otpSentAt = new Date();
  await user.save();
  return otp;
}

// The user document must have been loaded with `+otpHash`.
// On success the code is consumed so it cannot be used twice.
export async function checkOtp(user, otp, purpose) {
  if (!user.otpHash || !user.otpExpires || user.otpPurpose !== purpose) {
    return { ok: false, reason: "That code isn't valid. Request a new one." };
  }
  if (user.otpExpires.getTime() < Date.now()) {
    return { ok: false, reason: "That code has expired. Request a new one." };
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "Too many incorrect attempts. Request a new code." };
  }
  const matches = await bcrypt.compare(String(otp).trim(), user.otpHash);
  if (!matches) {
    user.otpAttempts += 1;
    await user.save();
    return { ok: false, reason: "Incorrect code. Check it and try again." };
  }
  user.otpHash = undefined;
  user.otpPurpose = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  // The code is spent, so the resend cooldown no longer applies. Without this, signing in
  // again within a minute would be told "a code was sent" when none is actually valid.
  user.otpSentAt = undefined;
  await user.save();
  return { ok: true };
}
