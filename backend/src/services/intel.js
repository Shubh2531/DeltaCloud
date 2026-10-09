import { config } from "../config.js";
import { feed } from "./feed.js";
import { getCandles, getQuotes } from "./stocks.js";
import { queryNews } from "./news.js";
import { getMarket, isCrypto } from "../lib/symbols.js";
import { technicals, mood, risk, technicalCards, relatedNews, ruleExplanation, fmtPrice } from "../lib/intelRules.js";
import { SYSTEM_PROMPT, buildUserMessage, parseAiReply, normalizeQuestion, languageOf } from "../lib/intelPrompt.js";

export const DISCLAIMER =
  "DC Intelligence explains what already happened using real prices and news. It does not predict prices and is not financial advice.";

const CACHE_MS = 3 * 60_000;
const CANDLE_MS = 10 * 60_000;

const cache = new Map(); // key -> { result, at }
const inflight = new Map();
const candles = new Map(); // crypto id -> { list, at }
const budget = { day: "", used: 0 };

export class IntelError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function cryptoCandles(id) {
  const hit = candles.get(id);
  if (hit && Date.now() - hit.at < CANDLE_MS) return hit.list;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${config.binanceBase}/api/v3/klines?symbol=${encodeURIComponent(id)}&interval=1d&limit=120`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    // [openTime, open, high, low, close, volume, closeTime, quoteVolume, ...]
    const list = (Array.isArray(rows) ? rows : [])
      .map((r) => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[7] }))
      .filter((c) => c.c > 0);
    candles.set(id, { list, at: Date.now() });
    if (candles.size > 500) candles.delete(candles.keys().next().value);
    return list;
  } finally {
    clearTimeout(timeout);
  }
}

async function gather(market) {
  if (isCrypto(market.id)) {
    const list = await cryptoCandles(market.id).catch(() => []);
    const live = feed.quotes([market.id])[market.id];
    return { list, live: live ? { price: live.c, change: live.P } : {}, marketOpen: true };
  }
  const [list, quotes] = await Promise.all([getCandles(market.id, "1day").catch(() => []), getQuotes([market.id]).catch(() => ({}))]);
  const q = quotes[market.id];
  return { list, live: q ? { price: q.price, change: q.change } : {}, marketOpen: q?.marketOpen ?? false };
}

function aiAllowed() {
  if (!config.intel.apiKey) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) {
    budget.day = today;
    budget.used = 0;
  }
  return budget.used < config.intel.dailyLimit;
}

async function askAi(userMessage) {
  budget.used += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": config.intel.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.intel.model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return parseAiReply(text);
  } finally {
    clearTimeout(timeout);
  }
}

const factsFor = (t, marketOpen, market) => ({
  price: fmtPrice(t.price),
  "change today": Number.isFinite(t.change1d) ? `${t.change1d.toFixed(2)}%` : "unknown",
  "change 7 days": Number.isFinite(t.change7d) ? `${t.change7d.toFixed(2)}%` : "unknown",
  "change 30 days": Number.isFinite(t.change30d) ? `${t.change30d.toFixed(2)}%` : "unknown",
  "20-day average": fmtPrice(t.sma20),
  "50-day average": fmtPrice(t.sma50),
  "RSI 14 days": Number.isFinite(t.rsi14) ? Math.round(t.rsi14) : "unknown",
  "30-day high": fmtPrice(t.high30),
  "30-day low": fmtPrice(t.low30),
  "typical daily move": Number.isFinite(t.volatility) ? `±${t.volatility.toFixed(1)}%` : "unknown",
  "trading volume vs normal": Number.isFinite(t.volumeRatio) ? `${t.volumeRatio.toFixed(1)}x` : "unknown",
  ...(market.kind === "stock" ? { "US market open now": marketOpen ? "yes" : "no (prices are from the last session)" } : {}),
});

async function build(market, question, lang) {
  const { list, live, marketOpen } = await gather(market);
  const t = technicals(list, live);
  if (!t.price) throw new IntelError("Prices for this market are unavailable right now. Try again in a moment.", 503);
  const m = mood(t);
  const r = risk(t);
  const news = relatedNews(queryNews({ limit: 100, sort: "latest" }), market);

  let explanation = null;
  let source = "rules";
  if (t.ready && aiAllowed()) {
    try {
      explanation = await askAi(buildUserMessage({ market, facts: factsFor(t, marketOpen, market), mood: m, risk: r, news, question, lang }));
      if (explanation) source = "ai";
    } catch (err) {
      console.warn("DC Intelligence AI unavailable, using rules:", err.message);
    }
  }
  if (!explanation) explanation = ruleExplanation(market, t, news, question);

  return {
    market: { id: market.id, kind: market.kind, name: market.name, base: market.base },
    asOf: new Date().toISOString(),
    price: t.price,
    change1d: t.change1d,
    marketOpen,
    mood: { score: m.score, label: m.label, reason: m.parts.join("; ") },
    risk: r,
    technicals: technicalCards(t),
    news,
    explanation,
    source,
    // Built-in analysis is English only; the AI writes in the requested language.
    lang: source === "ai" ? lang : "en",
    disclaimer: DISCLAIMER,
  };
}

// Explains one market, optionally answering a question about it. Results are shared between
// users for a few minutes, so a popular coin costs one AI call, not one per person.
export async function explain(symbol, question = "", language = "en") {
  const lang = languageOf(language);
  const market = getMarket(symbol);
  if (!market) throw new IntelError("Choose a supported market.");
  const q = String(question || "").trim().slice(0, 300);
  const key = `${symbol}|${lang}|${normalizeQuestion(q)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.result, cached: true };
  if (inflight.has(key)) return inflight.get(key);
  const p = build(market, q, lang)
    .then((result) => {
      cache.set(key, { result, at: Date.now() });
      if (cache.size > 1000) cache.delete(cache.keys().next().value);
      return result;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const intelStatus = () => ({
  ai: Boolean(config.intel.apiKey),
  model: config.intel.apiKey ? config.intel.model : null,
  usedToday: budget.day === new Date().toISOString().slice(0, 10) ? budget.used : 0,
  dailyLimit: config.intel.dailyLimit,
});
