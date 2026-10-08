import { MARKETS } from "./symbols";

// Turns the latest prices and headlines into a short, rule-based summary of what has happened.
// It never predicts. Every line can be traced back to numbers on screen.
export function marketPulse(prices, stories = []) {
  const rows = MARKETS.map((m) => ({ ...m, change: prices[m.id]?.P })).filter((r) => Number.isFinite(r.change));
  let breadth = null;
  if (rows.length) {
    const up = rows.filter((r) => r.change > 0).length;
    const avg = rows.reduce((s, r) => s + r.change, 0) / rows.length;
    const sorted = [...rows].sort((a, b) => b.change - a.change);
    const lean = avg > 0.25 ? "up" : avg < -0.25 ? "down" : "mixed";
    breadth = {
      up, down: rows.length - up, total: rows.length, avg, lean,
      best: sorted[0], worst: sorted[sorted.length - 1],
      // 0 = strongly down, 1 = strongly up, clamped at ±3% average
      needle: Math.min(1, Math.max(0, (avg + 3) / 6)),
    };
  }

  const tone = { positive: 0, negative: 0, neutral: 0 };
  const topics = {};
  for (const s of stories) {
    if (tone[s.tone] !== undefined) tone[s.tone] += 1;
    for (const t of s.topics || []) topics[t.id] = (topics[t.id] || 0) + 1;
  }
  const topTopics = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ id, n }));
  return { breadth, news: { total: stories.length, tone, topTopics } };
}

export function pulseSentence(p) {
  if (!p.breadth) return "Waiting for prices.";
  const b = p.breadth;
  const lean = b.lean === "up" ? "mostly higher" : b.lean === "down" ? "mostly lower" : "mixed";
  return `Markets are ${lean}: ${b.up} of ${b.total} are up over 24 hours, ${b.best.name} leading and ${b.worst.name} lagging.`;
}
