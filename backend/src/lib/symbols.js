// Symbols the platform supports. `seed` is only used by the simulated price feed.
export const SYMBOL_META = {
  BTCUSDT: { name: "Bitcoin", base: "BTC", seed: 65000 },
  ETHUSDT: { name: "Ethereum", base: "ETH", seed: 2600 },
  SOLUSDT: { name: "Solana", base: "SOL", seed: 150 },
  XRPUSDT: { name: "XRP", base: "XRP", seed: 0.55 },
  ADAUSDT: { name: "Cardano", base: "ADA", seed: 0.4 },
  DOGEUSDT: { name: "Dogecoin", base: "DOGE", seed: 0.15 },
};

export const SYMBOLS = Object.keys(SYMBOL_META);

export function isSymbol(value) {
  return typeof value === "string" && Object.hasOwn(SYMBOL_META, value);
}
