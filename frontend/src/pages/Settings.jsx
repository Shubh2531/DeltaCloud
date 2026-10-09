import { useCallback, useEffect, useState } from "react";
import api, { errorMessage, tokens } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import FeedBadge from "../components/FeedBadge";
import Disclaimer from "../components/Disclaimer";
import InviteCard from "../components/InviteCard";
import PasskeyCard from "../components/PasskeyCard";
import { forgetDevicePasskey } from "../lib/passkey";
import "../styles/settings.css";

// A small status line under a form: what happened, or what went wrong.
function Note({ note }) {
  if (!note) return null;
  return (
    <p className={`set-note ${note.type}`} role={note.type === "error" ? "alert" : "status"}>
      {note.text}
    </p>
  );
}

const ok = (text) => ({ type: "ok", text });
const bad = (err) => ({ type: "error", text: typeof err === "string" ? err : errorMessage(err) });

function Profile({ account, onAccount }) {
  const { updateUser } = useAuth();
  const [name, setName] = useState(account.name);
  const [note, setNote] = useState(null);
  const [step, setStep] = useState(account.pendingEmail ? "code" : "idle"); // idle | form | code
  const [newEmail, setNewEmail] = useState(account.pendingEmail || "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const saveName = async (e) => {
    e.preventDefault();
    setNote(null);
    try {
      const { data } = await api.patch("/account/profile", { name });
      onAccount(data.account);
      updateUser({ name: data.account.name });
      setNote(ok(data.message));
    } catch (err) {
      setNote(bad(err));
    }
  };

  const startEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const { data } = await api.post("/account/email/start", { newEmail, password });
      onAccount(data.account);
      setPassword("");
      setStep("code");
      setNote(ok(data.message));
    } catch (err) {
      setNote(bad(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const { data } = await api.post("/account/email/verify", { otp: code });
      onAccount(data.account);
      updateUser({ email: data.account.email });
      setStep("idle");
      setCode("");
      setNote(ok(data.message));
    } catch (err) {
      setNote(bad(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card set-card">
      <h2>Profile</h2>
      <form className="set-row" onSubmit={saveName}>
        <label htmlFor="set-name">Name</label>
        <div className="set-inline">
          <input id="set-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
          <button type="submit" className="btn btn-sm" disabled={!name.trim() || name.trim() === account.name}>
            Save
          </button>
        </div>
      </form>

      <div className="set-row">
        <span className="set-label">Email</span>
        <div className="set-inline">
          <span className="set-value">{account.email}</span>
          {step === "idle" && (
            <button type="button" className="btn btn-sm" onClick={() => setStep("form")}>
              Change email
            </button>
          )}
        </div>
      </div>

      {step === "form" && (
        <form className="set-sub" onSubmit={startEmail}>
          <input className="input" type="email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required autoComplete="email" />
          <input className="input" type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <div className="set-inline">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Sending…" : "Send code to new email"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setStep("idle")}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === "code" && (
        <form className="set-sub" onSubmit={verifyEmail}>
          <p className="small muted">Enter the 6-digit code we sent to {account.pendingEmail || newEmail}.</p>
          <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" />
          <div className="set-inline">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Confirm new email"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setStep("form")}>
              Use a different email
            </button>
          </div>
        </form>
      )}

      <p className="small muted" style={{ margin: 0 }}>
        Member since {new Date(account.memberSince).toLocaleDateString([], { month: "long", year: "numeric" })}
      </p>
      <Note note={note} />
    </section>
  );
}

function Security({ account, onAccount }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [others, setOthers] = useState(true);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const { data } = await api.post("/account/password", {
        currentPassword: current,
        newPassword: next,
        signOutOthers: others,
        refreshToken: tokens.getRefresh(),
      });
      onAccount(data.account);
      setCurrent("");
      setNext("");
      setNote(ok(data.message));
    } catch (err) {
      setNote(bad(err));
    } finally {
      setBusy(false);
    }
  };

  const signOutOthers = async () => {
    setNote(null);
    try {
      const { data } = await api.post("/account/sign-out-others", { refreshToken: tokens.getRefresh() });
      onAccount(data.account);
      setNote(ok(data.message));
    } catch (err) {
      setNote(bad(err));
    }
  };

  return (
    <section className="card set-card">
      <h2>Security</h2>
      <form className="set-sub" onSubmit={changePassword}>
        <span className="set-label">Change password</span>
        <input className="input" type={show ? "text" : "password"} placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        <input className="input" type={show ? "text" : "password"} placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
        <label className="set-check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
        </label>
        <label className="set-check">
          <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} /> Sign out my other devices
        </label>
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !current || !next}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>

      <div className="set-row">
        <span className="set-label">Signed-in devices</span>
        <div className="set-inline">
          <span className="set-value">
            {account.devices} {account.devices === 1 ? "device" : "devices"}
          </span>
          <button type="button" className="btn btn-sm" onClick={signOutOthers} disabled={account.devices <= 1}>
            Sign out all others
          </button>
        </div>
      </div>
      <Note note={note} />
    </section>
  );
}

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="set-toggle">
      <span>
        <b>{label}</b>
        {help && <small>{help}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Preferences({ account, languages, onAccount }) {
  const [note, setNote] = useState(null);
  const save = async (patch) => {
    setNote(null);
    try {
      const { data } = await api.patch("/account/prefs", patch);
      onAccount(data.account);
      if (patch.lang) {
        try {
          localStorage.setItem("dc_intel_lang", patch.lang);
        } catch {
          /* fine */
        }
      }
      setNote(ok("Saved."));
    } catch (err) {
      setNote(bad(err));
    }
  };
  const p = account.prefs;
  return (
    <section className="card set-card">
      <h2>Preferences</h2>
      <label className="set-row" htmlFor="set-lang">
        <span className="set-label">DC Intelligence language</span>
        <select id="set-lang" className="input" value={p.lang} onChange={(e) => save({ lang: e.target.value })}>
          {Object.entries(languages || {}).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <Toggle label="Price alert emails" help="Email me when one of my price alerts is reached." checked={p.alertEmails} onChange={(v) => save({ alertEmails: v })} />
      <Toggle label="DeltaCloud news" help="Occasional emails about new features. Never more than a couple a month." checked={p.productEmails} onChange={(v) => save({ productEmails: v })} />
      <Note note={note} />
    </section>
  );
}

function Practice() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const reset = async () => {
    if (!window.confirm("Reset your practice account to $10,000? This clears all holdings and order history and can't be undone.")) return;
    setBusy(true);
    setNote(null);
    try {
      await api.post("/paper/reset");
      setNote(ok("Your practice account is back to $10,000."));
    } catch (err) {
      setNote(bad(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card set-card">
      <h2>Practice account</h2>
      <p className="small muted">Start over with $10,000 of play money. Your holdings and order history are cleared; your trade journal stays.</p>
      <div>
        <button type="button" className="btn btn-danger btn-sm" onClick={reset} disabled={busy}>
          {busy ? "Resetting…" : "Reset practice account"}
        </button>
      </div>
      <Note note={note} />
    </section>
  );
}

function YourData() {
  const { forget } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { data } = await api.get("/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deltacloud-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote(ok("Downloaded."));
    } catch (err) {
      setNote(bad(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api.post("/account/delete", { password, confirm });
      forgetDevicePasskey();
      forget();
    } catch (err) {
      setNote(bad(err));
      setBusy(false);
    }
  };

  return (
    <section className="card set-card">
      <h2>Your data</h2>
      <p className="small muted">Download everything DeltaCloud stores about you: profile, practice account, trade journal, watchlist and alerts.</p>
      <div>
        <button type="button" className="btn btn-sm" onClick={download} disabled={busy}>
          Download my data
        </button>
      </div>

      {!deleting ? (
        <div>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>
            Delete my account
          </button>
        </div>
      ) : (
        <form className="set-sub set-danger" onSubmit={remove}>
          <b>Delete your account for good</b>
          <p className="small">This permanently deletes your account, practice money, trade journal, watchlist, alerts and Face ID passkeys. It can't be undone.</p>
          <input className="input" type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <input className="input" placeholder="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" />
          <div className="set-inline">
            <button type="submit" className="btn btn-danger btn-sm" disabled={busy || confirm !== "DELETE" || !password}>
              {busy ? "Deleting…" : "Delete account"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setDeleting(false)}>
              Keep my account
            </button>
          </div>
        </form>
      )}
      <Note note={note} />
    </section>
  );
}

export default function Settings() {
  const { logout } = useAuth();
  const [account, setAccount] = useState(null);
  const [languages, setLanguages] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get("/account")
      .then((res) => {
        setAccount(res.data.account);
        setLanguages(res.data.languages);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your profile, security, preferences and data.</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={logout}>
          Sign out
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      {account && (
        <div className="set-grid">
          <Profile account={account} onAccount={setAccount} />
          <div className="set-col">
            <PasskeyCard />
            <Security account={account} onAccount={setAccount} />
          </div>
          <Preferences account={account} languages={languages} onAccount={setAccount} />
          <InviteCard />
          <Practice />
          <YourData />
          <section className="card set-card">
            <h2>Help</h2>
            <p className="small muted">
              Questions, bugs or ideas? Email <a href="mailto:shubham@joindeltacloud.com">shubham@joindeltacloud.com</a>. A real person reads every message.
            </p>
            <div className="set-row">
              <span className="set-label">Price feed</span>
              <FeedBadge />
            </div>
          </section>
        </div>
      )}

      <Disclaimer>
        DeltaCloud uses practice money only. Nothing here is investment advice. DC Intelligence explains what already happened and does not predict prices.
      </Disclaimer>
    </div>
  );
}
