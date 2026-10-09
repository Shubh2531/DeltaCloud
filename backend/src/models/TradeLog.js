import mongoose from "mongoose";
import { JOURNAL_KINDS } from "../lib/journal.js";

// Permanent, append-only record of every action on a practice account.
// Never trimmed, never edited. See lib/journal.js.
const TradeLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Unique per event, so writing the same event twice (a retry) is harmless.
    eventId: { type: String, required: true, unique: true },
    kind: { type: String, enum: JOURNAL_KINDS, required: true },
    market: { type: String, enum: ["spot", "leverage", "account"], required: true },
    symbol: String,
    side: String,
    qty: Number,
    price: Number,
    entryPrice: Number,
    total: Number,
    leverage: Number,
    margin: Number,
    liqPrice: Number,
    pnl: Number,
    cashAfter: Number,
    positionId: String,
    openedAt: Date,
    mode: String, // "live" or "simulated" price feed at the time
    at: { type: Date, required: true },
  },
  { timestamps: { createdAt: "recordedAt", updatedAt: false }, versionKey: false }
);

TradeLogSchema.index({ user: 1, at: -1, _id: -1 });
TradeLogSchema.index({ user: 1, market: 1, at: -1 });

export default mongoose.model("TradeLog", TradeLogSchema);
