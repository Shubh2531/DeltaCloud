import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { SYMBOLS, SYMBOL_META } from "../lib/symbols.js";
import { stepPrice } from "../lib/simulate.js";

const POLL_MS = 2000;
const STALE_MS = 15000;
const HISTORY_MAX = 900; // about 30 minutes at one reading every 2 seconds
const LIVE_RETRY_MS = 60000;

// Price feed. Tries live Binance.US prices; if they are unreachable it switches to
// a simulated random walk and says so (mode = "simulated") so the UI can label it.
class MarketFeed extends EventEmitter {
  constructor({ source, apiBase }) {
    super();
    this.source = source; // auto | binance | sim
    this.apiBase = apiBase;
    this.mode = "connecting"; // connecting | live | simulated
    this.prices = new Map(); // symbol -> { c, P, t }
    this.opens = new Map(); // simulation reference prices for % change
    this.history = new Map(SYMBOLS.map((s) => [s, []]));
    this.failures = 0;
    this.nextLiveTry = 0;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    if (this.source === "sim") this.setMode("simulated");
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    console.log(`📈 Market feed mode: ${this.mode} → ${mode}`);
    this.mode = mode;
    // Live and simulated prices are unrelated, so never mix their history.
    for (const arr of this.history.values()) arr.length = 0;
    this.prices.clear();
    this.opens.clear();
  }

  async poll() {
    const now = Date.now();
    const tryLive = this.source !== "sim" && (this.mode !== "simulated" || now >= this.nextLiveTry);

    if (tryLive) {
      try {
        const rows = await this.fetchLive();
        this.failures = 0;
        this.setMode("live");
        this.apply(rows);
        return;
      } catch (err) {
        this.failures += 1;
        if (this.source === "binance") {
          if (this.failures === 1) console.warn("Live prices unavailable:", err.message);
          return; // live-only mode never falls back to simulated data
        }
        if (this.failures < 3 && this.mode !== "simulated") return;
        if (this.failures >= 3) {
          this.failures = 0;
          this.nextLiveTry = now + LIVE_RETRY_MS;
          this.setMode("simulated");
        }
      }
    }

    if (this.mode === "simulated") this.simulate();
  }

  async fetchLive() {
    const url = `${this.apiBase}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(SYMBOLS))}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Unexpected response");
      const rows = data
        .map((x) => ({ symbol: x.symbol, price: Number(x.lastPrice), change: Number(x.priceChangePercent) }))
        .filter((x) => SYMBOLS.includes(x.symbol) && Number.isFinite(x.price) && x.price > 0);
      if (rows.length === 0) throw new Error("No usable prices");
      return rows;
    } finally {
      clearTimeout(timeout);
    }
  }

  apply(rows) {
    const t = Date.now();
    for (const { symbol, price, change } of rows) {
      this.prices.set(symbol, { c: price, P: Number.isFinite(change) ? change : 0, t });
      this.pushHistory(symbol, t, price);
    }
    this.emit("tick", this.snapshot());
  }

  simulate() {
    const t = Date.now();
    for (const symbol of SYMBOLS) {
      const prev = this.prices.get(symbol)?.c ?? SYMBOL_META[symbol].seed;
      if (!this.opens.has(symbol)) this.opens.set(symbol, prev);
      const price = stepPrice(prev);
      const open = this.opens.get(symbol);
      this.prices.set(symbol, { c: price, P: ((price - open) / open) * 100, t });
      this.pushHistory(symbol, t, price);
    }
    this.emit("tick", this.snapshot());
  }

  pushHistory(symbol, t, p) {
    const arr = this.history.get(symbol);
    arr.push({ t, p });
    if (arr.length > HISTORY_MAX) arr.shift();
  }

  snapshot() {
    const prices = {};
    for (const [symbol, v] of this.prices) prices[symbol] = { c: v.c, P: v.P };
    return { mode: this.mode, ts: Date.now(), prices };
  }

  // Latest price, or null if we have none or it is too old to trade on.
  getPrice(symbol) {
    const v = this.prices.get(symbol);
    if (!v || Date.now() - v.t > STALE_MS) return null;
    return v.c;
  }

  getHistory(symbol, limit = HISTORY_MAX) {
    const arr = this.history.get(symbol) || [];
    return arr.slice(-limit);
  }
}

export const feed = new MarketFeed({ source: config.marketSource, apiBase: config.binanceBase });
