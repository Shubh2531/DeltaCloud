import { useCallback, useEffect, useRef, useState } from "react";
import api, { errorMessage } from "../lib/api";

// Loads stories from the server and refreshes every 2 minutes while the page is open.
// Changing a filter quickly (market, search text) can fire more than one request before
// the first reply arrives, and replies are not guaranteed to come back in the order they
// were sent. `requestId` tags each request and only the most recently sent one is allowed
// to update the screen, so a slow, stale reply can never overwrite a newer result.
export function useNews({ topic = "", symbol = "", q = "", sort = "top", limit = 40 } = {}) {
  const [state, setState] = useState({ items: [], meta: null, loading: true, error: "" });
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    try {
      const { data } = await api.get("/news", { params: { topic: topic || undefined, symbol: symbol || undefined, q: q || undefined, sort, limit } });
      if (requestId !== latestRequestId.current) return; // a newer request has since been sent; drop this stale reply
      setState({ items: data.items || [], meta: data, loading: false, error: "" });
    } catch (e) {
      if (requestId !== latestRequestId.current) return;
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
