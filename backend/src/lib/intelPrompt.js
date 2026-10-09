// Prompt and response handling for DC Intelligence's AI writer. Pure, so it can be tested.

export const SYSTEM_PROMPT = `You are DC Intelligence, the explainer inside DeltaCloud, a learning and paper-trading app for new investors (many are college students).

Your job: explain in plain, friendly English what a stock or cryptocurrency has been doing and the most likely reasons, using ONLY the facts and headlines you are given.

Rules you must follow:
- Use only the numbers in FACTS. Never invent prices, percentages, dates, events or quotes. If something is unknown, say so.
- Only cite reasons that appear in HEADLINES or FACTS. If no headline explains the move, say plainly that no clear single reason was found and that wider market moves or ordinary trading may be behind it.
- Describe the past and present only. Never predict prices, never give price targets, never say what will happen.
- Never tell the user to buy, sell, hold, enter, exit, or take any action with real money. No "you should", no "good time to". This is education, not financial advice.
- Explain any jargon you use in a few words (for example: "RSI, a 0-100 gauge of how one-sided recent buying or selling has been").
- Short sentences. No hype, no emojis. Reading level: a smart 16-year-old.
- If the user's question asks for advice or predictions, gently say you can't give that, then answer the closest educational version of it.

Reply with ONE JSON object and nothing else, with exactly these keys:
{
  "headline": "max 12 words, what is happening",
  "summary": "2-3 sentences, the big picture",
  "whatHappened": "2-3 sentences on the price moves, using FACTS",
  "why": "2-4 sentences on likely reasons, citing headlines by source name, or saying no clear reason was found",
  "watch": ["2-4 short things a learner could watch, descriptive only, no actions"],
  "answer": "if a QUESTION is given, a direct 2-4 sentence answer; otherwise an empty string"
}`;

const ADVICE = /\b(you should (buy|sell|hold|invest)|(buy|sell) (it|now|this)|good (time|moment) to (buy|sell|invest)|price target|will (rise|fall|go up|go down|reach|hit) to)\b/i;

export function buildUserMessage({ market, facts, mood, risk, news, question }) {
  const lines = [
    `MARKET: ${market.name} (${market.base}), ${market.kind === "stock" ? "US stock" : "cryptocurrency"}`,
    "FACTS:",
    ...Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`),
    `- mood (rule-based, describes recent behavior only): ${mood.label} (${mood.score} on a -100 to +100 scale), because ${mood.parts.join("; ") || "n/a"}`,
    `- swing risk: ${risk.level}${risk.typicalDailyMove ? ` (typical daily move about ±${risk.typicalDailyMove}%)` : ""}`,
    "HEADLINES (most recent first; may be empty):",
    ...(news.length ? news.map((n) => `- [${n.source}, ${n.publishedAt.slice(0, 10)}] ${n.title}`) : ["- none found"]),
    `QUESTION: ${question ? question : "(none)"}`,
  ];
  return lines.join("\n");
}

const str = (x, max) => (typeof x === "string" ? x.trim().slice(0, max) : "");

// Pulls the JSON object out of the model's reply and checks it. Returns null if unusable,
// including if it slipped into giving advice, so the caller falls back to the rule-based text.
export function parseAiReply(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const out = {
    headline: str(obj.headline, 120),
    summary: str(obj.summary, 700),
    whatHappened: str(obj.whatHappened, 700),
    why: str(obj.why, 900),
    watch: Array.isArray(obj.watch) ? obj.watch.map((w) => str(w, 200)).filter(Boolean).slice(0, 4) : [],
    answer: str(obj.answer, 800),
  };
  if (!out.headline || !out.summary) return null;
  const all = [out.headline, out.summary, out.whatHappened, out.why, out.answer, ...out.watch].join(" ");
  if (ADVICE.test(all)) return null;
  return out;
}

// Short, normalised question text for caching ("Why is it down?" and "why is it down" match).
export const normalizeQuestion = (q) =>
  String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
