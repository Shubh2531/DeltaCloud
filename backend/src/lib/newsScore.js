// Transparent, rule-based news filtering. No model guesses: every tag and score has a visible reason.

export const TOPICS = [
  { id: "rates", label: "Rates and central banks", words: ["interest rate", "rate cut", "rate hike", "federal reserve", "the fed", "fomc", "ecb", "bank of england", "bank of japan", "central bank", "powell", "lagarde", "monetary policy", "treasury yield", "bond yield"] },
  { id: "inflation", label: "Inflation and economy", words: ["inflation", "cpi", "consumer prices", "gdp", "recession", "unemployment", "jobs report", "payrolls", "retail sales", "economic growth", "tariff"] },
  { id: "crypto", label: "Crypto", words: ["bitcoin", "btc", "ethereum", "ether", "crypto", "cryptocurrency", "stablecoin", "blockchain", "solana", "xrp", "dogecoin", "cardano", "binance", "coinbase", "etf inflow", "token"] },
  { id: "regulation", label: "Regulation", words: ["sec ", "regulator", "regulation", "lawsuit", "sanction", "ban ", "compliance", "cftc", "antitrust", "approval", "approves", "bill passes", "legislation"] },
  { id: "markets", label: "Stocks and markets", words: ["stocks", "stock market", "s&p 500", "nasdaq", "dow jones", "wall street", "shares", "rally", "selloff", "sell-off", "volatility", "earnings", "ipo", "bull market", "bear market"] },
  { id: "energy", label: "Energy and commodities", words: ["oil", "crude", "opec", "natural gas", "gold", "silver", "copper", "commodity", "brent"] },
  { id: "world", label: "Geopolitics", words: ["war", "ceasefire", "sanctions", "election", "summit", "trade deal", "trade war", "conflict", "military"] },
];

export const ASSETS = {
  BTCUSDT: /\b(bitcoin|btc)\b/i,
  ETHUSDT: /\b(ethereum|ether|eth)\b/i,
  SOLUSDT: /\b(solana|sol)\b/i,
  XRPUSDT: /\b(xrp|ripple)\b/i,
  ADAUSDT: /\b(cardano|ada)\b/i,
  DOGEUSDT: /\b(dogecoin|doge)\b/i,
};

const POSITIVE = ["surge", "surges", "rally", "rallies", "gains", "jumps", "soars", "record high", "rebound", "recovers", "beats", "approval", "approves", "growth", "boost", "optimism"];
const NEGATIVE = ["plunge", "plunges", "crash", "slump", "falls", "drops", "tumbles", "selloff", "sell-off", "fears", "warns", "lawsuit", "ban", "hack", "recession", "default", "bankruptcy", "losses", "cuts forecast"];

const has = (text, word) => text.includes(word);

export function detectTopics(text) {
  const t = ` ${text.toLowerCase()} `;
  return TOPICS.map((tp) => ({ id: tp.id, hits: tp.words.filter((w) => has(t, w)).length })).filter((x) => x.hits > 0);
}

export function detectAssets(text) {
  return Object.entries(ASSETS).filter(([, re]) => re.test(text)).map(([id]) => id);
}

// Word-count tone only. It describes the wording of the headline, not what a market will do.
export function toneOf(text) {
  const t = text.toLowerCase();
  const pos = POSITIVE.filter((w) => has(t, w)).length;
  const neg = NEGATIVE.filter((w) => has(t, w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

const STOP = new Set("a an the of to in on for and or as at by with from is are was were be this that it its after over amid into new says say will could may more than".split(" "));

export function tokens(title) {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
  );
}

export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
}

// Groups near-identical stories from different outlets. The newest story leads each group.
export function cluster(items, threshold = 0.5, windowMs = 48 * 3600 * 1000) {
  const sorted = [...items].sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt));
  const groups = [];
  for (const it of sorted) {
    const tk = tokens(it.title);
    const home = groups.find(
      (g) => Math.abs(Date.parse(g.lead.publishedAt) - Date.parse(it.publishedAt)) < windowMs && similarity(g.tk, tk) >= threshold
    );
    if (home) {
      if (!home.others.some((o) => o.source === it.source) && home.lead.source !== it.source) home.others.push(it);
    } else {
      groups.push({ lead: it, tk, others: [] });
    }
  }
  return groups.map((g) => ({ ...g.lead, alsoReportedBy: g.others.map((o) => ({ source: o.source, title: o.title, link: o.link })) }));
}

// Ranking = relevance (40%) + freshness (25%) + how many outlets carry it (20%) + official source (15%).
export function scoreItem(item, now = Date.now()) {
  const topicHits = item.topics.reduce((n, t) => n + t.hits, 0);
  const relevance = Math.min(1, (topicHits + item.assets.length) / 3);
  const ageH = Math.max(0, (now - Date.parse(item.publishedAt)) / 3600000);
  const fresh = Math.exp(-ageH / 12);
  const corroboration = Math.min(1, item.alsoReportedBy.length / 3);
  const official = item.official ? 1 : 0;
  return Number((0.4 * relevance + 0.25 * fresh + 0.2 * corroboration + 0.15 * official).toFixed(4));
}
