import { Link } from "react-router-dom";
import { Doughnut } from "react-chartjs-2";
import "../lib/chart";
import { usePaperAccount } from "../hooks/usePaperAccount";
import { marketById } from "../lib/symbols";
import FeedBadge from "../components/FeedBadge";
import Disclaimer from "../components/Disclaimer";
import { usd, priceFmt, qtyFmt, signedUsd, pct, tone, timeFmt } from "../lib/format";

const COLORS = ["#94a3b8", "#f2a900", "#627eea", "#14f195", "#5b7cfa", "#ff6b9d", "#c084fc"];

export default function Portfolio() {
  const { account, loading, error } = usePaperAccount();

  const slices = account
    ? [
        { label: "Cash", value: account.cash },
        ...account.positions.map((p) => ({ label: marketById(p.symbol).base, value: p.value })),
      ].filter((s) => s.value > 0)
    : [];

  const chartData = {
    labels: slices.map((s) => s.label),
    datasets: [
      {
        data: slices.map((s) => s.value),
        backgroundColor: slices.map((_, i) => COLORS[i % COLORS.length]),
        borderColor: "#0a1020",
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Portfolio</h1>
          <p>What your practice account holds right now, and how it has done since you started.</p>
        </div>
        <FeedBadge />
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}
      {loading && !account && <div className="card muted">Loading your account…</div>}

      {account && (
        <>
          <div className="metrics">
            <div className="card metric">
              <div className="k">Total value</div>
              <div className="v tnum">{usd(account.equity)}</div>
              <div className="s">Started with {usd(account.startingCash, 0)}</div>
            </div>
            <div className="card metric">
              <div className="k">Profit / loss</div>
              <div className={`v tnum ${tone(account.pnl)}`}>{signedUsd(account.pnl)}</div>
              <div className={`s tnum ${tone(account.pnl)}`}>{pct(account.pnlPct)}</div>
            </div>
            <div className="card metric">
              <div className="k">Cash</div>
              <div className="v tnum">{usd(account.cash)}</div>
              <div className="s">{pct((account.cash / account.equity) * 100, 1).replace("+", "")} of your account</div>
            </div>
          </div>

          <div className="cols-even">
            <div className="card">
              <h2>How your money is split</h2>
              {slices.length === 0 ? (
                <div className="empty">Nothing to show yet.</div>
              ) : (
                <div style={{ height: 280 }}>
                  <Doughnut
                    data={chartData}
                    options={{
                      maintainAspectRatio: false,
                      cutout: "62%",
                      plugins: {
                        legend: { position: "bottom", labels: { color: "#cbd5e1" } },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${usd(ctx.parsed)}` } },
                      },
                    }}
                  />
                </div>
              )}
            </div>

            <div className="card">
              <h2>Open positions</h2>
              {account.positions.length === 0 ? (
                <div className="empty">
                  You don't hold anything yet. <Link to="/trading">Place a practice order</Link> to get started.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th className="num">Amount</th>
                        <th className="num">Avg. cost</th>
                        <th className="num">Price</th>
                        <th className="num">Value</th>
                        <th className="num">Profit / loss</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {account.positions.map((p) => (
                        <tr key={p.symbol}>
                          <td>{marketById(p.symbol).base}</td>
                          <td className="num tnum">{qtyFmt(p.qty)}</td>
                          <td className="num tnum">{priceFmt(p.avgCost)}</td>
                          <td className="num tnum">{p.priced ? priceFmt(p.mark) : "—"}</td>
                          <td className="num tnum">{usd(p.value)}</td>
                          <td className={`num tnum ${tone(p.pnl)}`}>
                            {signedUsd(p.pnl)} <span className="small">({pct(p.pnlPct)})</span>
                          </td>
                          <td>
                            <Link className="btn btn-sm" to={`/trading?symbol=${p.symbol}`}>Trade</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Order history</h2>
            {account.orders.length === 0 ? (
              <div className="empty">No orders yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Market</th>
                      <th>Side</th>
                      <th className="num">Amount</th>
                      <th className="num">Price</th>
                      <th className="num">Total</th>
                      <th className="num">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.orders.map((o) => (
                      <tr key={o.id}>
                        <td>{timeFmt(o.at)}</td>
                        <td>{marketById(o.symbol).base}</td>
                        <td className={o.side === "BUY" ? "pos" : "neg"}>{o.side === "BUY" ? "Buy" : "Sell"}</td>
                        <td className="num tnum">{qtyFmt(o.qty)}</td>
                        <td className="num tnum">{priceFmt(o.price)}</td>
                        <td className="num tnum">{usd(o.total)}</td>
                        <td className={`num tnum ${o.side === "SELL" ? tone(o.realizedPnl) : "muted"}`}>
                          {o.side === "SELL" ? signedUsd(o.realizedPnl) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  );
}
