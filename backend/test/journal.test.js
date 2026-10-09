import test from "node:test";
import assert from "node:assert/strict";

import { executeOrder } from "../src/lib/paperMath.js";
import { openLeverage, closeLeverage, settleLiquidations } from "../src/lib/leverageMath.js";
import {
  spotEntry,
  leverageOpenEntry,
  leverageCloseEntry,
  resetEntry,
  legacyEntries,
  summarize,
  toCsv,
  flushOutbox,
  KIND_MARKET,
} from "../src/lib/journal.js";

const acct = () => ({ cash: 10000, holdings: [], leveragePositions: [] });

test("spot buy and sell become journal entries with the right kind, totals and P/L", () => {
  const a = acct();
  const buy = executeOrder(a, { symbol: "BTCUSDT", side: "BUY", qty: 0.1, price: 50000 });
  const eb = spotEntry(buy.order, { cashAfter: buy.cash, mode: "live" });
  assert.equal(eb.kind, "SPOT_BUY");
  assert.equal(eb.market, "spot");
  assert.equal(eb.total, 5000);
  assert.equal(eb.cashAfter, 5000);
  assert.equal(eb.mode, "live");
  assert.equal("pnl" in eb, false, "a buy realises nothing");
  assert.ok(eb.eventId && eb.at instanceof Date);

  const sell = executeOrder({ cash: buy.cash, holdings: buy.holdings }, { symbol: "BTCUSDT", side: "SELL", qty: 0.1, price: 51000 });
  const es = spotEntry(sell.order, { cashAfter: sell.cash });
  assert.equal(es.kind, "SPOT_SELL");
  assert.equal(es.pnl, 100);
  assert.notEqual(es.eventId, eb.eventId, "every event gets its own id");
});

test("leverage open, close and liquidation become journal entries", () => {
  const opened = openLeverage(acct(), { symbol: "ETHUSDT", side: "LONG", marginUsd: 100, leverage: 10, price: 2000, nextId: "1" });
  const eo = leverageOpenEntry(opened.position, { cashAfter: opened.cash });
  assert.equal(eo.kind, "LEV_OPEN");
  assert.equal(eo.margin, 100);
  assert.equal(eo.leverage, 10);
  assert.equal(eo.total, 1000);
  assert.equal(eo.positionId, "1");
  assert.equal(eo.liqPrice, opened.position.liqPrice);

  const closed = closeLeverage(opened, { id: "1", price: 2100 });
  const ec = leverageCloseEntry(closed.closed, { cashAfter: closed.cash });
  assert.equal(ec.kind, "LEV_CLOSE");
  assert.equal(ec.pnl, 50);
  assert.equal(ec.entryPrice, 2000);
  assert.equal(ec.price, 2100);
  assert.equal(ec.positionId, "1");

  const liq = settleLiquidations(opened, { ETHUSDT: 1000 });
  const el = leverageCloseEntry(liq.liquidated[0]);
  assert.equal(el.kind, "LEV_LIQUIDATED");
  assert.equal(el.pnl, -100, "loss never exceeds margin");
});

test("entries carry no empty fields", () => {
  const e = resetEntry({ cashAfter: 10000 });
  assert.equal(e.kind, "RESET");
  assert.equal(e.market, "account");
  for (const v of Object.values(e)) assert.ok(v !== undefined && v !== null);
  assert.equal("symbol" in e, false);
});

test("every kind maps to a market", () => {
  for (const k of ["SPOT_BUY", "SPOT_SELL", "LEV_OPEN", "LEV_CLOSE", "LEV_LIQUIDATED", "RESET"]) assert.ok(KIND_MARKET[k]);
});

test("legacy history converts once with stable ids, oldest first", () => {
  const account = {
    orders: [
      { _id: "o1", symbol: "BTCUSDT", side: "BUY", qty: 1, price: 100, total: 100, realizedPnl: 0, at: new Date("2026-01-01") },
      { _id: "o2", symbol: "BTCUSDT", side: "SELL", qty: 1, price: 110, total: 110, realizedPnl: 10, at: new Date("2026-01-03") },
    ],
    leverageHistory: [
      { id: "1", symbol: "ETHUSDT", side: "SHORT", qty: 1, entryPrice: 2000, leverage: 5, margin: 400, closePrice: 1900, pnl: 100, reason: "closed", openedAt: new Date("2026-01-02"), closedAt: new Date("2026-01-04") },
    ],
    leveragePositions: [
      { id: "2", symbol: "BTCUSDT", side: "LONG", qty: 0.01, entryPrice: 50000, leverage: 2, margin: 250, liqPrice: 25125, openedAt: new Date("2026-01-05") },
    ],
  };
  const a = legacyEntries(account);
  const b = legacyEntries(account);
  assert.deepEqual(a.map((e) => e.eventId), b.map((e) => e.eventId), "ids are deterministic");
  assert.equal(new Set(a.map((e) => e.eventId)).size, a.length, "ids are unique");
  assert.deepEqual(a.map((e) => e.kind), ["SPOT_BUY", "LEV_OPEN", "SPOT_SELL", "LEV_CLOSE", "LEV_OPEN"]);
  const reopened = a.find((e) => e.kind === "LEV_OPEN" && e.positionId === "1");
  assert.ok(reopened.liqPrice > 2000, "short liquidation price is above entry");
});

