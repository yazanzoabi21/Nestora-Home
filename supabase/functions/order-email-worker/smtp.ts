import nodemailer from "nodemailer";
import { type Acceptance, BUSINESS_MAILBOX, type Message } from "./model.ts";
import { deliverSandbox, type SandboxConfig } from "./sandbox.ts";
import { assertProductionEnvelope } from "./production.ts";
export async function send(
  message: Message,
  sandboxConfig: () => SandboxConfig,
): Promise<Acceptance> {
  const username = Deno.env.get("SMTP_USERNAME"),
    password = Deno.env.get("SMTP_PASSWORD");
  if (username !== BUSINESS_MAILBOX || !password) {
    throw Object.assign(new Error("SMTP_CONFIGURATION"), { code: "EAUTH" });
  }
  const client = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    pool: false,
    auth: { user: username, pass: password },
    tls: {
      servername: "smtp.hostinger.com",
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const transport = (safe: Message) =>
      client.sendMail({
        from: { name: "Nestora Home", address: BUSINESS_MAILBOX },
        to: safe.to,
        replyTo: safe.replyTo,
        subject: safe.subject,
        text: safe.text,
        html: safe.html,
        messageId: safe.messageId,
        envelope: { from: BUSINESS_MAILBOX, to: [safe.to] },
        headers: {
          "Auto-Submitted": "auto-generated",
          "X-Auto-Response-Suppress": "All",
        },
      });
    const production = sandboxConfig().mode === "production";
    if (production) assertProductionEnvelope(message, sandboxConfig());
    const info = production
      ? await transport(message)
      : await deliverSandbox(message, sandboxConfig, transport);
    if (info.accepted.length !== 1 || info.rejected.length !== 0) {
      throw Object.assign(new Error("SMTP_REJECTED"), { code: "EENVELOPE" });
    }
    // Store only a queue identifier, never the raw SMTP response (which can include PII).
    const reference = typeof info.response === "string"
      ? /\b(?:id|queued as)\s+([A-Za-z0-9_-]{4,120})\b/i.exec(info.response)
        ?.[1] ?? null
      : null;
    return { messageId: message.messageId, reference };
  } finally {
    client.close();
  }
}
