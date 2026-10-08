import test from "node:test";
import assert from "node:assert/strict";

import { executeOrder, TradeError } from "../src/lib/paperMath.js";
import { computeInsights, MIN_SAMPLES, sma, pctChange } from "../src/lib/indicators.js";
import { normalizeEmail, cleanName, validatePassword, validateDob, parseQty, isOtp } from "../src/lib/validators.js";
import { generateOtp } from "../src/lib/code.js";
import { stepPrice } from "../src/lib/simulate.js";
import { isSymbol, SYMBOLS } from "../src/lib/symbols.js";

const fresh = () => ({ cash: 10000, holdings: [] });

test("BUY spends cash and creates a holding", () => {
  const r = executeOrder(fresh(), { symbol: "BTCUSDT", side: "BUY", qty: 0.1, price: 50000 });
  assert.equal(r.cash, 5000);
  assert.deepEqual(r.holdings, [{ symbol: "BTCUSDT", qty: 0.1, avgCost: 50000 }]);
  assert.equal(r.order.total, 5000);
});

test("BUY more averages the cost", () => {
  let a = fresh();
  let r = executeOrder(a, { symbol: "ETHUSDT", side: "BUY", qty: 1, price: 2000 });
  r = executeOrder(r, { symbol: "ETHUSDT", side: "BUY", qty: 1, price: 3000 });
  assert.equal(r.holdings[0].qty, 2);
  assert.equal(r.holdings[0].avgCost, 2500);
  assert.equal(r.cash, 5000);
});

test("cannot buy with too little cash", () => {
  assert.throws(
    () => executeOrder(fresh(), { symbol: "BTCUSDT", side: "BUY", qty: 1, price: 50000 }),
    (e) => e instanceof TradeError && /Not enough cash/.test(e.message)
  );
});

test("cannot sell what you do not own (no free money)", () => {
  assert.throws(
    () => executeOrder(fresh(), { symbol: "BTCUSDT", side: "SELL", qty: 0.5, price: 50000 }),
    (e) => e instanceof TradeError
  );
});

test("SELL returns cash, reports realized P/L, removes empty holding", () => {
  let r = executeOrder(fresh(), { symbol: "SOLUSDT", side: "BUY", qty: 10, price: 100 });
  r = executeOrder(r, { symbol: "SOLUSDT", side: "SELL", qty: 10, price: 120 });
  assert.equal(r.cash, 10200);
  assert.equal(r.holdings.length, 0);
  assert.equal(r.order.realizedPnl, 200);
});

test("partial SELL keeps the average cost", () => {
  let r = executeOrder(fresh(), { symbol: "SOLUSDT", side: "BUY", qty: 10, price: 100 });
  r = executeOrder(r, { symbol: "SOLUSDT", side: "SELL", qty: 4, price: 90 });
  assert.equal(r.holdings[0].qty, 6);
  assert.equal(r.holdings[0].avgCost, 100);
  assert.equal(r.order.realizedPnl, -40);
});

test("executeOrder does not mutate its input", () => {
  const a = { cash: 1000, holdings: [{ symbol: "XRPUSDT", qty: 10, avgCost: 0.5 }] };
  const snapshot = JSON.stringify(a);
  executeOrder(a, { symbol: "XRPUSDT", side: "SELL", qty: 5, price: 0.6 });
  assert.equal(JSON.stringify(a), snapshot);
});

test("rejects bad quantity, price and side", () => {
  for (const o of [
    { symbol: "BTCUSDT", side: "BUY", qty: 0, price: 1 },
    { symbol: "BTCUSDT", side: "BUY", qty: -1, price: 1 },
    { symbol: "BTCUSDT", side: "BUY", qty: NaN, price: 1 },
    { symbol: "BTCUSDT", side: "BUY", qty: 1, price: 0 },
    { symbol: "BTCUSDT", side: "HOLD", qty: 1, price: 1 },
  ]) {
    assert.throws(() => executeOrder(fresh(), o), TradeError);
  }
});

test("spending all cash at a fractional price is allowed", () => {
  const price = 65432.17;
  const qty = Math.floor((10000 / price) * 1e8) / 1e8;
  const r = executeOrder(fresh(), { symbol: "BTCUSDT", side: "BUY", qty, price });
  assert.ok(r.cash >= 0 && r.cash < 0.01);
});

