import "../styles/auth.css";

// Shared frame for sign-in screens: moving background, orb and a glass card.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="auth-container" data-stage>
      <div className="plasma" aria-hidden="true" />
      <div className="ai-orb" aria-hidden="true" />
      <section className="auth-card">
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
        {footer}
      </section>
    </main>
  );
}
