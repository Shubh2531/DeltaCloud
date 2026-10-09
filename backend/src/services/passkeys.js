import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { config } from "../config.js";

// Passkeys: sign in with Face ID, Touch ID, a fingerprint or Windows Hello.
// The device keeps the private key and only proves it has it; we store the public key.
// A passkey counts as both factors at once (the device you own + your face or fingerprint),
// so passkey sign-in skips the emailed code.

const { rpID, rpName, origins } = config.passkey;
const MAX_PASSKEYS = 10;
const CHALLENGE_TTL = "5m";

// Challenge tokens use their own key, so they can never be mistaken for a sign-in token.
const challengeKey = crypto.createHash("sha256").update(`${config.jwtSecret}:passkey-challenge`).digest();

export class PasskeyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Each challenge works once. Remembered until it would have expired anyway.
const used = new Map(); // challenge -> expiry
function consume(challenge) {
  const now = Date.now();
  for (const [c, exp] of used) if (exp < now) used.delete(c);
  if (used.has(challenge)) throw new PasskeyError("That request was already used. Try again.");
  used.set(challenge, now + 6 * 60_000);
}

const signChallenge = (challenge, purpose, sub) =>
  jwt.sign({ c: challenge, p: purpose, ...(sub ? { sub } : {}) }, challengeKey, { expiresIn: CHALLENGE_TTL });

function readChallenge(token, purpose, sub) {
  let payload;
  try {
    payload = jwt.verify(String(token || ""), challengeKey);
  } catch {
    throw new PasskeyError("That took too long. Try again.");
  }
  if (payload.p !== purpose || (sub && payload.sub !== String(sub))) throw new PasskeyError("Try again.");
  return payload.c;
}

// A friendly label like "iPhone" or "Mac" from the browser's user agent.
export function deviceName(ua = "") {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android phone";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/CrOS/i.test(ua)) return "Chromebook";
  return "This device";
}

/* ---------------- Turning on Face ID (registration) ---------------- */

export async function registrationOptions(user) {
  if ((user.passkeys || []).length >= MAX_PASSKEYS) {
    throw new PasskeyError("You have the maximum number of passkeys. Remove one in Settings first.");
  }
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(String(user._id)),
    attestationType: "none",
    excludeCredentials: (user.passkeys || []).map((p) => ({ id: p.credId, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  return { options, challengeToken: signChallenge(options.challenge, "register", user._id) };
}

export async function finishRegistration(user, { response, challengeToken }, ua) {
  const challenge = readChallenge(challengeToken, "register", user._id);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("We couldn't set up Face ID on this device. Try again.");
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new PasskeyError("We couldn't set up Face ID on this device. Try again.");
  }
  consume(challenge);
  const { credential } = verification.registrationInfo;
  const credId = String(credential.id);
  if ((user.passkeys || []).some((p) => p.credId === credId)) return user.passkeys;
  user.passkeys.push({
    credId,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter || 0,
    transports: credential.transports || response?.response?.transports || [],
    name: deviceName(ua),
  });
  await user.save();
  return user.passkeys;
}

/* ---------------- Signing in with Face ID (authentication) ---------------- */

export async function authenticationOptions() {
  // No account list: the device offers whichever DeltaCloud passkey it holds.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  return { options, challengeToken: signChallenge(options.challenge, "login") };
}

// findUser(credId) must return the user with +passkeys +refreshHashes, or null.
export async function finishAuthentication({ response, challengeToken }, findUser) {
  const challenge = readChallenge(challengeToken, "login");
  const credId = String(response?.id || "");
  if (!credId) throw new PasskeyError("Try again.");
  const user = await findUser(credId);
  const passkey = user?.passkeys?.find((p) => p.credId === credId);
  if (!user || !passkey) {
    throw new PasskeyError("This passkey isn't linked to an account anymore. Sign in with your email, then turn Face ID on again.", 401);
  }
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credId,
        publicKey: new Uint8Array(passkey.publicKey.buffer, passkey.publicKey.byteOffset, passkey.publicKey.byteLength),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
  } catch {
    throw new PasskeyError("Face ID sign-in didn't work. Try again, or use your email.", 401);
  }
  if (!verification.verified) throw new PasskeyError("Face ID sign-in didn't work. Try again, or use your email.", 401);
  consume(challenge);
  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  return user;
}

export const listPasskeys = (user) =>
  (user.passkeys || []).map((p) => ({ id: p.credId, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt || null }));
