// Face ID / fingerprint sign-in (passkeys) using the browser's built-in WebAuthn.
// The server sends options as JSON with base64url strings; the browser wants bytes.

const toBytes = (b64url) => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const toB64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Passkeys are tied to joindeltacloud.com, so they only work there (and on localhost for testing).
export function passkeysAvailable() {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) return false;
  const host = window.location.hostname;
  return host === "joindeltacloud.com" || host.endsWith(".joindeltacloud.com") || host === "localhost";
}

// True only when this device has a built-in face or fingerprint sensor ready to use.
export async function platformAuthAvailable() {
  return (await biometricStatus()) === "ready";
}

// A finer-grained check than a flat yes/no, so the UI can explain *why* this device
// can't use one-tap sign-in instead of just saying "incompatible":
//   "ready"              — good to go
//   "no-browser-support" — this browser doesn't implement WebAuthn at all (an old or
//                           non-Chromium browser — common with OEM/alternative browsers)
//   "no-device-lock"     — the browser supports it, but the OS says there's no secure
//                           screen lock to use (no fingerprint, face unlock, PIN or
//                           pattern set up) — very common on phones straight out of the
//                           box, especially budget Android devices
//   "unsupported-site"   — wrong domain (a preview/staging URL, not the real site)
export async function biometricStatus() {
  if (!passkeysAvailable()) return "unsupported-site";
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) return "no-browser-support";
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return "no-browser-support";
  try {
    const ok = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return ok ? "ready" : "no-device-lock";
  } catch {
    return "no-device-lock";
  }
}

// Which passkey this device saved, so sign-in can go straight to Face ID / fingerprint.
const DEVICE_KEY = "dc_device_passkey";
export function devicePasskey() {
  try {
    const v = JSON.parse(localStorage.getItem(DEVICE_KEY) || "null");
    return v?.id ? v : null;
  } catch {
    return null;
  }
}
export function rememberDevicePasskey(id, email) {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, JSON.stringify({ id, email: email || "" }));
  } catch {
    /* without storage, sign-in just shows the email form */
  }
}
export function forgetDevicePasskey() {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* fine */
  }
}

// iPadOS Safari has reported itself as a desktop Mac ("Macintosh; Intel Mac OS X…")
// since iPadOS 13, with no "iPad" anywhere in the string — so a plain user-agent check
// mislabels every iPad as a Mac and shows "Touch ID" even on an iPad with Face ID. The
// standard way to tell them apart: a real Mac has no touch screen, and iPadOS Safari's
// UA string still claims the "MacIntel" platform while reporting touch points.
const isIPadInDesktopMode = () => navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

// What to call it on this device. The Web Authentication API deliberately doesn't say
// which sensor a device has (that would be a fingerprinting risk), so for iPad — which
// ships in both Face ID and Touch ID models — we name both rather than guess wrong.
export function passkeyLabel() {
  const ua = navigator.userAgent || "";
  if (/iPad/i.test(ua) || isIPadInDesktopMode()) return "Face ID or Touch ID";
  if (/iPhone|iPod/i.test(ua)) return "Face ID";
  if (/Macintosh/i.test(ua)) return "Touch ID";
  // Android phones ship with fingerprint sensors, face unlock, or both — and like iPad,
  // the browser won't say which, so name both rather than assume.
  if (/Android/i.test(ua)) return "fingerprint or face unlock";
  if (/Windows/i.test(ua)) return "Windows Hello";
  return "passkey";
}

// A plain-language reason + what to do, for each biometricStatus() other than "ready".
export function biometricHelp(status, label) {
  if (status === "no-browser-support") {
    return `This browser can't do one-tap sign-in. Open DeltaCloud in Chrome (or your phone's default browser) and try again.`;
  }
  if (status === "no-device-lock") {
    return `Your phone doesn't have a fingerprint, face unlock or screen lock set up yet. Add one in your phone's Settings, then come back here and try again.`;
  }
  return `This device isn't compatible with ${label} sign-in. Sign in with your email below.`;
}

export async function createPasskey(options) {
  const cred = await navigator.credentials.create({
    publicKey: {
      ...options,
      hints: ["client-device"], // this device's own sensor, not another phone
      authenticatorSelection: { ...(options.authenticatorSelection || {}), authenticatorAttachment: "platform" },
      challenge: toBytes(options.challenge),
      user: { ...options.user, id: toBytes(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((c) => ({ ...c, id: toBytes(c.id) })),
    },
  });
  const r = cred.response;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      attestationObject: toB64url(r.attestationObject),
      transports: r.getTransports?.() || [],
    },
  };
}

export async function getPasskey(options) {
  const cred = await navigator.credentials.get({
    publicKey: {
      ...options,
      hints: ["client-device"],
      challenge: toBytes(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: toBytes(c.id) })),
    },
  });
  const r = cred.response;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      authenticatorData: toB64url(r.authenticatorData),
      signature: toB64url(r.signature),
      userHandle: r.userHandle ? toB64url(r.userHandle) : undefined,
    },
  };
}

// The person closed the Face ID prompt: not an error worth showing.
export const cancelled = (err) => err?.name === "NotAllowedError" || err?.name === "AbortError";
