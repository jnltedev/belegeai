/// Plain-text first, with a minimal HTML twin. Mail clients that block HTML
/// are common in exactly the setting this app is used in, and a password link
/// that only exists in an HTML part is a link some people cannot click.
export interface MailTemplate {
  subject: string;
  text: string;
  html: string;
}

function layout(title: string, body: string, link: string, action: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
<h2 style="margin:0 0 12px">${title}</h2>
${body}
<p style="margin:24px 0"><a href="${link}" style="background:#0b6b73;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${action}</a></p>
<p style="font-size:12px;color:#666">If the button does not work, copy this address into your browser:<br>${link}</p>
</body></html>`;
}

export function inviteMail(appName: string, name: string, link: string, expiresHours: number): MailTemplate {
  const subject = `You have been invited to ${appName}`;
  const text = `Hello ${name},

You have been invited to ${appName}, a private archive for official documents.

Choose a password to activate your account:
${link}

This link is valid for ${expiresHours} hours. If you were not expecting this invitation, you can ignore this message - the account cannot be used until a password is set.`;
  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>Hello ${name},</p><p>You have been invited to <strong>${appName}</strong>, a private archive for official documents. Choose a password to activate your account.</p><p style="font-size:13px;color:#666">This link is valid for ${expiresHours} hours.</p>`,
      link,
      "Choose a password",
    ),
  };
}

export function resetMail(appName: string, name: string, link: string, expiresHours: number): MailTemplate {
  const subject = `Reset your ${appName} password`;
  const text = `Hello ${name},

A password reset was requested for your ${appName} account.

Set a new password:
${link}

This link is valid for ${expiresHours} hours. If you did not expect this, you can ignore this message - your current password stays valid until a new one is set.`;
  return {
    subject,
    text,
    html: layout(
      subject,
      `<p>Hello ${name},</p><p>A password reset was requested for your <strong>${appName}</strong> account.</p><p style="font-size:13px;color:#666">This link is valid for ${expiresHours} hours. If you did not expect this, ignore this message - your current password stays valid.</p>`,
      link,
      "Set a new password",
    ),
  };
}
