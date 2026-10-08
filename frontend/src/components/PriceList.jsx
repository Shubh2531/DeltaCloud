import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MARKETS } from "../lib/symbols";
import { useMarket } from "../context/MarketContext";
import { priceFmt, pct, tone } from "../lib/format";
import Sparkline from "./Sparkline";

// One row. The price briefly flashes green or red whenever it ticks up or down.
function Row({ m, p, values }) {
  const last = useRef(p?.c);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (!Number.isFinite(p?.c) || !Number.isFinite(last.current) || p.c === last.current) {
      last.current = p?.c;
      return undefined;
    }
    setFlash(p.c > last.current ? "flash-up" : "flash-down");
    last.current = p.c;
    const t = setTimeout(() => setFlash(""), 600);
    return () => clearTimeout(t);
  }, [p?.c]);

  return (
    <Link to={`/trading?symbol=${m.id}`} className={`quote ${flash}`}>
      <span>
        <span className="name">{m.name}</span> <span className="base">{m.base}</span>
      </span>
      <Sparkline values={values} width={56} height={26} />
      <span className="tnum">{p ? priceFmt(p.c) : "—"}</span>
      <span className={`chg tnum ${p ? tone(p.P) : ""}`}>{p ? pct(p.P) : "—"}</span>
    </Link>
  );
}

// Every supported market with its latest price, a mini chart and 24-hour change.
export default function PriceList() {
  const { prices, trail } = useMarket();
  return (
    <div className="quote-list">
      {MARKETS.map((m) => (
        <Row key={m.id} m={m} p={prices[m.id]} values={trail[m.id] || []} />
      ))}
    </div>
  );
}
