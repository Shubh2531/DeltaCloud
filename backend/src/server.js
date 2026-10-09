import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { Server } from "socket.io";

import { config } from "./config.js";
import { verifyMail } from "./services/mail.js";
import { verifyAccess } from "./services/tokens.js";
import { feed } from "./services/feed.js";
import authRoutes from "./routes/auth.routes.js";
import marketRoutes from "./routes/market.routes.js";
import newsRoutes from "./routes/news.routes.js";
import { startNews, stopNews } from "./services/news.js";
import paperRoutes from "./routes/paper.routes.js";
import intelRoutes from "./routes/intel.routes.js";
import growthRoutes from "./routes/growth.routes.js";
import accountRoutes from "./routes/account.routes.js";
import { startStocks, stopStocks } from "./services/stocks.js";
import { liveSnapshot } from "./services/prices.js";
import { LIMITS, apiKey, authKey, ipOf, passkeyKey } from "./lib/limits.js";

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1); // correct client IPs behind a host's load balancer
app.use(helmet());

const originAllowed = (origin) =>
  !origin || config.clientOrigins.includes(origin) || config.clientOriginPatterns.some((re) => re.test(origin));
app.use(
  cors({
    origin(origin, callback) {
      if (originAllowed(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed"));
    },
  })
);
app.use(express.json({ limit: "20kb" }));

/* ---------------- Rate limits ---------------- */
// Counted per person, not per network, so a campus sharing one Wi-Fi address can sign up
// together. Per-IP ceilings stay on top to stop floods. See lib/limits.js.
const tooMany = { ok: false, message: "Too many requests. Please wait a bit and try again." };
const limiter = ({ windowMs, limit }, keyGenerator) =>
  rateLimit({ windowMs, limit, keyGenerator, standardHeaders: true, legacyHeaders: false, message: tooMany });
app.use("/api", limiter(LIMITS.apiPerIp, ipOf), limiter(LIMITS.apiPerClient, apiKey));
const authPerIp = limiter(LIMITS.authPerIp, ipOf);
const authPerPerson = limiter(LIMITS.authPerPerson, authKey);
for (const path of ["login", "register", "verify-otp", "resend-otp", "forgot-password", "reset-password"]) {
  app.use(`/api/auth/${path}`, authPerIp, authPerPerson);
}
// Account actions that check a password: same limits as sign-in, keyed by the signed-in session.
for (const path of ["password", "email/start", "email/verify", "delete"]) {
  app.use(`/api/account/${path}`, authPerIp, limiter(LIMITS.authPerPerson, apiKey));
}
// Passkey sign-in has no email, so it's limited per network (generous) and per passkey.
app.use("/api/auth/passkey/login", authPerIp, limiter(LIMITS.authPerPerson, passkeyKey));

/* ---------------- Routes ---------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "DeltaCloud API",
    db: mongoose.connection.readyState === 1 ? "connected" : "not connected",
    market: feed.mode,
    time: new Date().toISOString(),
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/paper", paperRoutes);
app.use("/api/intel", intelRoutes);
app.use("/api/growth", growthRoutes);
app.use("/api/account", accountRoutes);

app.use("/api", (req, res) => res.status(404).json({ ok: false, message: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (err.code === 11000) status = 409;
  if (err.message === "Origin not allowed") status = 403;
  if (status >= 500) console.error(err);
  const message =
    status >= 500
      ? "Something went wrong on our side. Please try again."
      : err.type === "entity.parse.failed"
      ? "That request couldn't be read."
      : err.message;
  res.status(status).json({ ok: false, message });
});

/* ---------------- Live prices over Socket.IO ---------------- */
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
});

io.use((socket, next) => {
  try {
    verifyAccess(String(socket.handshake.auth?.token || ""));
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.emit("priceUpdate", liveSnapshot());
});

// Featured coins, plus featured stocks from cache (no extra stock-data calls).
feed.on("tick", () => io.emit("priceUpdate", liveSnapshot()));

/* ---------------- Start ---------------- */
async function start() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log("✅ MongoDB connected");
    // Check email in the background so a slow mail host can never delay the server starting.
    verifyMail().catch(() => {});
    feed.start();
    startStocks();
    startNews();
    server.listen(config.port, () => {
      console.log(`🚀 DeltaCloud API on port ${config.port} (${config.isProd ? "production" : "development"})`);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }
}

function shutdown() {
  feed.stop();
  stopStocks();
  stopNews();
  io.close();
  server.close(() => mongoose.connection.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
