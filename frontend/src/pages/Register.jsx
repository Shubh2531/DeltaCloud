import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import AuthShell from "../components/AuthShell";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      const normalized = email.trim().toLowerCase();
      try {
        sessionStorage.setItem("dc_otp_email", normalized);
      } catch {
        /* the code screen also receives the email through navigation state */
      }
      navigate("/verify-otp", { state: { email: normalized, message: data.message, devOtp: data.devOtp } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Practice with play money and learn how markets move."
      footer={
        <div className="auth-actions">
          <span className="muted">Already have an account?</span>
          <Link to="/login">Sign in</Link>
        </div>
      }
    >
      <form onSubmit={submit}>
        <input
          className="input"
          type="text"
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
            placeholder="Password (8+ characters, with a number)"
            aria-label="Password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="toggle-pass" onClick={() => setShowPassword((s) => !s)}>
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      {error && <p className="message error" role="alert">{error}</p>}
    </AuthShell>
  );
}
