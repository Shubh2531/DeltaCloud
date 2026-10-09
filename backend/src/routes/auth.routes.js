import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { config } from "../config.js";
import { issueOtp, checkOtp } from "../services/otp.js";
import { sendOtpEmail } from "../services/mail.js";
import { hashToken, startSession, verifyRefresh } from "../services/tokens.js";
import { requireAuth } from "../middleware/auth.js";
import { normalizeEmail, cleanName, validatePassword, validateDob, isOtp } from "../lib/validators.js";
import { cleanSource, isRefCode } from "../lib/growth.js";
import { ensureRefCode } from "../services/growth.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message) => res.status(status).json({ ok: false, message });
const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email });

// Compared against when the email is unknown so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-1", 10);

// Creates a code and emails it. A cooldown is not an error: the earlier code still works.
async function issueAndSend(user, purpose) {
  try {
    const otp = await issueOtp(user, purpose);
    await sendOtpEmail({ to: user.email, otp, purpose });
    return { sent: true, ...(config.devReturnOtp ? { devOtp: otp } : {}) };
  } catch (err) {
    if (err.status === 429) return { sent: false, retryAfter: err.retryAfter };
    throw err;
  }
}

const sentMessage = (r) =>
  r.sent
    ? "We emailed you a 6-digit code. It expires in 5 minutes."
    : `A code was sent a moment ago. Check your inbox, or ask for another in ${r.retryAfter} seconds.`;

/* ---------------- Register: name + email + password, then verify by code ---------------- */
router.post(
  "/register",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanName(req.body?.name);
    const password = req.body?.password;
    if (!name) return fail(res, 400, "Enter your name.");
    if (!email) return fail(res, 400, "Enter a valid email address.");
    const pwError = validatePassword(password);
    if (pwError) return fail(res, 400, pwError);
    const dobResult = validateDob(req.body?.dob);
    if (dobResult.error) return fail(res, 400, dobResult.error);

    let user = await User.findOne({ email });
    if (user?.isVerified) {
      return fail(res, 409, "An account with this email already exists. Sign in instead.");
    }

    // Same full name and date of birth as an existing, verified account: almost certainly
    // the same person opening a second account under a different email.
    const sameIdentity = await User.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      dob: dobResult.dob,
      isVerified: true,
      email: { $ne: email },
    });
    if (sameIdentity) {
      return fail(
        res,
        409,
        "An account already exists for this name and date of birth. Sign in, or use Forgot password if you don't remember which email you used."
      );
    }

    // How they found us: a friend's invite code and/or a tagged link (club, class, flyer).
    const source = cleanSource(req.body?.source);
    const ref = String(req.body?.ref || "").toUpperCase();
    const referrer = isRefCode(ref) ? await User.findOne({ refCode: ref, isVerified: true }).select("_id email") : null;

    const passwordHash = await bcrypt.hash(password, 10);
    if (user) {
      user.name = name;
      user.dob = dobResult.dob;
      user.passwordHash = passwordHash;
    } else {
      user = new User({ email, name, dob: dobResult.dob, passwordHash });
    }
    if (!user.source && source) user.source = source;
    if (!user.referredBy && referrer && referrer.email !== email) user.referredBy = referrer._id;
    await user.save();

    const result = await issueAndSend(user, "login");
    return res.json({ ok: true, message: sentMessage(result), devOtp: result.devOtp });
  })
);

/* ---------------- Login: password, then a code by email ---------------- */
router.post(
  "/login",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== "string") {
      return fail(res, 400, "Enter your email and password.");
    }
    const user = await User.findOne({ email }).select("+passwordHash");
    const matches = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !matches) return fail(res, 401, "Incorrect email or password.");

    const result = await issueAndSend(user, "login");
    return res.json({ ok: true, message: sentMessage(result), devOtp: result.devOtp });
  })
);

