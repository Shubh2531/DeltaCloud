import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import AuthShell from "../components/AuthShell";

function rememberedEmail() {
  try {
    return sessionStorage.getItem("dc_otp_email");
  } catch {
    return null;
  }
}

export default function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const email = location.state?.email || rememberedEmail();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(location.state?.message || "");
  const [devOtp, setDevOtp] = useState(location.state?.devOtp || "");
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!email) return <Navigate to="/login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (loading || otp.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/verify-otp", { email, otp });
      login(data); // saves the session; the app switches to the signed-in screens
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError("");
    try {
      const { data } = await api.post("/auth/resend-otp", { email, purpose: "login" });
      setInfo(data.message);
      if (data.devOtp) setDevOtp(data.devOtp);
      setCooldown(60);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthShell
      title="Check your email"
      subtitle={`Enter the 6-digit code we sent to ${email}.`}
      footer={
        <div className="auth-actions">
          <button type="button" className="link-btn" onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <Link to="/login">Use a different email</Link>
        </div>
      }
    >
      <form onSubmit={submit}>
        <input
          className="input otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          aria-label="6-digit code"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={loading || otp.length !== 6}>
          {loading ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
      {info && !error && <p className="message ok" role="status">{info}</p>}
      {devOtp && <p className="message">Development code: <strong>{devOtp}</strong></p>}
      {error && <p className="message error" role="alert">{error}</p>}
    </AuthShell>
  );
}
