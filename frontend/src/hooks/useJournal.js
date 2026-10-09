import { useCallback, useEffect, useRef, useState } from "react";
import api, { errorMessage } from "../lib/api";

// The full trade journal, newest first, one page at a time, plus its totals.
// Changing a filter starts again from the newest entry. Like useNews, only the latest
// request may update the screen, so a slow reply for an old filter is ignored.
export function useJournal({ market = "", symbol = "", pageSize = 50 } = {}) {
  const [state, setState] = useState({ items: [], next: null, loading: true, loadingMore: false, error: "" });
  const [summary, setSummary] = useState(null);
  const latest = useRef(0);

  const params = useCallback(
    (extra = {}) => ({ market: market || undefined, symbol: symbol || undefined, limit: pageSize, ...extra }),
    [market, symbol, pageSize]
  );

  const reload = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [page, sum] = await Promise.all([
        api.get("/paper/journal", { params: params() }),
        api.get("/paper/journal/summary"),
      ]);
      if (id !== latest.current) return;
      setState({ items: page.data.items || [], next: page.data.next || null, loading: false, loadingMore: false, error: "" });
      setSummary(sum.data.summary || null);
    } catch (e) {
      if (id !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: errorMessage(e, "Could not load your trade journal.") }));
    }
  }, [params]);

  const loadMore = useCallback(async () => {
    if (!state.next || state.loadingMore) return;
    const id = latest.current;
    setState((s) => ({ ...s, loadingMore: true, error: "" }));
    try {
      const { data } = await api.get("/paper/journal", { params: params({ before: state.next }) });
      if (id !== latest.current) return;
      setState((s) => {
        const seen = new Set(s.items.map((i) => i.id));
        const fresh = (data.items || []).filter((i) => !seen.has(i.id));
        return { ...s, items: [...s.items, ...fresh], next: data.next || null, loadingMore: false };
      });
    } catch (e) {
      if (id !== latest.current) return;
      setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e, "Could not load more entries.") }));
    }
  }, [params, state.next, state.loadingMore]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Downloads every matching entry as a spreadsheet file.
  const exportCsv = useCallback(async () => {
    const { data } = await api.get("/paper/journal/export", {
      params: { market: market || undefined, symbol: symbol || undefined },
      responseType: "blob",
    });
    const blob = data instanceof Blob ? data : new Blob([data], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deltacloud-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [market, symbol]);

  return { ...state, summary, reload, loadMore, exportCsv };
}

// Totals only, for small summary cards.
export function useJournalSummary() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .get("/paper/journal/summary")
      .then(({ data }) => live && setSummary(data.summary || null))
      .catch((e) => live && setError(errorMessage(e, "Could not load your trade totals.")));
    return () => {
      live = false;
    };
  }, []);
  return { summary, error };
}
