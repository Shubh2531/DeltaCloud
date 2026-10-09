import { useCallback, useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "../context/AuthContext";
import { isNativeApp, appLockEnabled, verifyNativeLock, nativeLockAvailable, nativeLockLabel } from "../lib/nativeBiometric";
import "../styles/applock.css";

// Wraps the signed-in part of the app. Inside the installed native app, with app lock
// turned on for this device, it shows a full-screen "Unlock with Face ID" cover over
// everything else the moment there's a session to protect, and again every time the
// app comes back from the background — the same pattern a banking app uses. On the
// website, or with the setting off, this renders nothing but its children.
export default function AppLockGate({ children }) {
  const { user } = useAuth();
  const enabled = isNativeApp() && appLockEnabled();
  const active = enabled && Boolean(user);

  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState("Face ID or fingerprint");
  const [busy, setBusy] = useState(false);
  const [deniedOnce, setDeniedOnce] = useState(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    setDeniedOnce(false);
    const ok = await verifyNativeLock("Unlock DeltaCloud to continue");
    setBusy(false);
    if (ok) setLocked(false);
    else setDeniedOnce(true);
  }, []);

  // Lock the moment there's something to protect: right after sign-in, or right
  // after the app returns to the foreground.
  useEffect(() => {
    if (active) setLocked(true);
  }, [active]);

  useEffect(() => {
    if (!enabled) return undefined;
    let handle;
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) setLocked(true); // re-lock the instant it's backgrounded
    }).then((h) => {
      handle = h;
    });
    return () => handle?.remove();
  }, [enabled]);

  // As soon as it's locked, check the sensor is actually usable and prompt right away
  // — the person shouldn't have to tap a button just to get the prompt they expect.
  useEffect(() => {
    if (!active || !locked) return;
    let alive = true;
    nativeLockAvailable().then(({ available, kind }) => {
      if (!alive) return;
      if (!available) {
        // Became unavailable after being turned on (e.g. the person removed their
        // screen lock). Don't trap them behind a lock screen that can never open.
        setLocked(false);
        return;
      }
      setLabel(nativeLockLabel(kind));
      unlock();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, locked]);

  if (!active || !locked) return children;

  return (
    <div className="applock">
      <div className="applock-card card">
        <div className="applock-mark">Δ</div>
        <h2>DeltaCloud is locked</h2>
        <p className="muted">Use {label} to keep going.</p>
        {deniedOnce && <p className="applock-error">That didn't go through. Try again.</p>}
        <button type="button" className="btn btn-primary btn-block" onClick={unlock} disabled={busy}>
          {busy ? "Waiting…" : `Unlock with ${label}`}
        </button>
      </div>
    </div>
  );
}
