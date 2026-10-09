import test from "node:test";
import assert from "node:assert/strict";
import { rsi, technicals, mood, risk, technicalCards, relatedNews, ruleExplanation } from "../src/lib/intelRules.js";
import { parseAiReply, buildUserMessage, normalizeQuestion } from "../src/lib/intelPrompt.js";

const DAY = 86400000;
const series = (closes) => closes.map((c, i) => ({ t: i * DAY, o: c, h: c * 1.01, l: c * 0.99, c, v: 1000 }));
const rising = Array.from({ length: 80 }, (_, i) => 100 * 1.01 ** i);
const falling = Array.from({ length: 80 }, (_, i) => 100 * 0.99 ** i);

test("RSI: 100 for only gains, near 0 for only losses, about 50 when balanced", () => {
  assert.equal(rsi(rising), 100);
  assert.ok(rsi(falling) < 1);
  const zigzag = Array.from({ length: 60 }, (_, i) => (i % 2 ? 101 : 100));
  assert.ok(Math.abs(rsi(zigzag) - 50) < 5);
  assert.equal(rsi([1, 2, 3]), null);
});

test("steady rise reads bullish, steady fall reads bearish", () => {
  const up = technicals(series(rising));
  const down = technicals(series(falling));
  assert.ok(up.ready && down.ready);
  assert.ok(up.change7d > 0 && down.change7d < 0);
  assert.ok(mood(up).score >= 55 && mood(up).label === "Strongly bullish");
  assert.ok(mood(down).score <= -55 && mood(down).label === "Strongly bearish");
});

test("today's live price replaces the still-forming daily candle", () => {
  const t = technicals(series(rising), { price: 50, change: -40 });
  assert.equal(t.price, 50);
  assert.equal(t.change1d, -40);
  assert.ok(t.fromHigh30 < -40);
});

test("not enough history is reported, not guessed", () => {
  const t = technicals(series([1, 2, 3]));
  assert.equal(t.ready, false);
  assert.equal(mood(t).label, "Not enough data");
  assert.deepEqual(technicalCards(t), []);
  const e = ruleExplanation({ name: "NewCoin", kind: "crypto", base: "NEW" }, t, [], "why?");
  assert.match(e.summary, /needs a few weeks/);
});

test("risk levels follow the typical daily swing", () => {
  assert.equal(risk({ volatility: 1 }).level, "Low");
  assert.equal(risk({ volatility: 2 }).level, "Medium");
  assert.equal(risk({ volatility: 4 }).level, "High");
  assert.equal(risk({ volatility: 9 }).level, "Very high");
});

test("every technical card has a plain-English meaning", () => {
  const cards = technicalCards(technicals(series(rising)));
  assert.ok(cards.length >= 4);
  for (const c of cards) assert.ok(c.label && c.value && c.meaning.length > 20);
});

test("news matching: by name, or by ticker as a whole word with matching case", () => {
  const stories = [
    { title: "Apple unveils new chips", summary: "", source: "CNBC", publishedAt: "2026-10-08T10:00:00Z" },
    { title: "Pineapple prices climb", summary: "", source: "BBC", publishedAt: "2026-10-08T11:00:00Z" },
    { title: "Traders pile into $AAPL calls", summary: "", source: "MarketWatch", publishedAt: "2026-10-08T12:00:00Z" },
    { title: "Solana network upgrade", summary: "", source: "CoinDesk", publishedAt: "2026-10-08T09:00:00Z" },
    { title: "A solution for savers", summary: "", source: "NYT", publishedAt: "2026-10-08T09:00:00Z" },
  ];
  const apple = relatedNews(stories, { name: "Apple Inc", base: "AAPL" });
  assert.deepEqual(apple.map((s) => s.source), ["MarketWatch", "CNBC"]);
  const sol = relatedNews(stories, { name: "Solana", base: "SOL" });
  assert.deepEqual(sol.map((s) => s.source), ["CoinDesk"]);
});

test("rule-based explanation never gives advice and cites a headline when there is one", () => {
  const t = technicals(series(rising));
  const e = ruleExplanation({ name: "Apple Inc", kind: "stock", base: "AAPL" }, t, [{ title: "Apple unveils new chips", source: "CNBC" }], "should I buy?");
  const all = JSON.stringify(e);
  assert.match(e.why, /Apple unveils new chips/);
  assert.doesNotMatch(all, /you should (buy|sell)/i);
  assert.match(e.answer, /can't tell you what will happen next/);
});

test("AI reply: JSON is extracted and cleaned; advice or garbage is rejected", () => {
  const good = parseAiReply(
    'Sure! {"headline":"Bitcoin climbs","summary":"It rose.","whatHappened":"Up 2%.","why":"A CoinDesk report.","watch":["the 20-day average"],"answer":""}'
  );
  assert.equal(good.headline, "Bitcoin climbs");
  assert.deepEqual(good.watch, ["the 20-day average"]);

  assert.equal(parseAiReply("not json"), null);
  assert.equal(parseAiReply('{"headline":"","summary":"x"}'), null);
  assert.equal(parseAiReply('{"headline":"Dip","summary":"This is a good time to buy."}'), null);
  assert.equal(parseAiReply('{"headline":"Up","summary":"You should buy now."}'), null);
  assert.equal(parseAiReply('{"headline":"Up","summary":"It will rise to $100."}'), null);
});

test("prompt carries the computed facts and headlines, and says when there are none", () => {
  const msg = buildUserMessage({
    market: { name: "Bitcoin", base: "BTC", kind: "crypto" },
    facts: { price: "$65,000", "change today": "2.00%" },
    mood: { label: "Bullish", score: 30, parts: ["price is above its 20-day average"] },
    risk: { level: "Medium", typicalDailyMove: 2.1 },
    news: [],
    question: "",
  });
  assert.match(msg, /price: \$65,000/);
  assert.match(msg, /none found/);
  assert.match(msg, /QUESTION: \(none\)/);
  assert.equal(normalizeQuestion("  Why is it DOWN?? "), "why is it down");
});
