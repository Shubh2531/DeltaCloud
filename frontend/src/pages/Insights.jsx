import { useEffect, useState } from "react";
import api, { errorMessage } from "../lib/api";
import { MARKETS } from "../lib/symbols";
import FeedBadge from "../components/FeedBadge";
import { priceFmt, pct, tone } from "../lib/format";

const TREND_LABEL = { rising: "Rising", falling: "Falling", sideways: "Sideways" };

export default function Insights() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setData(null);
    const load = () =>
      api
        .get(`/market/insights/${symbol}`)
        .then((res) => {
          if (!alive) return;
          setData(res.data);
          setError("");
        })
        .catch((err) => alive && setError(errorMessage(err)));
    load();
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol]);

  const ins = data?.insights;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p>
            Plain-language readings of what a market has done recently. They're built from simple rules you can
            check yourself, not from a prediction.
          </p>
        </div>
        <FeedBadge />
      </div>

      <div className="seg" role="group" aria-label="Market">
        {MARKETS.map((m) => (
          <button key={m.id} type="button" className="btn" aria-pressed={m.id === symbol} onClick={() => setSymbol(m.id)}>
            {m.base}
          </button>
        ))}
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}
      {!data && !error && <div className="card muted">Loading…</div>}

      {data && !ins.ready && (
        <div className="card">
          <h2>Collecting data for {data.name}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Insights need at least {ins.needed} price readings. So far: {ins.collected}. Readings arrive about every 2
            seconds, so this takes around a minute.
          </p>
          <progress value={ins.collected} max={ins.needed} style={{ width: "100%" }} aria-label="Readings collected" />
        </div>
      )}

      {data && ins.ready && (
        <>
          {data.mode === "simulated" && (
            <div className="notice warn">These readings come from simulated prices, not the real market.</div>
          )}

          <div className="metrics">
            <div className="card metric">
              <div className="k">Latest price</div>
              <div className="v tnum">{priceFmt(ins.price)}</div>
              <div className="s">{data.name}</div>
            </div>
            <div className="card metric">
              <div className="k">Move over last {ins.windowMinutes} min</div>
              <div className={`v tnum ${tone(ins.change)}`}>{pct(ins.change)}</div>
              <div className="s">From the first to the latest reading</div>
            </div>
            <div className="card metric">
              <div className="k">Recent direction</div>
              <div className="v">{TREND_LABEL[ins.trend]}</div>
              <div className="s">Short average vs. longer average</div>
            </div>
            <div className="card metric">
              <div className="k">Price vs. 30-reading average</div>
              <div className={`v tnum ${tone(ins.vsLongPct)}`}>{pct(ins.vsLongPct, 3)}</div>
              <div className="s">Range in window: {ins.rangePct.toFixed(2)}%</div>
            </div>
          </div>

          <div className="card">
            <h2>In plain words</h2>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, lineHeight: 1.55 }}>
              {ins.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="card">
        <h2>How to read this</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, lineHeight: 1.55 }} className="muted">
          <li>Each reading is a price taken about every 2 seconds. The window covers the last {data?.insights?.windowMinutes ?? "few"} minutes since the server started collecting.</li>
          <li>"Recent direction" compares the average of the last 10 readings with the average of the last 30.</li>
          <li>A rising or falling label only describes the past. Markets can change direction at any time.</li>
        </ul>
        <p className="disclaimer" style={{ marginBottom: 0 }}>
          {data?.disclaimer ||
            "These readings are for education only, do not predict what happens next, and are not investment advice."}
        </p>
      </div>
    </div>
  );
}
