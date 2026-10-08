import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "../lib/api";

// Loads stories from the server and refreshes every 2 minutes while the page is open.
export function useNews({ topic = "", symbol = "", q = "", sort = "top", limit = 40 } = {}) {
  const [state, setState] = useState({ items: [], meta: null, loading: true, error: "" });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/news", { params: { topic: topic || undefined, symbol: symbol || undefined, q: q || undefined, sort, limit } });
      setState({ items: data.items || [], meta: data, loading: false, error: "" });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(e, "Could not load the news. Try again in a moment.") }));
    }
  }, [topic, symbol, q, sort, limit]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  return { ...state, reload: load };
}
