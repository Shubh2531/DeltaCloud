import { useMemo, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { MARKETS, marketById } from "../lib/symbols";
import { usd, qtyFmt, floorTo } from "../lib/format";

const SLICES = [5, 10, 25, 50, 100];

// A leverage multiple offered on the Leverage tab, used only to illustrate what the same
// slice of cash would risk there, compared with holding it outright here.
const SAMPLE_LEVERAGE = 10;

// Practice-only position-size helper for ordinary (spot) trades. It does not place an
// order: it only shows what a slice of cash is worth, and compares it with what the same
// slice would risk if used as margin on the Leverage tab instead. No prediction, no advice.
export default function PacingCard({ account }) {
  const { prices } = useMarket();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [slicePct, setSlicePct] = useState(10);

  const market = marketById(symbol);
  const price = prices[symbol]?.c;
  const cash = account?.cash ?? 0;

  const sliceCash = (cash * slicePct) / 100;
  const qty = price ? floorTo(sliceCash / price) : null;
  const liveSlice = Number.isFinite(qty) && price ? qty * price : sliceCash;

  // A move that would wipe out this slice outright, spot vs. the same slice as leveraged margin.
  const wipeoutMove = useMemo(() => 100, []); // a spot position only reaches zero on a 100% move
  const leveredWipeout = +(wipeoutMove / SAMPLE_LEVERAGE).toFixed(1);

  return (
    <div className="card pace">
      <div className="page-head" style={{ marginBottom: 6 }}>
        <h2 style={{ marginBottom: 0 }}>Pace your trades</h2>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        A common way to practice risk: decide how much of your cash goes into one trade before you place it, instead
        of after.
      </p>

      <div className="pace-row">
        <label className="label" htmlFor="pace-market">Market</label>
        <select id="pace-market" className="input pace-select" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {MARKETS.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.base})</option>
          ))}
        </select>
      </div>

      <div className="pace-row">
        <span className="label">Slice of your cash</span>
        <div className="seg" role="group" aria-label="Percent of cash for this trade">
          {SLICES.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn btn-sm${slicePct === p ? " on" : ""}`}
              aria-pressed={slicePct === p}
              onClick={() => setSlicePct(p)}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <div className="pace-result">
        <div>
          <div className="k">This trade</div>
          <div className="v tnum">{usd(liveSlice)}</div>
          <div className="s">
            {Number.isFinite(qty) && qty > 0 ? `≈ ${qtyFmt(qty)} ${market.base} at the current price` : "Waiting for a price…"}
          </div>
        </div>
        <div>
          <div className="k">Left in cash</div>
          <div className="v tnum">{usd(Math.max(0, cash - liveSlice))}</div>
          <div className="s">if you placed it</div>
        </div>
      </div>

      <div className="pace-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, slicePct)}%` }} />
      </div>

      <div className="pace-note">
        <b>Spot vs. leverage</b>
        Held like this (spot), {usd(liveSlice)} can only ever fall to $0 — a {wipeoutMove}% move against you wipes it
        out, nothing more. Used as margin on the Leverage tab at {SAMPLE_LEVERAGE}&times;, that same {usd(liveSlice)}
        is wiped out by a move of only {leveredWipeout}%. Leverage never touches your other cash there either, but it
        gets you to zero far faster.
      </div>
    </div>
  );
}
