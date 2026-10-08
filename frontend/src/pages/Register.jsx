import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import AuthShell from "../components/AuthShell";

// Bounds for the date-of-birth field: must be 18+ and not absurdly old.
function dobBounds() {
  const d = new Date();
  const max = new Date(Date.UTC(d.getUTCFullYear() - 18, d.getUTCMonth(), d.getUTCDate()));
  const min = new Date(Date.UTC(d.getUTCFullYear() - 120, d.getUTCMonth(), d.getUTCDate()));
  const iso = (x) => x.toISOString().slice(0, 10);
  return { min: iso(min), max: iso(max) };
}

export default function Register() {
  const navigate = useNavigate();
  const { min: dobMin, max: dobMax } = dobBounds();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
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
      const { data } = await api.post("/auth/register", { name, email, password, dob });
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
        <label className="label" htmlFor="reg-dob">
          Date of birth
        </label>
        <input
          id="reg-dob"
          className="input"
          type="date"
          aria-label="Date of birth"
          autoComplete="bday"
          min={dobMin}
          max={dobMax}
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          required
        />
        <p className="small muted" style={{ margin: "2px 0 14px" }}>
          You must be 18 or older. We ask so we don't mix up two people who share a name.
        </p>
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
