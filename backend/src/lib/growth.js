import crypto from "node:crypto";

// Growth math for the founder dashboard. Pure functions, so they can be tested.
// Days are calendar days in US Eastern time, matching how the founder and campus users live.

const TZ = "America/New_York";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const dayKey = (date = new Date()) => fmt.format(new Date(date)); // "2026-10-09"

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// Invite codes: 7 characters, no look-alikes (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function makeRefCode() {
  const bytes = crypto.randomBytes(7);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}
export const isRefCode = (s) => typeof s === "string" && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/.test(s);

// Where someone came from, from a link like ?src=finance-club. Short, lowercase, safe.
export function cleanSource(s) {
  const v = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return v || null;
}

// users: [{ id, day }] where day is the sign-up day. Returns one row per day, oldest first.
export function signupsByDay(users, today, days = 30) {
  const counts = new Map();
  for (const u of users) counts.set(u.day, (counts.get(u.day) || 0) + 1);
  const out = [];
  let total = users.filter((u) => u.day < addDays(today, -(days - 1))).length;
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const n = counts.get(day) || 0;
    total += n;
    out.push({ day, signups: n, total });
  }
  return out;
}

const pctChange = (now, before) => (before > 0 ? ((now - before) / before) * 100 : now > 0 ? null : 0);

// This week's sign-ups vs last week's (last 7 days vs the 7 before).
export function weekOverWeek(users, today) {
  const start = addDays(today, -6);
  const prevStart = addDays(today, -13);
  const thisWeek = users.filter((u) => u.day >= start && u.day <= today).length;
  const lastWeek = users.filter((u) => u.day >= prevStart && u.day < start).length;
  return { thisWeek, lastWeek, growthPct: pctChange(thisWeek, lastWeek) };
}

// activity: Map(userId -> Set of active days).
// Week-N retention for a user = active on any day in [signup + 7(N-1) + 1, signup + 7N].
const activeIn = (days, from, to) => {
  if (!days) return false;
  for (const d of days) if (d >= from && d <= to) return true;
  return false;
};

// Week-1 retention across everyone who signed up 8 to 14 days ago (so their first week is complete).
export function week1Retention(users, activity, today) {
  const cohort = users.filter((u) => {
    const age = daysBetween(u.day, today);
    return age >= 8 && age <= 14;
  });
  if (!cohort.length) return { cohort: 0, retained: 0, pct: null };
  const retained = cohort.filter((u) => activeIn(activity.get(u.id), addDays(u.day, 1), addDays(u.day, 7))).length;
  return { cohort: cohort.length, retained, pct: (retained / cohort.length) * 100 };
}

// Weekly cohorts (by sign-up week, Monday-based) with the share active in each later week.
// A week that hasn't finished yet for a cohort is null rather than a misleading low number.
export function retentionCohorts(users, activity, today, weeks = 6) {
  const monday = (day) => {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    return addDays(day, -((dow + 6) % 7));
  };
  const thisMonday = monday(today);
  const rows = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(thisMonday, -7 * w);
    const end = addDays(start, 6);
    const members = users.filter((u) => u.day >= start && u.day <= end);
    const row = { week: start, size: members.length, weeks: [] };
    for (let n = 1; n <= 4; n++) {
      // Complete only once the youngest member has had n full weeks.
      if (daysBetween(end, today) < 7 * n) {
        row.weeks.push(null);
        continue;
      }
      if (!members.length) {
        row.weeks.push(null);
        continue;
      }
      const kept = members.filter((u) =>
        activeIn(activity.get(u.id), addDays(u.day, 7 * (n - 1) + 1), addDays(u.day, 7 * n))
      ).length;
      row.weeks.push((kept / members.length) * 100);
    }
    rows.push(row);
  }
  return rows;
}

// How people found DeltaCloud: invited by a friend, a tagged link (club, class, flyer), or direct.
export function sourceBreakdown(users) {
  const counts = new Map();
  for (const u of users) {
    const key = u.referred ? "friend-invite" : u.source || "direct";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n);
}

// Active users on a day, over the last 7 days, and over the last 30 days.
export function activeCounts(activity, today) {
  const d7 = addDays(today, -6);
  const d30 = addDays(today, -29);
  let dau = 0;
  let wau = 0;
  let mau = 0;
  for (const days of activity.values()) {
    if (days.has(today)) dau++;
    if (activeIn(days, d7, today)) wau++;
    if (activeIn(days, d30, today)) mau++;
  }
  return { dau, wau, mau };
}

// Daily active users for the last `days` days, oldest first.
export function dailyActive(activity, today, days = 30) {
  const counts = new Map();
  for (const set of activity.values()) for (const d of set) counts.set(d, (counts.get(d) || 0) + 1);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, active: counts.get(day) || 0 });
  }
  return out;
}
