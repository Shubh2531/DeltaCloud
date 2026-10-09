// Native Face ID / Touch ID / fingerprint app-lock for the installed Android and iOS
// app (Capacitor) — the "like a bank app" pattern. This is deliberately separate from
// the browser passkeys in lib/passkey.js: it never talks to our server. The app is
// already signed in (a refresh token is stored on the device); this just asks the
// device's OWN operating system — Android's BiometricPrompt, iOS's LocalAuthentication —
// to confirm it's really you before the already-authenticated screen is shown. That's
// why it works on far more phones than WebAuthn passkeys: Android's BiometricPrompt
// accepts fingerprint, face unlock, iris, or a PIN/pattern fallback, with none of the
// FIDO2 hardware-certification requirements that make some budget phones fail passkeys.
//
// Only does anything inside the installed app (Capacitor.isNativePlatform()). On the
// plain website this module is inert: nativeLockAvailable() resolves unavailable and
// verifyNativeLock() resolves false, so callers can use the same code path everywhere
// and just get no native lock on the web.
//
// Requires the "capacitor-native-biometric" and "@capacitor/app" packages (added to
// package.json) and a native sync — see the comment at the bottom of this file for the
// exact commands to run locally; this sandbox has no Android/iOS build tools, so none
// of this has been run through an actual device build yet.

import { Capacitor } from "@capacitor/core";

let NativeBiometricMod = null;
async function plugin() {
  if (!Capacitor.isNativePlatform()) return null;
  if (NativeBiometricMod) return NativeBiometricMod;
  try {
    const mod = await import("capacitor-native-biometric");
    NativeBiometricMod = mod.NativeBiometric;
    return NativeBiometricMod;
  } catch {
    return null; // package not installed/synced into the native project yet
  }
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

// biometryType from the plugin: 0 none, 1 touch/fingerprint, 2 face, 3 iris
// (Android reports 1 for any fingerprint-class sensor; iOS reports 1 for Touch ID,
// 2 for Face ID). We don't trust the exact number across plugin versions, so this
// stays defensive and falls back to a generic label rather than guessing wrong.
function kindFromBiometryType(t) {
  if (t === 2) return "face";
  if (t === 1) return "fingerprint";
  if (t === 3) return "iris";
  return null;
}

// { available, kind } — kind is "face" | "fingerprint" | "iris" | "biometric" | null
export async function nativeLockAvailable() {
  const nb = await plugin();
  if (!nb) return { available: false, kind: null };
  try {
    const result = await nb.isAvailable({ useFallback: true });
    const available = Boolean(result?.isAvailable);
    return { available, kind: available ? kindFromBiometryType(result?.biometryType) || "biometric" : null };
  } catch {
    return { available: false, kind: null };
  }
}

export function nativeLockLabel(kind) {
  if (kind === "face") return "Face ID";
  if (kind === "fingerprint") return "fingerprint";
  if (kind === "iris") return "iris scan";
  return "Face ID or fingerprint";
}

// Shows the device's own biometric sheet. Resolves true on success, false if the
// person cancelled or it genuinely failed — callers should keep the lock screen up
// either way and let them retry, never treat false as "let them in."
export async function verifyNativeLock(reason) {
  const nb = await plugin();
  if (!nb) return false;
  try {
    await nb.verifyIdentity({
      reason: reason || "Unlock DeltaCloud",
      title: "Unlock DeltaCloud",
      subtitle: "",
      description: "",
      useFallback: true, // let the OS fall back to device PIN/pattern if biometric fails
      maxAttempts: 5,
    });
    return true;
  } catch {
    return false;
  }
}

// Per-device preference (like the existing passkey "remembered on this device"
// pattern) — not a server setting, since it's about this specific phone.
const ENABLED_KEY = "dc_app_lock_on";
export function appLockEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}
export function setAppLockEnabled(on) {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* without storage this just can't be remembered between app opens */
  }
}

/*
 * To actually build and test this on a device (can't be done from this sandbox —
 * no Android/iOS SDKs or a physical device here):
 *
 *   cd frontend
 *   npm install
 *   npx cap add android        # first time only — creates the android/ project
 *   npx cap add ios            # first time only, macOS + Xcode only
 *   npm run build
 *   npx cap sync
 *   npx cap open android       # opens Android Studio; Run on a device/emulator
 *   npx cap open ios           # opens Xcode, macOS only
 *
 * If `capacitor-native-biometric` doesn't have a release compatible with your
 * installed Capacitor 8 packages, npm will say so during `npm install` — the
 * actively-maintained alternative is `@aparajita/capacitor-biometric-auth`, which
 * has a slightly different API (see its README) but the same isAvailable() /
 * verify() shape; swap it in here if needed.
 */
