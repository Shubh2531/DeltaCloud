import { useCallback, useEffect, useMemo, useState } from "react";
import api, { errorMessage } from "../lib/api";
import { useMarket } from "../context/MarketContext";

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
  const equity = account.cash + invested;
  const pnl = equity - account.startingCash;
  return {
    ...account,
    positions,
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

  const account = useMemo(() => enrich(raw, prices), [raw, prices]);
  return { account, setAccount: setRaw, loading, error, refresh };
}