test("summary counts trades, wins, losses, liquidations and realised P/L", () => {
  const s = summarize([
    { kind: "SPOT_BUY", market: "spot", total: 1000, at: new Date("2026-01-01") },
    { kind: "SPOT_SELL", market: "spot", total: 1100, pnl: 100, symbol: "BTCUSDT", at: new Date("2026-01-02") },
    { kind: "LEV_OPEN", market: "leverage", total: 5000, at: new Date("2026-01-03") },
    { kind: "LEV_LIQUIDATED", market: "leverage", pnl: -500, symbol: "ETHUSDT", at: new Date("2026-01-04") },
    { kind: "LEV_CLOSE", market: "leverage", pnl: 0, at: new Date("2026-01-05") },
    { kind: "RESET", market: "account", at: new Date("2026-01-06") },
  ]);
  assert.equal(s.totalEvents, 6);
  assert.equal(s.trades, 3);
  assert.equal(s.spotTrades, 2);
  assert.equal(s.leverageTrades, 1);
  assert.equal(s.closedTrades, 3);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  assert.equal(s.winRate, 50, "break-even trades don't count either way");
  assert.equal(s.liquidations, 1);
  assert.equal(s.resets, 1);
  assert.equal(s.realizedPnl, -400);
  assert.equal(s.volume, 7100);
  assert.equal(s.best.pnl, 100);
  assert.equal(s.worst.symbol, "ETHUSDT");
  assert.equal(s.firstAt.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(s.lastAt.toISOString().slice(0, 10), "2026-01-06");
});

test("summary of an empty journal", () => {
  const s = summarize([]);
  assert.equal(s.trades, 0);
  assert.equal(s.winRate, null);
  assert.equal(s.best, null);
});

test("CSV export quotes separators and neutralises spreadsheet formulas", () => {
  const csv = toCsv([
    { at: new Date("2026-01-01T00:00:00Z"), kind: "SPOT_SELL", symbol: "BTCUSDT", pnl: -5, eventId: '=HYPERLINK("x")' },
    { at: new Date("2026-01-02T00:00:00Z"), kind: "RESET", mode: 'a,"b"' },
  ]);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("at,kind,symbol"));
  assert.ok(lines[1].includes(",-5,"), "negative numbers stay numbers");
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`), "formula is neutralised and quoted");
  assert.ok(lines[2].includes(`"a,""b"""`));
});

test("outbox flush: stores entries then clears exactly those", async () => {
  const stored = [];
  let removed = null;
  const ok = await flushOutbox([{ eventId: "a", kind: "RESET" }, { eventId: "b", kind: "RESET" }, null], {
    user: "u1",
    insertMany: async (docs) => stored.push(...docs),
    removeFromOutbox: async (ids) => (removed = ids),
  });
  assert.equal(ok, true);
  assert.deepEqual(stored.map((d) => [d.eventId, d.user]), [["a", "u1"], ["b", "u1"]]);
  assert.deepEqual(removed, ["a", "b"]);
});

test("outbox flush: a retry of already-stored entries still clears the outbox", async () => {
  let removed = null;
  const dup = Object.assign(new Error("dup"), { writeErrors: [{ code: 11000 }, { err: { code: 11000 } }] });
  const ok = await flushOutbox([{ eventId: "a" }, { eventId: "b" }], {
    insertMany: async () => { throw dup; },
    removeFromOutbox: async (ids) => (removed = ids),
  });
  assert.equal(ok, true);
  assert.deepEqual(removed, ["a", "b"]);
});

test("outbox flush: a real failure keeps entries for the next try", async () => {
  let removed = false;
  let reported = null;
  const ok = await flushOutbox([{ eventId: "a" }], {
    insertMany: async () => { throw new Error("network down"); },
    removeFromOutbox: async () => (removed = true),
    onError: (e) => (reported = e.message),
  });
  assert.equal(ok, false);
  assert.equal(removed, false);
  assert.equal(reported, "network down");

  const mixed = Object.assign(new Error("mixed"), { writeErrors: [{ code: 11000 }, { code: 121 }] });
  const ok2 = await flushOutbox([{ eventId: "a" }], {
    insertMany: async () => { throw mixed; },
    removeFromOutbox: async () => (removed = true),
  });
  assert.equal(ok2, false, "a non-duplicate error among duplicates is still a failure");
  assert.equal(removed, false);
});

test("empty outbox does nothing", async () => {
  let called = false;
  const ok = await flushOutbox([], { insertMany: async () => (called = true), removeFromOutbox: async () => (called = true) });
  assert.equal(ok, true);
  assert.equal(called, false);
});
