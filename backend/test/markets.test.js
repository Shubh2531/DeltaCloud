import test from "node:test";
import assert from "node:assert/strict";
import { parseExchangeInfo } from "../src/lib/cryptoUniverse.js";
import { setMarkets, searchMarkets, isSymbol, isCrypto, isStock, getMarket, stockMarket, SYMBOLS } from "../src/lib/symbols.js";
import { parseQuotes, parseListing, parseCandles } from "../src/lib/stockData.js";

const pair = (base, quote, extra = {}) => ({
  symbol: `${base}${quote}`, baseAsset: base, quoteAsset: quote, status: "TRADING", isSpotTradingAllowed: true, ...extra,
});

test("coin list: one market per coin, USDT preferred, stablecoins and halted pairs skipped", () => {
  const list = parseExchangeInfo({
    symbols: [
      pair("AVAX", "USD"),
      pair("AVAX", "USDT"),
      pair("LINK", "USD"),
      pair("USDC", "USD"),
      pair("USDT", "USD"),
      pair("LUNA", "USD", { status: "BREAK" }),
      pair("ETH", "BTC"),
      pair("BTC", "USD"),
    ],
  });
  const ids = list.map((m) => m.id);
  assert.ok(ids.includes("AVAXUSDT"));
  assert.ok(!ids.includes("AVAXUSD"));
  assert.ok(ids.includes("LINKUSD"), "USD pair used when no USDT pair exists");
  assert.ok(!ids.some((id) => id.startsWith("USDC") || id.startsWith("USDT")));
  assert.ok(!ids.includes("LUNAUSD"));
  assert.ok(!ids.includes("ETHBTC"));
  // Core coins always keep their existing USDT ids, so old accounts still match.
  for (const id of SYMBOLS) assert.ok(ids.includes(id));
  assert.ok(!ids.includes("BTCUSD"));
  assert.equal(list.find((m) => m.id === "AVAXUSDT").name, "Avalanche");
  assert.equal(list.find((m) => m.id === "AVAXUSDT").tv, "BINANCE:AVAXUSDT");
});

test("registry: crypto and stocks live side by side and are searchable", () => {
  setMarkets("crypto", parseExchangeInfo({ symbols: [pair("AVAX", "USDT"), pair("APE", "USD")] }));
  setMarkets("stock", [
    stockMarket({ symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" }),
    stockMarket({ symbol: "APP", name: "AppLovin Corp", exchange: "NASDAQ" }),
    stockMarket({ symbol: "JPM", name: "JPMorgan Chase & Co", exchange: "NYSE" }),
  ]);
  assert.ok(isCrypto("BTCUSDT") && isCrypto("AVAXUSDT"));
  assert.ok(isStock("AAPL") && !isCrypto("AAPL"));
  assert.ok(!isSymbol("NOPE"));
  assert.equal(getMarket("JPM").tv, "NYSE:JPM");

  // Exact ticker beats prefix, prefix beats name matches.
  assert.equal(searchMarkets({ q: "app" })[0].id, "APP");
  assert.equal(searchMarkets({ q: "apple" })[0].id, "AAPL");
  assert.equal(searchMarkets({ q: "avalanche" })[0].id, "AVAXUSDT");
  assert.deepEqual(searchMarkets({ q: "ap", kind: "stock" }).map((m) => m.kind), ["stock", "stock"]);

  // Replacing stocks keeps crypto, and the other way round.
  setMarkets("stock", []);
  assert.ok(!isStock("AAPL") && isCrypto("AVAXUSDT"));
});

test("stock quotes: one symbol is a flat object, several are keyed by symbol; errors are skipped", () => {
  const one = parseQuotes({ symbol: "AAPL", close: "190.5", percent_change: "1.25", is_market_open: true }, ["AAPL"]);
  assert.equal(one.AAPL.price, 190.5);
  assert.equal(one.AAPL.change, 1.25);
  assert.equal(one.AAPL.marketOpen, true);

  const many = parseQuotes(
    {
      AAPL: { symbol: "AAPL", close: "190", previous_close: "200", is_market_open: false },
      ZZZZ: { code: 404, status: "error", message: "not found" },
    },
    ["AAPL", "ZZZZ"]
  );
  assert.equal(many.AAPL.change, -5); // computed from previous close when percent_change is missing
  assert.equal(many.AAPL.marketOpen, false);
  assert.ok(!many.ZZZZ);
  assert.deepEqual(parseQuotes({ status: "error", code: 401 }, ["AAPL"]), {});
});

test("stock list keeps major US exchanges and real stock types only", () => {
  const list = parseListing({
    data: [
      { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", type: "Common Stock" },
      { symbol: "AAPL", name: "dup", exchange: "NASDAQ", type: "Common Stock" },
      { symbol: "XYZW", name: "Warrant", exchange: "NASDAQ", type: "Warrant" },
      { symbol: "OTCX", name: "OTC Co", exchange: "OTC", type: "Common Stock" },
      { symbol: "BRK.B", name: "Berkshire Hathaway", exchange: "NYSE", type: "Common Stock" },
    ],
  });
  assert.deepEqual(list.map((s) => s.symbol), ["AAPL", "BRK.B"]);
  assert.equal(stockMarket(list[1]).tv, "NYSE:BRK_B");
});

test("candles come back oldest first, in UTC", () => {
  const c = parseCandles({
    values: [
      { datetime: "2026-10-08", open: "1", high: "2", low: "0.5", close: "1.5", volume: "100" },
      { datetime: "2026-10-07", open: "1", high: "2", low: "0.5", close: "1.2", volume: "90" },
    ],
  });
  assert.deepEqual(c.map((x) => x.c), [1.2, 1.5]);
  assert.equal(new Date(c[1].t).toISOString(), "2026-10-08T00:00:00.000Z");
  assert.equal(parseCandles({ values: [{ datetime: "2026-10-08 14:30:00", close: "5" }] })[0].t, Date.parse("2026-10-08T14:30:00Z"));
});
