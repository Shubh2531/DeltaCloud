import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";
import { usePaperAccount } from "../hooks/usePaperAccount";
import FeedBadge from "../components/FeedBadge";
import PriceList from "../components/PriceList";
import TradingViewChart from "../components/TradingViewChart";
import OrbCard from "../components/OrbCard";
import Disclaimer from "../components/Disclaimer";
import { useNews } from "../hooks/useNews";
import MarketPulse from "../components/MarketPulse";
import { Story } from "./News";
import { usd, signedUsd, pct, tone } from "../lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const { prices } = useMarket();
  const { account, error } = usePaperAccount();
  const news = useNews({ limit: 40 });

  const firstName = (user?.name || "").split(" ")[0] || "there";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Welcome back, {firstName}</h1>
          <p>Your practice account, the latest prices and a chart, all in one place.</p>
        </div>
        <FeedBadge />
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}

      <div className="metrics">
        <div className="card metric">
          <div className="k">Practice account value</div>
          <div className="v tnum">{usd(account?.equity)}</div>
          <div className={`s tnum ${tone(account?.pnl)}`}>
            {account ? `${signedUsd(account.pnl)} (${pct(account.pnlPct)}) since start` : "Loading…"}
          </div>
        </div>
        <div className="card metric">
          <div className="k">Cash</div>
          <div className="v tnum">{usd(account?.cash)}</div>
          <div className="s">Ready to use</div>
        </div>
        <div className="card metric">
          <div className="k">Invested</div>
          <div className="v tnum">{usd(account?.invested)}</div>
          <div className="s">
            {account ? `${account.positions.length} open position${account.positions.length === 1 ? "" : "s"}` : "Loading…"}
          </div>
        </div>
      </div>

      <MarketPulse prices={prices} stories={news.items} />

      <div className="cols-2">
        <div className="card">
          <div className="page-head" style={{ marginBottom: 12 }}>
            <h2 style={{ marginBottom: 0 }}>Bitcoin</h2>
            <Link to="/trading" className="btn btn-sm">Open trading</Link>
          </div>
          <TradingViewChart symbol="BINANCE:BTCUSDT" height="clamp(320px, 50vh, 520px)" />
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <OrbCard />
          <div className="card">
            <h2>Markets</h2>
            <PriceList />
          </div>
          <div className="card">
            <div className="page-head" style={{ marginBottom: 6 }}>
              <h2 style={{ marginBottom: 0 }}>Top stories</h2>
              <Link to="/news" className="btn btn-sm">All news</Link>
            </div>
            {news.items.length === 0 ? (
              <div className="small muted">{news.error || (news.loading ? "Loading stories…" : "No stories yet. Check back soon.")}</div>
            ) : (
              news.items.slice(0, 4).map((it) => (
                <Story key={it.link} item={it} compact />
              ))
            )}
          </div>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
