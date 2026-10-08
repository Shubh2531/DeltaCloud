// Practice leverage: isolated margin only. Each position puts up its own margin and can
// never lose more than that margin — a loss never touches the rest of the practice balance,
// and cash can never go negative. This is not how every real exchange works (some let a
// loss spill into your other funds); it's the safer, clearer version for learning with
// play money.

import { round } from "./paperMath.js";

export class TradeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TradeError";
    this.status = status;
  }
}

export const LEVERAGE_OPTIONS = [2, 5, 10, 20, 50];

// How far short of total loss a position is force-closed, as a fraction of the position's
// notional value — mirrors the "maintenance margin" real exchanges hold back so a position
// is closed slightly before it would owe more than its margin.
export const MAINTENANCE_FRAC = 0.005;

const EPS = 1e-9;

// The price at which a position is force-closed. Below this (LONG) or above this (SHORT),
// the position's margin is gone.
export function liquidationPrice(entryPrice, leverage, side, maintenanceFrac = MAINTENANCE_FRAC) {
  const k = maintenanceFrac - 1 / leverage;
  return side === "LONG" ? entryPrice * (1 + k) : entryPrice * (1 - k);
}

// Unrealized profit or loss of one position at a given price.
export function positionPnl(position, price) {
  const diff = position.side === "LONG" ? price - position.entryPrice : position.entryPrice - price;
  return round(diff * position.qty);
}

// What a position would pay out right now if closed at `price`: margin plus P/L, but never
// less than zero and never more than margin plus the position's full notional value.
export function settlementValue(position, price) {
  return Math.max(0, round(position.margin + positionPnl(position, price)));
}

function hasCrossedLiquidation(position, price) {
  return position.side === "LONG" ? price <= position.liqPrice + EPS : price >= position.liqPrice - EPS;
}

// account: { cash, leveragePositions: [{ id, symbol, side, qty, entryPrice, leverage, margin, liqPrice, openedAt }] }
// Opens a new isolated-margin position. Debits `marginUsd` from cash immediately, the same
// way a spot BUY debits the cost. Never mutates its input.
export function openLeverage(account, { symbol, side, marginUsd, leverage, price, nextId }) {
  if (!LEVERAGE_OPTIONS.includes(leverage)) throw new TradeError("Choose a supported leverage multiple.");
  if (side !== "LONG" && side !== "SHORT") throw new TradeError("Side must be LONG or SHORT.");
  if (!Number.isFinite(marginUsd) || marginUsd <= 0) throw new TradeError("Enter an amount greater than zero.");
  if (!Number.isFinite(price) || price <= 0) throw new TradeError("No valid price available right now", 503);
  if (marginUsd > account.cash + EPS) throw new TradeError("Not enough cash for that margin.");

  const margin = round(marginUsd);
  const notional = round(margin * leverage);
  const qty = round(notional / price);
  if (qty <= 0) throw new TradeError("That amount is too small to open a position.");

  const position = {
    id: nextId,
    symbol,
    side,
    qty,
    entryPrice: price,
    leverage,
    margin,
    liqPrice: round(liquidationPrice(price, leverage, side)),
    openedAt: new Date(),
  };

  return {
    cash: round(account.cash - margin),
    leveragePositions: [...account.leveragePositions, position],
    position,
  };
}

// Closes a position the trader still holds, at the current price. If the price already
// crossed the liquidation level, it settles as a liquidation instead (payout clamped to 0)
// rather than letting a late manual close pay out more than the position actually has left.
export function closeLeverage(account, { id, price }) {
  if (!Number.isFinite(price) || price <= 0) throw new TradeError("No valid price available right now", 503);
  const idx = account.leveragePositions.findIndex((p) => p.id === id);
  if (idx < 0) throw new TradeError("That position isn't open.");
  const position = account.leveragePositions[idx];

  const liquidated = hasCrossedLiquidation(position, price);
  const payout = settlementValue(position, price);
  const remaining = account.leveragePositions.filter((p) => p.id !== id);

  return {
    cash: round(account.cash + payout),
    leveragePositions: remaining,
    closed: {
      ...position,
      closedAt: new Date(),
      closePrice: price,
      pnl: round(payout - position.margin),
      reason: liquidated ? "liquidated" : "closed",
    },
  };
}

// Scans every open position against the latest prices and force-closes any that have
// crossed their liquidation level. Called before showing the account, so a position is
// never shown open after the market has already wiped it out. `prices` is { symbol: number }.
export function settleLiquidations(account, prices) {
  const stillOpen = [];
  const liquidated = [];
  for (const position of account.leveragePositions) {
    const price = prices[position.symbol];
    if (Number.isFinite(price) && hasCrossedLiquidation(position, price)) {
      liquidated.push({
        ...position,
        closedAt: new Date(),
        closePrice: price,
        pnl: round(settlementValue(position, price) - position.margin),
        reason: "liquidated",
      });
    } else {
      stillOpen.push(position);
    }
  }
  if (!liquidated.length) return null;
  const payout = liquidated.reduce((sum, p) => sum + (p.pnl + p.margin), 0);
  return { cash: round(account.cash + payout), leveragePositions: stillOpen, liquidated };
}
