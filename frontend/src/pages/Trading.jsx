import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { marketById } from "../lib/symbols";
import { useWatch } from "../context/MarketContext";
import { useMarketInfo } from "../hooks/useMarketInfo";
import MarketPicker from "../components/MarketPicker";
import { usePaperAccount } from "../hooks/usePaperAccount";
import FeedBadge from "../components/FeedBadge";
import TradingViewChart from "../components/TradingViewChart";
import TradePanel from "../components/TradePanel";
import LeveragePanel from "../components/LeveragePanel";
import LeveragePositions from "../components/LeveragePositions";
import Disclaimer from "../components/Disclaimer";
import { priceFmt, qtyFmt, usd, signedUsd, timeFmt, tone } from "../lib/format";

export default function Trading() {
  const [params, setParams] = useSearchParams();
  const market = useMarketInfo(params.get("symbol") || "BTCUSDT");
  const isStock = market.kind === "stock";
  const { account, setAccount, error } = usePaperAccount();
  const [mode, setMode] = useState("spot"); // "spot" | "leverage"
  useWatch([market.id]);

  // Leverage practice is for crypto only.
  useEffect(() => {
    if (isStock) setMode("spot");
  }, [isStock]);

  const orders = account?.orders.slice(0, 10) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Trading</h1>
          <p>Practice buying and selling any coin or US stock with play money. Prices are real when the badge says live.</p>
        </div>
        <FeedBadge />
      </div>

      <div className="card">
        <MarketPicker value={market.id} onChange={(id) => setParams({ symbol: id }, { replace: true })} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Want to understand {market.name} first?{" "}
          <Link to={`/intelligence?symbol=${encodeURIComponent(market.id)}`}>Ask DC Intelligence</Link>
        </p>
      </div>

      {isStock && (
        <div className="notice" role="note">
          Stock practice orders fill at the live price while the US market is open (weekdays 9:30 am to 4 pm Eastern).
          Leverage practice is for crypto only.
        </div>
      )}

      {error && <div className="notice error" role="alert">{error}</div>}

      {!isStock && (
      <div className="seg" role="group" aria-label="Order type">
        <button type="button" className={`btn${mode === "spot" ? " on" : ""}`} aria-pressed={mode === "spot"} onClick={() => setMode("spot")}>
          Spot
        </button>
        <button type="button" className={`btn${mode === "leverage" ? " on" : ""}`} aria-pressed={mode === "leverage"} onClick={() => setMode("leverage")}>
          Leverage
        </button>
      </div>
      )}

      <div className="cols-2">
        <TradingViewChart symbol={market.tv} height="clamp(320px, 62vh, 640px)" />
        {mode === "spot" ? (
          <TradePanel symbol={market.id} account={account} onAccount={setAccount} />
        ) : (
          <LeveragePanel symbol={market.id} account={account} onAccount={setAccount} />
        )}
      </div>

      {mode === "leverage" && <LeveragePositions account={account} onAccount={setAccount} />}

      <div className="card">
        <h2>Recent practice orders</h2>
        {orders.length === 0 ? (
          <div className="empty">No orders yet. Place your first practice order above.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Market</th>
                  <th>Side</th>
                  <th className="num">Amount</th>
                  <th className="num">Price</th>
                  <th className="num">Total</th>
                  <th className="num">Result</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{timeFmt(o.at)}</td>
                    <td>{marketById(o.symbol).base}</td>
                    <td className={o.side === "BUY" ? "pos" : "neg"}>{o.side === "BUY" ? "Buy" : "Sell"}</td>
                    <td className="num tnum">{qtyFmt(o.qty)}</td>
                    <td className="num tnum">{priceFmt(o.price)}</td>
                    <td className="num tnum">{usd(o.total)}</td>
                    <td className={`num tnum ${o.side === "SELL" ? tone(o.realizedPnl) : "muted"}`}>
                      {o.side === "SELL" ? signedUsd(o.realizedPnl) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}
