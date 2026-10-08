import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

function required(name, devDefault) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`Missing required environment variable ${name}`);
  console.warn(`⚠️  ${name} is not set; using a development default`);
  return devDefault;
}

function secret(name, devDefault) {
  const value = required(name, devDefault);
  if (isProd && value.length < 32) {
    throw new Error(`${name} must be at least 32 characters in production`);
  }
  return value;
}

const jwtSecret = secret("JWT_SECRET", "dev-only-access-secret-change-me");
const refreshSecret = secret("REFRESH_SECRET", "dev-only-refresh-secret-change-me");
if (isProd && jwtSecret === refreshSecret) {
  throw new Error("JWT_SECRET and REFRESH_SECRET must be different");
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 8080,
  mongoUri: required("MONGO_URI", "mongodb://127.0.0.1:27017/deltacloud"),
  jwtSecret,
  refreshSecret,
  accessTtl: "15m",
  refreshTtl: "7d",
  clientOrigins: (
    process.env.CLIENT_ORIGINS ||
    "http://localhost:3000,http://localhost:3001,capacitor://localhost,http://localhost,https://localhost"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 2525,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "DeltaCloud <no-reply@localhost>",
  },
  marketSource: process.env.MARKET_SOURCE || "auto", // auto | binance | sim
  binanceBase: (process.env.BINANCE_API_BASE || "https://api.binance.us").replace(/\/+$/, ""),
  devReturnOtp: !isProd && process.env.DEV_RETURN_OTP === "true",
};
