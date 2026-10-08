import { marketPulse, pulseSentence } from "../lib/pulse";
import { pct, tone } from "../lib/format";

const LABEL = { positive: "Positive", negative: "Negative", neutral: "Neutral" };

// A half-circle gauge. The needle shows the average 24-hour move across all markets.
function Gauge({ value }) {
  const angle = -90 + value * 180;
  return (
    <svg viewBox="0 0 200 118" className="gauge" role="img" aria-label="Gauge of the average 24-hour move across all markets">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="0.5" stopColor="#f5b942" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round" />
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" opacity="0.9" />
      <g className="gauge-needle" style={{ transform: `rotate(${angle}deg)` }}>
        <line x1="100" y1="100" x2="100" y2="38" stroke="#e6ebf5" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="7" fill="#e6ebf5" />
    </svg>
  );
}

export default function MarketPulse({ prices, stories }) {
  const p = marketPulse(prices, stories);
  const b = p.breadth;
  const total = p.news.total || 1;

  return (
    <section className="card pulse" aria-label="Market pulse">
      <div className="page-head" style={{ marginBottom: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Market pulse</h2>
        <span className="small muted">Describes the last 24 hours, not what comes next</span>
      </div>
      <p className="pulse-line">{pulseSentence(p)}</p>

      <div className="pulse-grid">
        <div className="pulse-gauge">
          {b ? <Gauge value={b.needle} /> : <div className="muted">—</div>}
          {b && <div className={`pulse-avg tnum ${tone(b.avg)}`}>{pct(b.avg)} average</div>}
        </div>

        <div className="pulse-stats">
          {b && (
            <>
              <div className="pulse-row"><span className="muted">Strongest</span><b>{b.best.name} <span className={`tnum ${tone(b.best.change)}`}>{pct(b.best.change)}</span></b></div>
              <div className="pulse-row"><span className="muted">Weakest</span><b>{b.worst.name} <span className={`tnum ${tone(b.worst.change)}`}>{pct(b.worst.change)}</span></b></div>
              <div className="pulse-row"><span className="muted">Up / down</span><b className="tnum">{b.up} / {b.down}</b></div>
            </>
          )}
        </div>

        <div className="pulse-news">
          <div className="small muted">Headline wording ({p.news.total} stories)</div>
          {p.news.total > 0 ? (
            <>
              <div className="tonebar" role="img" aria-label={`Positive ${p.news.tone.positive}, neutral ${p.news.tone.neutral}, negative ${p.news.tone.negative}`}>
                <span style={{ width: `${(p.news.tone.positive / total) * 100}%`, background: "var(--pos)" }} />
                <span style={{ width: `${(p.news.tone.neutral / total) * 100}%`, background: "var(--faint)" }} />
                <span style={{ width: `${(p.news.tone.negative / total) * 100}%`, background: "var(--neg)" }} />
              </div>
              <div className="small muted">
                {["positive", "neutral", "negative"].map((k) => `${LABEL[k]} ${p.news.tone[k]}`).join(" · ")}
              </div>
              {p.news.topTopics.length > 0 && (
                <div className="story-tags" style={{ marginTop: 8 }}>
                  {p.news.topTopics.map((t) => <span key={t.id} className="chip">{t.id} · {t.n}</span>)}
                </div>
              )}
            </>
          ) : (
            <div className="small muted">News is still loading.</div>
          )}
        </div>
      </div>
    </section>
  );
}
