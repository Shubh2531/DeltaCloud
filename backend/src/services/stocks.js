import { config } from "../config.js";
import { setMarkets, stockMarket, isStock } from "../lib/symbols.js";
import { parseQuotes, parseListing, parseCandles } from "../lib/stockData.js";

// US stocks and ETFs from Twelve Data. Every call costs API credits, so everything is cached
// and shared: however many people look at Apple, the server asks for it at most once per
// cache window. Without TWELVEDATA_API_KEY this service stays off and the app is crypto-only.

const LIST_MS = 24 * 60 * 60_000; // the stock list changes rarely
const QUOTE_OPEN_MS = 15_000; // quote freshness while the market is open
const QUOTE_CLOSED_MS = 5 * 60_000; // ...and while it is closed
const TRADE_MAX_AGE_MS = 20_000; // a price must be this fresh to trade on
const BATCH = 50;
const FEATURED_MS = 30_000;

const FEATURED = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com Inc", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet Inc", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms Inc", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "NYSE ARCA", type: "ETF" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "ETF" },
  { symbol: "JPM", name: "JPMorgan Chase & Co", exchange: "NYSE" },
];
export const FEATURED_STOCKS = FEATURED.map((s) => s.symbol);

const { apiKey, apiBase } = config.stocks;
export const stocksEnabled = () => Boolean(apiKey);

const quoteCache = new Map(); // id -> { q, at }
const candleCache = new Map(); // key -> { candles, at }
const inflight = new Map(); // key -> promise, so concurrent requests share one call
let listTimer = null;
let featuredTimer = null;
let listedCount = 0;

export class StockError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

async function td(path, params) {
  const url = new URL(`${apiBase}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: { Authorization: `apikey ${apiKey}` }, signal: controller.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status === "error") {
      const code = data?.code || res.status;
      throw new StockError(code === 429 ? "Stock data is busy. Try again in a moment." : "Stock data is unavailable right now.", code === 429 ? 429 : 503);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function shared(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function loadList() {
  const [stocks, etfs] = await Promise.all([
    td("/stocks", { country: "United States" }),
    td("/etfs", { country: "United States" }).catch(() => ({ data: [] })),
  ]);
  const list = [...parseListing(stocks), ...parseListing(etfs, "ETF")].map(stockMarket);
  if (list.length < 100) throw new Error("Stock list looks incomplete");
  // Keep featured stocks even if a listing missed one.
  const have = new Set(list.map((m) => m.id));
  for (const f of FEATURED) if (!have.has(f.symbol)) list.push(stockMarket(f));
  setMarkets("stock", list);
  listedCount = list.length;
  console.log(`🏦 Loaded ${list.length} US stocks and ETFs`);
}

const fresh = (entry, now = Date.now()) =>
  entry && now - entry.at < (entry.q.marketOpen ? QUOTE_OPEN_MS : QUOTE_CLOSED_MS);

// Quotes for the given stock ids, from cache where fresh, fetching the rest in batches.
export async function getQuotes(ids) {
  if (!stocksEnabled()) return {};
  const wanted = [...new Set(ids)].filter(isStock);
  const out = {};
  const missing = [];
  for (const id of wanted) {
    const hit = quoteCache.get(id);
    if (fresh(hit)) out[id] = hit.q;
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const key = `q:${chunk.join(",")}`;
    try {
      const data = await shared(key, () => td("/quote", { symbol: chunk.join(",") }));
      const parsed = parseQuotes(data, chunk);
      const at = Date.now();
      for (const [id, q] of Object.entries(parsed)) {
        quoteCache.set(id, { q, at });
        out[id] = q;
      }
    } catch (err) {
      // Serve slightly old prices rather than nothing.
      for (const id of chunk) if (quoteCache.has(id)) out[id] = quoteCache.get(id).q;
      if (Object.keys(out).length === 0) throw err;
    }
  }
  return out;
}

// { id: { c, P, open } } in the same shape as crypto prices, for the browser.
export async function getPriceMap(ids) {
  const quotes = await getQuotes(ids);
  const out = {};
  for (const [id, q] of Object.entries(quotes)) out[id] = { c: q.price, P: q.change, open: q.marketOpen };
  return out;
}

// Cached quotes only, never calling the API. Used for the live push to every browser.
export function cachedPriceMap(ids) {
  const out = {};
  for (const id of ids) {
    const hit = quoteCache.get(id);
    if (hit) out[id] = { c: hit.q.price, P: hit.q.change, open: hit.q.marketOpen };
  }
  return out;
}

// A price you can trade on: fresh, and only while the US market is open.
export async function tradablePrice(id) {
  const hit = quoteCache.get(id);
  if (!hit || Date.now() - hit.at > TRADE_MAX_AGE_MS) {
    quoteCache.delete(id);
    await getQuotes([id]);
  }
  const q = quoteCache.get(id)?.q;
  if (!q) throw new StockError("This stock's price is unavailable right now. Try again in a moment.");
  if (!q.marketOpen) {
    throw new StockError("The US stock market is closed. Practice stock orders work weekdays 9:30 am to 4 pm Eastern.", 409);
  }
  return q.price;
}

// Candles for charts and DC Intelligence. interval: 5min (today) or 1day (recent months).
export async function getCandles(id, interval = "1day") {
  if (!stocksEnabled() || !isStock(id)) return [];
  const size = interval === "1day" ? 130 : 78;
  const ttl = interval === "1day" ? 10 * 60_000 : 60_000;
  const key = `${id}:${interval}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.candles;
  const data = await shared(`c:${key}`, () => td("/time_series", { symbol: id, interval, outputsize: String(size), timezone: "UTC" }));
  const candles = parseCandles(data);
  candleCache.set(key, { candles, at: Date.now() });
  if (candleCache.size > 2000) candleCache.delete(candleCache.keys().next().value);
  return candles;
}

export const stockStatus = () => ({ enabled: stocksEnabled(), listed: listedCount });

export function startStocks() {
  if (!stocksEnabled() || listTimer) return;
  // The featured stocks work straight away, even before (or if) the full list loads.
  setMarkets("stock", FEATURED.map(stockMarket));
  const list = () =>
    loadList().catch((err) => {
      console.warn("Stock list unavailable:", err.message);
      setTimeout(list, 5 * 60_000).unref?.();
    });
  list();
  listTimer = setInterval(list, LIST_MS);
  listTimer.unref?.();
  // Keep the featured stocks warm so the dashboard has them without waiting.
  const warm = () => getQuotes(FEATURED_STOCKS).catch(() => {});
  setTimeout(warm, 5000).unref?.();
  featuredTimer = setInterval(warm, FEATURED_MS);
  featuredTimer.unref?.();
}

export function stopStocks() {
  clearInterval(listTimer);
  clearInterval(featuredTimer);
  listTimer = featuredTimer = null;
}
