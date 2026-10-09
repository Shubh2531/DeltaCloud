import { Router } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import PaperAccount from "../models/PaperAccount.js";
import TradeLog from "../models/TradeLog.js";
import { requireAuth } from "../middleware/auth.js";
import { issueOtp, checkOtp } from "../services/otp.js";
import { sendOtpEmail } from "../services/mail.js";
import { hashToken } from "../services/tokens.js";
import { normalizeEmail, cleanName, validatePassword, isOtp } from "../lib/validators.js";
import { LANGUAGES } from "../lib/intelPrompt.js";

// Everything on the Settings page: profile, password, email, devices, preferences,
// downloading your data and deleting your account.

const router = Router();
router.use(requireAuth);

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message) => res.status(status).json({ ok: false, message });

const prefsOf = (u) => ({
  lang: Object.hasOwn(LANGUAGES, u.prefs?.lang) ? u.prefs.lang : "en",
  alertEmails: u.prefs?.alertEmails !== false,
  productEmails: u.prefs?.productEmails !== false,
});

const view = (u) => ({
  name: u.name,
  email: u.email,
  pendingEmail: u.pendingEmail || null,
  memberSince: u.verifiedAt || u.createdAt,
  devices: (u.refreshHashes || []).length,
  passkeys: (u.passkeys || []).length,
  prefs: prefsOf(u),
});

const load = (id, extra = "") => User.findById(id).select(`+refreshHashes +passkeys ${extra}`.trim());

router.get(
  "/",
  ah(async (req, res) => {
    const user = await load(req.userId);
    if (!user) return fail(res, 401, "Sign in again.");
    res.json({ ok: true, account: view(user), languages: LANGUAGES });
  })
);

router.patch(
  "/profile",
  ah(async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return fail(res, 400, "Enter your name.");
    const user = await load(req.userId);
    if (!user) return fail(res, 401, "Sign in again.");
    user.name = name;
    await user.save();
    res.json({ ok: true, message: "Name updated.", account: view(user) });
  })
);

router.patch(
  "/prefs",
  ah(async (req, res) => {
    const user = await load(req.userId);
    if (!user) return fail(res, 401, "Sign in again.");
    const b = req.body || {};
    const next = prefsOf(user);
    if (typeof b.lang === "string" && Object.hasOwn(LANGUAGES, b.lang)) next.lang = b.lang;
    if (typeof b.alertEmails === "boolean") next.alertEmails = b.alertEmails;
    if (typeof b.productEmails === "boolean") next.productEmails = b.productEmails;
    user.prefs = next;
    await user.save();
    res.json({ ok: true, message: "Saved.", account: view(user) });
  })
);

// Change password. Optionally signs out every other device (keeps this one).
router.post(
  "/password",
  ah(async (req, res) => {
    const { currentPassword, newPassword, signOutOthers, refreshToken } = req.body || {};
    const pwError = validatePassword(newPassword);
    if (pwError) return fail(res, 400, pwError);
    const user = await load(req.userId, "+passwordHash");
    if (!user) return fail(res, 401, "Sign in again.");
    if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return fail(res, 400, "Your current password isn't right.");
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    if (signOutOthers) {
      const keep = typeof refreshToken === "string" ? hashToken(refreshToken) : null;
      user.refreshHashes = (user.refreshHashes || []).filter((h) => h === keep);
    }
    await user.save();
    res.json({ ok: true, message: signOutOthers ? "Password changed. Other devices are signed out." : "Password changed.", account: view(user) });
  })
);

// Change email, step 1: password check, then a code goes to the NEW address.
router.post(
  "/email/start",
  ah(async (req, res) => {
    const email = normalizeEmail(req.body?.newEmail);
    if (!email) return fail(res, 400, "Enter a valid email address.");
    const user = await load(req.userId, "+passwordHash");
    if (!user) return fail(res, 401, "Sign in again.");
    if (typeof req.body?.password !== "string" || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return fail(res, 400, "Your password isn't right.");
    }
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
    res.json({ ok: true, message: `We sent a 6-digit code to ${email}.`, account: view(user) });
  })
);

// Change email, step 2: the code from the new inbox.
router.post(
  "/email/verify",
  ah(async (req, res) => {
    const otp = req.body?.otp;
    if (!isOtp(otp)) return fail(res, 400, "Enter the 6-digit code.");
    const user = await load(req.userId, "+otpHash");
    if (!user?.pendingEmail) return fail(res, 400, "Start the email change again.");
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
    res.json({ ok: true, message: `Your email is now ${user.email}.`, account: view(user) });
  })
);

// Sign out every other device (this one stays signed in).
router.post(
  "/sign-out-others",
  ah(async (req, res) => {
    const user = await load(req.userId);
    if (!user) return fail(res, 401, "Sign in again.");
    const keep = typeof req.body?.refreshToken === "string" ? hashToken(req.body.refreshToken) : null;
    user.refreshHashes = (user.refreshHashes || []).filter((h) => h === keep);
    await user.save();
    res.json({ ok: true, message: "Every other device is signed out.", account: view(user) });
  })
);

// Everything we store about you, as one file.
router.get(
  "/export",
  ah(async (req, res) => {
    const user = await User.findById(req.userId).lean();
    if (!user) return fail(res, 401, "Sign in again.");
    const [paper, journal] = await Promise.all([
      PaperAccount.findOne({ user: user._id }).lean(),
      TradeLog.find({ user: user._id }).sort({ at: 1 }).lean(),
    ]);
    const extra = {};
    for (const [key, model] of [["watchlist", "Watch"], ["priceAlerts", "PriceAlert"], ["openOrders", "OpenOrder"], ["accountHistory", "EquitySnapshot"]]) {
      const M = mongoose.models[model];
      if (M) extra[key] = await M.find({ user: user._id }).lean();
    }
    const strip = ({ passwordHash, otpHash, refreshHashes, passkeys, __v, ...rest }) => rest; // eslint-disable-line no-unused-vars
    res.set("Content-Disposition", `attachment; filename="deltacloud-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ exportedAt: new Date().toISOString(), profile: strip(user), practiceAccount: paper, tradeJournal: journal, ...extra });
  })
);

// Delete the account and everything linked to it. Needs the password and the word DELETE.
router.post(
  "/delete",
  ah(async (req, res) => {
    const { password, confirm } = req.body || {};
    if (confirm !== "DELETE") return fail(res, 400, 'Type DELETE to confirm.');
    const user = await load(req.userId, "+passwordHash");
    if (!user) return fail(res, 401, "Sign in again.");
    if (typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
      return fail(res, 400, "Your password isn't right.");
    }
    const id = user._id;
    for (const name of ["PaperAccount", "TradeLog", "Activity", "Watch", "PriceAlert", "OpenOrder", "EquitySnapshot"]) {
      const M = mongoose.models[name];
      if (M) await M.deleteMany({ user: id });
    }
    await User.deleteOne({ _id: id });
    res.json({ ok: true, message: "Your account and its data are deleted." });
  })
);

export default router;
