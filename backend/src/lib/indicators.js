// Transparent, rule-based market readings. These describe what price has done
// recently. They do not predict anything and never say buy or sell.

export const MIN_SAMPLES = 30;

export const mean = (values) =>
  values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;

export function sma(values, n) {
  if (values.length < n) return null;
  return mean(values.slice(-n));
}

export const pctChange = (from, to) => (from ? ((to - from) / from) * 100 : 0);

export function stdev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((x) => (x - m) ** 2)));
}

const signed = (x, digits = 2) => `${x >= 0 ? "+" : ""}${x.toFixed(digits)}%`;

// points: [{ t: epoch ms, p: price }] oldest first.
export function computeInsights(points) {
  const n = points.length;
  if (n < MIN_SAMPLES) return { ready: false, collected: n, needed: MIN_SAMPLES };

  const prices = points.map((x) => x.p);
  const last = prices[n - 1];
  const shortAvg = sma(prices, 10);
  const longAvg = sma(prices, 30);
  const windowMinutes = Math.max(1, Math.round((points[n - 1].t - points[0].t) / 60000));
  const change = pctChange(prices[0], last);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const avg = mean(prices);
  const rangePct = avg ? ((high - low) / avg) * 100 : 0;

  const returns = [];
  for (let i = 1; i < n; i++) returns.push(pctChange(prices[i - 1], prices[i]));
  const stepMovePct = stdev(returns);

  const vsLongPct = pctChange(longAvg, last);
  const gap = pctChange(longAvg, shortAvg);
  const trend = gap > 0.02 ? "rising" : gap < -0.02 ? "falling" : "sideways";

  const summary = [
    `Over the last ${windowMinutes} minute${windowMinutes === 1 ? "" : "s"}, price moved ${signed(change)}.`,
    trend === "sideways"
      ? "The short-term average (last 10 readings) is about level with the longer average (last 30 readings), so recent movement is mostly sideways."
      : `The short-term average (last 10 readings) is ${trend === "rising" ? "above" : "below"} the longer average (last 30 readings) by ${Math.abs(gap).toFixed(3)}%, which means recent prices are ${trend === "rising" ? "higher" : "lower"} than slightly older ones.`,
    `Price stayed within a ${rangePct.toFixed(2)}% range during this window, with an average move of ${stepMovePct.toFixed(3)}% between readings.`,
  ];

  return {
    ready: true,
    samples: n,
    windowMinutes,
    price: last,
    change,
    shortAvg,
    longAvg,
    vsLongPct,
    trend,
    high,
    low,
    rangePct,
    stepMovePct,
    summary,
  };
}
