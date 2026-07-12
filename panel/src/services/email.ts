import nodemailer from "nodemailer";
import { Queue } from "bullmq";
import { config } from "../config/env.js";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "Troxe Host <noreply@troxe.dev>";
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
export const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED === "true";

const connection = {
  host: config.REDIS_URL.includes("://")
    ? new URL(config.REDIS_URL).hostname
    : "localhost",
  port: config.REDIS_URL.includes("://")
    ? parseInt(new URL(config.REDIS_URL).port || "6379")
    : 6379,
  password: config.REDIS_PASSWORD || undefined,
};

export const notificationsQueue = new Queue("notifications", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS,
          }
        : undefined,
    });
  }
  return transporter;
}

function emailTemplate(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;background:linear-gradient(135deg,#1a1a1a 0%,#252525 100%);border-bottom:1px solid #2a2a2a;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                <span style="color:#818cf8;">Troxe</span> Host
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#ffffff;">${title}</h2>
              <div style="font-size:15px;line-height:1.7;color:#a1a1aa;">
                ${body}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#151515;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#52525b;text-align:center;">
                Troxe Host Panel &middot; This is an automated notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!NOTIFICATIONS_ENABLED) {
    console.log(`[Email] Notifications disabled, skipping email to ${to}: ${subject}`);
    return;
  }

  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}: ${subject}`, err);
  }
}

export async function sendServerInstalled(
  user: { email: string; username: string },
  serverName: string
): Promise<void> {
  const html = emailTemplate(
    "Server Installed",
    `<p>Hey <strong>${user.username}</strong>,</p>
     <p>Your server <strong>${serverName}</strong> has been successfully installed and is now running.</p>
     <p>You can manage it from your Troxe Host dashboard.</p>`
  );
  await sendEmail(user.email, `[Troxe] Server "${serverName}" installed`, html);
}

export async function sendServerCrashed(
  user: { email: string; username: string },
  serverName: string
): Promise<void> {
  const html = emailTemplate(
    "Server Crashed",
    `<p>Hey <strong>${user.username}</strong>,</p>
     <p>Your server <strong>${serverName}</strong> has crashed and is no longer running.</p>
     <p>Please check the server console for more details, or try restarting it from the dashboard.</p>`
  );
  await sendEmail(user.email, `[Troxe] Server "${serverName}" crashed`, html);
}

export async function sendServerRemoved(
  user: { email: string; username: string },
  serverName: string
): Promise<void> {
  const html = emailTemplate(
    "Server Removed",
    `<p>Hey <strong>${user.username}</strong>,</p>
     <p>Your server <strong>${serverName}</strong> has been deleted.</p>
     <p>All associated data has been permanently removed.</p>`
  );
  await sendEmail(user.email, `[Troxe] Server "${serverName}" removed`, html);
}

export async function sendApiKeyCreated(
  user: { email: string; username: string },
  keyName: string
): Promise<void> {
  const html = emailTemplate(
    "API Key Created",
    `<p>Hey <strong>${user.username}</strong>,</p>
     <p>A new API key named <strong>${keyName}</strong> has been created on your account.</p>
     <p>If you did not create this key, please revoke it immediately from your settings.</p>`
  );
  await sendEmail(user.email, `[Troxe] API key "${keyName}" created`, html);
}
