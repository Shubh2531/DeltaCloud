import { MARKETS } from "./symbols";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Standard deviation of the last `n` tick-to-tick returns for one market.
function tickVolatility(series, n = 30) {
  if (!series || series.length < 8) return null;
  const s = series.slice(-(n + 1));
  const r = [];
  for (let i = 1; i < s.length; i += 1) {
    if (s[i - 1] > 0 && s[i] > 0) r.push(Math.log(s[i] / s[i - 1]));
  }
  if (r.length < 5) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
}

// Largest single-tick move across all markets, as a fraction (0.001 = 0.1%).
export function biggestTick(trail) {
  let best = 0;
  for (const m of MARKETS) {
    const s = trail?.[m.id];
    if (s && s.length >= 2 && s[s.length - 2] > 0) {
      best = Math.max(best, Math.abs(s[s.length - 1] / s[s.length - 2] - 1));
    }
  }
  return best;
}

const MOODS = [
  { max: 0.28, label: "Calm", note: "Prices are moving only a little." },
  { max: 0.5, label: "Active", note: "Prices are moving at a normal pace." },
  { max: 0.75, label: "Fast", note: "Prices are moving quickly." },
  { max: 2, label: "Stormy", note: "Prices are swinging hard." },
];

// Turns prices and recent ticks into the orb's state and a plain-language reading.
// Everything here describes what already happened. It never predicts and never says buy or sell.
export function orbReading(prices, trail) {
  const rows = MARKETS.map((m) => ({ ...m, change: prices?.[m.id]?.P })).filter((r) => Number.isFinite(r.change));
  if (!rows.length) return null;

  const avg = rows.reduce((s, r) => s + r.change, 0) / rows.length;
  const avgAbs = rows.reduce((s, r) => s + Math.abs(r.change), 0) / rows.length;
  const up = rows.filter((r) => r.change > 0).length;
  const down = rows.length - up;
  const agree = Math.max(up, down);
  const lean = avg > 0.25 ? "up" : avg < -0.25 ? "down" : "mixed";

  const vols = MARKETS.map((m) => tickVolatility(trail?.[m.id])).filter((v) => v !== null);
  const shortVol = vols.length ? clamp(vols.reduce((a, b) => a + b, 0) / vols.length / 0.0008, 0, 1) : 0;
  const energy = clamp(0.55 * clamp(avgAbs / 4, 0, 1) + 0.45 * shortVol, 0.08, 1);
  const delta = clamp(avg / 4, -1, 1);

  const mood = MOODS.find((m) => energy <= m.max);
  const together = agree >= rows.length - 1 && lean !== "mixed";
  const direction =
    lean === "mixed" ? "split" : together ? (lean === "up" ? "rising together" : "falling together") : lean === "up" ? "leaning higher" : "leaning lower";

  let tip;
  if (mood.label === "Stormy" || mood.label === "Fast") {
    tip = "Prices are moving fast. In practice, try smaller amounts and watch how a quick swing changes your balance.";
  } else if (together && lean === "down") {
    tip = "Most markets are falling together. Notice that holding several of them did not spread the risk this time.";
  } else if (together && lean === "up") {
    tip = "Most markets are rising together. Notice that a rise in many markets at once can reverse in many at once too.";
  } else if (lean === "mixed") {
    tip = "Markets are split, with some up and some down. Compare the leader and the laggard and see what set them apart.";
  } else if (mood.label === "Calm") {
    tip = "It is quiet. Practice orders will change your balance only a little, so this is a good time to study the charts.";
  } else {
    tip = "Moves are steady. Place a small practice order and follow how it behaves against the market.";
  }

  const best = [...rows].sort((a, b) => b.change - a.change)[0];
  const worst = [...rows].sort((a, b) => a.change - b.change)[0];

  return {
    delta, energy, avg, up, down, agree, total: rows.length, lean, direction,
    mood: mood.label, moodNote: mood.note, tip, best, worst,
    headline: `${mood.label}, ${direction}`,
    nodes: rows.map((r) => ({ id: r.id, base: r.base, name: r.name, change: r.change })),
  };
}
