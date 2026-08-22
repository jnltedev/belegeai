import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string;
  fromName: string | null;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/// Built per send rather than kept open. Sends are rare - an invite, a reset,
/// the odd import alert - and a pooled connection to someone else's mail
/// server would sit idle for hours and be dropped anyway.
export async function sendMail(config: SmtpConfig, mail: Mail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password ?? "" } : undefined,
  });

  try {
    await transport.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } finally {
    transport.close();
  }
}

/// Telegram's sendMessage. The chat id may be a user, a group (negative id)
/// or a channel (@name) - all three are passed through unchanged.
export async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Telegram answers 200 with ok:false for most real problems, so the body
    // is worth surfacing - "chat not found" is far more useful than "400".
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram rejected the message (${response.status}): ${body.slice(0, 200)}`);
  }
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (payload && payload.ok === false) {
    throw new Error(`Telegram rejected the message: ${payload.description ?? "unknown reason"}`);
  }
}

/// Discord incoming webhook. The URL is the whole credential.
export async function sendDiscord(webhookUrl: string, content: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(10_000),
  });

  // A webhook post answers 204 with no body on success.
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord rejected the message (${response.status}): ${body.slice(0, 200)}`);
  }
}
