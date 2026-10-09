// The core coins, always available and streamed live. Many small widgets (ticker, mini
// charts, the market mood) use just these. Every other coin and stock is found through search.
// `tv` is the symbol the chart widget expects.
export const MARKETS = [
  { id: "BTCUSDT", kind: "crypto", name: "Bitcoin", base: "BTC", tv: "BINANCE:BTCUSDT" },
  { id: "ETHUSDT", kind: "crypto", name: "Ethereum", base: "ETH", tv: "BINANCE:ETHUSDT" },
  { id: "SOLUSDT", kind: "crypto", name: "Solana", base: "SOL", tv: "BINANCE:SOLUSDT" },
  { id: "XRPUSDT", kind: "crypto", name: "XRP", base: "XRP", tv: "BINANCE:XRPUSDT" },
  { id: "ADAUSDT", kind: "crypto", name: "Cardano", base: "ADA", tv: "BINANCE:ADAUSDT" },
  { id: "DOGEUSDT", kind: "crypto", name: "Dogecoin", base: "DOGE", tv: "BINANCE:DOGEUSDT" },
];

// Markets learned from the server (search results, details), so names show up everywhere.
const known = new Map(MARKETS.map((m) => [m.id, m]));

export function rememberMarkets(list) {
  for (const m of list || []) if (m?.id) known.set(m.id, { ...known.get(m.id), ...m });
}

// Best guess from the id alone, for markets we haven't loaded details for yet.
function guess(id) {
  const s = String(id || "").toUpperCase();
  const crypto = s.match(/^([A-Z0-9]+?)(USDT|USD)$/);
  if (crypto && s.length > 5) {
    return { id: s, kind: "crypto", name: crypto[1], base: crypto[1], tv: `BINANCE:${crypto[1]}USDT` };
  }
  return { id: s, kind: "stock", name: s, base: s, tv: s };
}

export const marketById = (id) => (id ? known.get(String(id).toUpperCase()) || guess(id) : MARKETS[0]);

export const isStockId = (id) => marketById(id).kind === "stock";