/* ---------------- Resend a code (same reply whether or not the account exists) ---------------- */
router.post(
  "/resend-otp",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const purpose = req.body?.purpose === "reset" ? "reset" : "login";
    if (!email) return fail(res, 400, "Enter a valid email address.");
    const user = await User.findOne({ email });
    let result = { sent: true };
    if (user) result = await issueAndSend(user, purpose);
    return res.json({
      ok: true,
      message: "If the account exists, a new code is on its way.",
      retryAfter: result.retryAfter,
      devOtp: result.devOtp,
    });
  })
);

/* ---------------- Verify the code: finishes sign-in ---------------- */
router.post(
  "/verify-otp",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const otp = req.body?.otp;
    if (!email || !isOtp(otp)) return fail(res, 400, "Enter the 6-digit code.");

    const user = await User.findOne({ email }).select("+otpHash +refreshHashes");
    if (!user) return fail(res, 400, "That code isn't valid. Request a new one.");

    const result = await checkOtp(user, otp, "login");
    if (!result.ok) return fail(res, 400, result.reason);

    if (!user.isVerified) user.verifiedAt = new Date();
    user.isVerified = true;
    const tokens = await startSession(user);
    ensureRefCode(user).catch(() => {}); // their own invite link, ready for later
    return res.json({ ok: true, ...tokens, user: publicUser(user) });
  })
);

/* ---------------- Refresh: trade a refresh token for a new pair ---------------- */
router.post(
  "/refresh",
  ah(async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== "string") return fail(res, 401, "Sign in again.");
    let payload;
    try {
      payload = verifyRefresh(refreshToken);
    } catch {
      return fail(res, 401, "Your session has expired. Sign in again.");
    }
    const user = await User.findById(payload.sub).select("+refreshHashes");
    const hash = hashToken(refreshToken);
    if (!user || !user.refreshHashes.includes(hash)) {
      return fail(res, 401, "Your session has expired. Sign in again.");
    }
    const tokens = await startSession(user, hash);
    return res.json({ ok: true, ...tokens });
  })
);

/* ---------------- Logout: forget this device's refresh token ---------------- */
router.post(
  "/logout",
  ah(async (req, res) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken === "string") {
      try {
        const payload = verifyRefresh(refreshToken);
        const hash = hashToken(refreshToken);
        await User.updateOne({ _id: payload.sub }, { $pull: { refreshHashes: hash } });
      } catch {
        /* already invalid; nothing to forget */
      }
    }
    return res.json({ ok: true });
  })
);

/* ---------------- Password reset ---------------- */
router.post(
  "/forgot-password",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) return fail(res, 400, "Enter a valid email address.");
    const user = await User.findOne({ email });
    let result = null;
    if (user) {
      try {
        result = await issueAndSend(user, "reset");
      } catch (err) {
        console.error("Reset email failed:", err.message);
      }
    }
    return res.json({
      ok: true,
      message: "If an account exists for that email, we sent a reset code.",
      devOtp: result?.devOtp,
    });
  })
);

router.post(
  "/reset-password",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { otp, newPassword } = req.body || {};
    if (!email || !isOtp(otp)) return fail(res, 400, "Enter the 6-digit code.");
    const pwError = validatePassword(newPassword);
    if (pwError) return fail(res, 400, pwError);

    const user = await User.findOne({ email }).select("+otpHash +passwordHash +refreshHashes");
    if (!user) return fail(res, 400, "That code isn't valid. Request a new one.");

    const result = await checkOtp(user, otp, "reset");
    if (!result.ok) return fail(res, 400, result.reason);

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.refreshHashes = []; // sign out every device
    user.isVerified = true; // they proved they own the inbox
    await user.save();
    return res.json({ ok: true, message: "Password updated. Sign in with your new password." });
  })
);

/* ---------------- Current user ---------------- */
router.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    return res.json({ ok: true, user: publicUser(user) });
  })
);

export default router;
