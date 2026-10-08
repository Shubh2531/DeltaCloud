import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true, select: false },
    isVerified: { type: Boolean, default: false },

    // One-time code state. The code itself is only ever stored hashed.
    otpHash: { type: String, select: false },
    otpPurpose: { type: String, enum: ["login", "reset"] },
    otpExpires: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpSentAt: { type: Date },

    // SHA-256 hashes of currently valid refresh tokens (one per signed-in device).
    refreshHashes: { type: [String], select: false, default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
