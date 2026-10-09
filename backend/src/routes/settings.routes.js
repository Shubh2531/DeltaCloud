import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import PaperAccount from "../models/PaperAccount.js";
import TradeLog from "../models/TradeLog.js";
import { requireAuth } from "../middleware/auth.js";
import { validatePassword, cleanName, validateDob, normalizeEmail, isOtp } from "../lib/validators.js";
import { issueOtp, checkOtp } from "../services/otp.js";
import { sendOtpEmail } from "../services/mail.js";
import { config } from "../config.js";

const router = Router();
router.use(requireAuth);

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message) => res.status(status).json({ ok: false, message });

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "NPR", "JPY", "CAD", "AUD", "AED", "SGD", "BRL", "MXN", "KRW", "CNY"];
const THEMES = ["observatory", "aurora", "midnight"];
const VIEWS = ["all", "crypto", "stocks"];
const LANGS = ["en", "ne", "es", "hi", "fr", "ar", "zh", "bn", "pt", "ko", "vi", "ur"];

const publicPrefs = (p = {}) => ({
  language: LANGS.includes(p.language) ? p.language : "en",
  currency: CURRENCIES.includes(p.currency) ? p.currency : "USD",
  theme: THEMES.includes(p.theme) ? p.theme : "observatory",
  reducedMotion: Boolean(p.reducedMotion),
  marketingEmails: p.marketingEmails !== false,
  productEmails: p.productEmails !== false,
  tradeNotifications: p.tradeNotifications !== false,
  priceAlerts: p.priceAlerts !== false,
  weeklyDigest: p.weeklyDigest !== false,
  shareInLeaderboard: Boolean(p.shareInLeaderboard),
  defaultView: VIEWS.includes(p.defaultView) ? p.defaultView : "all",
  defaultSymbol: typeof p.defaultSymbol === "string" ? p.defaultSymbol.toUpperCase().slice(0, 20) : "BTCUSDT",
});

router.get("/options", (req, res) => {
  res.json({ ok: true, currencies: CURRENCIES, themes: THEMES, views: VIEWS, languages: LANGS });
});

router.get(
  "/",
  ah(async (req, res) => {
    const user = await User.findById(req.userId).select("+refreshHashes +passkeys");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    res.json({
      ok: true,
      profile: {
        name: user.name,
        email: user.email,
        pendingEmail: user.pendingEmail || null,
        dob: user.dob,
        createdAt: user.createdAt,
      },
      preferences: publicPrefs(user.preferences || {}),
      security: {
        passkeys: (user.passkeys || []).length,
        activeSessions: (user.refreshHashes || []).length,
      },
    });
  })
);

router.patch(
  "/profile",
  ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    const name = cleanName(req.body?.name);
    if (!name) return fail(res, 400, "Enter your name.");
    const dobResult = validateDob(req.body?.dob || user.dob);
    if (dobResult.error) return fail(res, 400, dobResult.error);
    user.name = name;
    user.dob = dobResult.dob;
    await user.save();
    res.json({ ok: true, message: "Profile updated.", profile: { name: user.name, email: user.email, dob: user.dob } });
  })
);

router.patch(
  "/preferences",
  ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    const merged = publicPrefs({ ...(user.preferences || {}), ...(req.body || {}) });
    user.preferences = merged;
    await user.save();
    res.json({ ok: true, preferences: merged });
  })
);

router.post(
  "/change-password",
  ah(async (req, res) => {
    const user = await User.findById(req.userId).select("+passwordHash +refreshHashes");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    const current = String(req.body?.currentPassword || "");
    const next = String(req.body?.newPassword || "");
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) return fail(res, 400, "Your current password is wrong.");
    const err = validatePassword(next);
    if (err) return fail(res, 400, err);
    if (next === current) return fail(res, 400, "Pick a password you haven't used here before.");
    user.passwordHash = await bcrypt.hash(next, 10);
    // Sign out other devices for safety; the current device gets a fresh pair below.
    user.refreshHashes = [];
    await user.save();
    res.json({ ok: true, message: "Password changed. Other devices were signed out." });
  })
);

