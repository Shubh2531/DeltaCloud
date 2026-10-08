import { Link } from "react-router-dom";
import { MARKETS } from "../lib/symbols";
import { useMarket } from "../context/MarketContext";
import { priceFmt, pct, tone } from "../lib/format";

// A slow scrolling strip of every market, like the bar along the top of an exchange.
export default function MarketTicker() {
  const { prices } = useMarket();
  const items = MARKETS.filter((m) => prices[m.id]);
  if (items.length === 0) return null;

  const row = (suffix) =>
    items.map((m) => (
      <Link key={m.id + suffix} to={`/trading?symbol=${m.id}`} className="tick" tabIndex={suffix ? -1 : 0} aria-hidden={suffix ? "true" : undefined}>
        <b>{m.base}</b>
        <span className="tnum">{priceFmt(prices[m.id].c)}</span>
        <span className={`tnum ${tone(prices[m.id].P)}`}>{pct(prices[m.id].P)}</span>
      </Link>
    ));

  return (
    <div className="ticker" role="region" aria-label="Market prices">
      <div className="ticker-track">
        {row("")}
        {row("-dup")}
      </div>
    </div>
  );
}
