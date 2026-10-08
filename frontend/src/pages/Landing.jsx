import { useRef } from "react";
import { Link } from "react-router-dom";
import WaveField from "../components/WaveField";
import "../styles/landing.css";

const FEATURES = [
  ["Practice account", "Start with $10,000 of play money. Buy and sell six popular crypto markets at the latest price. Nothing you do here moves real money."],
  ["Real prices, clearly labelled", "Prices come from a live market feed. If the feed drops, DeltaCloud switches to simulated prices and says so on every screen."],
  ["Plain-language readings", "See what a market just did in simple terms: its recent trend, how far it moved, and how wide its range was. No buy or sell calls."],
  ["Growth Lab", "Try compounding on paper. Change the starting amount, the regular contribution and the return, and watch two scenarios side by side."],
];

const STEPS = [
  ["Create an account", "Use your email. We send a 6-digit code to confirm it is you."],
  ["Get $10,000 to practice with", "Your practice balance is ready as soon as you sign in."],
  ["Place practice trades", "Pick a market, choose an amount, and see your portfolio update."],
  ["Read what happened", "Check the plain-language readings to understand the moves."],
];

const NOTS = [
  "Hold or move real money",
  "Connect to a brokerage or bank",
  "Tell you what to buy or sell",
  "Offer leverage or short selling",
];

const WAYS = [
  ["iPhone and iPad", "Open the site in Safari, tap Share, then Add to Home Screen."],
  ["Android", "Open the site in Chrome, tap the menu, then Install app."],
  ["Mac, Windows and Linux", "Open the site in Chrome or Edge and click the install icon in the address bar."],
];

function Spark() {
  return (
    <svg className="lp-spark" viewBox="0 0 320 120" role="img" aria-label="Example line chart of a practice account value rising over time">
      <defs>
        <linearGradient id="lpFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00e5b4" stopOpacity="0.28" />
          <stop offset="1" stopColor="#00e5b4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="lp-spark-area" d="M0 96 L30 88 L62 92 L96 70 L128 76 L160 52 L194 60 L226 36 L258 44 L290 22 L320 28 L320 120 L0 120 Z" fill="url(#lpFill)" />
      <path className="lp-spark-line" pathLength="1" d="M0 96 L30 88 L62 92 L96 70 L128 76 L160 52 L194 60 L226 36 L258 44 L290 22 L320 28" fill="none" stroke="#00e5b4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// A layered stack of cards in 3D that leans toward the pointer. All values are illustrations.
function Scene() {
  const box = useRef(null);
  const frame = useRef(0);
  const move = (e) => {
    if (e.pointerType === "touch") return;
    const r = box.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      box.current.style.setProperty("--ry", `${(-16 + x * 14).toFixed(2)}deg`);
      box.current.style.setProperty("--rx", `${(8 - y * 10).toFixed(2)}deg`);
    });
  };
  const reset = () => {
    box.current.style.removeProperty("--ry");
    box.current.style.removeProperty("--rx");
  };
  return (
    <figure className="lp-scene" ref={box} onPointerMove={move} onPointerLeave={reset} aria-label="Example of the DeltaCloud practice account screen">
      <div className="lp-stage">
        <div className="lp-layer lp-l-main">
          <div className="lp-card-top"><span>Practice account</span><span className="lp-pill">Example</span></div>
          <div className="lp-card-value">$10,482.17</div>
          <div className="lp-card-delta">+$482.17 since you started</div>
          <Spark />
          <div className="lp-card-rows">
            <div><span>Cash</span><b>$6,240.00</b></div>
            <div><span>Invested</span><b>$4,242.17</b></div>
          </div>
        </div>
        <div className="lp-layer lp-l-mkts">
          <div className="lp-mini-h">Markets</div>
          <div className="lp-mini"><b>BTC</b><i className="pos">+1.2%</i></div>
          <div className="lp-mini"><b>ETH</b><i className="pos">+0.8%</i></div>
          <div className="lp-mini"><b>SOL</b><i className="neg">−0.4%</i></div>
        </div>
        <div className="lp-layer lp-l-fill">
          <span className="lp-tick" aria-hidden="true">✓</span>
          <div><b>Practice order filled</b><span>Bought 0.05 BTC</span></div>
        </div>
      </div>
      <figcaption>An illustration of the screen, not real results.</figcaption>
    </figure>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="lp-brand" aria-label="DeltaCloud home">
          <span className="lp-mark" aria-hidden="true">Δ</span> DeltaCloud
        </Link>
        <nav className="lp-nav-links" aria-label="Main">
          <a href="#features">What you can do</a>
          <a href="#install">Get the app</a>
          <Link to="/login" className="lp-link">Sign in</Link>
          <Link to="/register" className="lp-btn lp-btn-sm">Start practicing</Link>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <WaveField />
          <div className="lp-hero-copy">
            <h1>Learn how markets move before you risk a dollar.</h1>
            <p className="lp-lede">
              DeltaCloud gives you a $10,000 practice account, real market prices and plain-language readings of what just happened. It is built for learning, so no real money is involved.
            </p>
            <div className="lp-cta">
              <Link to="/register" className="lp-btn">Create a free account</Link>
              <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
            </div>
            <p className="lp-fine">Free to use. Practice only. Not investment advice.</p>
          </div>

          <Scene />
        </section>

        <section id="features" className="lp-section">
          <h2>What you can do</h2>
          <dl className="lp-defs">
            {FEATURES.map(([t, d]) => (
              <div key={t} className="lp-def">
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-section lp-light">
          <h2>How it works</h2>
          <ol className="lp-steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <span className="lp-step-n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-split">
          <div>
            <h2>Plain about what this is</h2>
            <p className="lp-body">
              DeltaCloud is an education tool. Every trade is practice, and every price is labelled Live or Simulated so you always know what you are looking at. The readings describe the past. They do not predict what comes next.
            </p>
          </div>
          <div>
            <h3 className="lp-sub">DeltaCloud does not</h3>
            <ul className="lp-nots">
              {NOTS.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        </section>

        <section id="install" className="lp-section lp-light">
          <h2>Use it on every device</h2>
          <p className="lp-body lp-wide">
            DeltaCloud runs in any modern browser, and you can install it like an app. It adapts from a phone screen to a large monitor.
          </p>
          <dl className="lp-defs lp-defs-light">
            {WAYS.map(([t, d]) => (
              <div key={t} className="lp-def">
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-final">
          <h2>Start with $10,000 of practice money.</h2>
          <Link to="/register" className="lp-btn">Create a free account</Link>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-brand"><span className="lp-mark" aria-hidden="true">Δ</span> DeltaCloud</div>
        <p>
          DeltaCloud is for education and practice only. It is not a broker, bank or adviser, and nothing here is investment advice. Prices may be delayed or simulated. Past movement does not predict future results.
        </p>
        <p className="lp-copy">© {new Date().getFullYear()} Delta Cloud LLC</p>
      </footer>
    </div>
  );
}
