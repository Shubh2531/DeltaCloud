import { useState } from "react";
import api, { errorMessage } from "../lib/api";
import { useMarket } from "../context/MarketContext";
import { marketById } from "../lib/symbols";
import { usd, priceFmt, qtyFmt, floorTo } from "../lib/format";

// Practice-money order ticket. The server sets the fill price; the number shown here is only an estimate.
export default function TradePanel({ symbol, account, onAccount }) {
  const { prices } = useMarket();
  const market = marketById(symbol);
  const price = prices[symbol]?.c;
  const holding = account?.positions.find((p) => p.symbol === symbol);

  const [side, setSide] = useState("BUY");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: "ok" | "error", text }

  const qtyNum = Number(qty);
  const valid = Number.isFinite(qtyNum) && qtyNum > 0;
  const estimate = valid && price ? qtyNum * price : null;

  const preset = (fraction) => {
    if (!price) return;
    if (side === "BUY") {
      const cash = account?.cash ?? 0;
      setQty(String(floorTo((cash * fraction) / price)));
    } else {
      setQty(String(floorTo((holding?.qty ?? 0) * fraction)));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await api.post("/paper/orders", { symbol, side, qty: qtyNum });
      onAccount(data.account);
      setMessage({
        type: "ok",
        text: `${side === "BUY" ? "Bought" : "Sold"} ${qtyFmt(qtyNum)} ${market.base} with practice money.`,
      });
      setQty("");
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
      <h2 style={{ marginBottom: 0 }}>Practice order · {market.base}</h2>

      <div className="seg" role="group" aria-label="Order side">
        <button type="button" className={`btn${side === "BUY" ? " btn-buy" : ""}`} aria-pressed={side === "BUY"} onClick={() => setSide("BUY")}>
          Buy
        </button>
        <button type="button" className={`btn${side === "SELL" ? " btn-sell" : ""}`} aria-pressed={side === "SELL"} onClick={() => setSide("SELL")}>
          Sell
        </button>
      </div>

      <div className="small muted tnum" style={{ display: "grid", gap: 4 }}>
        <div>Price now: <strong style={{ color: "var(--text)" }}>{price ? priceFmt(price) : "waiting for price…"}</strong></div>
        <div>Cash: {usd(account?.cash)}</div>
        <div>You hold: {qtyFmt(holding?.qty ?? 0)} {market.base}</div>
      </div>

      <div className="field">
        <label htmlFor="qty">Amount of {market.base}</label>
        <input
          id="qty"
          className="input tnum"
          inputMode="decimal"
          placeholder="0.00"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
          autoComplete="off"
        />
      </div>

      <div className="row">
        {[0.25, 0.5, 1].map((f) => (
          <button key={f} type="button" className="btn btn-sm" onClick={() => preset(f)} disabled={!price}>
            {f === 1 ? (side === "BUY" ? "All cash" : "All") : `${f * 100}%`}
          </button>
        ))}
      </div>

      <div className="small muted tnum">
        {estimate !== null ? `Estimated ${side === "BUY" ? "cost" : "proceeds"}: ${usd(estimate)}` : "Enter an amount to see the estimate."}
      </div>

      <button type="submit" className={`btn btn-block ${side === "BUY" ? "btn-buy" : "btn-sell"}`} disabled={!valid || !price || busy}>
        {busy ? "Placing order…" : `${side === "BUY" ? "Buy" : "Sell"} ${market.base}`}
      </button>

      {message && (
        <div className={`notice ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
      <p className="disclaimer">Practice money only. Orders fill at the server's current price, with no fees and no leverage.</p>
    </form>
  );
}
