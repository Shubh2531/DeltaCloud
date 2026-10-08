import { useEffect, useState } from "react";

const INTERVALS = [
  ["1m", "1"],
  ["5m", "5"],
  ["15m", "15"],
  ["1h", "60"],
  ["4h", "240"],
  ["1D", "D"],
];

// TradingView's free chart embed. It is for viewing only; trades happen in the practice account.
export default function TradingViewChart({ symbol, height = "60vh" }) {
  const [interval, setTf] = useState("60");
  const [full, setFull] = useState(false);

  // Escape leaves fullscreen. Only Escape is handled so typing in other fields is never affected.
  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [full]);

  const src =
    "https://s.tradingview.com/widgetembed/?" +
    new URLSearchParams({
      symbol,
      interval,
      theme: "dark",
      style: "1",
      locale: "en",
      timezone: "Etc/UTC",
      withdateranges: "1",
      hide_side_toolbar: "0",
      allow_symbol_change: "0",
      saveimage: "0",
      toolbarbg: "0b1220",
    }).toString();

  return (
    <div className={`chart-frame${full ? " full" : ""}`} style={{ height: full ? undefined : height, minHeight: 320 }}>
      <div className="chart-bar">
        {INTERVALS.map(([label, value]) => (
          <button
            key={value}
            type="button"
            className="btn btn-sm"
            aria-pressed={interval === value}
            onClick={() => setTf(value)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setFull((f) => !f)}>
          {full ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
      <iframe key={`${symbol}-${interval}`} title={`${symbol} price chart`} src={src} />
    </div>
  );
}
