import { parseFeed } from "../lib/rss.js";
import { detectTopics, detectAssets, toneOf, cluster, scoreItem, TOPICS } from "../lib/newsScore.js";

// Public RSS feeds. We show headline, a short snippet and a link back to the publisher, always credited.
// `focus: true` feeds are finance-native, so everything in them is kept. Others must match a topic.
export const SOURCES = [
  { id: "fed", name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", official: true, focus: true },
  { id: "sec", name: "U.S. SEC", url: "https://www.sec.gov/news/pressreleases.rss", official: true, focus: true },
  { id: "ecb", name: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html", official: true, focus: true },
  { id: "cnbc", name: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", focus: true },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/", focus: true },
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", focus: true },
  { id: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss", focus: true },
  { id: "bbc", name: "BBC News", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { id: "guardian", name: "The Guardian", url: "https://www.theguardian.com/uk/business/rss" },
  { id: "nyt", name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { id: "aljazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
];

const REFRESH_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 3 * 24 * 3600 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let store = [];
let status = SOURCES.map((s) => ({ id: s.id, name: s.name, ok: null, count: 0, checkedAt: null }));
let timer = null;
let refreshedAt = null;

async function pull(src) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: ctl.signal,
      headers: { "user-agent": "DeltaCloudNewsReader/1.0 (+headline links only)", accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text()).slice(0, 40);
    return items.map((i) => ({ ...i, source: src.name, sourceId: src.id, official: Boolean(src.official), focus: Boolean(src.focus) }));
  } finally {
    clearTimeout(to);
  }
}

export function build(raw, now = Date.now()) {
  const recent = raw.filter((i) => now - Date.parse(i.publishedAt) < MAX_AGE_MS && Date.parse(i.publishedAt) <= now + 3600000);
  const enriched = recent
    .map((i) => {
      const text = `${i.title}. ${i.summary}`;
      return { ...i, topics: detectTopics(text), assets: detectAssets(text), tone: toneOf(i.title) };
    })
    // Finance-native feeds keep everything; general news must match a market topic or asset.
    .filter((i) => i.focus || i.topics.length > 0 || i.assets.length > 0);
  return cluster(enriched).map((i) => ({ ...i, score: scoreItem(i, now) }));
}

export async function refresh() {
  const results = await Promise.allSettled(SOURCES.map(pull));
  const raw = [];
  status = results.map((r, i) => {
    const src = SOURCES[i];
    if (r.status === "fulfilled") {
      raw.push(...r.value);
      return { id: src.id, name: src.name, ok: true, count: r.value.length, checkedAt: new Date().toISOString() };
    }
    return { id: src.id, name: src.name, ok: false, count: 0, checkedAt: new Date().toISOString() };
  });
  // Keep the previous list if every feed failed (for example, no internet), instead of blanking the page.
  if (raw.length > 0) {
    store = build(raw);
    refreshedAt = new Date().toISOString();
  }
}

export function startNews() {
  if (timer) return;
  refresh().catch(() => {});
  timer = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
  timer.unref?.();
}

export function stopNews() {
  clearInterval(timer);
  timer = null;
}

export function queryNews({ topic, symbol, q, limit = 40, sort = "top" } = {}) {
  let list = store;
  if (topic) list = list.filter((i) => i.topics.some((t) => t.id === topic));
  if (symbol) list = list.filter((i) => i.assets.includes(symbol));
  if (q) {
    const needle = String(q).toLowerCase().slice(0, 80);
    list = list.filter((i) => `${i.title} ${i.summary}`.toLowerCase().includes(needle));
  }
  const sorted = [...list].sort((a, b) =>
    sort === "latest" ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : b.score - a.score
  );
  return sorted.slice(0, Math.min(Math.max(Number(limit) || 40, 1), 100));
}

export const newsMeta = () => ({
  refreshedAt,
  sources: status,
  topics: TOPICS.map(({ id, label }) => ({ id, label })),
});
