import { useState } from "react";
import { Link } from "react-router-dom";
import { useJournal } from "../hooks/useJournal";
import { MARKETS, marketById } from "../lib/symbols";
import { errorMessage } from "../lib/api";
import Disclaimer from "../components/Disclaimer";
import { usd, priceFmt, qtyFmt, signedUsd, tone, timeFmt } from "../lib/format";

const FILTERS = [
  { id: "", label: "Everything" },
  { id: "spot", label: "Spot" },
  { id: "leverage", label: "Leverage" },
  { id: "account", label: "Resets" },
];

// What happened, in plain words.
export function describeEntry(e) {
  const side = e.side === "SHORT" ? "short" : "long";
  switch (e.kind) {
    case "SPOT_BUY":
      return { text: "Bought", cls: "pos" };
    case "SPOT_SELL":
      return { text: "Sold", cls: "neg" };
    case "LEV_OPEN":
      return { text: `Opened ${e.leverage}× ${side}`, cls: e.side === "SHORT" ? "neg" : "pos" };
    case "LEV_CLOSE":
      return { text: `Closed ${e.leverage}× ${side}`, cls: "muted" };
    case "LEV_LIQUIDATED":
      return { text: `Liquidated ${e.leverage}× ${side}`, cls: "neg" };
    case "RESET":
      return { text: "Reset account", cls: "muted" };
    default:
      return { text: e.kind, cls: "muted" };
  }
}

const realises = (e) => e.kind === "SPOT_SELL" || e.kind === "LEV_CLOSE" || e.kind === "LEV_LIQUIDATED";

export default function Journal() {
  const [market, setMarket] = useState("");
  const [symbol, setSymbol] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const { items, next, loading, loadingMore, error, summary, loadMore, exportCsv } = useJournal({ market, symbol });

  const onExport = async () => {
    setExporting(true);
    setExportError("");
    try {
      await exportCsv();
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const s = summary;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Trade journal</h1>
          <p>Every trade you have placed, kept for good. Nothing here is ever trimmed or edited.</p>
        </div>
        <button type="button" className="btn" onClick={onExport} disabled={exporting || !s || s.totalEvents === 0}>
          {exporting ? "Preparing…" : "Download CSV"}
        </button>
      </div>

      {exportError && <div className="notice error" role="alert">{exportError}</div>}

      {s && (
        <div className="metrics journal-metrics">
          <div className="card metric">
            <div className="k">Realised profit / loss</div>
            <div className={`v tnum ${tone(s.realizedPnl)}`}>{signedUsd(s.realizedPnl)}</div>
            <div className="s">From {s.closedTrades} closed {s.closedTrades === 1 ? "trade" : "trades"}</div>
          </div>
          <div className="card metric">
            <div className="k">Trades placed</div>
            <div className="v tnum">{s.trades.toLocaleString()}</div>
            <div className="s">{s.spotTrades} spot, {s.leverageTrades} leverage</div>
          </div>
          <div className="card metric">
            <div className="k">Win rate</div>
            <div className="v tnum">{s.winRate === null ? "—" : `${s.winRate}%`}</div>
            <div className="s">{s.wins} won, {s.losses} lost</div>
          </div>
          <div className="card metric">
            <div className="k">Volume traded</div>
            <div className="v tnum">{usd(s.volume, 0)}</div>
            <div className={`s ${s.liquidations ? "neg" : ""}`}>
              {s.liquidations} {s.liquidations === 1 ? "liquidation" : "liquidations"}
            </div>
          </div>
        </div>
      )}

      {s && (s.best || s.worst) && (
        <div className="journal-extremes">
          {s.best && s.best.pnl > 0 && (
            <div className="card">
              <div className="label">Best trade</div>
              <div className="pos tnum">{signedUsd(s.best.pnl)}</div>
              <div className="small muted">{marketById(s.best.symbol).base}, {timeFmt(s.best.at)}</div>
            </div>
          )}
          {s.worst && s.worst.pnl < 0 && (
            <div className="card">
              <div className="label">Worst trade</div>
              <div className="neg tnum">{signedUsd(s.worst.pnl)}</div>
              <div className="small muted">{marketById(s.worst.symbol).base}, {timeFmt(s.worst.at)}</div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="journal-filters">
          <div className="seg" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                className={`btn btn-sm${market === f.id ? " on" : ""}`}
                aria-pressed={market === f.id}
                onClick={() => setMarket(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            className="input journal-symbol"
            aria-label="Filter by market"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={market === "account"}
          >
            <option value="">All markets</option>
            {MARKETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.base}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="notice error" role="alert">{error}</div>}

        {loading && items.length === 0 ? (
          <div className="muted">Loading your journal…</div>
        ) : items.length === 0 ? (
          <div className="empty">
            {market || symbol ? "Nothing matches this filter yet." : "No trades yet. "}
            {!market && !symbol && <Link to="/trading">Place your first practice trade</Link>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table journal-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>What happened</th>
                  <th>Market</th>
                  <th className="num">Amount</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">Result</th>
                  <th className="num">Cash after</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const d = describeEntry(e);
                  return (
                    <tr key={e.id} data-kind={e.kind}>
                      <td>{timeFmt(e.at)}</td>
                      <td className={d.cls}>
                        {d.text}
                        {e.kind === "LEV_OPEN" && Number.isFinite(e.margin) && (
                          <div className="small muted">{usd(e.margin)} margin, liq. {priceFmt(e.liqPrice)}</div>
                        )}
                        {(e.kind === "LEV_CLOSE" || e.kind === "LEV_LIQUIDATED") && Number.isFinite(e.entryPrice) && (
                          <div className="small muted">Entered at {priceFmt(e.entryPrice)}</div>
                        )}
                      </td>
                      <td>{e.symbol ? marketById(e.symbol).base : "—"}</td>
                      <td className="num tnum">{Number.isFinite(e.qty) ? qtyFmt(e.qty) : "—"}</td>
                      <td className="num tnum">{Number.isFinite(e.price) ? priceFmt(e.price) : "—"}</td>
                      <td className="num tnum">{Number.isFinite(e.total) ? usd(e.total) : "—"}</td>
                      <td className={`num tnum ${realises(e) ? tone(e.pnl) : "muted"}`}>
                        {realises(e) ? signedUsd(e.pnl) : "—"}
                      </td>
                      <td className="num tnum">{Number.isFinite(e.cashAfter) ? usd(e.cashAfter) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {next && (
          <div className="journal-more">
            <button type="button" className="btn" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Show older entries"}
            </button>
          </div>
        )}
        {!next && items.length > 0 && <div className="small faint journal-end">That's everything, back to your first trade.</div>}
      </div>

      <Disclaimer />
    </div>
  );
}
