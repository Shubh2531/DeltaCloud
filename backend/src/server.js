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
import paperRoutes from "./routes/paper.routes.js";

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1); // correct client IPs behind a host's load balancer
app.use(helmet());

const originAllowed = (origin) => !origin || config.clientOrigins.includes(origin);
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
const tooMany = { ok: false, message: "Too many requests. Please wait a bit and try again." };
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: tooMany });
const codeLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: tooMany });
app.use("/api", apiLimiter);
for (const path of ["login", "register", "verify-otp", "resend-otp", "forgot-password", "reset-password"]) {
  app.use(`/api/auth/${path}`, codeLimiter);
}

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
app.use("/api/paper", paperRoutes);

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
  socket.emit("priceUpdate", feed.snapshot());
});

feed.on("tick", (snapshot) => io.emit("priceUpdate", snapshot));

/* ---------------- Start ---------------- */
async function start() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log("✅ MongoDB connected");
    await verifyMail();
    feed.start();
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
  io.close();
  server.close(() => mongoose.connection.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