test("insights wait for enough samples", () => {
  const pts = Array.from({ length: MIN_SAMPLES - 1 }, (_, i) => ({ t: i * 2000, p: 100 }));
  const r = computeInsights(pts);
  assert.equal(r.ready, false);
  assert.equal(r.needed, MIN_SAMPLES);
});

test("insights describe a rising series", () => {
  const pts = Array.from({ length: 60 }, (_, i) => ({ t: i * 2000, p: 100 + i * 0.1 }));
  const r = computeInsights(pts);
  assert.equal(r.ready, true);
  assert.equal(r.trend, "rising");
  assert.ok(r.change > 0);
  assert.equal(r.summary.length, 3);
  assert.ok(!/buy|sell/i.test(r.summary.join(" ")));
});

test("insights describe a flat series as sideways", () => {
  const pts = Array.from({ length: 40 }, (_, i) => ({ t: i * 2000, p: 100 }));
  const r = computeInsights(pts);
  assert.equal(r.trend, "sideways");
  assert.equal(r.rangePct, 0);
});

test("sma and pctChange basics", () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1], 2), null);
  assert.equal(pctChange(100, 110), 10);
  assert.equal(pctChange(0, 5), 0);
});

test("email, name and password validation", () => {
  assert.equal(normalizeEmail("  A@B.co "), "a@b.co");
  assert.equal(normalizeEmail("nope"), null);
  assert.equal(normalizeEmail({ $ne: null }), null);
  assert.equal(cleanName("  Ada   Lovelace "), "Ada Lovelace");
  assert.equal(cleanName(""), null);
  assert.equal(cleanName({}), null);
  assert.ok(validatePassword("short1"));
  assert.ok(validatePassword("alllettersonly"));
  assert.ok(validatePassword("12345678"));
  assert.equal(validatePassword("abcdef12"), null);
  assert.ok(validatePassword("a1" + "x".repeat(80)));
});

test("date of birth validation", () => {
  const todayIso = (yearsAgo, dayShift = 0) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - yearsAgo);
    d.setUTCDate(d.getUTCDate() + dayShift);
    return d.toISOString().slice(0, 10);
  };

  assert.ok(validateDob(undefined).error);
  assert.ok(validateDob("").error);
  assert.ok(validateDob("not-a-date").error);
  assert.ok(validateDob("2020-13-40").error, "rejects an impossible calendar date");
  assert.ok(validateDob("2020-02-30").error, "rejects a day that does not exist in that month");
  assert.ok(validateDob(todayIso(-1)).error, "rejects a date in the future");
  assert.ok(validateDob(todayIso(200)).error, "rejects an implausibly old date");

  assert.ok(validateDob(todayIso(17)).error, "17 years old is rejected");
  assert.match(validateDob(todayIso(17)).error, /18/);
  // Exactly 18 today is allowed; 18 years minus one day is not yet 18.
  assert.equal(validateDob(todayIso(18)).error, undefined);
  assert.ok(validateDob(todayIso(18, 1)).error, "one day short of 18 is rejected");

  const ok = validateDob(todayIso(30));
  assert.equal(ok.error, undefined);
  assert.ok(ok.dob instanceof Date);
});

test("quantity and otp parsing", () => {
  assert.equal(parseQty("0.12345678"), 0.12345678);
  assert.equal(parseQty(0.123456789), 0.12345679);
  assert.equal(parseQty(0), null);
  assert.equal(parseQty(-1), null);
  assert.equal(parseQty("abc"), null);
  assert.equal(parseQty(Infinity), null);
  assert.equal(parseQty(2e9), null);
  assert.equal(isOtp("123456"), true);
  assert.equal(isOtp("12345"), false);
  assert.equal(isOtp(123456), false);
  assert.equal(isOtp("12345a"), false);
});

test("generated codes are six digits", () => {
  for (let i = 0; i < 200; i++) assert.match(generateOtp(), /^\d{6}$/);
  assert.equal(generateOtp(() => 7), "000007");
});

test("simulated price stays positive and moves a small amount", () => {
  let p = 100;
  for (let i = 0; i < 5000; i++) {
    const next = stepPrice(p);
    assert.ok(next > 0);
    assert.ok(Math.abs(next / p - 1) <= 0.0006 * 3 + 1e-12);
    p = next;
  }
});

test("symbol check rejects prototype keys and junk", () => {
  assert.ok(isSymbol("BTCUSDT"));
  assert.equal(isSymbol("__proto__"), false);
  assert.equal(isSymbol("constructor"), false);
  assert.equal(isSymbol(null), false);
  assert.equal(SYMBOLS.length, 6);
});
