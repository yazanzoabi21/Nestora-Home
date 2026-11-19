import nodemailer from "nodemailer";
import { type Acceptance, BUSINESS_MAILBOX, type Message } from "./model.ts";
import { loadTemplates, renderMessage, siteOrigin } from "./render.ts";
import { handler, type Rpc } from "./worker.ts";
import { assertSandbox, deliverSandbox } from "./sandbox.ts";

const sandboxConfig = () => ({
  enabled: Deno.env.get("ORDER_EMAIL_ENABLED"),
  sendEnabled: Deno.env.get("ORDER_EMAIL_SEND_ENABLED"),
  mode: Deno.env.get("ORDER_EMAIL_MODE"),
  projectUrl: Deno.env.get("SUPABASE_URL"),
});

let templates: ReturnType<typeof loadTemplates> | undefined;
async function rpc(name: Rpc, args: Record<string, unknown>): Promise<unknown> {
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SERVER_CONFIGURATION");
  const result = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error("DATABASE_OPERATION_FAILED");
  return await result.json();
}
async function send(message: Message): Promise<Acceptance> {
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
    const info = await deliverSandbox(
      message,
      sandboxConfig,
      (safe) =>
        client.sendMail({
          from: { name: "Nestora Home", address: BUSINESS_MAILBOX },
          to: BUSINESS_MAILBOX,
          replyTo: BUSINESS_MAILBOX,
          subject: safe.subject,
          text: safe.text,
          html: safe.html,
          messageId: safe.messageId,
          envelope: { from: BUSINESS_MAILBOX, to: [BUSINESS_MAILBOX] },
        }),
    );
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
Deno.serve(handler({
  async ready() {
    assertSandbox(sandboxConfig());
    siteOrigin(Deno.env.get("ORDER_EMAIL_SITE_URL") ?? "");
    if (
      Deno.env.get("SMTP_USERNAME") !== BUSINESS_MAILBOX ||
      !Deno.env.get("SMTP_PASSWORD") ||
      !Deno.env.get("SUPABASE_URL") ||
      !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ) throw new Error("SERVER_CONFIGURATION");
    templates ??= loadTemplates();
    await templates;
  },
  enabled: () => Deno.env.get("ORDER_EMAIL_ENABLED") === "true",
  sendEnabled: () => Deno.env.get("ORDER_EMAIL_SEND_ENABLED") === "true",
  token: () => Deno.env.get("ORDER_EMAIL_WEBHOOK_TOKEN"),
  rpc,
  send,
  async render(job) {
    const origin = siteOrigin(Deno.env.get("ORDER_EMAIL_SITE_URL") ?? "");
    templates ??= loadTemplates();
    return renderMessage(job, origin, await templates);
  },
}));
