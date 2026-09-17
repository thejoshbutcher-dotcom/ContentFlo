import "server-only";

import { escapeHtml } from "./mailer";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Matches docs/email-templates — same card, logo and amber button. */
export function inviteEmail(opts: {
  inviterEmail: string;
  profileName: string;
  role: "editor" | "viewer";
  licensed: boolean;
  origin: string;
}) {
  const inviter = escapeHtml(opts.inviterEmail);
  const profile = escapeHtml(opts.profileName);
  const can = opts.role === "editor" ? "view and edit" : "view";
  const url = opts.licensed ? `${opts.origin}/login` : `${opts.origin}/purchase`;
  const cta = opts.licensed ? "Open CreatorFlo" : "Get CreatorFlo";
  const next = opts.licensed
    ? "Sign in with this email address and the invite will be waiting for you."
    : "Shared workspaces are part of CreatorFlo, so you&rsquo;ll need your own copy first. Buy it with this email address, sign in, and the invite will be waiting for you.";

  const subject = `${opts.inviterEmail} invited you to "${opts.profileName}" on CreatorFlo`;

  const text = [
    `${opts.inviterEmail} invited you to ${can} "${opts.profileName}" on CreatorFlo.`,
    "",
    opts.licensed
      ? "Sign in with this email address and the invite will be waiting for you:"
      : "Shared workspaces are part of CreatorFlo, so you'll need your own copy first. Buy it with this email address, sign in, and the invite will be waiting:",
    url,
  ].join("\n");

  const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#14161b;margin:0;padding:32px 12px;font-family:${FONT};">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#22252c;border:1px solid #30343c;border-radius:20px;overflow:hidden;">
      <tr><td align="center" style="padding:34px 32px 8px;">
        <img src="https://creatorflo.io/brand/logo-white.png" width="150" alt="CreatorFlo" style="display:block;border:0;height:auto;width:150px;color:#ffffff;font-size:21px;font-weight:700;">
      </td></tr>
      <tr><td align="center" style="padding:16px 32px 0;">
        <h1 style="margin:0;color:#ffffff;font-size:23px;line-height:1.3;font-weight:700;">You&rsquo;ve been invited to ${profile}</h1>
        <p style="margin:12px 0 0;color:#b7bdc6;font-size:15px;line-height:1.6;">
          <strong style="color:#ffffff;">${inviter}</strong> wants you to ${can} their
          content workspace &mdash; boards, scripts, schedule and inspiration, all in one place.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:28px 32px 4px;">
        <a href="${url}" style="display:inline-block;background:#f7c948;color:#181a20;font-size:15px;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:14px;">${cta}</a>
      </td></tr>
      <tr><td style="padding:22px 32px 30px;">
        <div style="border-top:1px solid #30343c;padding-top:18px;">
          <p style="margin:0;color:#8a9099;font-size:12px;line-height:1.6;">${next}
          Not expecting this? You can safely ignore it &mdash; nothing is shared until you accept.</p>
        </div>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:11px;">
      CreatorFlo &mdash; the content OS for creators &middot;
      <a href="https://creatorflo.io" style="color:#8a9099;text-decoration:none;">creatorflo.io</a>
    </p>
  </td></tr>
</table>`;

  return { subject, html, text };
}
