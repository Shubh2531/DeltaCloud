// Minimal RSS 2.0 / Atom reader. Only pulls the fields we show: title, link, short summary, date.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };

export function decode(text = "") {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function safeChar(code) {
  try { return String.fromCodePoint(code); } catch { return ""; }
}

export function stripTags(text = "") {
  return decode(decode(text).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

function atomLink(block) {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return (alt || any)?.[1] || "";
}

const safeUrl = (u) => {
  try {
    const url = new URL(decode(u).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

export function clip(text, max = 220) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

export function parseFeed(xml) {
  const blocks = [
    ...String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...String(xml).matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const items = [];
  for (const b of blocks) {
    const title = stripTags(tag(b, "title"));
    const link = safeUrl(tag(b, "link").trim() || atomLink(b));
    const dateRaw = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const t = Date.parse(decode(dateRaw).trim());
    const summary = clip(stripTags(tag(b, "description") || tag(b, "summary") || tag(b, "content")));
    if (!title || !link || !Number.isFinite(t)) continue;
    items.push({ title, link, summary, publishedAt: new Date(t).toISOString() });
  }
  return items;
}
