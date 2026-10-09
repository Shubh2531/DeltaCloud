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
  if (!passkeysAvailable()) return false;
  try {
    return Boolean(await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
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

// What to call it on this device.
export function passkeyLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/i.test(ua)) return "Face ID";
  if (/Macintosh/i.test(ua)) return "Touch ID";
  if (/Android/i.test(ua)) return "fingerprint";
  if (/Windows/i.test(ua)) return "Windows Hello";
  return "passkey";
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
