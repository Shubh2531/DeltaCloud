import { useEffect, useState } from "react";
import api from "../lib/api";
import { marketById, rememberMarkets } from "../lib/symbols";

// Full details (name, kind, chart symbol) for a market, loading them if we only know the id.
export function useMarketInfo(id) {
  const [, setLoaded] = useState(0);
  const market = marketById(id);
  const needsLoad = Boolean(id) && market.name === market.base && market.kind === "stock";

  useEffect(() => {
    if (!needsLoad) return undefined;
    let alive = true;
    api
      .get(`/market/symbol/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!alive) return;
        rememberMarkets([res.data.market]);
        setLoaded((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, needsLoad]);

  return marketById(id);
}
