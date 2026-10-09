// DC Intelligence, the rule-based part. Every number shown to the user is computed here,
// from real prices, so the AI never has to (and is never allowed to) invent figures.
// Everything describes what already happened. Nothing here predicts or says buy or sell.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (from, to) => (from ? ((to - from) / from) * 100 : null);
const round = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const signed = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${x.toFixed(d)}%` : "n/a");

export function sma(values, n) {
  return values.length >= n ? mean(values.slice(-n)) : null;
}

// Wilder's 14-period RSI.
export function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function dailyVolatility(closes, n = 30) {
  const s = closes.slice(-(n + 1));
  const r = [];
  for (let i = 1; i < s.length; i++) if (s[i - 1] > 0) r.push(Math.log(s[i] / s[i - 1]));
  if (r.length < 5) return null;
  const m = mean(r);
  return Math.sqrt(mean(r.map((x) => (x - m) ** 2))) * 100; // typical daily move, in %
}

// candles: [{ t, o, h, l, c, v }] daily, oldest first. live: { price, change } for today.
export function technicals(candles, live = {}) {
  const closes = candles.map((c) => c.c).filter((x) => x > 0);
  const price = live.price ?? closes[closes.length - 1];
  if (!price || closes.length < 15) return { ready: false, price };
  const series = [...closes.slice(0, -1), price]; // today's candle is still forming: use the live price
  const at = (daysAgo) => series[series.length - 1 - daysAgo];
  const last30 = series.slice(-30);
  const high30 = Math.max(...last30);
  const low30 = Math.min(...last30);
  const vols = candles.slice(-21, -1).map((c) => c.v).filter((v) => v > 0);
  const lastVol = candles[candles.length - 1]?.v;

  return {
    ready: true,
    price,
    change1d: Number.isFinite(live.change) ? live.change : pct(at(1), price),
    change7d: series.length > 7 ? pct(at(7), price) : null,
    change30d: series.length > 30 ? pct(at(30), price) : null,
    sma20: sma(series, 20),
    sma50: sma(series, 50),
    rsi14: rsi(series, 14),
    high30,
    low30,
    fromHigh30: pct(high30, price),
    fromLow30: pct(low30, price),
    volatility: dailyVolatility(series),
    volumeRatio: vols.length >= 5 && lastVol ? lastVol / mean(vols) : null,
  };
}

// Mood score from -100 (strongly bearish) to +100 (strongly bullish), from trend, momentum and RSI.
// "Bullish/bearish" here only describes how price has been behaving.
export function mood(t) {
  if (!t.ready) return { score: 0, label: "Not enough data", parts: [] };
  const parts = [];
  let score = 0;
  if (t.sma20) {
    const above = t.price > t.sma20;
    score += above ? 20 : -20;
    parts.push(`price is ${above ? "above" : "below"} its 20-day average`);
  }
  if (t.sma20 && t.sma50) {
    const up = t.sma20 > t.sma50;
    score += up ? 20 : -20;
    parts.push(`the 20-day average is ${up ? "above" : "below"} the 50-day average`);
  }
  if (Number.isFinite(t.change7d)) {
    score += clamp(t.change7d * 3, -25, 25);
    parts.push(`it moved ${signed(t.change7d)} over 7 days`);
  }
  if (Number.isFinite(t.change1d)) score += clamp(t.change1d * 3, -15, 15);
  if (Number.isFinite(t.rsi14)) {
    score += clamp((t.rsi14 - 50) * 0.6, -20, 20);
    parts.push(`RSI is ${Math.round(t.rsi14)}`);
  }
  score = Math.round(clamp(score, -100, 100));
  const label =
    score >= 55 ? "Strongly bullish" : score >= 20 ? "Bullish" : score > -20 ? "Neutral" : score > -55 ? "Bearish" : "Strongly bearish";
  return { score, label, parts };
}

export function risk(t) {
  const v = t.volatility;
  if (!Number.isFinite(v)) return { level: "Unknown", typicalDailyMove: null };
  const level = v < 1.5 ? "Low" : v < 3 ? "Medium" : v < 6 ? "High" : "Very high";
  return { level, typicalDailyMove: round(v, 1) };
}

// The technicals shown to the user, each with a plain-English meaning.
export function technicalCards(t) {
  if (!t.ready) return [];
  const cards = [];
  if (Number.isFinite(t.rsi14)) {
    const r = Math.round(t.rsi14);
    cards.push({
      label: "RSI (14 days)",
      value: String(r),
      meaning:
        r >= 70
          ? "Above 70: it has risen fast and steadily. Moves like this have often cooled off or paused afterwards."
          : r <= 30
          ? "Below 30: it has fallen fast and steadily. Moves like this have often slowed or bounced afterwards."
          : r >= 55
          ? "Between 55 and 70: buyers have had the upper hand lately, without being stretched."
          : r <= 45
          ? "Between 30 and 45: sellers have had the upper hand lately, without being stretched."
          : "Near 50: buying and selling pressure have been roughly balanced.",
    });
  }
  if (t.sma20) {
    const gap = pct(t.sma20, t.price);
    cards.push({
      label: "vs 20-day average",
      value: signed(gap),
      meaning: `Price is ${gap >= 0 ? "above" : "below"} its average of the last 20 days, so the short-term trend has been ${gap >= 0 ? "up" : "down"}.`,
    });
  }
  if (t.sma20 && t.sma50) {
    const up = t.sma20 > t.sma50;
    cards.push({
      label: "20 vs 50-day average",
      value: up ? "Above" : "Below",
      meaning: up
        ? "The short-term average is above the longer one: recent prices are higher than a couple of months ago."
        : "The short-term average is below the longer one: recent prices are lower than a couple of months ago.",
    });
  }
  if (Number.isFinite(t.fromHigh30)) {
    cards.push({
      label: "30-day range",
      value: `${signed(t.fromHigh30)} from high`,
      meaning: `Over 30 days it traded between ${fmtPrice(t.low30)} and ${fmtPrice(t.high30)}. It is ${Math.abs(t.fromHigh30).toFixed(1)}% below the top of that range and ${t.fromLow30.toFixed(1)}% above the bottom.`,
    });
  }
  if (Number.isFinite(t.volatility)) {
    cards.push({
      label: "Typical daily swing",
      value: `±${t.volatility.toFixed(1)}%`,
      meaning: `On a normal day lately, it moved about ${t.volatility.toFixed(1)}% up or down. ${t.volatility >= 6 ? "That is very wild." : t.volatility >= 3 ? "That is lively." : t.volatility >= 1.5 ? "That is moderate." : "That is calm."}`,
    });
  }
  if (Number.isFinite(t.volumeRatio)) {
    const v = t.volumeRatio;
    cards.push({
      label: "Trading activity",
      value: `${v.toFixed(1)}× normal`,
      meaning: v >= 1.5 ? "More trading than usual: people are paying extra attention." : v <= 0.6 ? "Quieter than usual: fewer people are trading it." : "Close to its usual level of trading.",
    });
  }
  return cards;
}

export function fmtPrice(n) {
  if (!Number.isFinite(n)) return "n/a";
  const d = n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d })}`;
}

