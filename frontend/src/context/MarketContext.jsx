import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { MARKETS } from "../lib/symbols";
import { socket } from "../lib/socket";
import { useAuth } from "./AuthContext";

const MarketContext = createContext(null);

// One live-price subscription for the whole app.
// mode: "connecting" | "live" | "simulated" (simulated = the server could not reach a real feed)
export function MarketProvider({ children }) {
  const { user } = useAuth();
  const [prices, setPrices] = useState({});
  const [mode, setMode] = useState("connecting");
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  // The last ~60 prices seen per market (this session only), for sparklines.
  const [trail, setTrail] = useState({});
  const retries = useRef(0);
  // Prices for markets outside the live stream (any coin or stock a screen is showing).
  const [extra, setExtra] = useState({});
  const watched = useRef(new Map()); // id -> number of screens watching it
  const [watchVersion, setWatchVersion] = useState(0);

  // Screens call watch([...ids]) and the returned function to stop. Prices for those ids are
  // fetched every few seconds while anyone is watching them.
  const watch = useCallback((ids) => {
    const list = [...new Set((ids || []).filter(Boolean).map((id) => String(id).toUpperCase()))];
    if (!list.length) return () => {};
    for (const id of list) watched.current.set(id, (watched.current.get(id) || 0) + 1);
    setWatchVersion((v) => v + 1);
    return () => {
      for (const id of list) {
        const n = (watched.current.get(id) || 1) - 1;
        if (n <= 0) watched.current.delete(id);
        else watched.current.set(id, n);
      }
      setWatchVersion((v) => v + 1);
    };
  }, []);

  const apply = useCallback((snapshot) => {
    if (!snapshot?.prices) return;
    setPrices(snapshot.prices);
    setTrail((prev) => {
      const next = { ...prev };
      for (const [id, q] of Object.entries(snapshot.prices)) {
        if (!Number.isFinite(q?.c)) continue;
        const arr = prev[id] ? prev[id].slice(-59) : [];
        arr.push(q.c);
        next[id] = arr;
      }
      return next;
    });
    setMode(snapshot.mode || "connecting");
    setUpdatedAt(snapshot.ts || Date.now());
  }, []);

  useEffect(() => {
    if (!user) {
      socket.disconnect();
      setConnected(false);
      setPrices({});
      setTrail({});
      setMode("connecting");
      return undefined;
    }

    let alive = true;
    const fetchPrices = () =>
      api
        .get("/market/prices")
        .then((res) => alive && apply(res.data))
        .catch(() => {});

    const onConnect = () => {
      retries.current = 0;
      setConnected(true);
    };
    const onDisconnect = () => setConnected(false);
    const onError = async (err) => {
      setConnected(false);
      // An expired token is refreshed through a normal API call, then we reconnect.
      if (String(err?.message).includes("unauthorized") && retries.current < 3) {
        retries.current += 1;
        try {
          await api.get("/auth/me");
          if (alive) socket.connect();
        } catch {
          /* sign-out is handled by the API client */
        }
      }
    };

    // Pre-fill the mini charts from the server's recent history so they are not empty at first.
    MARKETS.forEach((m) =>
      api
        .get(`/market/history/${m.id}`)
        .then((res) => {
          if (!alive) return;
          const seed = (res.data?.points || []).map((pt) => pt.p).filter(Number.isFinite).slice(-60);
          if (seed.length > 1) setTrail((prev) => ({ ...prev, [m.id]: [...seed, ...(prev[m.id] || [])].slice(-60) }));
        })
        .catch(() => {})
    );

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.on("priceUpdate", apply);
    socket.connect();
    fetchPrices();

    // If the live connection is down, fall back to polling so prices keep moving.
    const poll = setInterval(() => {
      if (!socket.connected) fetchPrices();
    }, 5000);

    return () => {
      alive = false;
      clearInterval(poll);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.off("priceUpdate", apply);
      socket.disconnect();
    };
  }, [user, apply]);

  const streamed = useRef(prices);
  streamed.current = prices;
  useEffect(() => {
    if (!user) {
      setExtra({});
      return undefined;
    }
    let alive = true;
    const load = () => {
      // Only ask for what the live stream doesn't already deliver, 50 at a time at most.
      const ids = [...watched.current.keys()].filter((id) => !streamed.current[id]).slice(0, 50);
      if (!ids.length) return;
      api
        .get("/market/prices", { params: { symbols: ids.join(",") } })
        .then((res) => {
          if (!alive) return;
          const got = res.data?.prices || {};
          setExtra((prev) => ({ ...prev, ...got }));
          setTrail((prev) => {
            const next = { ...prev };
            for (const [id, q] of Object.entries(got)) {
              if (!Number.isFinite(q?.c)) continue;
              const arr = prev[id] ? prev[id].slice(-59) : [];
              if (arr[arr.length - 1] !== q.c) arr.push(q.c);
              next[id] = arr;
            }
            return next;
          });
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, watchVersion]);

  const allPrices = useMemo(() => ({ ...extra, ...prices }), [extra, prices]);

  const value = useMemo(
    () => ({ prices: allPrices, trail, mode, connected, updatedAt, watch }),
    [allPrices, trail, mode, connected, updatedAt, watch]
  );
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

// Keeps prices flowing for these markets while the calling screen is shown.
export function useWatch(ids) {
  const { watch } = useMarket();
  const key = (ids || []).filter(Boolean).join(",");
  useEffect(() => watch(key ? key.split(",") : []), [watch, key]);
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used inside <MarketProvider>");
  return ctx;
}
