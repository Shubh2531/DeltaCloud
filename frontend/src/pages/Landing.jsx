import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { Link } from "react-router-dom";
import WaveField from "../components/WaveField";
import "../styles/landing.css";

const FEATURES = [
  ["Practice account", "Start with $10,000. Buy and sell six popular crypto markets at the latest price and watch your portfolio move."],
  ["Real prices, clearly labelled", "Prices come from a live market feed. If the feed drops, DeltaCloud switches to simulated prices and says so on every screen."],
  ["Delta News", "Headlines from central banks, regulators and major outlets, filtered to what moves markets and merged when several outlets report the same story."],
  ["Market pulse", "A plain-language read on the last 24 hours: how many markets are up, which led, which lagged, and how the news is worded."],
  ["Growth Lab", "Try compounding on paper. Change the starting amount, the regular contribution and the return, and compare two scenarios side by side."],
];

const STEPS = [
  ["Create an account", "Use your email. We send a 6-digit code to confirm it is you."],
  ["Get $10,000 to practice with", "Your balance is ready as soon as you sign in."],
  ["Place practice trades", "Pick a market, choose an amount, and see your portfolio update."],
  ["Read what happened", "Use the news and the market pulse to understand the moves."],
];

const WAYS = [
  ["iPhone and iPad", "Open the site in Safari, tap Share, then Add to Home Screen."],
  ["Android", "Open the site in Chrome, tap the menu, then Install app."],
  ["Mac, Windows and Linux", "Open the site in Chrome or Edge and click the install icon in the address bar."],
];

const RING = [
  ["BTC", "Bitcoin", "M0 40 L20 34 L40 38 L60 22 L80 28 L100 10"],
  ["ETH", "Ethereum", "M0 30 L20 36 L40 24 L60 30 L80 16 L100 20"],
  ["SOL", "Solana", "M0 42 L20 30 L40 34 L60 18 L80 24 L100 8"],
  ["XRP", "XRP", "M0 24 L20 28 L40 20 L60 32 L80 22 L100 26"],
  ["ADA", "Cardano", "M0 36 L20 26 L40 30 L60 14 L80 20 L100 12"],
  ["DOGE", "Dogecoin", "M0 20 L20 30 L40 22 L60 34 L80 28 L100 38"],
];

const FACTS = [
  ["6", "markets to practice on"],
  ["11", "news sources, filtered"],
  ["$10,000", "practice balance"],
  ["5", "platforms: iPhone, Android, Mac, Windows, Linux"],
];

function Spark() {
  return (
    <svg className="lp-spark" viewBox="0 0 320 120" role="img" aria-label="Example line chart of a practice account value rising over time">
      <defs>
        <linearGradient id="lpFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b7bff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#8b7bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="lp-spark-area" d="M0 96 L30 88 L62 92 L96 70 L128 76 L160 52 L194 60 L226 36 L258 44 L290 22 L320 28 L320 120 L0 120 Z" fill="url(#lpFill)" />
      <path className="lp-spark-line" pathLength="1" d="M0 96 L30 88 L62 92 L96 70 L128 76 L160 52 L194 60 L226 36 L258 44 L290 22 L320 28" fill="none" stroke="#8b7bff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Six market cards turning slowly on a 3D ring. The lines are decorative shapes, not real prices.
function Ring() {
  return (
    <div className="lp-ring" aria-hidden="true">
      <div className="lp-ring-track">
        {RING.map(([sym, name, d], i) => (
          <div key={sym} className="lp-ring-item" style={{ "--i": i }}>
            <b>{sym}</b>
            <span>{name}</span>
            <svg viewBox="0 0 100 50"><path d={d} fill="none" stroke="#8b7bff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        ))}
      </div>
    </div>
  );
}

function Showcase() {
  return (
    <div className="lp-show">
      <div className="lp-panel">
        <h3>Markets</h3>
        {[["BTC", "+1.2%", "pos"], ["ETH", "+0.8%", "pos"], ["SOL", "−0.4%", "neg"], ["XRP", "+0.3%", "pos"]].map(([s, v, t]) => (
          <div key={s} className="lp-mini"><b>{s}</b><i className={t}>{v}</i></div>
        ))}
        <small>Example</small>
      </div>
      <div className="lp-panel">
        <h3>Delta News</h3>
        <p>Central bank holds rates steady</p>
        <p>Bitcoin fund inflows return</p>
        <p>Oil slips as supply talks continue</p>
        <small>Example headlines</small>
      </div>
      <div className="lp-panel">
        <h3>Market pulse</h3>
        <svg viewBox="0 0 200 118" className="lp-gauge" aria-hidden="true">
          <defs><linearGradient id="lpg" x1="0" x2="1"><stop offset="0" stopColor="#ef4444" /><stop offset=".5" stopColor="#f5b942" /><stop offset="1" stopColor="#22c55e" /></linearGradient></defs>
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#lpg)" strokeWidth="14" strokeLinecap="round" />
          <line x1="100" y1="100" x2="132" y2="42" stroke="#e6ebf5" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="100" r="7" fill="#e6ebf5" />
        </svg>
        <p>Markets are mostly higher over 24 hours.</p>
        <small>Example</small>
      </div>
    </div>
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

// Real number of confirmed accounts, shown once it's big enough to mean something.
function useUserCount() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let alive = true;
    api
      .get("/growth/public")
      .then((res) => alive && setCount(res.data.users))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return count;
}

export default function Landing() {
  const users = useUserCount();
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
          <Link to="/register" className="lp-btn lp-btn-sm">Start free</Link>
        </nav>
      </header>

      <main data-stage>
        <section className="lp-hero">
          <div className="lp-aurora" aria-hidden="true" />
          <WaveField />
          <div className="lp-hero-copy">
            <h1>Learn how markets move before you risk a dollar.</h1>
            <p className="lp-lede">
              DeltaCloud gives you a $10,000 practice account, real prices for every coin and US stock, and DC Intelligence: it explains why markets moved, in plain words and in your language.
            </p>
            <div className="lp-cta">
              <Link to="/register" className="lp-btn">Create a free account</Link>
              <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
            </div>
            <p className="lp-fine">
              {Number.isFinite(users) && users >= 50 ? `${users.toLocaleString()} people learning with DeltaCloud. ` : ""}
              Free to start. Works on every device.
            </p>
          </div>
          <Scene />
        </section>

        <section className="lp-facts" aria-label="At a glance">
          {FACTS.map(([n, l]) => (
            <div key={l}><b>{n}</b><span>{l}</span></div>
          ))}
        </section>

        <section className="lp-section lp-ring-section">
          <h2>Six markets. One place.</h2>
          <Ring />
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

        <section className="lp-section lp-show-section">
          <h2>Everything on one screen</h2>
          <Showcase />
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

        <section id="install" className="lp-section">
          <h2>Use it on every device</h2>
          <p className="lp-body lp-wide">
            DeltaCloud runs in any modern browser, and you can install it like an app. It adapts from a phone screen to a large monitor.
          </p>
          <dl className="lp-defs">
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
        <p className="lp-copy">© 2025 Delta Cloud</p>
      </footer>
    </div>
  );
}
