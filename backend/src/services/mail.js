import nodemailer from "nodemailer";
import { config } from "../config.js";

const { smtp } = config;

const transporter =
  smtp.host && smtp.user && smtp.pass
    ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      })
    : null;

export async function verifyMail() {
  if (!transporter) {
    console.warn(
      config.isProd
        ? "❌ SMTP is not configured: sign-in codes cannot be delivered"
        : "📧 SMTP not configured: one-time codes will be printed to this console"
    );
    return false;
  }
  try {
    await transporter.verify();
    console.log("📧 SMTP verified");
    return true;
  } catch (err) {
    console.error("❌ SMTP verification failed:", err.message);
    return false;
  }
}

export async function sendOtpEmail({ to, otp, purpose }) {
  if (!transporter) {
    if (config.isProd) {
      throw Object.assign(new Error("Email delivery is not available right now."), { status: 503 });
    }
    console.log(`[dev] ${purpose} code for ${to}: ${otp}`);
    return;
  }

  const reset = purpose === "reset";
  const subject = reset ? "Reset your DeltaCloud password" : "Your DeltaCloud verification code";
  const lead = reset
    ? "Use this code to reset your DeltaCloud password."
    : "Use this code to finish signing in to DeltaCloud.";

  try {
    await transporter.sendMail({
      from: smtp.from,
      to,
      subject,
      text: `${lead}\n\n${otp}\n\nThe code expires in 5 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2 style="margin:0 0 8px">DeltaCloud</h2>
        <p>${lead}</p>
        <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${otp}</p>
        <p style="color:#555">The code expires in 5 minutes. If you didn't ask for it, you can ignore this email.</p>
      </div>`,
    });
  } catch (err) {
    console.error("Email send failed:", err.message);
    throw Object.assign(new Error("We couldn't send the email. Please try again shortly."), { status: 502 });
  }
}
