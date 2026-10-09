import { useEffect, useState } from "react";
import { isNativeApp, nativeLockAvailable, nativeLockLabel, appLockEnabled, setAppLockEnabled, verifyNativeLock } from "../lib/nativeBiometric";

// Settings card for the native app's "unlock with Face ID / fingerprint" app lock.
// Only renders inside the installed Android/iOS app — on the website there's nothing
// to show here (that's lib/passkey.js's job, in the Passkey card above this one).
export default function AppLockCard() {
  const [status, setStatus] = useState(null); // { available, kind }
  const [on, setOn] = useState(appLockEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isNativeApp()) return;
    nativeLockAvailable().then(setStatus);
  }, []);

  if (!isNativeApp()) return null;
  if (!status) return null; // still checking
  if (!status.available) {
    return (
      <div className="card">
        <h3>App lock</h3>
        <p className="muted small">
          This device doesn't have a fingerprint, face unlock or screen lock set up yet. Add one in your phone's Settings to turn this on.
        </p>
      </div>
    );
  }

  const label = nativeLockLabel(status.kind);

  const toggle = async (next) => {
    setError("");
    if (next) {
      setBusy(true);
      const ok = await verifyNativeLock(`Turn on ${label} for DeltaCloud`);
      setBusy(false);
      if (!ok) {
        setError("That didn't go through. Try again.");
        return;
      }
    }
    setAppLockEnabled(next);
    setOn(next);
  };

  return (
    <div className="card">
      <h3>App lock</h3>
      <p className="muted small">
        Require {label} every time you open the app or come back to it — on top of staying signed in, like a banking app. Nothing leaves
        this device; it never touches our servers.
      </p>
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <div className="settings-row-label">Require {label} to open DeltaCloud</div>
        </div>
        <button type="button" className={`settings-toggle${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(!on)} disabled={busy}>
          <span className="settings-toggle-dot" />
        </button>
      </div>
      {error && <p className="small neg" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
