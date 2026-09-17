import "server-only";

import nodemailer from "nodemailer";

/**
 * Outbound mail for app-level messages (team invites). Sign-in emails are sent
 * by Supabase Auth and don't come through here.
 *
 * Inert until SMTP_HOST / SMTP_USER / SMTP_PASS are set on the server: an
 * invite still works without it — it's waiting in the app the next time the
 * invitee signs in — it just isn't announced by email.
 */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

export async function sendMail(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? `CreatorFlo <${process.env.SMTP_USER}>`,
      ...msg,
    });
    return true;
  } catch (err) {
    console.error("[mailer] send failed", err);
    return false;
  }
}

/** Anything user-supplied that lands in email HTML goes through this. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
