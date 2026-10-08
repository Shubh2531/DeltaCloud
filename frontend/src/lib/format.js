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
