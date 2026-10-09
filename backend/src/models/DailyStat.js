import mongoose from "mongoose";

// Simple daily counters, e.g. { day: "2026-10-09", key: "intel", n: 412 }.
const DailyStatSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    key: { type: String, required: true },
    n: { type: Number, default: 0 },
  },
  { versionKey: false }
);

DailyStatSchema.index({ day: 1, key: 1 }, { unique: true });

export default mongoose.model("DailyStat", DailyStatSchema);
