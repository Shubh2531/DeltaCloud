import mongoose from "mongoose";

export const STARTING_CASH = 10000;

const HoldingSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true },
    qty: { type: Number, required: true },
    avgCost: { type: Number, required: true },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  side: { type: String, enum: ["BUY", "SELL"], required: true },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
  realizedPnl: { type: Number, default: 0 },
  at: { type: Date, default: Date.now },
});

const PaperAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    startingCash: { type: Number, default: STARTING_CASH },
    cash: { type: Number, default: STARTING_CASH },
    holdings: { type: [HoldingSchema], default: [] },
    orders: { type: [OrderSchema], default: [] },
  },
  // Rejects a save if the document changed since it was read, so two orders
  // sent at the same moment cannot both spend the same cash.
  { timestamps: true, optimisticConcurrency: true }
);

export default mongoose.model("PaperAccount", PaperAccountSchema);
