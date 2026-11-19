import {
  type Acceptance,
  type Job,
  type Message,
  type Outcome,
  parseJob,
  UUID,
} from "./model.ts";
import { sandboxMessage } from "./sandbox.ts";
import { authenticateSignal } from "./auth.ts";

export type Rpc =
  | "order_email_consume_wake"
  | "order_email_prepare"
  | "order_email_claim"
  | "order_email_start"
  | "order_email_finish";
export interface Dependencies {
  ready(): Promise<void>;
  enabled(): boolean;
  sendEnabled(): boolean;
  token(): string | undefined;
  rpc(name: Rpc, args: Record<string, unknown>): Promise<unknown>;
  render(job: Job): Promise<Message>;
  send(message: Message): Promise<Acceptance>;
}
async function signal(
  request: Request,
): Promise<{ orderId: string | null; body: string } | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      const body = new TextDecoder().decode(bytes);
      const value: unknown = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }
      const p = value as Record<string, unknown>;
      if (p["mode"] === "recover" && Object.keys(p).length === 1) {
        return { orderId: null, body };
      }
      const record = p["record"];
      if (
        p["type"] === "INSERT" && p["schema"] === "public" &&
        p["table"] === "orders" && record && typeof record === "object"
      ) {
        const id = (record as Record<string, unknown>)["id"];
        if (typeof id === "string" && UUID.test(id)) {
          return { orderId: id, body };
        }
      }
      return null;
    };
    return await Promise.race([
      read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          void reader.cancel().catch(() => {});
          resolve(null);
        }, 5000);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export function smtpFailure(error: unknown): { state: Outcome; code: string } {
  const e = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const response = Number(e["responseCode"]);
  const command = typeof e["command"] === "string"
    ? e["command"].toUpperCase().trim()
    : "";
  const beforeData = /^(EHLO|HELO|AUTH(?: [A-Z0-9_-]+)?|MAIL FROM|RCPT TO)$/
    .test(command);
  // Nodemailer labels socket failures/timeouts CONN even after DATA. Only DNS or
  // an actual refused/unreachable connect proves that no SMTP session submitted.
  if (
    e["code"] === "EDNS" ||
    ["ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"].includes(
      String(e["originalCode"]),
    )
  ) {
    return { state: "retry", code: "SMTP_CONNECT_NOT_ESTABLISHED" };
  }
  // A QUIT/unknown-stage failure may occur AFTER acceptance and must not replay.
  if (
    Number.isInteger(response) && response >= 400 && response < 600 &&
    (beforeData || command === "DATA")
  ) {
    return {
      state: response < 500 ? "retry" : "failed",
      code: response < 500
        ? "SMTP_TRANSIENT_REJECTION"
        : "SMTP_PERMANENT_REJECTION",
    };
  }
  if (e["code"] === "EAUTH") {
    return { state: "failed", code: "SMTP_AUTH_REJECTED" };
  }
  if (e["code"] === "EENVELOPE") {
    return { state: "failed", code: "SMTP_ENVELOPE_REJECTED" };
  }
  if (beforeData) {
    return { state: "retry", code: "SMTP_NOT_SUBMITTED" };
  }
  // Missing/ambiguous phase or failures after DATA must never be automatically replayed.
  return { state: "uncertain", code: "SMTP_ACCEPTANCE_UNKNOWN" };
}
function identity(raw: unknown): { id: string; token: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  return typeof j["id"] === "string" && UUID.test(j["id"]) &&
      typeof j["claimToken"] === "string" && UUID.test(j["claimToken"])
    ? { id: j["id"], token: j["claimToken"] }
    : null;
}
export function handler(deps: Dependencies): (r: Request) => Promise<Response> {
  const reply = (status: number, data: Record<string, unknown>) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  return async (request) => {
    if (request.method !== "POST") {
      return reply(405, { error: "POST_REQUIRED" });
    }
    if (!request.headers.has("x-order-email-signature")) {
      return reply(401, { error: "UNAUTHORIZED" });
    }
    const event = await signal(request);
    if (!event) return reply(400, { error: "INVALID_SIGNAL" });
    const authorization = await authenticateSignal(
      request,
      event.body,
      deps.token(),
    );
    if (!authorization) return reply(401, { error: "UNAUTHORIZED" });
    if (!deps.enabled()) return reply(503, { error: "ORDER_EMAIL_DISABLED" });
    try {
      await deps.ready();
    } catch {
      return reply(503, { error: "SERVER_NOT_READY" });
    }
    const counts = {
      accepted: 0,
      retry: 0,
      failed: 0,
      uncertain: 0,
      captured: 0,
    };
    const deadline = Date.now() + 110000;
    try {
      if (
        await deps.rpc("order_email_consume_wake", {
          p_nonce: authorization.nonce,
          p_body_hash: authorization.bodyHash,
        }) !== true
      ) {
        return reply(409, { error: "REPLAYED_OR_EXPIRED_SIGNAL" });
      }
      await deps.rpc("order_email_prepare", { p_order_id: event.orderId });
      for (let index = 0; index < 2 && Date.now() < deadline - 65000; index++) {
        const raw = await deps.rpc("order_email_claim", {
          p_allow_send: deps.sendEnabled(),
        });
        if (raw === null) break;
        const key = identity(raw);
        if (!key) throw new Error("INVALID_CLAIM");
        const finish = async (
          state: Outcome,
          code: string,
          acceptance?: Acceptance,
        ) => {
          const saved = await deps.rpc("order_email_finish", {
            p_id: key.id,
            p_claim: key.token,
            p_state: state,
            p_code: code,
            p_message_id: acceptance?.messageId ?? null,
            p_reference: acceptance?.reference ?? null,
          });
          if (saved !== true) throw new Error("OUTCOME_NOT_RECORDED");
          counts[state]++;
        };
        let job: Job, message: Message;
        try {
          job = parseJob(raw);
          message = sandboxMessage(job, await deps.render(job));
        } catch {
          await finish("failed", "INVALID_SNAPSHOT");
          continue;
        }
        if (!deps.enabled()) break;
        if (job.deliveryMode === "capture") {
          await finish("captured", "SANDBOX_CAPTURED");
          continue;
        }
        if (!deps.sendEnabled()) break;
        if (
          await deps.rpc("order_email_start", {
            p_id: key.id,
            p_claim: key.token,
          }) !== true
        ) continue;
        let acceptance: Acceptance;
        try {
          acceptance = await deps.send(message);
        } catch (error: unknown) {
          const result = smtpFailure(error);
          await finish(result.state, result.code);
          continue;
        }
        // A failed outcome write must NOT enter the SMTP retry branch or send a second time.
        await finish("accepted", "SMTP_ACCEPTED", acceptance);
      }
      return reply(200, { ok: true, ...counts });
    } catch {
      // Claims/submitting states remain durable; recovery resolves leases conservatively.
      return reply(503, { error: "WORKER_INCOMPLETE", ...counts });
    }
  };
}
