import { useState } from "react";
import api, { errorMessage } from "../lib/api";
import { useMarket } from "../context/MarketContext";
import { marketById } from "../lib/symbols";
import { usd, priceFmt, qtyFmt, floorTo } from "../lib/format";

const PRESETS = [10, 25, 50, 100];
// Mirrors backend/src/lib/leverageMath.js — shown here only as a preview before you submit;
// the server always recalculates and enforces the real number.
const MAINTENANCE_FRAC = 0.005;
const liqPreview = (entry, leverage, side) => {
  const k = MAINTENANCE_FRAC - 1 / leverage;
  return side === "LONG" ? entry * (1 + k) : entry * (1 - k);
};

// Practice leverage order ticket: isolated margin only. A position can lose, at most, the
// margin you put into it — never your other cash — and the server is the only thing that
// ever decides the price or the liquidation level.
export default function LeveragePanel({ symbol, account, onAccount }) {
  const { prices } = useMarket();
  const market = marketById(symbol);
  const price = prices[symbol]?.c;
  const options = account?.leverageOptions || [2, 5, 10, 20, 50];

  const [side, setSide] = useState("LONG");
  const [leverage, setLeverage] = useState(options[1] || 5);
  const [marginStr, setMarginStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const margin = Number(marginStr);
  const valid = Number.isFinite(margin) && margin > 0;
  const notional = valid ? margin * leverage : null;
  const qty = valid && price ? floorTo(notional / price) : null;
  const liqPrice = price ? liqPreview(price, leverage, side) : null;

  const preset = (frac) => {
    const cash = account?.cash ?? 0;
    setMarginStr(String(floorTo((cash * frac) / 100, 2)));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await api.post("/paper/leverage/open", { symbol, side, marginUsd: margin, leverage });
      onAccount(data.account);
      setMessage({ type: "ok", text: `Opened a ${leverage}× ${side === "LONG" ? "long" : "short"} on ${market.base}.` });
      setMarginStr("");
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
      <h2 style={{ marginBottom: 0 }}>Leverage · {market.base}</h2>

      <div className="notice warn">
        Practice money only. Isolated margin: this position can lose, at most, the amount you put in below — never
        the rest of your balance. If the price passes the liquidation level shown, it closes automatically and the
        margin is gone.
      </div>

      <div className="seg" role="group" aria-label="Direction">
        <button type="button" className={`btn${side === "LONG" ? " btn-buy" : ""}`} aria-pressed={side === "LONG"} onClick={() => setSide("LONG")}>
          Long (price up)
        </button>
        <button type="button" className={`btn${side === "SHORT" ? " btn-sell" : ""}`} aria-pressed={side === "SHORT"} onClick={() => setSide("SHORT")}>
          Short (price down)
        </button>
      </div>

      <div>
        <label className="label" htmlFor="lev-select">Leverage</label>
        <div className="seg" role="group" aria-label="Leverage multiple">
          {options.map((x) => (
            <button key={x} type="button" className={`btn btn-sm${leverage === x ? " on" : ""}`} aria-pressed={leverage === x} onClick={() => setLeverage(x)}>
              {x}×
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="lev-margin">Margin (your risk on this position)</label>
        <input
          id="lev-margin"
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0.00"
          value={marginStr}
          onChange={(e) => setMarginStr(e.target.value)}
        />
        <div className="seg" style={{ marginTop: 8 }} role="group" aria-label="Margin presets">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="btn btn-sm" onClick={() => preset(p)}>
              {p === 100 ? "All cash" : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      {valid && (
        <div className="pace-result">
          <div>
            <div className="k">Position size</div>
            <div className="v tnum">{usd(notional)}</div>
            <div className="s">{Number.isFinite(qty) ? `≈ ${qtyFmt(qty)} ${market.base}` : "Waiting for a price…"}</div>
          </div>
          <div>
            <div className="k">Liquidation price</div>
            <div className="v tnum neg">{liqPrice ? priceFmt(liqPrice) : "—"}</div>
            <div className="s">{price ? `vs current ${priceFmt(price)}` : ""}</div>
          </div>
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={!valid || busy}>
        {busy ? "Opening…" : `Open ${leverage}× ${side === "LONG" ? "long" : "short"}`}
      </button>
      {message && (
        <div className={`notice ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
    </form>
  );
}
