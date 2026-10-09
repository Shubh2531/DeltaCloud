import test from "node:test";
import assert from "node:assert/strict";
import {
  dayKey, addDays, daysBetween, makeRefCode, isRefCode, cleanSource, signupsByDay, weekOverWeek,
  week1Retention, retentionCohorts, sourceBreakdown, activeCounts, dailyActive,
} from "../src/lib/growth.js";

test("days are Eastern calendar days", () => {
  // 02:00 UTC on Oct 10 is still Oct 9 in New York.
  assert.equal(dayKey("2026-10-10T02:00:00Z"), "2026-10-09");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-01", "2026-10-09"), 8);
});

test("invite codes are 7 easy-to-read characters", () => {
  const codes = new Set(Array.from({ length: 500 }, makeRefCode));
  assert.ok(codes.size > 490);
  for (const c of codes) assert.ok(isRefCode(c), c);
  assert.ok(!isRefCode("ABC0OIL"));
  assert.ok(!isRefCode("abc"));
});

test("source tags are cleaned", () => {
  assert.equal(cleanSource("Finance Club!!"), "finance-club");
  assert.equal(cleanSource("  "), null);
  assert.equal(cleanSource("x".repeat(80)).length, 40);
});

const today = "2026-10-20";
const users = [
  { id: "a", day: "2026-10-01" },
  { id: "b", day: "2026-10-08" },
  { id: "c", day: "2026-10-09" },
  { id: "d", day: "2026-10-10", referred: true },
  { id: "e", day: "2026-10-15", source: "finance-club" },
  { id: "f", day: "2026-10-19", source: "finance-club" },
  { id: "g", day: "2026-10-20" },
];

test("sign-ups per day carry a running total", () => {
  const rows = signupsByDay(users, today, 7);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].day, "2026-10-14");
  assert.equal(rows.at(-1).total, 7);
  assert.equal(rows.find((r) => r.day === "2026-10-15").signups, 1);
  assert.equal(rows[0].total, 4); // a, b, c, d signed up before the window
});

test("week over week growth", () => {
  const w = weekOverWeek(users, today);
  assert.equal(w.thisWeek, 3); // e, f, g (Oct 14-20)
  assert.equal(w.lastWeek, 3); // b, c, d (Oct 7-13)
  assert.equal(w.growthPct, 0);
});

test("week-1 retention only counts people whose first week is over", () => {
  const activity = new Map([
    ["b", new Set(["2026-10-08", "2026-10-10"])], // came back within a week
    ["c", new Set(["2026-10-09"])], // never came back
    ["d", new Set(["2026-10-10", "2026-10-17"])], // came back on day 7
    ["e", new Set(["2026-10-16"])], // too new to count
  ]);
  const r = week1Retention(users, activity, today);
  assert.equal(r.cohort, 3); // b (12 days), c (11), d (10)
  assert.equal(r.retained, 2);
  assert.equal(Math.round(r.pct), 67);
});

test("cohorts leave unfinished weeks empty instead of showing 0%", () => {
  const activity = new Map([["b", new Set(["2026-10-12"])]]);
  const rows = retentionCohorts(users, activity, today, 3);
  assert.equal(rows.length, 3);
  const thisWeek = rows.at(-1);
  assert.deepEqual(thisWeek.weeks, [null, null, null, null]);
  const twoWeeksAgo = rows[0]; // week of Oct 5
  assert.equal(twoWeeksAgo.size, 3); // b, c, d
  assert.equal(Math.round(twoWeeksAgo.weeks[0]), 33);
  assert.equal(twoWeeksAgo.weeks[1], null);
});

test("sources: friend invites, tagged links and direct", () => {
  const s = sourceBreakdown(users);
  assert.deepEqual(s[0], { source: "direct", n: 4 });
  assert.ok(s.some((x) => x.source === "finance-club" && x.n === 2));
  assert.ok(s.some((x) => x.source === "friend-invite" && x.n === 1));
});

test("daily, weekly and monthly actives", () => {
  const activity = new Map([
    ["a", new Set(["2026-10-20"])],
    ["b", new Set(["2026-10-15"])],
    ["c", new Set(["2026-09-25"])],
    ["d", new Set(["2026-08-01"])],
  ]);
  assert.deepEqual(activeCounts(activity, today), { dau: 1, wau: 2, mau: 3 });
  const daily = dailyActive(activity, today, 7);
  assert.equal(daily.at(-1).active, 1);
  assert.equal(daily.find((d) => d.day === "2026-10-15").active, 1);
});
