import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import { BarElement } from "chart.js";
import ChartJS from "../lib/chart";
import api, { errorMessage } from "../lib/api";
import "../styles/founder.css";

ChartJS.register(BarElement);

const LINE = "#5b7cfa";
const GRID = "rgba(255,255,255,0.06)";
const TICK = "#94a3b8";

const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : "—");
const fmtPct = (n, d = 0) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : "—");
const shortDay = (day) => {
  const [, m, d] = day.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
};

function chartOptions(label) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0a1020",
        borderColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        titleColor: "#e6ebf5",
        bodyColor: "#e6ebf5",
        displayColors: false,
        callbacks: { label: (c) => `${label}: ${fmtInt(c.parsed.y)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: TICK, maxTicksLimit: 7, maxRotation: 0 } },
      y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { color: TICK, precision: 0, maxTicksLimit: 5 } },
    },
  };
}

function LineChart({ title, rows, field, label }) {
  const data = useMemo(
    () => ({
      labels: rows.map((r) => shortDay(r.day)),
      datasets: [
        {
          data: rows.map((r) => r[field]),
          borderColor: LINE,
          backgroundColor: "rgba(91,124,250,0.14)",
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 12,
        },
      ],
    }),
    [rows, field]
  );
  return (
    <div className="card fd-chart">
      <h3>{title}</h3>
      <div className="fd-plot">
        <Line data={data} options={chartOptions(label)} aria-label={title} role="img" />
      </div>
    </div>
  );
}

function BarChart({ title, rows, field, label }) {
  const data = useMemo(
    () => ({
      labels: rows.map((r) => shortDay(r.day)),
      datasets: [{ data: rows.map((r) => r[field]), backgroundColor: LINE, borderRadius: 4, borderSkipped: "start", maxBarThickness: 18 }],
    }),
    [rows, field]
  );
  return (
    <div className="card fd-chart">
      <h3>{title}</h3>
      <div className="fd-plot">
        <Bar data={data} options={chartOptions(label)} aria-label={title} role="img" />
      </div>
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="fd-tile">
      <span>{label}</span>
      <b className="tnum">{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

// The sentence for the YC application, built only from real numbers.
function ycLine(m) {
  const t = m.totals;
  const days = m.signups.filter((r) => r.signups > 0).length;
  const parts = [`${fmtInt(t.users)} users`];
  if (Number.isFinite(t.wauPct)) parts.push(`${fmtPct(t.wauPct)} active in the last 7 days`);
  if (Number.isFinite(m.retention.pct)) parts.push(`${fmtPct(m.retention.pct)} came back in their first week`);
  if (Number.isFinite(m.growth.growthPct)) parts.push(`sign-ups ${m.growth.growthPct >= 0 ? "up" : "down"} ${fmtPct(Math.abs(m.growth.growthPct))} week over week`);
  if (t.users) parts.push(`${fmtPct((t.referred / t.users) * 100)} joined through a friend's invite`);
  return `DeltaCloud: ${parts.join(", ")}${days ? ` (sign-ups on ${days} of the last 30 days)` : ""}.`;
}

