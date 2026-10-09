import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../hooks/useSettings";
import FeedBadge from "../components/FeedBadge";
import InviteCard from "../components/InviteCard";
import PasskeyCard from "../components/PasskeyCard";
import Disclaimer from "../components/Disclaimer";

// Sections, in the order they appear in the sidebar.
const SECTIONS = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "security", label: "Security", icon: "🔒" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "display", label: "Display & language", icon: "🎨" },
  { id: "privacy", label: "Privacy", icon: "🛡" },
  { id: "data", label: "Your data", icon: "📦" },
  { id: "invite", label: "Invite friends", icon: "✨" },
  { id: "practice", label: "Practice account", icon: "💰" },
  { id: "help", label: "Help & about", icon: "ℹ" },
];

const LANG_NAMES = {
  en: "English", ne: "नेपाली Nepali", es: "Español Spanish", hi: "हिंदी Hindi", fr: "Français French",
  ar: "العربية Arabic", zh: "中文 Chinese", bn: "বাংলা Bengali", pt: "Português Portuguese",
  ko: "한국어 Korean", vi: "Tiếng Việt Vietnamese", ur: "اردو Urdu",
};

const Toast = ({ msg, kind, onClose }) => {
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div className={`settings-toast ${kind === "error" ? "error" : "ok"}`} role="status">
      {msg}
    </div>
  );
};

const Field = ({ label, hint, children }) => (
  <label className="settings-field">
    <span className="settings-field-label">{label}</span>
    {children}
    {hint && <span className="settings-field-hint">{hint}</span>}
  </label>
);

const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    className={`settings-toggle${checked ? " on" : ""}`}
    aria-pressed={checked}
    onClick={() => onChange(!checked)}
    disabled={disabled}
  >
    <span className="settings-toggle-dot" />
  </button>
);

const Row = ({ label, hint, children }) => (
  <div className="settings-row">
    <div>
      <div className="settings-row-label">{label}</div>
      {hint && <div className="settings-row-hint">{hint}</div>}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
);

