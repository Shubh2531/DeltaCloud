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

  const value = useMemo(
    () => ({ prices, trail, mode, connected, updatedAt }),
    [prices, trail, mode, connected, updatedAt]
  );
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used inside <MarketProvider>");
  return ctx;
}
