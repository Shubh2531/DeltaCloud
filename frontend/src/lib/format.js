export const usd = (n, digits = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

// Cheap coins need more decimals than expensive ones.
export const priceFmt = (n) => {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return usd(n, 2);
  if (n >= 1) return usd(n, 3);
  return usd(n, 5);
};

export const qtyFmt = (n) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 8 }) : "—";

export const pct = (n, digits = 2) =>
  Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(digits)}%` : "—";

export const signedUsd = (n) =>
  Number.isFinite(n) ? `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}` : "—";

export const tone = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

// Rounds down so a "use all my cash" order can never exceed the cash available.
export const floorTo = (x, digits = 8) => Math.floor(x * 10 ** digits) / 10 ** digits;

export const timeFmt = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const timeAgo = (iso, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};
