import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import AuthShell from "../components/AuthShell";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const requestCode = async (e) => {
    e?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setInfo(data.message);
      if (data.devOtp) setDevOtp(data.devOtp);
      setStep(2);
      setCooldown(60);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/reset-password", { email, otp, newPassword });
      navigate("/login", { replace: true, state: { notice: data.message } });
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError("");
    try {
      const { data } = await api.post("/auth/resend-otp", { email, purpose: "reset" });
      setInfo(data.message);
      if (data.devOtp) setDevOtp(data.devOtp);
      setCooldown(60);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthShell
      title={step === 1 ? "Reset your password" : "Choose a new password"}
      subtitle={
        step === 1
          ? "Enter your email and we'll send you a code."
          : "Enter the code from your email and a new password."
      }
      footer={
        <div className="auth-actions">
          <Link to="/login">Back to sign in</Link>
          {step === 2 && (
            <button type="button" className="link-btn" onClick={resend} disabled={cooldown > 0}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          )}
        </div>
      }
    >
      {step === 1 ? (
        <form onSubmit={requestCode}>
          <input
            className="input"
            type="email"
            placeholder="Email address"
            aria-label="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword}>
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
          <input
            className="input"
            type="password"
            placeholder="New password (8+ characters, with a number)"
            aria-label="New password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={loading || otp.length !== 6}>
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
      {info && !error && <p className="message ok" role="status">{info}</p>}
      {devOtp && <p className="message">Development code: <strong>{devOtp}</strong></p>}
      {error && <p className="message error" role="alert">{error}</p>}
    </AuthShell>
  );
}
