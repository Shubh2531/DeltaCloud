// The trade journal: one permanent record for every action that changes a practice
// account. Spot buys and sells, leveraged opens, closes and liquidations, and resets.
// Nothing here is ever trimmed or rewritten. The account document keeps short recent
// lists for fast screens, and the journal keeps the full history.
//
// These helpers are pure. They build journal entries from the results of the trading
// maths and summarise a list of entries. The routes decide when to write them.

import { randomUUID } from "node:crypto";
import { round } from "./paperMath.js";
import { liquidationPrice } from "./leverageMath.js";

export const JOURNAL_KINDS = ["SPOT_BUY", "SPOT_SELL", "LEV_OPEN", "LEV_CLOSE", "LEV_LIQUIDATED", "RESET"];

export const KIND_MARKET = {
  SPOT_BUY: "spot",
  SPOT_SELL: "spot",
  LEV_OPEN: "leverage",
  LEV_CLOSE: "leverage",
  LEV_LIQUIDATED: "leverage",
  RESET: "account",
};

const num = (x) => (Number.isFinite(x) ? x : undefined);

// Drops empty fields so stored entries only carry what applies to them.
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

function base(kind, { cashAfter, mode, at, eventId } = {}) {
  return {
    eventId: eventId || randomUUID(),
    kind,
    market: KIND_MARKET[kind],
    cashAfter: num(cashAfter),
    mode: mode || undefined,
    at: at ? new Date(at) : new Date(),
  };
}

// A spot order as returned by executeOrder().
export function spotEntry(order, ctx = {}) {
  return clean({
    ...base(order.side === "SELL" ? "SPOT_SELL" : "SPOT_BUY", ctx),
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    price: order.price,
    total: order.total,
    pnl: order.side === "SELL" ? round(order.realizedPnl || 0) : undefined,
  });
}

// A newly opened leveraged position as returned by openLeverage().
export function leverageOpenEntry(position, ctx = {}) {
  return clean({
    ...base("LEV_OPEN", { at: position.openedAt, ...ctx }),
    symbol: position.symbol,
    side: position.side,
    qty: position.qty,
    price: position.entryPrice,
    total: round(position.qty * position.entryPrice),
    margin: position.margin,
    leverage: position.leverage,
    liqPrice: position.liqPrice,
    positionId: position.id,
  });
}

// A closed or liquidated position as returned by closeLeverage() or settleLiquidations().
export function leverageCloseEntry(closed, ctx = {}) {
  return clean({
    ...base(closed.reason === "liquidated" ? "LEV_LIQUIDATED" : "LEV_CLOSE", { at: closed.closedAt, ...ctx }),
    symbol: closed.symbol,
    side: closed.side,
    qty: closed.qty,
    price: closed.closePrice,
    entryPrice: closed.entryPrice,
    total: round(closed.qty * closed.closePrice),
    margin: closed.margin,
    leverage: closed.leverage,
    liqPrice: closed.liqPrice,
    pnl: closed.pnl,
    positionId: closed.id,
    openedAt: closed.openedAt ? new Date(closed.openedAt) : undefined,
  });
}

export function resetEntry(ctx = {}) {
  return clean({ ...base("RESET", ctx), total: num(ctx.cashAfter) });
}

const plain = (d) => (typeof d?.toObject === "function" ? d.toObject() : { ...d });

// Entries for history that was recorded before the journal existed. Their ids are
// derived from the original records, so running this twice can never create duplicates.
export function legacyEntries(account) {
  const out = [];
  for (const o of account.orders || []) {
    out.push(spotEntry(o, { at: o.at, eventId: `legacy-order-${o._id}` }));
  }
  for (const p of account.leverageHistory || []) {
    const stamp = p.closedAt ? new Date(p.closedAt).getTime() : 0;
    const liqPrice = round(liquidationPrice(p.entryPrice, p.leverage, p.side));
    if (p.openedAt) {
      out.push(leverageOpenEntry({ ...plain(p), liqPrice }, { eventId: `legacy-levopen-${p.id}-${stamp}` }));
    }
    out.push(leverageCloseEntry({ ...plain(p), liqPrice }, { eventId: `legacy-lev-${p.id}-${stamp}` }));
  }
  for (const p of account.leveragePositions || []) {
    const stamp = p.openedAt ? new Date(p.openedAt).getTime() : 0;
    out.push(leverageOpenEntry(plain(p), { eventId: `legacy-levopen-${p.id}-${stamp}` }));
  }
  return out.sort((a, b) => a.at - b.at);
}

