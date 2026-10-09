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
    otpPurpose: { type: String, enum: ["login", "reset", "email"] },
    // A new address waiting for its confirmation code (change email in Settings).
    pendingEmail: { type: String, lowercase: true, trim: true },
    otpExpires: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpSentAt: { type: Date },

    // SHA-256 hashes of currently valid refresh tokens (one per signed-in device).
    refreshHashes: { type: [String], select: false, default: [] },

    // Growth: when the account was confirmed, this user's own invite code, how they found us
    // (a tag like "finance-club" from a link), and who invited them.
    verifiedAt: { type: Date },
    refCode: { type: String },
    source: { type: String },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Passkeys (Face ID, Touch ID, fingerprint, Windows Hello). Only the public key is stored;
    // the private key never leaves the person's device.
    passkeys: {
      type: [
        {
          credId: { type: String, required: true },
          publicKey: { type: Buffer, required: true },
          counter: { type: Number, default: 0 },
          transports: { type: [String], default: [] },
          name: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date },
        },
      ],
      default: [],
      select: false,
    },

    // How the user wants DeltaCloud presented to them. All settings are optional and the
    // app falls back to sensible defaults, so a user from before this field existed is fine.
    preferences: {
      type: {
        language: { type: String, default: "en" }, // dc intelligence language
        currency: { type: String, default: "USD" }, // display currency on prices and portfolio
        theme: { type: String, default: "observatory" }, // observatory | aurora | midnight
        reducedMotion: { type: Boolean, default: false },
        marketingEmails: { type: Boolean, default: true },
        productEmails: { type: Boolean, default: true },
        tradeNotifications: { type: Boolean, default: true },
        priceAlerts: { type: Boolean, default: true },
        weeklyDigest: { type: Boolean, default: true },
        shareInLeaderboard: { type: Boolean, default: false },
        // What to show by default on the dashboard: everything, just crypto, just stocks.
        defaultView: { type: String, default: "all" },
        // Which quick symbol opens on the dashboard chart.
        defaultSymbol: { type: String, default: "BTCUSDT" },
      },
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// Fast lookup for the same-person check at registration (name is matched case-insensitively).
UserSchema.index({ name: 1, dob: 1 });
UserSchema.index({ refCode: 1 }, { unique: true, partialFilterExpression: { refCode: { $type: "string" } } });
UserSchema.index({ referredBy: 1 });
UserSchema.index({ "passkeys.credId": 1 }, { unique: true, partialFilterExpression: { "passkeys.credId": { $type: "string" } } });

export default mongoose.model("User", UserSchema);
