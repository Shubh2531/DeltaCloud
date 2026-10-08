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

// Practice leverage: isolated margin, long or short, can never lose more than its own
// margin. See lib/leverageMath.js for the math.
const LeveragePositionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: ["LONG", "SHORT"], required: true },
    qty: { type: Number, required: true },
    entryPrice: { type: Number, required: true },
    leverage: { type: Number, required: true },
    margin: { type: Number, required: true },
    liqPrice: { type: Number, required: true },
    openedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LeverageHistorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: ["LONG", "SHORT"], required: true },
    qty: { type: Number, required: true },
    entryPrice: { type: Number, required: true },
    leverage: { type: Number, required: true },
    margin: { type: Number, required: true },
    closePrice: { type: Number, required: true },
    pnl: { type: Number, required: true },
    reason: { type: String, enum: ["closed", "liquidated"], required: true },
    openedAt: { type: Date },
    closedAt: { type: Date, default: Date.now },
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
    leveragePositions: { type: [LeveragePositionSchema], default: [] },
    leverageHistory: { type: [LeverageHistorySchema], default: [] },
    // Monotonically increasing, used to give each leveraged position a stable id.
    leverageSeq: { type: Number, default: 0 },
  },
  // Rejects a save if the document changed since it was read, so two orders
  // sent at the same moment cannot both spend the same cash.
  { timestamps: true, optimisticConcurrency: true }
);

export default mongoose.model("PaperAccount", PaperAccountSchema);
