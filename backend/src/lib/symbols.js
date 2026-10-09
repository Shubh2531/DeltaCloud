// Every market the platform knows about: crypto pairs from Binance.US and, when a stock
// data key is configured, US stocks and ETFs. The six core coins are always present, so the
// app works (and the simulated feed has seed prices) even before any list has loaded.

// Core coins. `seed` is only used by the simulated price feed.
export const SYMBOL_META = {
  BTCUSDT: { name: "Bitcoin", base: "BTC", seed: 65000 },
  ETHUSDT: { name: "Ethereum", base: "ETH", seed: 2600 },
  SOLUSDT: { name: "Solana", base: "SOL", seed: 150 },
  XRPUSDT: { name: "XRP", base: "XRP", seed: 0.55 },
  ADAUSDT: { name: "Cardano", base: "ADA", seed: 0.4 },
  DOGEUSDT: { name: "Dogecoin", base: "DOGE", seed: 0.15 },
};

export const SYMBOLS = Object.keys(SYMBOL_META);

// Friendly names for well-known coins. Binance only gives tickers; anything not listed here
// shows its ticker as its name.
export const COIN_NAMES = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP", ADA: "Cardano", DOGE: "Dogecoin",
  BNB: "BNB", AVAX: "Avalanche", DOT: "Polkadot", LINK: "Chainlink", LTC: "Litecoin", BCH: "Bitcoin Cash",
  MATIC: "Polygon", POL: "Polygon", SHIB: "Shiba Inu", TRX: "TRON", XLM: "Stellar", ATOM: "Cosmos",
  UNI: "Uniswap", ETC: "Ethereum Classic", FIL: "Filecoin", ALGO: "Algorand", HBAR: "Hedera",
  NEAR: "NEAR Protocol", APT: "Aptos", ARB: "Arbitrum", OP: "Optimism", SUI: "Sui", PEPE: "Pepe",
  AAVE: "Aave", MKR: "Maker", CRV: "Curve", GRT: "The Graph", SAND: "The Sandbox", MANA: "Decentraland",
  AXS: "Axie Infinity", APE: "ApeCoin", ICP: "Internet Computer", VET: "VeChain", EGLD: "MultiversX",
  XTZ: "Tezos", EOS: "EOS", ZEC: "Zcash", DASH: "Dash", COMP: "Compound", SNX: "Synthetix",
  SUSHI: "SushiSwap", YFI: "yearn.finance", BAT: "Basic Attention Token", ENJ: "Enjin Coin",
  CHZ: "Chiliz", ONE: "Harmony", HNT: "Helium", KSM: "Kusama", QNT: "Quant", RNDR: "Render",
  RENDER: "Render", INJ: "Injective", SEI: "Sei", TIA: "Celestia", WIF: "dogwifhat", BONK: "Bonk",
  FLOKI: "FLOKI", JUP: "Jupiter", PYTH: "Pyth Network", IMX: "Immutable", STX: "Stacks",
  FET: "Fetch.ai", TON: "Toncoin", KAS: "Kaspa", ONDO: "Ondo", ENA: "Ethena", W: "Wormhole",
};

const STOCK_TV_EXCHANGE = { NASDAQ: "NASDAQ", NYSE: "NYSE", "NYSE ARCA": "AMEX", AMEX: "AMEX", BATS: "AMEX", CBOE: "AMEX" };

// id -> { id, kind: "crypto" | "stock", base, quote, name, exchange, tv }
const registry = new Map();

function coreCrypto() {
  return SYMBOLS.map((id) => cryptoMarket({ id, base: SYMBOL_META[id].base, quote: "USDT" }));
}

export function cryptoMarket({ id, base, quote }) {
  return {
    id,
    kind: "crypto",
    base,
    quote,
    name: COIN_NAMES[base] || base,
    exchange: "Binance.US",
    // The chart widget reads global Binance's USDT pairs, which cover far more coins.
    tv: `BINANCE:${base}USDT`,
  };
}

export function stockMarket({ symbol, name, exchange, type }) {
  const id = String(symbol).toUpperCase();
  const tvExchange = STOCK_TV_EXCHANGE[String(exchange || "").toUpperCase()];
  return {
    id,
    kind: "stock",
    base: id,
    quote: "USD",
    name: name || id,
    exchange: exchange || "US",
    type: type || "Common Stock",
    tv: tvExchange ? `${tvExchange}:${id.replace(".", "_")}` : id,
  };
}

function resetTo(list) {
  registry.clear();
  for (const m of coreCrypto()) registry.set(m.id, m);
  for (const m of list) if (!registry.has(m.id) || registry.get(m.id).kind === m.kind) registry.set(m.id, m);
}
resetTo([]);

// Replaces one kind of market (crypto or stock) and keeps the other.
export function setMarkets(kind, list) {
  const keep = [...registry.values()].filter((m) => m.kind !== kind);
  resetTo([...keep, ...list]);
}

export function isSymbol(value) {
  return typeof value === "string" && registry.has(value);
}

export const getMarket = (id) => registry.get(id) || null;
export const isCrypto = (id) => registry.get(id)?.kind === "crypto";
export const isStock = (id) => registry.get(id)?.kind === "stock";
export const cryptoIds = () => [...registry.values()].filter((m) => m.kind === "crypto").map((m) => m.id);
export const marketCount = (kind) => [...registry.values()].filter((m) => !kind || m.kind === kind).length;

// Search by ticker or name. Exact ticker matches first, then tickers that start with the
// query, then names that contain it. Popular (`rank` lower) markets break ties.
export function searchMarkets({ q = "", kind, limit = 20, rank = () => 1e9 } = {}) {
  const needle = String(q).trim().toUpperCase().slice(0, 40);
  const max = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const pool = [...registry.values()].filter((m) => !kind || m.kind === kind);
  if (!needle) return pool.sort((a, b) => rank(a.id) - rank(b.id)).slice(0, max);

  const scored = [];
  for (const m of pool) {
    const name = m.name.toUpperCase();
    let s;
    if (m.base === needle || m.id === needle) s = 0;
    else if (m.base.startsWith(needle)) s = 1;
    else if (name.startsWith(needle)) s = 2;
    else if (name.includes(needle)) s = 3;
    else continue;
    scored.push({ m, s });
  }
  scored.sort((a, b) => a.s - b.s || rank(a.m.id) - rank(b.m.id) || a.m.base.length - b.m.base.length);
  return scored.slice(0, max).map((x) => x.m);
}
