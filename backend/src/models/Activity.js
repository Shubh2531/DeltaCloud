import mongoose from "mongoose";

// One row per user per day they used the app (Eastern calendar day, "2026-10-09").
// This is all weekly-active and retention numbers need, and nothing more.
const ActivitySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true },
  },
  { versionKey: false }
);

ActivitySchema.index({ user: 1, day: 1 }, { unique: true });
ActivitySchema.index({ day: 1 });

export default mongoose.model("Activity", ActivitySchema);