function LinkBuilder() {
  const [tag, setTag] = useState("");
  const [copied, setCopied] = useState(false);
  const clean = tag.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const link = `https://joindeltacloud.com/${clean ? `?src=${clean}` : ""}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", link);
    }
  };
  return (
    <div className="card">
      <h3>Tracked links for QR codes and posts</h3>
      <p className="small muted">
        Give each club, class, flyer or post its own tag. Sign-ups from it show up under that name in Sources. Paste the link into any free QR
        code maker for flyers.
      </p>
      <div className="fd-builder">
        <input className="input" placeholder="e.g. finance-club, econ101, insta-story" value={tag} onChange={(e) => setTag(e.target.value)} maxLength={60} />
        <code>{link.replace("https://", "")}</code>
        <button type="button" className="btn btn-sm" onClick={copy} disabled={!clean}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function Founder() {
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api
      .get("/growth/founder")
      .then((res) => {
        setM(res.data);
        setError("");
      })
      .catch((err) => {
        if (err?.response?.status === 404) setDenied(true);
        else setError(errorMessage(err));
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (denied) return <Navigate to="/dashboard" replace />;

  if (!m) {
    return (
      <div className="page">
        <h1>Founder dashboard</h1>
        {error ? <div className="notice error">{error}</div> : <p className="muted">Loading your numbers…</p>}
      </div>
    );
  }

  const t = m.totals;
  const line = ycLine(m);
  const copyLine = async () => {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy:", line);
    }
  };
  const last7 = m.usage.slice(-7).reverse();

  return (
    <div className="page founder">
      <div className="page-head">
        <div>
          <h1>Founder dashboard</h1>
          <p>Real numbers from your database. Updated {new Date(m.asOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}; refreshes every minute.</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="card fd-yc">
        <b>For your YC application</b>
        <p>{line}</p>
        <button type="button" className="btn btn-sm btn-primary" onClick={copyLine}>
          {copied ? "Copied" : "Copy sentence"}
        </button>
      </div>

      <div className="fd-tiles">
        <Tile label="Total users" value={fmtInt(t.users)} sub={`${fmtInt(m.growth.thisWeek)} joined in the last 7 days`} />
        <Tile label="Weekly active" value={fmtInt(t.wau)} sub={Number.isFinite(t.wauPct) ? `${fmtPct(t.wauPct)} of all users` : "No users yet"} />
        <Tile
          label="Week-1 retention"
          value={fmtPct(m.retention.pct)}
          sub={m.retention.cohort ? `${m.retention.retained} of ${m.retention.cohort} came back` : "Needs users who joined 8+ days ago"}
        />
        <Tile
          label="Sign-up growth, week over week"
          value={m.growth.growthPct === null ? "New" : `${m.growth.growthPct >= 0 ? "+" : ""}${fmtPct(m.growth.growthPct)}`}
          sub={`${fmtInt(m.growth.thisWeek)} this week vs ${fmtInt(m.growth.lastWeek)} last week`}
        />
        <Tile label="Active today" value={fmtInt(t.dau)} sub={`${fmtInt(t.mau)} active in 30 days`} />
        <Tile label="Joined via a friend" value={t.users ? fmtPct((t.referred / t.users) * 100) : "—"} sub={`${fmtInt(t.referred)} users`} />
      </div>

      <div className="fd-charts">
        <LineChart title="Total users, last 30 days" rows={m.signups} field="total" label="Total users" />
        <BarChart title="New sign-ups per day" rows={m.signups} field="signups" label="Sign-ups" />
        <LineChart title="Daily active users" rows={m.active} field="active" label="Active users" />
      </div>

      <div className="card">
        <h3>Retention by sign-up week</h3>
        <p className="small muted">Share of each week's new users who used DeltaCloud again in their 1st, 2nd, 3rd and 4th week. Blank means that week hasn't finished yet.</p>
        <div className="table-wrap">
          <table className="table fd-cohorts">
            <thead>
              <tr>
                <th>Joined week of</th>
                <th className="num">Users</th>
                <th className="num">Week 1</th>
                <th className="num">Week 2</th>
                <th className="num">Week 3</th>
                <th className="num">Week 4</th>
              </tr>
            </thead>
            <tbody>
              {m.cohorts.map((c) => (
                <tr key={c.week}>
                  <td>{shortDay(c.week)}</td>
                  <td className="num tnum">{fmtInt(c.size)}</td>
                  {c.weeks.map((w, i) => (
                    <td key={i} className="num tnum" style={w === null ? undefined : { background: `rgba(91,124,250,${0.08 + (w / 100) * 0.55})` }}>
                      {w === null ? "" : fmtPct(w)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cols-even">
        <div className="card">
          <h3>Where users come from</h3>
          {m.sources.length === 0 ? (
            <p className="muted">No users yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {m.sources.map((s) => (
                  <tr key={s.source}>
                    <td>{s.source === "friend-invite" ? "Friend's invite link" : s.source === "direct" ? "Direct / untagged" : s.source}</td>
                    <td className="num tnum">{fmtInt(s.n)}</td>
                    <td className="num tnum muted">{fmtPct((s.n / t.users) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Top inviters</h3>
          {m.topReferrers.length === 0 ? (
            <p className="muted">Nobody has joined through an invite link yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {m.topReferrers.map((r, i) => (
                  <tr key={`${r.name}-${i}`}>
                    <td>{r.name}</td>
                    <td className="num tnum">{fmtInt(r.invited)} joined</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="cols-even">
        <div className="card">
          <h3>Engagement, last 7 days</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">DC Intelligence questions</th>
                <th className="num">Practice trades</th>
              </tr>
            </thead>
            <tbody>
              {last7.map((r) => (
                <tr key={r.day}>
                  <td>{shortDay(r.day)}</td>
                  <td className="num tnum">{fmtInt(r.intel)}</td>
                  <td className="num tnum">{fmtInt(r.trades)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Latest sign-ups</h3>
          {m.recent.length === 0 ? (
            <p className="muted">No users yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {m.recent.map((u, i) => (
                  <tr key={`${u.name}-${i}`}>
                    <td>{u.name || "New user"}</td>
                    <td className="muted">{u.source === "friend-invite" ? "invite" : u.source}</td>
                    <td className="num muted">{new Date(u.at).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <LinkBuilder />
    </div>
  );
}
