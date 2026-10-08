// Pure paper-trading maths: spot only, no leverage, no shorting.
// BUY spends cash and adds to a holding. SELL reduces a holding you own.

export class TradeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TradeError";
    this.status = status;
  }
}

export const round = (x, digits = 8) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

const EPS = 1e-9;

// account: { cash, holdings: [{ symbol, qty, avgCost }] }
// order:   { symbol, side: "BUY" | "SELL", qty, price }
// Returns the new cash/holdings and the order record. Never mutates its input.
export function executeOrder(account, order) {
  const { symbol, side, qty, price } = order;
  if (!Number.isFinite(qty) || qty <= 0) throw new TradeError("Quantity must be greater than zero");
  if (!Number.isFinite(price) || price <= 0) throw new TradeError("No valid price available right now", 503);

  const total = round(qty * price);
  const holdings = account.holdings.map((h) => ({ symbol: h.symbol, qty: h.qty, avgCost: h.avgCost }));
  const idx = holdings.findIndex((h) => h.symbol === symbol);
  let cash = account.cash;
  let realizedPnl = 0;

  if (side === "BUY") {
    if (total > cash + EPS) throw new TradeError("Not enough cash for this order");
    cash = round(cash - total);
    if (idx >= 0) {
      const h = holdings[idx];
      const newQty = round(h.qty + qty);
      h.avgCost = round((h.qty * h.avgCost + total) / newQty);
      h.qty = newQty;
    } else {
      holdings.push({ symbol, qty: round(qty), avgCost: price });
    }
  } else if (side === "SELL") {
    if (idx < 0 || holdings[idx].qty + EPS < qty) {
      throw new TradeError(`You don't hold enough ${symbol.replace("USDT", "")} to sell that much`);
    }
    const h = holdings[idx];
    realizedPnl = round((price - h.avgCost) * qty);
    cash = round(cash + total);
    h.qty = round(h.qty - qty);
    if (h.qty <= EPS) holdings.splice(idx, 1);
  } else {
    throw new TradeError("Side must be BUY or SELL");
  }

  return {
    cash,
    holdings,
    order: { symbol, side, qty: round(qty), price, total, realizedPnl },
  };
}
