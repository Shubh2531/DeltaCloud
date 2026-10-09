import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "../lib/api";
import { passkeysAvailable, passkeyLabel, createPasskey, cancelled } from "../lib/passkey";

const DISMISS_KEY = "dc_passkey_nudge_off";

export async function turnOnPasskey() {
  const { data: start } = await api.post("/auth/passkey/register/options");
  const response = await createPasskey(start.options);
  const { data } = await api.post("/auth/passkey/register/verify", { response, challengeToken: start.challengeToken });
  return data;
}

// Settings: turn Face ID sign-in on, see which devices have it, remove one.
// compact = the dashboard nudge, shown once to people who haven't turned it on yet.
export default function PasskeyCard({ compact = false }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(() => {
    try {
      return compact && localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const available = passkeysAvailable();
  const label = passkeyLabel();

  const load = useCallback(() => {
    api
      .get("/auth/passkeys")
      .then((res) => setList(res.data.passkeys))
      .catch(() => setList([]));
  }, []);

  useEffect(() => {
    if (available && !hidden) load();
  }, [available, hidden, load]);

  if (!available || hidden || list === null) return null;
  if (compact && list.length > 0) return null;

  const add = async () => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const data = await turnOnPasskey();
      setList(data.passkeys);
      setMsg(data.message);
    } catch (err) {
      if (!cancelled(err)) setError(err?.response ? errorMessage(err) : "This device couldn't save a passkey.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setError("");
    try {
      const { data } = await api.delete(`/auth/passkeys/${encodeURIComponent(id)}`);
      setList(data.passkeys);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* fine */
    }
    setHidden(true);
  };

  if (compact) {
    return (
      <div className="card passkey-nudge">
        <div>
          <b>Sign in with {label} next time</b>
          <p className="small muted">One tap, no password, no email code. Your face or fingerprint never leaves your phone.</p>
          {error && <p className="small neg">{error}</p>}
          {msg && <p className="small pos">{msg}</p>}
        </div>
        <div className="passkey-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={busy}>
            {busy ? "Waiting…" : `Turn on ${label}`}
          </button>
          <button type="button" className="btn btn-sm" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <h2 style={{ marginBottom: 0 }}>{label} sign-in</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Sign in with one tap using {label}. It uses a passkey: your face or fingerprint stays on your device, and there's no password to steal.
      </p>
      {list.length > 0 && (
        <ul className="passkey-list">
          {list.map((p) => (
            <li key={p.id}>
              <span>
                <b>{p.name || "Device"}</b>
                <span className="small muted">
                  {" "}
                  added {new Date(p.createdAt).toLocaleDateString()}
                  {p.lastUsedAt ? `, last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ""}
                </span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => remove(p.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
        {busy ? "Waiting for you…" : list.length ? `Add ${label} on this device` : `Turn on ${label}`}
      </button>
      {msg && <p className="small pos" style={{ margin: 0 }}>{msg}</p>}
      {error && <p className="small neg" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
