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

    // Settings the person chose.
    prefs: {
      lang: { type: String, default: "en" }, // DC Intelligence language
      alertEmails: { type: Boolean, default: true }, // email me when a price alert fires
      productEmails: { type: Boolean, default: true }, // occasional DeltaCloud news
    },

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
  },
  { timestamps: true }
);

// Fast lookup for the same-person check at registration (name is matched case-insensitively).
UserSchema.index({ name: 1, dob: 1 });
UserSchema.index({ refCode: 1 }, { unique: true, partialFilterExpression: { refCode: { $type: "string" } } });
UserSchema.index({ referredBy: 1 });
UserSchema.index({ "passkeys.credId": 1 }, { unique: true, partialFilterExpression: { "passkeys.credId": { $type: "string" } } });

export default mongoose.model("User", UserSchema);
