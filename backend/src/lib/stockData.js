// Pure helpers for Twelve Data responses. Kept separate from the network code so they can be tested.

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

// One /quote object -> our quote shape, or null if it is an error or unusable.
export function parseQuote(q) {
  if (!q || typeof q !== "object" || q.status === "error" || q.code) return null;
  const price = num(q.close);
  if (!price || price <= 0) return null;
  const prev = num(q.previous_close);
  const change = num(q.percent_change) ?? (prev ? ((price - prev) / prev) * 100 : 0);
  return {
    symbol: String(q.symbol || "").toUpperCase(),
    name: q.name || "",
    price,
    change,
    open: num(q.open),
    high: num(q.high),
    low: num(q.low),
    prevClose: prev,
    volume: num(q.volume),
    avgVolume: num(q.average_volume),
    marketOpen: q.is_market_open === true || q.is_market_open === "true",
    week52Low: num(q.fifty_two_week?.low),
    week52High: num(q.fifty_two_week?.high),
    // Seconds since epoch of the last price, when given.
    at: num(q.timestamp) ? num(q.timestamp) * 1000 : Date.now(),
  };
}

// /quote returns a flat object for one symbol and an object keyed by symbol for several.
export function parseQuotes(data, requested) {
  const out = {};
  if (!data || typeof data !== "object") return out;
  if (requested.length === 1 && (data.symbol || data.close || data.status === "error")) {
    const q = parseQuote(data);
    if (q) out[requested[0]] = { ...q, symbol: requested[0] };
    return out;
  }
  for (const id of requested) {
    const q = parseQuote(data[id]);
    if (q) out[id] = { ...q, symbol: id };
  }
  return out;
}

// /stocks or /etfs -> list of { symbol, name, exchange, type } on major US exchanges.
const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "NYSE ARCA", "AMEX", "BATS", "CBOE"]);
const KEEP_TYPES = new Set(["Common Stock", "ETF", "American Depositary Receipt", "Depositary Receipt", "REIT"]);

export function parseListing(data, fallbackType) {
  const rows = Array.isArray(data?.data) ? data.data : [];
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const symbol = String(r?.symbol || "").toUpperCase();
    const exchange = String(r?.exchange || "").toUpperCase();
    const type = r?.type || fallbackType;
    if (!symbol || seen.has(symbol) || !/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) continue;
    if (!US_EXCHANGES.has(exchange)) continue;
    if (fallbackType !== "ETF" && !KEEP_TYPES.has(type)) continue;
    seen.add(symbol);
    out.push({ symbol, name: r.name || symbol, exchange: r.exchange, type });
  }
  return out;
}

// /time_series values (newest first, strings, requested with timezone=UTC) -> candles oldest first.
export function parseCandles(data) {
  const values = Array.isArray(data?.values) ? data.values : [];
  const utc = (d) => {
    const s = String(d);
    return Date.parse(s.length > 10 ? `${s.replace(" ", "T")}Z` : `${s}T00:00:00Z`);
  };
  return values
    .map((v) => ({
      t: utc(v.datetime),
      o: num(v.open),
      h: num(v.high),
      l: num(v.low),
      c: num(v.close),
      v: num(v.volume) ?? 0,
    }))
    .filter((x) => Number.isFinite(x.t) && x.c > 0)
    .sort((a, b) => a.t - b.t);
}
