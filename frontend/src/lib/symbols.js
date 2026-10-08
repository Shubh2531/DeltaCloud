// Markets available for paper trading. `tv` is the symbol the chart widget expects.
export const MARKETS = [
  { id: "BTCUSDT", name: "Bitcoin", base: "BTC", tv: "BINANCE:BTCUSDT" },
  { id: "ETHUSDT", name: "Ethereum", base: "ETH", tv: "BINANCE:ETHUSDT" },
  { id: "SOLUSDT", name: "Solana", base: "SOL", tv: "BINANCE:SOLUSDT" },
  { id: "XRPUSDT", name: "XRP", base: "XRP", tv: "BINANCE:XRPUSDT" },
  { id: "ADAUSDT", name: "Cardano", base: "ADA", tv: "BINANCE:ADAUSDT" },
  { id: "DOGEUSDT", name: "Dogecoin", base: "DOGE", tv: "BINANCE:DOGEUSDT" },
];

export const marketById = (id) => MARKETS.find((m) => m.id === id) || MARKETS[0];
