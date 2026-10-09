import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import AuthShell from "../components/AuthShell";
import { useAuth } from "../context/AuthContext";
import { passkeysAvailable, passkeyLabel, getPasskey, cancelled } from "../lib/passkey";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const notice = location.state?.notice;
  const { login } = useAuth();
  const [faceLoading, setFaceLoading] = useState(false);
  const canPasskey = passkeysAvailable();

  // One tap: Face ID / fingerprint, no password and no emailed code.
  const signInWithPasskey = async () => {
    if (faceLoading) return;
    setFaceLoading(true);
    setError("");
    try {
      const { data: start } = await api.post("/auth/passkey/login/options");
      const response = await getPasskey(start.options);
      const { data } = await api.post("/auth/passkey/login/verify", { response, challengeToken: start.challengeToken });
      login(data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (!cancelled(err)) setError(err?.response ? errorMessage(err) : "Face ID sign-in didn't work on this device. Use your email instead.");
      setFaceLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      try {
        sessionStorage.setItem("dc_otp_email", email.trim().toLowerCase());
      } catch {
        /* the code screen also receives the email through navigation state */
      }
      navigate("/verify-otp", { state: { email: email.trim().toLowerCase(), message: data.message, devOtp: data.devOtp } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to DeltaCloud. We'll email you a code to finish."
      footer={
        <div className="auth-actions">
          <Link to="/register">Create account</Link>
          <Link to="/forgot-password" className="warm">
            Forgot password?
          </Link>
        </div>
      }
    >
      {canPasskey && (
        <>
          <button type="button" className="btn btn-primary btn-block passkey-btn" onClick={signInWithPasskey} disabled={faceLoading}>
            {faceLoading ? "Waiting for you…" : `Sign in with ${passkeyLabel()}`}
          </button>
          <div className="or-line">
            <span>or use your email</span>
          </div>
        </>
      )}
      <form onSubmit={submit}>
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
        <div className="password-wrap">
          <input
            className="input"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="toggle-pass" onClick={() => setShowPassword((s) => !s)}>
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Sending code…" : "Continue"}
        </button>
      </form>
      {notice && <p className="message ok" role="status">{notice}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
    </AuthShell>
  );
}
