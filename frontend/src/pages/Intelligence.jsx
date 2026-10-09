import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../lib/api";
import { rememberMarkets } from "../lib/symbols";
import { useMarketInfo } from "../hooks/useMarketInfo";
import { priceFmt, pct, timeAgo, tone } from "../lib/format";
import DeltaOrb from "../components/DeltaOrb";
import MarketPicker from "../components/MarketPicker";
import "../styles/orb.css";
import "../styles/intel.css";

const SUGGESTIONS = [
  "Why did it move today?",
  "Is it in an uptrend or a downtrend?",
  "How risky is it right now?",
  "What do the technicals say, in simple words?",
];

const parseChange = (text) => {
  const n = Number(String(text || "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Turns an explanation into the sphere's state: colour from the mood, ripples from the
// swing risk, and one orbiting dot per timeframe.
function sphereReading(result, thinking) {
  if (thinking) {
    return { energy: 0.95, delta: 0, headline: "Thinking", nodes: [] };
  }
  if (!result) return { energy: 0.25, delta: 0, headline: "Ready", nodes: [] };
  const swing = result.risk?.typicalDailyMove;
  const energy = Number.isFinite(swing) ? Math.min(1, Math.max(0.12, swing / 8)) : 0.3;
  const nodes = [{ id: "d1", base: "Today", change: result.change1d ?? 0 }];
  const range = result.technicals?.find((t) => t.label === "vs 20-day average");
  const avg = parseChange(range?.value);
  if (avg !== null) nodes.push({ id: "a20", base: "vs 20d avg", change: avg });
  return {
    energy,
    delta: Math.max(-1, Math.min(1, (result.mood?.score ?? 0) / 100)),
    headline: `${result.market.name}: ${result.mood?.label}`,
    nodes,
  };
}

function MoodMeter({ score, label }) {
  const pos = ((Math.max(-100, Math.min(100, score)) + 100) / 200) * 100;
  return (
    <div className="intel-mood">
      <div className="intel-mood-head">
        <span>Mood</span>
        <b className={score > 15 ? "pos" : score < -15 ? "neg" : ""}>{label}</b>
      </div>
      <div className="intel-mood-bar" role="img" aria-label={`Mood ${label}, ${score} on a scale from -100 bearish to +100 bullish`}>
        <i style={{ left: `${pos}%` }} />
      </div>
      <div className="intel-mood-ends">
        <span>Bearish</span>
        <span>Neutral</span>
        <span>Bullish</span>
      </div>
    </div>
  );
}

export default function Intelligence() {
  const [params, setParams] = useSearchParams();
  const market = useMarketInfo(params.get("symbol") || "BTCUSDT");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [spike, setSpike] = useState(0);
  const [status, setStatus] = useState(null);
  const request = useRef(0);

  useEffect(() => {
    api
      .get("/intel/status")
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, []);

  const ask = useCallback(async (symbol, q) => {
    const id = ++request.current;
    setThinking(true);
    setError("");
    setAsked(q);
    try {
      const { data } = await api.post("/intel/explain", { symbol, question: q });
      if (id !== request.current) return;
      rememberMarkets([data.market]);
      setResult(data);
      setSpike((n) => n + 1);
    } catch (err) {
      if (id === request.current) setError(errorMessage(err));
    } finally {
      if (id === request.current) setThinking(false);
    }
  }, []);

  // Explain the chosen market as soon as it's picked.
  useEffect(() => {
    ask(market.id, "");
    setQuestion("");
  }, [market.id, ask]);

  const reading = useMemo(() => sphereReading(result, thinking), [result, thinking]);
  const e = result?.explanation;
  const showing = result && result.market.id === market.id;

  const submit = (ev) => {
    ev.preventDefault();
    if (question.trim()) ask(market.id, question.trim());
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>DC Intelligence</h1>
          <p>Pick any coin or US stock. DC Intelligence reads the live price, the charts and the news, and explains what is going on in plain English.</p>
        </div>
      </div>

      <div className="intel-top">
        <div className="card intel-sphere">
          <DeltaOrb reading={reading} spike={spike} label="DC Intelligence" />
          <p className="intel-sphere-caption" aria-live="polite">
            {thinking ? `Reading ${market.name}'s prices and news…` : showing ? reading.headline : "Pick a market to begin."}
          </p>
        </div>

        <div className="card intel-ask">
          <MarketPicker value={market.id} onChange={(id) => setParams({ symbol: id }, { replace: true })} label="Explain" />
          <form className="intel-form" onSubmit={submit}>
            <label htmlFor="intel-q" className="small muted">
              Ask about {market.name}
            </label>
            <div className="intel-form-row">
              <input
                id="intel-q"
                className="input"
                type="text"
                maxLength={300}
                placeholder={`e.g. Why is ${market.base} ${result?.change1d < 0 ? "down" : "up"} today?`}
                value={question}
                onChange={(ev) => setQuestion(ev.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={thinking || !question.trim()}>
                Ask
              </button>
            </div>
            <div className="intel-suggest">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-sm"
                  disabled={thinking}
                  onClick={() => {
                    setQuestion(s);
                    ask(market.id, s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </form>
          {status && !status.ai && (
            <p className="small muted" style={{ margin: 0 }}>
              Running on built-in analysis. Answers get more natural once the AI writer is switched on.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      {showing && e && (
        <div className={`intel-result${thinking ? " stale" : ""}`} aria-busy={thinking}>
          <div className="card">
            <div className="intel-title">
              <div>
                <span className={`kind-tag ${result.market.kind}`}>{result.market.kind === "stock" ? "Stock" : "Crypto"}</span>
                <h2>{e.headline}</h2>
              </div>
              <div className="intel-price tnum">
                {priceFmt(result.price)} <span className={tone(result.change1d)}>{pct(result.change1d)}</span>
                {result.market.kind === "stock" && !result.marketOpen && <span className="small muted"> market closed</span>}
              </div>
            </div>

            {asked && e.answer && (
              <div className="intel-answer">
                <b>You asked: {asked}</b>
                <p>{e.answer}</p>
              </div>
            )}

            <p className="intel-summary">{e.summary}</p>

            <div className="intel-grid">
              <MoodMeter score={result.mood.score} label={result.mood.label} />
              <div className="intel-risk">
                <span>Swing risk</span>
                <b className={`risk-${String(result.risk.level).toLowerCase().replace(" ", "-")}`}>{result.risk.level}</b>
                {result.risk.typicalDailyMove != null && <small>About ±{result.risk.typicalDailyMove}% on a normal day</small>}
              </div>
            </div>
          </div>

          <div className="cols-even">
            <div className="card">
              <h3>What happened</h3>
              <p>{e.whatHappened}</p>
              <h3>Why it may have moved</h3>
              <p>{e.why}</p>
              {e.watch?.length > 0 && (
                <>
                  <h3>Worth watching</h3>
                  <ul className="intel-watch">
                    {e.watch.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="card">
              <h3>The technicals, in plain words</h3>
              <div className="intel-tech">
                {result.technicals.map((t) => (
                  <div key={t.label} className="intel-tech-item">
                    <div className="intel-tech-head">
                      <span>{t.label}</span>
                      <b className="tnum">{t.value}</b>
                    </div>
                    <p>{t.meaning}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3>News mentioning {result.market.name}</h3>
            {result.news.length === 0 ? (
              <p className="muted">No recent headline mentions {result.market.name} in the sources we follow.</p>
            ) : (
              <ul className="intel-news">
                {result.news.map((n) => (
                  <li key={n.link || n.title}>
                    <a href={n.link} target="_blank" rel="noopener noreferrer">
                      {n.title}
                    </a>
                    <span className="small muted">
                      {" "}
                      {n.source} · {timeAgo(n.publishedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="small muted intel-foot">
            {result.source === "ai" ? "Written by AI from the live numbers and headlines above. " : "Built-in analysis from the live numbers and headlines above. "}
            Updated {timeAgo(result.asOf)}. {result.disclaimer}{" "}
            <Link to={`/trading?symbol=${encodeURIComponent(result.market.id)}`}>Practice-trade {result.market.base}</Link>
          </p>
        </div>
      )}
    </div>
  );
}
