import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true, default: "" },
    // Stored to tell apart two people who happen to share a name, and to stop one
    // person opening a second account under a different email. Not shown to other users.
    // Not required at the schema level: accounts created before this field existed must
    // keep signing in and saving normally. New registrations always collect it (enforced
    // in the register route, not here).
    dob: { type: Date },
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

// Fast lookup for the same-person check at registration (name is matched case-insensitively).
UserSchema.index({ name: 1, dob: 1 });

export default mongoose.model("User", UserSchema);