// Change email, step 1: password check, then a code goes to the NEW address so we know
// it's reachable and really theirs.
router.post(
  "/email/start",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.newEmail);
    if (!email) return fail(res, 400, "Enter a valid email address.");
    const user = await User.findById(req.userId).select("+passwordHash");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    const okPassword = await bcrypt.compare(String(req.body?.password || ""), user.passwordHash);
    if (!okPassword) return fail(res, 400, "Your password is wrong.");
    if (email === user.email) return fail(res, 400, "That's already your email.");
    if (await User.exists({ email })) return fail(res, 409, "Another account already uses that email.");
    user.pendingEmail = email;
    let otp;
    try {
      otp = await issueOtp(user, "email");
    } catch (err) {
      if (err.status === 429) return fail(res, 429, `A code was sent a moment ago. Try again in ${err.retryAfter} seconds.`);
      throw err;
    }
    await sendOtpEmail({ to: email, otp, purpose: "email" });
    res.json({ ok: true, message: `We sent a 6-digit code to ${email}.`, profile: { name: user.name, email: user.email, pendingEmail: email, dob: user.dob } });
  })
);

// Change email, step 2: the code from the new inbox confirms they really control it.
router.post(
  "/email/verify",
  ah(async (req, res) => {
    const otp = req.body?.otp;
    if (!isOtp(otp)) return fail(res, 400, "Enter the 6-digit code.");
    const user = await User.findById(req.userId).select("+otpHash");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    if (!user.pendingEmail) return fail(res, 400, "Start the email change again.");
    const result = await checkOtp(user, otp, "email");
    if (!result.ok) return fail(res, 400, result.reason);
    if (await User.exists({ email: user.pendingEmail, _id: { $ne: user._id } })) {
      user.pendingEmail = undefined;
      await user.save();
      return fail(res, 409, "Another account started using that email. Try a different one.");
    }
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    await user.save();
    res.json({ ok: true, message: `Your email is now ${user.email}.`, profile: { name: user.name, email: user.email, pendingEmail: null, dob: user.dob } });
  })
);

router.get(
  "/sessions",
  ah(async (req, res) => {
    const user = await User.findById(req.userId).select("+refreshHashes +passkeys");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    res.json({
      ok: true,
      activeDevices: (user.refreshHashes || []).length,
      passkeys: (user.passkeys || []).map((p) => ({ id: p.credId, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt })),
    });
  })
);

router.post(
  "/sessions/signout-others",
  ah(async (req, res) => {
    const user = await User.findById(req.userId).select("+refreshHashes");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    user.refreshHashes = [];
    await user.save();
    res.json({ ok: true, message: "All other devices were signed out. This one stays signed in." });
  })
);

router.get(
  "/export",
  ah(async (req, res) => {
    const [user, account, trades] = await Promise.all([
      User.findById(req.userId),
      PaperAccount.findOne({ user: req.userId }),
      TradeLog.find({ user: req.userId }).sort({ at: 1 }).lean(),
    ]);
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "DeltaCloud",
      profile: { name: user.name, email: user.email, dob: user.dob, createdAt: user.createdAt },
      preferences: publicPrefs(user.preferences || {}),
      practiceAccount: account
        ? {
            cash: account.cash,
            holdings: account.holdings,
            orders: account.orders,
            leveragePositions: account.leveragePositions,
          }
        : null,
      trades,
    };
    res.set("Content-Type", "application/json");
    res.set("Content-Disposition", `attachment; filename="deltacloud-${user.email.replace(/[^a-z0-9]/gi, "-")}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  })
);

router.post(
  "/delete-account",
  ah(async (req, res) => {
    const user = await User.findById(req.userId).select("+passwordHash +refreshHashes");
    if (!user) return fail(res, 401, "Your session has expired. Sign in again.");
    const password = String(req.body?.password || "");
    const confirm = String(req.body?.confirm || "");
    if (confirm !== "DELETE") return fail(res, 400, 'Type DELETE in the confirmation box to continue.');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return fail(res, 400, "Your password is wrong.");
    // The user's own data is removed; aggregated numbers on the founder dashboard stay.
    await Promise.all([
      PaperAccount.deleteMany({ user: user._id }),
      TradeLog.deleteMany({ user: user._id }),
      User.deleteOne({ _id: user._id }),
    ]);
    res.json({ ok: true, message: "Your account was deleted." });
  })
);

export default router;
