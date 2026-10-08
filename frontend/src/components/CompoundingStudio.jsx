// src/components/CompoundingStudio.jsx
import React, { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler, // required for fill: true
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const MODES = {
  Daily: { unit: "day", perYear: 365 },
  Weekly: { unit: "week", perYear: 52 },
  Monthly: { unit: "month", perYear: 12 },
};

const surface = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 16,
};
const labelStyle = { display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 4 };
const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: 10,
  borderRadius: 10,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const money = (v) =>
  Number.isFinite(v)
    ? v.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
    : "-";
const compact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Contribution is added at the start of each period, then the period's return applies.
function simulate({ start, contrib, rate, periods }) {
  const points = [{ i: 0, bal: start }];
  let bal = start;
  for (let i = 1; i <= periods; i++) {
    bal += contrib;
    bal *= 1 + rate / 100;
    points.push({ i, bal });
  }
  return points;
}

export default function CompoundingStudio() {
  const [mode, setMode] = useState("Daily");
  // Inputs are kept as strings so the user can clear a field while typing.
  const [startStr, setStartStr] = useState("1000");
  const [contribStr, setContribStr] = useState("0");
  const [rateStr, setRateStr] = useState("1");
  const [periodsStr, setPeriodsStr] = useState("30");
  const [targetStr, setTargetStr] = useState("5");
  const [aiPct, setAIPct] = useState(0);
  const [upliftStr, setUpliftStr] = useState("10");

  const { unit, perYear } = MODES[mode];

  const start = clamp(num(startStr), 0, 1e9);
  const contrib = clamp(num(contribStr), 0, 1e9);
  const rate = clamp(num(rateStr), -100, 100);
  const periods = Math.round(clamp(num(periodsStr, 1), 1, 365));
  const target = clamp(num(targetStr), 0, 1e9);
  const uplift = clamp(num(upliftStr), -100, 100);

  // What-if: the user supplies the assumed uplift; nothing is predicted.
  const whatIfRate = rate * (1 + (uplift / 100) * (aiPct / 100));

  const manual = useMemo(
    () => simulate({ start, contrib, rate, periods }),
    [start, contrib, rate, periods]
  );
  const whatIf = useMemo(
    () => simulate({ start, contrib, rate: whatIfRate, periods }),
    [start, contrib, whatIfRate, periods]
  );

  const final = manual[manual.length - 1].bal;
  const finalWhatIf = whatIf[whatIf.length - 1].bal;
  const totalIn = start + contrib * periods;
  const avgGain = (final - totalIn) / periods;
  const goalMet = avgGain >= target;

  const annual = (Math.pow(1 + rate / 100, perYear) - 1) * 100;
  const annualText = !Number.isFinite(annual)
    ? "-"
    : annual > 1e6
    ? "> 1,000,000%"
    : `${annual.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

  const data = useMemo(() => {
    const datasets = [
      {
        label: "Your assumptions",
        data: manual.map((p) => p.bal),
        borderColor: "rgba(59,130,246,1)",
        backgroundColor: "rgba(59,130,246,0.2)",
        fill: true,
        tension: 0.25,
        pointRadius: 0,
      },
    ];
    if (aiPct > 0) {
      datasets.push({
        label: "What-if: AI-assisted share",
        data: whatIf.map((p) => p.bal),
        borderColor: "rgba(16,185,129,1)",
        backgroundColor: "rgba(16,185,129,0.2)",
        fill: true,
        tension: 0.25,
        pointRadius: 0,
      });
    }
    return { labels: manual.map((p) => p.i), datasets };
  }, [manual, whatIf, aiPct]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { labels: { color: "white" } },
        tooltip: {
          callbacks: {
            title: (items) => `${unit} ${items[0].label}`,
            label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          title: { display: true, text: `Elapsed ${unit}s`, color: "#94a3b8" },
        },
        y: {
          ticks: { color: "#94a3b8", callback: (v) => "$" + compact.format(v) },
        },
      },
    }),
    [unit]
  );

  return (
    <div style={surface}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>Compounding Studio</h3>
        <div role="group" aria-label="Period length" style={{ display: "inline-flex", gap: 8 }}>
          {Object.keys(MODES).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: mode === m ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)",
                color: "#e2e8f0",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <label htmlFor="cs-start" style={labelStyle}>Starting amount ($)</label>
          <input id="cs-start" type="number" min="0" inputMode="decimal"
            value={startStr} onChange={(e) => setStartStr(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="cs-contrib" style={labelStyle}>Added each {unit} ($)</label>
          <input id="cs-contrib" type="number" min="0" inputMode="decimal"
            value={contribStr} onChange={(e) => setContribStr(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="cs-rate" style={labelStyle}>Assumed return per {unit} (%)</label>
          <input id="cs-rate" type="number" step="0.01" min="-100" max="100" inputMode="decimal"
            value={rateStr} onChange={(e) => setRateStr(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="cs-periods" style={labelStyle}>Number of {unit}s (1-365)</label>
          <input id="cs-periods" type="number" min="1" max="365" inputMode="numeric"
            value={periodsStr} onChange={(e) => setPeriodsStr(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="cs-target" style={labelStyle}>Goal: gain per {unit} ($)</label>
          <input id="cs-target" type="number" min="0" inputMode="decimal"
            value={targetStr} onChange={(e) => setTargetStr(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <fieldset
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 10,
          border: "1px dashed rgba(255,255,255,0.15)",
        }}
      >
        <legend style={{ color: "#94a3b8", fontSize: 13, padding: "0 6px" }}>
          What-if: AI-assisted share (hypothetical)
        </legend>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label htmlFor="cs-ai" style={labelStyle}>Share of money in the what-if: {aiPct}%</label>
            <input id="cs-ai" type="range" min={0} max={100} value={aiPct}
              onChange={(e) => setAIPct(Number(e.target.value))} style={{ width: "100%" }} />
          </div>
          <div>
            <label htmlFor="cs-uplift" style={labelStyle}>Assumed change to return on that share (%)</label>
            <input id="cs-uplift" type="number" min="-100" max="100" inputMode="decimal"
              value={upliftStr} onChange={(e) => setUpliftStr(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
          This is an assumption you choose, not a prediction of how any AI tool performs.
        </div>
      </fieldset>

      <div
        role="img"
        aria-label={`Projected balance over ${periods} ${unit}s, ending at ${money(final)}`}
        style={{ marginTop: 14, height: 320, position: "relative" }}
      >
        <Line data={data} options={options} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <Card label="Final balance" value={money(final)} />
        {aiPct > 0 && <Card label="Final balance (what-if)" value={money(finalWhatIf)} color="#10b981" />}
        <Card label="Total you put in" value={money(totalIn)} />
        <Card label={`Average gain per ${unit}`} value={money(avgGain)} />
        <Card
          label={`Goal check (${money(target)} per ${unit})`}
          value={goalMet ? "Meets goal" : "Below goal"}
          color={goalMet ? "#22c55e" : "#facc15"}
        />
        <Card label="Same rate over a year" value={annualText} />
      </div>

      {annual > 100 && (
        <div style={{ marginTop: 10, color: "#facc15", fontSize: 13 }}>
          At this rate your money would more than double in a year. Returns like this are
          extremely rare and are not something to plan around.
        </div>
      )}

      <div style={{ marginTop: 10, color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
        Illustration only, based on the numbers you enter. It does not predict results, ignores
        fees, taxes and losses, and is not investment advice. Each {unit}'s deposit is added
        before that {unit}'s return is applied.
      </div>
    </div>
  );
}

function Card({ label, value, color = "#3b82f6" }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: 14 }}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4, color }}>{value}</div>
    </div>
  );
}