// Totals across a trader's whole journal. Only entries that realise a profit or loss
// (spot sells, leveraged closes and liquidations) count towards wins and losses.
export function summarize(entries) {
  const s = {
    totalEvents: 0,
    trades: 0,
    spotTrades: 0,
    leverageTrades: 0,
    closedTrades: 0,
    wins: 0,
    losses: 0,
    liquidations: 0,
    resets: 0,
    realizedPnl: 0,
    volume: 0,
    best: null,
    worst: null,
    firstAt: null,
    lastAt: null,
  };
  for (const e of entries) {
    s.totalEvents += 1;
    const at = e.at ? new Date(e.at) : null;
    if (at && (!s.firstAt || at < s.firstAt)) s.firstAt = at;
    if (at && (!s.lastAt || at > s.lastAt)) s.lastAt = at;

    if (e.kind === "RESET") {
      s.resets += 1;
      continue;
    }
    if (e.kind === "SPOT_BUY" || e.kind === "SPOT_SELL" || e.kind === "LEV_OPEN") {
      s.trades += 1;
      if (e.market === "spot" || e.kind.startsWith("SPOT")) s.spotTrades += 1;
      else s.leverageTrades += 1;
      if (Number.isFinite(e.total)) s.volume += e.total;
    }
    if (e.kind === "LEV_LIQUIDATED") s.liquidations += 1;

    const realises = e.kind === "SPOT_SELL" || e.kind === "LEV_CLOSE" || e.kind === "LEV_LIQUIDATED";
    if (realises && Number.isFinite(e.pnl)) {
      s.closedTrades += 1;
      s.realizedPnl += e.pnl;
      if (e.pnl > 0) s.wins += 1;
      else if (e.pnl < 0) s.losses += 1;
      const pick = { kind: e.kind, symbol: e.symbol, side: e.side, pnl: e.pnl, at: e.at };
      if (!s.best || e.pnl > s.best.pnl) s.best = pick;
      if (!s.worst || e.pnl < s.worst.pnl) s.worst = pick;
    }
  }
  s.realizedPnl = round(s.realizedPnl, 2);
  s.volume = round(s.volume, 2);
  s.winRate = s.wins + s.losses ? round((s.wins / (s.wins + s.losses)) * 100, 1) : null;
  return s;
}

const CSV_COLUMNS = [
  "at", "kind", "symbol", "side", "qty", "price", "entryPrice", "total",
  "leverage", "margin", "liqPrice", "pnl", "cashAfter", "positionId", "mode", "eventId",
];

function csvCell(v) {
  if (v === undefined || v === null) return "";
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(entries) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of entries) lines.push(CSV_COLUMNS.map((c) => csvCell(e[c])).join(","));
  return lines.join("\n") + "\n";
}

// Copies pending entries to permanent storage, then removes exactly those from the
// outbox. `insertMany(docs)` and `removeFromOutbox(eventIds)` are supplied by the caller.
// Entries already stored (same eventId) count as stored, so retries are safe. Returns
// true when the outbox was cleared, false when the copy failed and must be retried.
export async function flushOutbox(outbox, { user, insertMany, removeFromOutbox, onError = () => {} }) {
  const pending = (outbox || []).filter((e) => e && e.eventId);
  if (!pending.length) return true;
  try {
    await insertMany(pending.map((e) => ({ ...e, user })));
  } catch (err) {
    const errors = err.writeErrors || [];
    const onlyDuplicates = errors.length > 0 && errors.every((w) => (w.code ?? w.err?.code) === 11000);
    if (!onlyDuplicates) {
      onError(err);
      return false;
    }
  }
  await removeFromOutbox(pending.map((e) => e.eventId));
  return true;
}
