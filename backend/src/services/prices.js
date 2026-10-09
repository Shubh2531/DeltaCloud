import { feed } from "./feed.js";
import { getPriceMap, tradablePrice, StockError, FEATURED_STOCKS, cachedPriceMap, stocksEnabled } from "./stocks.js";
import { isCrypto, isStock } from "../lib/symbols.js";

// One way to price anything, crypto or stock.

export class PriceError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

// { id: { c, P } } for any mix of ids we know. Unknown ids are skipped.
export async function pricesFor(ids) {
  const crypto = ids.filter(isCrypto);
  const stocks = ids.filter(isStock);
  const out = feed.quotes(crypto);
  if (stocks.length) {
    try {
      Object.assign(out, await getPriceMap(stocks));
    } catch {
      /* stock data down: return what we have */
    }
  }
  return out;
}

// The price an order fills at. The server decides it; a client-supplied price is never trusted.
export async function tradePrice(id) {
  if (isCrypto(id)) {
    const price = feed.getPrice(id);
    if (!price) throw new PriceError("Prices are unavailable right now. Try again in a moment.");
    return price;
  }
  if (isStock(id)) {
    try {
      return await tradablePrice(id);
    } catch (err) {
      if (err instanceof StockError) throw new PriceError(err.message, err.status);
      throw new PriceError("This stock's price is unavailable right now. Try again in a moment.");
    }
  }
  throw new PriceError("Choose a supported market.", 400);
}

// What every browser receives on each tick: featured coins plus featured stocks (from cache).
export function liveSnapshot() {
  const snap = feed.snapshot();
  if (stocksEnabled()) Object.assign(snap.prices, cachedPriceMap(FEATURED_STOCKS));
  return snap;
}
