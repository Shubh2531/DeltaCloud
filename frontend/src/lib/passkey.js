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

// What to call it on this device.
export function passkeyLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|Macintosh/i.test(ua)) return "Face ID or Touch ID";
  if (/Android/i.test(ua)) return "fingerprint or face unlock";
  if (/Windows/i.test(ua)) return "Windows Hello";
  return "passkey";
}

export async function createPasskey(options) {
  const cred = await navigator.credentials.create({
    publicKey: {
      ...options,
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
