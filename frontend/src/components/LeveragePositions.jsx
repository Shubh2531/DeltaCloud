import { useState } from "react";
import api, { errorMessage } from "../lib/api";
import { marketById } from "../lib/symbols";
import { usd, signedUsd, priceFmt, pct, tone } from "../lib/format";

// Open leveraged positions, re-priced live, with a one-click close. The margin shown as
// "at risk" is the most this position can ever lose — never more, even in a crash.
export default function LeveragePositions({ account, onAccount }) {
  const [closingId, setClosingId] = useState(null);
  const [error, setError] = useState("");
  const positions = account?.leveragePositions ?? [];

  const close = async (id) => {
    setClosingId(id);
    setError("");
    try {
      const { data } = await api.post("/paper/leverage/close", { id });
      onAccount(data.account);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClosingId(null);
    }
  };

  if (positions.length === 0) {
    return (
      <div className="card">
        <h2>Open leveraged positions</h2>
        <div className="empty">No leveraged positions open. Use the Leverage panel above to open one.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Open leveraged positions</h2>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th className="num">Leverage</th>
              <th className="num">Entry</th>
              <th className="num">Mark</th>
              <th className="num">Margin at risk</th>
              <th className="num">P/L</th>
              <th className="num">Liquidates at</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const near = p.side === "LONG" ? (p.markPrice - p.liqPrice) / p.markPrice < 0.08 : (p.liqPrice - p.markPrice) / p.markPrice < 0.08;
              return (
                <tr key={p.id}>
                  <td>{marketById(p.symbol).base}</td>
                  <td className={p.side === "LONG" ? "pos" : "neg"}>{p.side === "LONG" ? "Long" : "Short"}</td>
                  <td className="num tnum">{p.leverage}×</td>
                  <td className="num tnum">{priceFmt(p.entryPrice)}</td>
                  <td className="num tnum">{p.priced ? priceFmt(p.markPrice) : "—"}</td>
                  <td className="num tnum">{usd(p.margin)}</td>
                  <td className={`num tnum ${tone(p.pnl)}`}>
                    {signedUsd(p.pnl)} <span className="small muted">({pct(p.pnlPct)})</span>
                  </td>
                  <td className={`num tnum ${near ? "neg" : "muted"}`}>{priceFmt(p.liqPrice)}</td>
                  <td>
                    <button type="button" className="btn btn-sm" disabled={closingId === p.id} onClick={() => close(p.id)}>
                      {closingId === p.id ? "Closing…" : "Close"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        A liquidation price shown in red means the position is within 8% of being force-closed.
      </p>
    </div>
  );
}
