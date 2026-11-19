import { send } from "./smtp.ts";
import { BUSINESS_MAILBOX } from "./model.ts";
import { loadTemplates, renderMessage, siteOrigin } from "./render.ts";
import { handler, type Rpc } from "./worker.ts";
import { assertSandbox } from "./sandbox.ts";
import { assertProduction } from "./production.ts";

const sandboxConfig = () => ({
  enabled: Deno.env.get("ORDER_EMAIL_ENABLED"),
  sendEnabled: Deno.env.get("ORDER_EMAIL_SEND_ENABLED"),
  mode: Deno.env.get("ORDER_EMAIL_MODE"),
  projectUrl: Deno.env.get("SUPABASE_URL"),
  testRecipient: Deno.env.get("ORDER_EMAIL_TEST_RECIPIENT"),
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
Deno.serve(handler({
  async ready() {
    if (sandboxConfig().mode === "production") {
      assertProduction(sandboxConfig());
    } else assertSandbox(sandboxConfig());
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
  send: (message) => send(message, sandboxConfig),
  async render(job) {
    const origin = siteOrigin(Deno.env.get("ORDER_EMAIL_SITE_URL") ?? "");
    templates ??= loadTemplates();
    return renderMessage(job, origin, await templates);
  },
}));
