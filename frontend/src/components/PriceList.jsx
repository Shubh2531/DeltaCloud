import { Link } from "react-router-dom";
import { MARKETS } from "../lib/symbols";
import { useMarket } from "../context/MarketContext";
import { priceFmt, pct, tone } from "../lib/format";

// Every supported market with its latest price and 24-hour change.
export default function PriceList() {
  const { prices } = useMarket();
  return (
    <div className="quote-list">
      {MARKETS.map((m) => {
        const p = prices[m.id];
        return (
          <Link key={m.id} to={`/trading?symbol=${m.id}`} className="quote">
            <span>
              <span className="name">{m.name}</span> <span className="base">{m.base}</span>
            </span>
            <span className="tnum">{p ? priceFmt(p.c) : "—"}</span>
            <span className={`chg tnum ${p ? tone(p.P) : ""}`}>{p ? pct(p.P) : "—"}</span>
          </Link>
        );
      })}
    </div>
  );
}
