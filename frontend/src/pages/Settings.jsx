import { useState } from "react";
import api, { errorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import FeedBadge from "../components/FeedBadge";
import Disclaimer from "../components/Disclaimer";
import InviteCard from "../components/InviteCard";
import PasskeyCard from "../components/PasskeyCard";

export default function Settings() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const resetAccount = async () => {
    const ok = window.confirm(
      "Reset your practice account to $10,000? This clears all holdings and order history and can't be undone."
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/paper/reset");
      setMessage({ type: "ok", text: "Your practice account is back to $10,000." });
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account and practice data.</p>
        </div>
      </div>

      <div className="cols-even">
        <PasskeyCard />
        <InviteCard />
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ marginBottom: 0 }}>Account</h2>
          <div>
            <div className="label">Name</div>
            <div>{user?.name || "—"}</div>
          </div>
          <div>
            <div className="label">Email</div>
            <div>{user?.email}</div>
          </div>
          <div>
            <button type="button" className="btn" onClick={logout}>Sign out</button>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Practice account</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Start over with $10,000 of play money. Your holdings and order history are cleared.
          </p>
          <div>
            <button type="button" className="btn btn-danger" onClick={resetAccount} disabled={busy}>
              {busy ? "Resetting…" : "Reset practice account"}
            </button>
          </div>
          {message && (
            <div className={`notice ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
              {message.text}
            </div>
          )}
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ marginBottom: 0 }}>Price feed</h2>
          <div><FeedBadge /></div>
          <p className="muted small" style={{ margin: 0, lineHeight: 1.5 }}>
            "Live" means prices come from a real exchange. "Simulated" means the server couldn't reach one, so the
            numbers are made up for demonstration.
          </p>
        </div>
      </div>

      <Disclaimer>
        DeltaCloud uses practice money only. Nothing here is investment advice. Terms of Service and Privacy Policy
        will be linked here before launch.
      </Disclaimer>
    </div>
  );
}
