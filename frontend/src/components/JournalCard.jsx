import { Link } from "react-router-dom";
import { useJournalSummary } from "../hooks/useJournal";
import { usd, signedUsd, tone } from "../lib/format";

// A short look at the full trade journal, with a way into it.
export default function JournalCard() {
  const { summary: s, error } = useJournalSummary();

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Trade journal</h2>
        <Link className="btn btn-sm" to="/journal">See every trade</Link>
      </div>
      {error && <div className="small neg">{error}</div>}
      {s && (
        <div className="journal-card-stats">
          <div>
            <div className="k">Trades placed</div>
            <div className="v tnum">{s.trades.toLocaleString()}</div>
          </div>
          <div>
            <div className="k">Realised P/L</div>
            <div className={`v tnum ${tone(s.realizedPnl)}`}>{signedUsd(s.realizedPnl)}</div>
          </div>
          <div>
            <div className="k">Win rate</div>
            <div className="v tnum">{s.winRate === null ? "—" : `${s.winRate}%`}</div>
          </div>
          <div>
            <div className="k">Volume</div>
            <div className="v tnum">{usd(s.volume, 0)}</div>
          </div>
        </div>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Every buy, sell, leveraged open, close and liquidation is saved permanently, and you can download it as a spreadsheet.
      </p>
    </div>
  );
}
