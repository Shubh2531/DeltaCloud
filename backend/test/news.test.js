import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, stripTags } from "../src/lib/rss.js";
import { detectTopics, detectAssets, toneOf, cluster, scoreItem, similarity, tokens } from "../src/lib/newsScore.js";
import { build } from "../src/services/news.js";

const NOW = Date.parse("2026-10-08T12:00:00Z");

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Fed holds rates steady &amp; signals caution]]></title><link>https://example.com/a</link>
<description><![CDATA[<p>The <b>Federal Reserve</b> left interest rate unchanged.</p>]]></description><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>No date story</title><link>https://example.com/b</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<feed><entry><title>Bitcoin jumps as ETF inflows return</title><link rel="alternate" href="https://example.com/c"/>
<updated>2026-10-08T09:00:00Z</updated><summary>Bitcoin rallies.</summary></entry></feed>`;

test("RSS: decodes text, strips html, drops bad entries", () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Fed holds rates steady & signals caution");
  assert.equal(items[0].summary, "The Federal Reserve left interest rate unchanged.");
  assert.equal(items[0].publishedAt, "2026-10-08T10:00:00.000Z");
});

test("Atom entries are read too", () => {
  const items = parseFeed(ATOM);
  assert.equal(items[0].link, "https://example.com/c");
});

test("script links are rejected", () => {
  assert.equal(parseFeed(RSS).some((i) => i.link.startsWith("javascript")), false);
  assert.equal(stripTags("<script>x</script>Hi &amp; bye"), "x Hi & bye");
});

test("topics, assets and tone", () => {
  assert.ok(detectTopics("Fed signals interest rate cut").some((t) => t.id === "rates"));
  assert.deepEqual(detectAssets("Bitcoin and Ethereum rally"), ["BTCUSDT", "ETHUSDT"]);
  assert.equal(detectAssets("Solving hard problems").length, 0);
  assert.equal(toneOf("Stocks plunge on recession fears"), "negative");
  assert.equal(toneOf("Bitcoin surges to record high"), "positive");
  assert.equal(toneOf("Committee meets Tuesday"), "neutral");
});

test("the same story from two outlets becomes one item", () => {
  const items = [
    { title: "Bitcoin jumps as ETF inflows return", source: "A", link: "https://a", publishedAt: "2026-10-08T09:00:00Z" },
    { title: "Bitcoin jumps as ETF inflows return to market", source: "B", link: "https://b", publishedAt: "2026-10-08T09:30:00Z" },
    { title: "Oil falls on OPEC supply talk", source: "C", link: "https://c", publishedAt: "2026-10-08T08:00:00Z" },
  ];
  const out = cluster(items);
  assert.equal(out.length, 2);
  assert.equal(out[0].alsoReportedBy.length, 1);
  assert.ok(similarity(tokens(items[0].title), tokens(items[2].title)) < 0.2);
});

test("scoring prefers fresh, corroborated, official stories", () => {
  const base = { topics: [{ id: "rates", hits: 2 }], assets: [], alsoReportedBy: [], official: false, publishedAt: "2026-10-08T11:00:00Z" };
  const plain = scoreItem(base, NOW);
  assert.ok(scoreItem({ ...base, official: true }, NOW) > plain);
  assert.ok(scoreItem({ ...base, alsoReportedBy: [1, 2] }, NOW) > plain);
  assert.ok(scoreItem({ ...base, publishedAt: "2026-10-05T11:00:00Z" }, NOW) < plain);
});

test("build keeps focus feeds, filters unrelated general news, drops old and future items", () => {
  const mk = (title, extra = {}) => ({ title, summary: "", link: "https://x/" + title, source: "S", sourceId: "s", publishedAt: "2026-10-08T10:00:00Z", official: false, focus: false, ...extra });
  const out = build([
    mk("Celebrity wedding photos released"),
    mk("Central bank raises interest rate again"),
    mk("Quiet day on the desk", { focus: true }),
    mk("Old rate story about interest rate", { publishedAt: "2026-09-01T10:00:00Z" }),
    mk("Future bitcoin story", { publishedAt: "2026-10-20T10:00:00Z" }),
  ], NOW).map((i) => i.title);
  assert.deepEqual(out.sort(), ["Central bank raises interest rate again", "Quiet day on the desk"].sort());
});
