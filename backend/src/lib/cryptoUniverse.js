import { cryptoMarket, SYMBOLS } from "./symbols.js";

// Coins pegged to a currency. Their price barely moves, so they add nothing to practice trading.
export const STABLECOINS = new Set([
  "USDT", "USDC", "USD", "DAI", "BUSD", "TUSD", "USDP", "PAX", "PYUSD", "FDUSD", "GUSD", "USDS", "EURC", "EUR", "UST",
]);

// Quote currencies we accept, most preferred first. One market per coin keeps the list clean.
const QUOTES = ["USDT", "USD"];

// Turns Binance's /api/v3/exchangeInfo response into one market per coin.
// Keeps actively trading spot pairs priced in USDT or USD, prefers USDT, skips stablecoins
// and leveraged tokens. The core coins always keep their existing USDT ids.
export function parseExchangeInfo(data) {
  const rows = Array.isArray(data?.symbols) ? data.symbols : [];
  const best = new Map(); // base -> { id, base, quote }
  for (const s of rows) {
    const base = String(s?.baseAsset || "").toUpperCase();
    const quote = String(s?.quoteAsset || "").toUpperCase();
    const id = String(s?.symbol || "").toUpperCase();
    if (!base || !id || !QUOTES.includes(quote)) continue;
    if (s.status !== "TRADING") continue;
    if (s.isSpotTradingAllowed === false) continue;
    if (STABLECOINS.has(base)) continue;
    if (/(UP|DOWN|BULL|BEAR)$/.test(base) && base.length > 4) continue;
    if (id !== `${base}${quote}`) continue;
    const prev = best.get(base);
    if (!prev || QUOTES.indexOf(quote) < QUOTES.indexOf(prev.quote)) best.set(base, { id, base, quote });
  }
  // Core coins keep their USDT ids even if Binance.US only lists them against USD,
  // so existing accounts and journal entries still match.
  for (const id of SYMBOLS) {
    const base = id.replace(/USDT$/, "");
    best.set(base, { id, base, quote: "USDT" });
  }
  return [...best.values()].map(cryptoMarket).sort((a, b) => a.base.localeCompare(b.base));
}
