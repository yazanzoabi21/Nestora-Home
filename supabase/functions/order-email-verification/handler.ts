import {
  BUSINESS_MAILBOX,
  mailbox,
  type Message,
  UUID,
} from "../order-email-worker/model.ts";

export interface VerificationDependencies {
  enabled(): boolean;
  ipHash(request: Request): Promise<string>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  send(message: Message): Promise<unknown>;
}
export async function hash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function verificationHandler(
  deps: VerificationDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = request.headers.get("origin");
    const headers = {
      "Access-Control-Allow-Origin": "https://nestorahomelb.com",
      "Vary": "Origin",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Headers":
        "content-type,apikey,authorization,x-client-info",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    const reply = (status: number, value: Record<string, unknown>) =>
      Response.json(value, { status, headers });
    if (origin && origin !== "https://nestorahomelb.com") {
      return reply(403, { error: "FORBIDDEN" });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return reply(405, { error: "POST_REQUIRED" });
    }
    if (!deps.enabled()) {
      return reply(503, { error: "VERIFICATION_UNAVAILABLE" });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return reply(400, { error: "INVALID_REQUEST" });
    }
    try {
      // Bound streamed input even when Content-Length is absent or dishonest.
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: "INVALID_REQUEST" });
      const chunks: Uint8Array[] = [];
      let length = 0;
      const timer = setTimeout(() => {
        void reader.cancel().catch(() => {});
      }, 5000);
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > 1024) {
            await reader.cancel();
            return reply(413, { error: "INVALID_REQUEST" });
          }
          chunks.push(part.value);
        }
      } finally {
        clearTimeout(timer);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return reply(400, { error: "INVALID_REQUEST" });
      }
      const body = raw as Record<string, unknown>;
      if (
        typeof body["orderId"] !== "string" || !UUID.test(body["orderId"]) ||
        typeof body["checkoutToken"] !== "string" ||
        !UUID.test(body["checkoutToken"]) ||
        !["request", "confirm"].includes(String(body["action"])) ||
        Object.keys(body).some((key) =>
          !["orderId", "checkoutToken", "action", "code"].includes(key)
        )
      ) return reply(400, { error: "INVALID_REQUEST" });
      const ip = await deps.ipHash(request);
      if (
        await deps.rpc("order_email_verification_guard", { p_ip_hash: ip }) !==
          true
      ) return reply(429, { error: "TRY_LATER" });
      const args = {
        p_order_id: body["orderId"],
        p_checkout_token: body["checkoutToken"],
      };
      if (body["action"] === "confirm") {
        if (typeof body["code"] !== "string" || !/^\d{8}$/.test(body["code"])) {
          return reply(400, { error: "INVALID_CODE" });
        }
        const verified = await deps.rpc("order_email_verification_confirm", {
          ...args,
          p_code_hash: await hash(`${body["orderId"]}:${body["code"]}`),
        });
        return verified === true
          ? reply(200, { verified: true })
          : reply(400, { error: "INVALID_OR_EXPIRED_CODE" });
      }
      // Rejection sampling avoids modulo bias for eight decimal digits.
      let value: number;
      do {
        value = crypto.getRandomValues(new Uint32Array(1))[0];
      } while (value >= 4200000000);
      const code = String(value % 100000000).padStart(8, "0");
      const result = await deps.rpc("order_email_verification_request", {
        ...args,
        p_code_hash: await hash(`${body["orderId"]}:${code}`),
        p_ip_hash: ip,
      });
      if (result && typeof result === "object") {
        const permit = result as Record<string, unknown>;
        if (permit["verified"] === true) return reply(200, { verified: true });
        if (
          typeof permit["recipient"] === "string" &&
          mailbox(permit["recipient"])
        ) {
          await deps.send({
            to: permit["recipient"],
            replyTo: BUSINESS_MAILBOX,
            subject: "Verify your Nestora Home order email",
            text:
              `Your verification code is ${code}. It expires in 10 minutes. Enter it on your order confirmation page or at https://nestorahomelb.com/shop/verify-order-email in the same browser tab you used to check out. This verifies only this order's email address. If you did not place an order, ignore this email.\nNestora Home\n${BUSINESS_MAILBOX}`,
            html: "",
            messageId:
              `<nestora-order-${crypto.randomUUID()}@nestorahomelb.com>`,
          });
        }
      }
      // No order existence/recipient details are returned for denied requests.
      return reply(200, { requested: true });
    } catch {
      return reply(503, { error: "VERIFICATION_UNAVAILABLE" });
    }
  };
}
