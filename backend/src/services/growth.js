import mongoose from "mongoose";
import User from "../models/User.js";
import Activity from "../models/Activity.js";
import DailyStat from "../models/DailyStat.js";
import TradeLog from "../models/TradeLog.js";
import {
  dayKey, addDays, makeRefCode, signupsByDay, weekOverWeek, week1Retention,
  retentionCohorts, sourceBreakdown, activeCounts, dailyActive,
} from "../lib/growth.js";

const db = () => mongoose.connection.readyState === 1;

/* ---------------- Activity: one row per user per day ---------------- */

let seenDay = "";
const seen = new Set(); // "userId" already recorded today, so most requests cost nothing

export function markActive(userId) {
  if (!userId || !db()) return;
  const day = dayKey();
  if (day !== seenDay) {
    seenDay = day;
    seen.clear();
  }
  const key = String(userId);
  if (seen.has(key)) return;
  seen.add(key);
  Activity.updateOne({ user: userId, day }, { $setOnInsert: { user: userId, day } }, { upsert: true }).catch((err) => {
    if (err?.code !== 11000) seen.delete(key); // try again on the next request
  });
}

export function countEvent(key, n = 1) {
  if (!db()) return;
  DailyStat.updateOne({ day: dayKey(), key }, { $inc: { n } }, { upsert: true }).catch(() => {});
}

/* ---------------- Invite codes ---------------- */

export async function ensureRefCode(user) {
  if (user.refCode) return user.refCode;
  for (let i = 0; i < 5; i++) {
    const code = makeRefCode();
    const res = await User.updateOne({ _id: user._id, refCode: { $exists: false } }, { $set: { refCode: code } }).catch((err) => {
      if (err?.code === 11000) return null; // code taken, try another
      throw err;
    });
    if (res?.modifiedCount) {
      user.refCode = code;
      return code;
    }
    if (res) {
      const fresh = await User.findById(user._id).select("refCode").lean();
      if (fresh?.refCode) return (user.refCode = fresh.refCode);
    }
  }
  throw new Error("Could not create an invite code");
}

export async function inviteInfo(userId) {
  const user = await User.findById(userId).select("refCode");
  if (!user) return null;
  const code = await ensureRefCode(user);
  const [invited, active] = await Promise.all([
    User.countDocuments({ referredBy: user._id, isVerified: true }),
    User.countDocuments({ referredBy: user._id, isVerified: true, verifiedAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
  ]);
  return { code, invited, joinedThisWeek: active };
}

/* ---------------- Public counter ---------------- */

let publicCache = { at: 0, value: null };
export async function publicStats() {
  if (publicCache.value && Date.now() - publicCache.at < 60_000) return publicCache.value;
  if (!db()) return { users: null };
  const users = await User.countDocuments({ isVerified: true });
  publicCache = { at: Date.now(), value: { users } };
  return publicCache.value;
}

/* ---------------- Founder metrics ---------------- */

let metricsCache = { at: 0, value: null };

export async function founderMetrics() {
  if (metricsCache.value && Date.now() - metricsCache.at < 60_000) return metricsCache.value;
  const today = dayKey();
  const since = addDays(today, -59);

  const [rawUsers, activityRows, intelRows, tradeRows, referrerRows] = await Promise.all([
    User.find({ isVerified: true }).select("name createdAt verifiedAt source referredBy").lean(),
    Activity.find({ day: { $gte: since } }).select("user day -_id").lean(),
    DailyStat.find({ key: "intel", day: { $gte: addDays(today, -29) } }).lean(),
    TradeLog.aggregate([
      { $match: { at: { $gte: new Date(Date.now() - 31 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "America/New_York" } }, n: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { isVerified: true, referredBy: { $exists: true } } },
      { $group: { _id: "$referredBy", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 10 },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
    ]),
  ]);

  const users = rawUsers.map((u) => ({
    id: String(u._id),
    name: u.name,
    at: u.verifiedAt || u.createdAt,
    day: dayKey(u.verifiedAt || u.createdAt),
    source: u.source || null,
    referred: Boolean(u.referredBy),
  }));
  const activity = new Map();
  for (const row of activityRows) {
    const id = String(row.user);
    if (!activity.has(id)) activity.set(id, new Set());
    activity.get(id).add(row.day);
  }

  const intelByDay = new Map(intelRows.map((r) => [r.day, r.n]));
  const tradesByDay = new Map(tradeRows.map((r) => [r._id, r.n]));
  const actives = activeCounts(activity, today);
  const totalUsers = users.length;

  const value = {
    asOf: new Date().toISOString(),
    today,
    totals: {
      users: totalUsers,
      ...actives,
      wauPct: totalUsers ? (actives.wau / totalUsers) * 100 : null,
      referred: users.filter((u) => u.referred).length,
    },
    growth: weekOverWeek(users, today),
    retention: week1Retention(users, activity, today),
    cohorts: retentionCohorts(users, activity, today, 6),
    signups: signupsByDay(users, today, 30),
    active: dailyActive(activity, today, 30),
    usage: Array.from({ length: 30 }, (_, i) => {
      const day = addDays(today, -(29 - i));
      return { day, intel: intelByDay.get(day) || 0, trades: tradesByDay.get(day) || 0 };
    }),
    sources: sourceBreakdown(users),
    topReferrers: referrerRows.map((r) => ({ name: r.u?.[0]?.name || "Someone", invited: r.n })),
    recent: [...users]
      .sort((a, b) => b.at - a.at)
      .slice(0, 15)
      .map((u) => ({ name: u.name, at: u.at, source: u.referred ? "friend-invite" : u.source || "direct" })),
  };
  metricsCache = { at: Date.now(), value };
  return value;
}