/* ---------- Profile ---------- */
function ProfileSection({ data, updateProfile, onToast }) {
  const [name, setName] = useState(data.profile.name || "");
  const [dob, setDob] = useState(data.profile.dob ? String(data.profile.dob).slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ name, dob });
      onToast("Profile updated.", "ok");
    } catch (err) {
      onToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={save}>
      <h3>Who you are</h3>
      <p className="muted small">Shown to you only. We never share it with other users.</p>
      <Field label="Display name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
      </Field>
      <Field label="Date of birth" hint="You must be 18 or older.">
        <input type="date" className="input" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)} />
      </Field>
      <Field label="Email">
        <input className="input" value={data.profile.email} disabled />
        <span className="settings-field-hint">Changing your email isn't supported yet. Email support if you need to.</span>
      </Field>
      <Field label="Joined">
        <input className="input" value={new Date(data.profile.createdAt).toLocaleDateString()} disabled />
      </Field>
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Security ---------- */
function PasswordCard({ onToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      onToast("New passwords don't match.", "error");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/settings/change-password", { currentPassword: current, newPassword: next });
      onToast(data.message, "ok");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      onToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>Change password</h3>
      <p className="muted small">For safety, every other device is signed out after you change it.</p>
      <Field label="Current password">
        <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint="At least 8 characters, with a letter and a number.">
        <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password">
        <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} />
      </Field>
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !current || !next}>
          {busy ? "Updating…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

function SessionsCard({ onToast }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    api.get("/settings/sessions").then((res) => setInfo(res.data)).catch(() => {});
  };
  useEffect(load, []);
  const signOutOthers = async () => {
    if (!window.confirm("Sign out every other device? You'll stay signed in here.")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/settings/sessions/signout-others");
      onToast(data.message, "ok");
      load();
    } catch (err) {
      onToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h3>Active sessions</h3>
      <p className="muted small">Every device you've signed in on with your email. Passkey devices are listed too.</p>
      <Row label="Signed-in devices" hint="Including this one.">
        <span className="tnum">{info?.activeDevices ?? "—"}</span>
      </Row>
      <Row label="Devices with Face ID / fingerprint" hint="One tap sign-in enabled.">
        <span className="tnum">{info?.passkeys?.length ?? 0}</span>
      </Row>
      <div className="settings-actions">
        <button type="button" className="btn" onClick={signOutOthers} disabled={busy}>
          {busy ? "Working…" : "Sign out every other device"}
        </button>
      </div>
    </div>
  );
}

function SecuritySection({ onToast }) {
  return (
    <>
      <PasskeyCard />
      <PasswordCard onToast={onToast} />
      <SessionsCard onToast={onToast} />
    </>
  );
}

/* ---------- Notifications ---------- */
function NotificationsSection({ data, updatePrefs, onToast }) {
  const p = data.preferences;
  const set = async (key, value) => {
    try {
      await updatePrefs({ [key]: value });
    } catch (err) {
      onToast(errorMessage(err), "error");
    }
  };
  return (
    <div className="card">
      <h3>What should we email you about?</h3>
      <p className="muted small">You can change these anytime. Important security emails always go through.</p>
      <Row label="Trade notifications" hint="Fills, closes and liquidations on your practice account.">
        <Toggle checked={p.tradeNotifications} onChange={(v) => set("tradeNotifications", v)} />
      </Row>
      <Row label="Price alerts" hint="When a market you're watching moves a lot.">
        <Toggle checked={p.priceAlerts} onChange={(v) => set("priceAlerts", v)} />
      </Row>
      <Row label="Weekly digest" hint="A short Sunday summary: what moved, what you did and what's ahead.">
        <Toggle checked={p.weeklyDigest} onChange={(v) => set("weeklyDigest", v)} />
      </Row>
      <Row label="Product updates" hint="New features and improvements.">
        <Toggle checked={p.productEmails} onChange={(v) => set("productEmails", v)} />
      </Row>
      <Row label="Tips and offers" hint="Occasional ideas for getting more from DeltaCloud.">
        <Toggle checked={p.marketingEmails} onChange={(v) => set("marketingEmails", v)} />
      </Row>
    </div>
  );
}

/* ---------- Display & Language ---------- */
function DisplaySection({ data, options, updatePrefs, onToast }) {
  const p = data.preferences;
  const set = async (key, value) => {
    try {
      await updatePrefs({ [key]: value });
      onToast("Saved.", "ok");
    } catch (err) {
      onToast(errorMessage(err), "error");
    }
  };
  return (
    <>
      <div className="card">
        <h3>Language</h3>
        <p className="muted small">DC Intelligence explains the market in your language. Buttons and menus stay in English for now; translations coming.</p>
        <Field label="Explain markets in">
          <select className="input" value={p.language} onChange={(e) => set("language", e.target.value)}>
            {(options?.languages || Object.keys(LANG_NAMES)).map((code) => (
              <option key={code} value={code}>{LANG_NAMES[code] || code}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="card">
        <h3>Appearance</h3>
        <Field label="Theme" hint="Observatory is the deep-space default. Try Aurora or Midnight to compare.">
          <select className="input" value={p.theme} onChange={(e) => set("theme", e.target.value)}>
            <option value="observatory">Observatory (default)</option>
            <option value="aurora">Aurora</option>
            <option value="midnight">Midnight</option>
          </select>
        </Field>
        <Row label="Reduce motion" hint="Turn off the sphere animation and other movement.">
          <Toggle checked={p.reducedMotion} onChange={(v) => set("reducedMotion", v)} />
        </Row>
      </div>

      <div className="card">
        <h3>Numbers & markets</h3>
        <Field label="Display currency" hint="How prices and your portfolio are shown. Doesn't change trading.">
          <select className="input" value={p.currency} onChange={(e) => set("currency", e.target.value)}>
            {(options?.currencies || ["USD"]).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Dashboard shows">
          <select className="input" value={p.defaultView} onChange={(e) => set("defaultView", e.target.value)}>
            <option value="all">Everything (crypto and stocks)</option>
            <option value="crypto">Crypto only</option>
            <option value="stocks">US stocks only</option>
          </select>
        </Field>
        <Field label="Favorite market" hint="The one that opens on your dashboard chart.">
          <input className="input" value={p.defaultSymbol} onChange={(e) => set("defaultSymbol", e.target.value.toUpperCase())} placeholder="BTCUSDT, AAPL, …" maxLength={20} />
        </Field>
      </div>
    </>
  );
}

/* ---------- Privacy ---------- */
function PrivacySection({ data, updatePrefs, onToast }) {
  const p = data.preferences;
  return (
    <div className="card">
      <h3>Privacy</h3>
      <p className="muted small">Your practice account is private. These control what DeltaCloud itself shows about you.</p>
      <Row label="Show me on the public leaderboard" hint="A future opt-in: top practice portfolios of the month. Off by default.">
        <Toggle checked={p.shareInLeaderboard} onChange={async (v) => {
          try { await updatePrefs({ shareInLeaderboard: v }); } catch (err) { onToast(errorMessage(err), "error"); }
        }} />
      </Row>
      <div style={{ marginTop: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Read our <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a> and{" "}
          <a href="/terms" target="_blank" rel="noreferrer">terms of service</a>.
        </p>
      </div>
    </div>
  );
}

/* ---------- Your data ---------- */
function DataSection({ onToast }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const { logout } = useAuth();
  const navigate = useNavigate();

  const exportData = async () => {
    setBusy(true);
    try {
      const res = await api.get("/settings/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "deltacloud-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onToast("Your data is downloading.", "ok");
    } catch (err) {
      onToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    if (confirm !== "DELETE") return;
    if (!window.confirm("This permanently deletes your DeltaCloud account and everything in it. There's no undo. Delete anyway?")) return;
    setBusy(true);
    try {
      await api.post("/settings/delete-account", { confirm, password });
      onToast("Your account was deleted.", "ok");
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      onToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h3>Download everything</h3>
        <p className="muted small">A single JSON file with your profile, preferences, practice account, orders and trade journal.</p>
        <div className="settings-actions">
          <button type="button" className="btn" onClick={exportData} disabled={busy}>
            {busy ? "Preparing…" : "Download my data"}
          </button>
        </div>
      </div>

      <form className="card settings-danger" onSubmit={deleteAccount}>
        <h3>Delete account</h3>
        <p className="muted small">This removes your DeltaCloud account, your practice portfolio and your trade history. The founder dashboard's aggregate numbers stay. There's no undo.</p>
        <Field label="Password">
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label='Type "DELETE" to confirm'>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
        </Field>
        <div className="settings-actions">
          <button type="submit" className="btn btn-danger" disabled={busy || confirm !== "DELETE" || !password}>
            {busy ? "Working…" : "Delete my account"}
          </button>
        </div>
      </form>
    </>
  );
}

/* ---------- Practice account ---------- */
function PracticeSection({ onToast }) {
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!window.confirm("Reset your practice account to $10,000? Your holdings and order history are cleared.")) return;
    setBusy(true);
    try {
      await api.post("/paper/reset");
      onToast("Your practice account is back to $10,000.", "ok");
    } catch (err) {
      onToast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="card">
        <h3>Price feed</h3>
        <div style={{ marginBottom: 8 }}><FeedBadge /></div>
        <p className="muted small">"Live" means prices come from a real exchange. "Simulated" means the server couldn't reach one, so numbers are made up for demo.</p>
      </div>
      <div className="card">
        <h3>Practice account</h3>
        <p className="muted small">Start over with $10,000 of play money. Your holdings and order history are cleared.</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-danger" onClick={reset} disabled={busy}>
            {busy ? "Resetting…" : "Reset practice account"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Help ---------- */
function HelpSection() {
  return (
    <>
      <div className="card">
        <h3>Get help</h3>
        <p>
          Email <a href="mailto:shubham@joindeltacloud.com">shubham@joindeltacloud.com</a>. We read every message.
        </p>
      </div>
      <div className="card">
        <h3>About DeltaCloud</h3>
        <p className="muted small">Practice-trade every coin and US stock with $10,000 of play money. DC Intelligence explains why markets move, in your language.</p>
        <Row label="Version" hint="Shown so support can help faster.">
          <span className="tnum">1.0.0</span>
        </Row>
        <Row label="Terms">
          <a href="/terms">View</a>
        </Row>
        <Row label="Privacy policy">
          <a href="/privacy">View</a>
        </Row>
      </div>
    </>
  );
}

/* ---------- Main ---------- */
export default function Settings() {
  const { user, logout } = useAuth();
  const { data, options, loading, error, reload, updatePrefs, updateProfile } = useSettings();
  const [section, setSection] = useState("profile");
  const [toast, setToast] = useState({ msg: "", kind: "ok" });
  const showToast = (msg, kind) => setToast({ msg, kind });
  const navRef = useRef(null);

  if (loading) {
    return (
      <div className="page">
        <h1>Settings</h1>
        <p className="muted">Loading your settings…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page">
        <h1>Settings</h1>
        <div className="notice error">{error || "Couldn't load your settings."}</div>
        <button type="button" className="btn" onClick={reload}>Try again</button>
      </div>
    );
  }

  const content = {
    profile: <ProfileSection data={data} updateProfile={updateProfile} onToast={showToast} />,
    security: <SecuritySection onToast={showToast} />,
    notifications: <NotificationsSection data={data} updatePrefs={updatePrefs} onToast={showToast} />,
    display: <DisplaySection data={data} options={options} updatePrefs={updatePrefs} onToast={showToast} />,
    privacy: <PrivacySection data={data} updatePrefs={updatePrefs} onToast={showToast} />,
    data: <DataSection onToast={showToast} />,
    invite: <InviteCard />,
    practice: <PracticeSection onToast={showToast} />,
    help: <HelpSection />,
  }[section];

  const activeLabel = SECTIONS.find((s) => s.id === section)?.label || "Settings";

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Signed in as <b>{user?.name}</b> ({user?.email})</p>
        </div>
        <button type="button" className="btn" onClick={logout}>Sign out</button>
      </div>

      <Toast msg={toast.msg} kind={toast.kind} onClose={() => setToast({ msg: "", kind: "ok" })} />

      <div className="settings-layout">
        <nav className="settings-nav" ref={navRef} aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-item${section === s.id ? " active" : ""}`}
              aria-pressed={section === s.id}
              onClick={() => {
                setSection(s.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span className="settings-nav-icon" aria-hidden="true">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <h2 className="settings-section-title">{activeLabel}</h2>
          <div className="settings-cards">{content}</div>
        </div>
      </div>

      <Disclaimer>
        DeltaCloud uses practice money only. Nothing here is investment advice.
      </Disclaimer>
    </div>
  );
}
