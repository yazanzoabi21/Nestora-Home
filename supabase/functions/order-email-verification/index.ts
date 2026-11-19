import { verificationHandler } from "./handler.ts";
import { send } from "../order-email-worker/smtp.ts";
const config = () => ({
  enabled: Deno.env.get("ORDER_EMAIL_ENABLED"),
  sendEnabled: Deno.env.get("ORDER_EMAIL_SEND_ENABLED"),
  mode: Deno.env.get("ORDER_EMAIL_MODE"),
  projectUrl: Deno.env.get("SUPABASE_URL"),
  testRecipient: Deno.env.get("ORDER_EMAIL_TEST_RECIPIENT"),
});
Deno.serve(verificationHandler({
  enabled: () =>
    config().enabled === "true" && config().sendEnabled === "true" &&
    config().mode === "production",
  async ipHash(request) {
    // IP is an additional throttle. Order/email limits remain authoritative even if proxy headers change.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const secret = Deno.env.get("ORDER_EMAIL_WEBHOOK_TOKEN");
    if (!secret) throw new Error("CONFIGURATION");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(ip),
    );
    return Array.from(
      new Uint8Array(signed),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  },
  async rpc(name, args) {
    const url = Deno.env.get("SUPABASE_URL"),
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("CONFIGURATION");
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
  },
  send: (message) => send(message, config),
}));