// Picks the news stories that mention this market, newest first.
export function relatedNews(stories, market, max = 5) {
  const names = [market.name.replace(/,?\s+(Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?|plc|Holdings|Platforms|Class [A-Z])\b.*$/i, "").trim()];
  if (market.base.length >= 3 && market.base !== names[0].toUpperCase()) names.push(market.base);
  const patterns = names
    .filter((n) => n.length >= 3)
    .map((n) => new RegExp(`(^|[^A-Za-z0-9$])\\$?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, n === market.base ? "" : "i"));
  if (!patterns.length) return [];
  return stories
    .filter((s) => patterns.some((re) => re.test(`${s.title} ${s.summary || ""}`)))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, max)
    .map((s) => ({ title: s.title, source: s.source, link: s.link, publishedAt: s.publishedAt, tone: s.tone }));
}

// A complete explanation from rules alone. Used when no AI key is set, the daily AI budget
// is spent, or the AI is unavailable. Same shape as the AI version.
export function ruleExplanation(market, t, news, question) {
  const m = mood(t);
  const r = risk(t);
  if (!t.ready) {
    return {
      headline: `${market.name}: not enough price history yet`,
      summary: "DC Intelligence needs a few weeks of daily prices to explain this market. Check back soon.",
      whatHappened: "",
      why: "",
      watch: [],
      answer: question ? "There isn't enough price history yet to answer that." : "",
    };
  }
  const dir = t.change1d >= 0 ? "up" : "down";
  const big = Math.abs(t.change1d) >= Math.max(2 * (t.volatility || 1), 3);
  return {
    headline: `${market.name} is ${dir} ${signed(Math.abs(t.change1d)).replace("+", "")} today, mood ${m.label.toLowerCase()}`,
    summary: `${market.name} is ${dir} ${Math.abs(t.change1d).toFixed(1)}% today${big ? ", a bigger move than usual for it" : ""}. Over the past week it moved ${signed(t.change7d)}, and its recent behavior reads as ${m.label.toLowerCase()} because ${m.parts.slice(0, 2).join(" and ") || "of its recent moves"}.`,
    whatHappened: `Today: ${signed(t.change1d)}. Last 7 days: ${signed(t.change7d)}. Last 30 days: ${signed(t.change30d)}. It sits ${Math.abs(t.fromHigh30 ?? 0).toFixed(1)}% below its 30-day high.`,
    why: news.length
      ? `Recent headlines mentioning ${market.name}: "${news[0].title}" (${news[0].source})${news[1] ? ` and "${news[1].title}" (${news[1].source})` : ""}. Headlines can move prices, but many moves also come from the wider market or from no single clear reason.`
      : `We didn't find a recent headline that mentions ${market.name}, so this move may reflect the wider ${market.kind === "stock" ? "stock market" : "crypto market"} or ordinary trading rather than one specific story.`,
    watch: [
      t.sma20 ? `Whether price stays ${t.price >= t.sma20 ? "above" : "below"} its 20-day average of ${fmtPrice(t.sma20)}.` : null,
      Number.isFinite(t.high30) ? `The 30-day high at ${fmtPrice(t.high30)} and low at ${fmtPrice(t.low30)}.` : null,
      Number.isFinite(t.rsi14) && (t.rsi14 >= 70 || t.rsi14 <= 30) ? `RSI at ${Math.round(t.rsi14)} is at an extreme, which has often come before a pause.` : null,
      r.level === "High" || r.level === "Very high" ? `Swings are ${r.level.toLowerCase()} (about ±${r.typicalDailyMove}% a day), so practice amounts can change quickly.` : null,
    ].filter(Boolean),
    answer: question
      ? `Here is what the data shows: ${market.name} moved ${signed(t.change1d)} today and ${signed(t.change7d)} this week, with a ${m.label.toLowerCase()} mood and ${r.level.toLowerCase()} swings. DC Intelligence explains what happened; it can't tell you what will happen next.`
      : "",
  };
}
