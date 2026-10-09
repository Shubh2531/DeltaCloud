import { useCallback, useEffect, useMemo, useState } from "react";
import api, { errorMessage } from "../lib/api";
import { useMarket, useWatch } from "../context/MarketContext";

// Adds live values (market value, profit and loss, equity) to the stored account.
export function enrich(account, prices) {
  if (!account) return null;
  const positions = account.holdings.map((h) => {
    const live = prices?.[h.symbol]?.c;
    const priced = Number.isFinite(live);
    const mark = priced ? live : h.avgCost;
    const value = h.qty * mark;
    const cost = h.qty * h.avgCost;
    return {
      ...h,
      mark,
      priced,
      value,
      cost,
      pnl: value - cost,
      pnlPct: cost ? ((value - cost) / cost) * 100 : 0,
    };
  });
  const invested = positions.reduce((sum, p) => sum + p.value, 0);

  // Re-price open leverage positions against the live socket feed between account refreshes.
  // Equity is clamped at 0 here too: a position can never owe back more than its margin.
  const leveragePositions = (account.leveragePositions || []).map((p) => {
    const live = prices?.[p.symbol]?.c;
    const priced = Number.isFinite(live);
    const mark = priced ? live : p.markPrice;
    const diff = p.side === "LONG" ? mark - p.entryPrice : p.entryPrice - mark;
    const pnl = diff * p.qty;
    return { ...p, markPrice: mark, priced, pnl, pnlPct: p.margin ? (pnl / p.margin) * 100 : 0, equity: Math.max(0, p.margin + pnl) };
  });
  const leverageEquity = leveragePositions.reduce((sum, p) => sum + p.equity, 0);

  const equity = account.cash + invested + leverageEquity;
  const pnl = equity - account.startingCash;
  return {
    ...account,
    positions,
    leveragePositions,
    leverageEquity,
    invested,
    equity,
    pnl,
    pnlPct: account.startingCash ? (pnl / account.startingCash) * 100 : 0,
  };
}

export function usePaperAccount() {
  const { prices } = useMarket();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/paper/account");
      setRaw(data.account);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep live prices coming for everything held, whatever coin or stock it is.
  useWatch([...(raw?.holdings || []).map((h) => h.symbol), ...(raw?.leveragePositions || []).map((p) => p.symbol)]);

  const account = useMemo(() => enrich(raw, prices), [raw, prices]);
  return { account, setAccount: setRaw, loading, error, refresh };
}
