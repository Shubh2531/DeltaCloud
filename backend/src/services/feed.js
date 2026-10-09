import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { SYMBOLS, SYMBOL_META, cryptoIds, setMarkets } from "../lib/symbols.js";
import { parseExchangeInfo } from "../lib/cryptoUniverse.js";
import { stepPrice } from "../lib/simulate.js";

const POLL_MS = 2000;
const DAY_STATS_MS = 60_000; // 24-hour open, change and volume
const UNIVERSE_MS = 6 * 60 * 60_000; // refresh the coin list every 6 hours
const STALE_MS = 15000;
const HISTORY_MAX = 900; // about 30 minutes at one reading every 2 seconds
const LIVE_RETRY_MS = 60000;
export const FEATURED_MAX = 12;

async function getJson(url, ms = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Price feed for every Binance.US coin. Tries live prices; if they are unreachable it
// switches to a simulated random walk for the core coins and says so (mode = "simulated").
// Every coin is priced every 2 seconds, but only a small "featured" set (core coins plus
// the busiest by volume) is pushed to every browser, to keep bandwidth low. Other coins
// are fetched on demand through the API.
class MarketFeed extends EventEmitter {
  constructor({ source, apiBase }) {
    super();
    this.source = source; // auto | binance | sim
    this.apiBase = apiBase;
    this.mode = "connecting"; // connecting | live | simulated
    this.prices = new Map(); // symbol -> { c, P, t }
    this.day = new Map(); // symbol -> { open, volume (quote currency) }
    this.opens = new Map(); // simulation reference prices for % change
    this.history = new Map();
    this.featured = [...SYMBOLS];
    this.failures = 0;
    this.nextLiveTry = 0;
    this.nextDayStats = 0;
    this.nextUniverse = 0;
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
    const from = this.mode;
    this.mode = mode;
    if (from === "connecting") return; // nothing collected yet worth discarding
    // Live and simulated prices are unrelated, so never mix their history.
    this.history.clear();
    this.prices.clear();
    this.opens.clear();
    this.day.clear();
    this.nextDayStats = 0;
  }

  async loadUniverse() {
    const data = await getJson(`${this.apiBase}/api/v3/exchangeInfo`, 10000);
    const list = parseExchangeInfo(data);
    if (list.length < SYMBOLS.length) throw new Error("Coin list looks incomplete");
    setMarkets("crypto", list);
    console.log(`🪙 Loaded ${list.length} coins from Binance.US`);
  }

  async poll() {
    const now = Date.now();
    const tryLive = this.source !== "sim" && (this.mode !== "simulated" || now >= this.nextLiveTry);

    if (tryLive) {
      try {
        if (now >= this.nextUniverse) {
          this.nextUniverse = now + UNIVERSE_MS;
          await this.loadUniverse().catch((err) => {
            this.nextUniverse = now + 5 * 60_000; // try again in 5 minutes
            console.warn("Coin list unavailable, keeping the current one:", err.message);
          });
        }
        if (now >= this.nextDayStats) {
          // Not fatal: prices still work without it; % change just waits for the next try.
          await this.fetchDayStats().catch(() => {
            this.nextDayStats = now + 30_000;
          });
        }
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

  // 24-hour stats for every coin in one call: opening price (for % change) and volume
  // (to pick the featured coins).
  async fetchDayStats() {
    const data = await getJson(`${this.apiBase}/api/v3/ticker/24hr`, 8000);
    if (!Array.isArray(data)) throw new Error("Unexpected response");
    const known = new Set(cryptoIds());
    for (const x of data) {
      if (!known.has(x.symbol)) continue;
      const open = Number(x.openPrice);
      const volume = Number(x.quoteVolume);
      if (open > 0) this.day.set(x.symbol, { open, volume: Number.isFinite(volume) ? volume : 0 });
    }
    this.nextDayStats = Date.now() + DAY_STATS_MS;
    this.pickFeatured();
  }

  pickFeatured() {
    const busiest = [...this.day.entries()]
      .filter(([id]) => !SYMBOLS.includes(id))
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, FEATURED_MAX - SYMBOLS.length)
      .map(([id]) => id);
    this.featured = [...SYMBOLS, ...busiest];
  }

  // Latest price for every coin in one light call.
  async fetchLive() {
    const data = await getJson(`${this.apiBase}/api/v3/ticker/price`, 4000);
    if (!Array.isArray(data)) throw new Error("Unexpected response");
    const known = new Set(cryptoIds());
    const rows = [];
    for (const x of data) {
      const price = Number(x.price);
      if (!known.has(x.symbol) || !Number.isFinite(price) || price <= 0) continue;
      const open = this.day.get(x.symbol)?.open;
      rows.push({ symbol: x.symbol, price, change: open ? ((price - open) / open) * 100 : 0 });
    }
    if (rows.length === 0) throw new Error("No usable prices");
    return rows;
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
    this.featured = [...SYMBOLS];
    this.emit("tick", this.snapshot());
  }

  pushHistory(symbol, t, p) {
    let arr = this.history.get(symbol);
    if (!arr) {
      arr = [];
      this.history.set(symbol, arr);
    }
    arr.push({ t, p });
    if (arr.length > HISTORY_MAX) arr.shift();
  }

  // What every browser receives: the featured coins only.
  snapshot() {
    return { mode: this.mode, ts: Date.now(), prices: this.quotes(this.featured) };
  }

  // { symbol: { c, P } } for the requested coins we have a price for.
  quotes(ids) {
    const out = {};
    for (const id of ids) {
      const v = this.prices.get(id);
      if (v) out[id] = { c: v.c, P: v.P };
    }
    return out;
  }

  // Every coin's latest price, for server-side checks such as liquidations.
  allPrices() {
    const out = {};
    for (const [id, v] of this.prices) out[id] = v.c;
    return out;
  }

  dayVolume(id) {
    return this.day.get(id)?.volume ?? 0;
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
