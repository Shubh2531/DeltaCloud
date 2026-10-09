// Remembers how a visitor found DeltaCloud until they sign up:
//   joindeltacloud.com/?src=finance-club   (a tagged link or QR code for a club, class, flyer)
//   joindeltacloud.com/r/AB3CD7E            (a friend's invite link)
// Kept in this browser only, for 30 days. Sent once, with the sign-up form.

const KEY = "dc_attr";
const MAX_AGE = 30 * 86400000;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Date.now() - v.at < MAX_AGE ? v : null;
  } catch {
    return null;
  }
};

const write = (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...v, at: Date.now() }));
  } catch {
    /* storage unavailable: attribution is a nice-to-have */
  }
};

const cleanSrc = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const cleanRef = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

// Call once on page load. The first source seen wins, so a later plain visit doesn't erase it.
export function captureAttribution(location = window.location) {
  const params = new URLSearchParams(location.search);
  const src = cleanSrc(params.get("src") || params.get("utm_source"));
  const ref = cleanRef(params.get("ref") || (location.pathname.match(/^\/r\/([A-Za-z0-9]+)/) || [])[1]);
  if (!src && !ref) return;
  const prev = read() || {};
  write({ src: prev.src || src || undefined, ref: prev.ref || ref || undefined });
}

export function getAttribution() {
  const v = read();
  return { source: v?.src || undefined, ref: v?.ref || undefined };
}
