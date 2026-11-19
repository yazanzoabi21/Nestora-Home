export interface ProbeConfig {
  username: string;
  password: string;
  runId?: string;
}

export interface ProbeDependencies {
  env(name: string): string | undefined;
  now(): number;
  dns(): Promise<void>;
  tls(): Promise<void>;
  verify(config: ProbeConfig): Promise<void>;
  claim(runId: string): Promise<boolean>;
  send(config: ProbeConfig): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAILBOX = /^[^\s<>@,;"\\]+@[^\s<>@,;"\\]+\.[^\s<>@,;"\\]+$/;

async function matches(
  actual: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (!actual || !expected || expected.length < 32 || actual.length > 256) {
    return false;
  }
  const digest = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [first, second] = await Promise.all([digest(actual), digest(expected)]);
  const a = new Uint8Array(first);
  const b = new Uint8Array(second);
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function response(status: number, data: Record<string, unknown>): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function modeFrom(
  request: Request,
): Promise<"verify" | "send-once" | null> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    return Object.keys(record).length === 1 &&
        (record["mode"] === "verify" || record["mode"] === "send-once")
      ? record["mode"]
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export function createProbeHandler(
  deps: ProbeDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    // No CORS, user JWT authorization, query-string credentials, or caller-selected recipients.
    if (request.method !== "POST") {
      return response(405, { error: "post_required" });
    }
    if (deps.env("SMTP_PROBE_ENABLED") !== "true") {
      return response(503, { error: "probe_disabled" });
    }
    if (
      !await matches(
        request.headers.get("x-smtp-probe-token"),
        deps.env("SMTP_PROBE_TOKEN"),
      )
    ) {
      return response(401, { error: "unauthorized" });
    }
    const expires = Date.parse(deps.env("SMTP_PROBE_EXPIRES_AT") ?? "");
    const remaining = expires - deps.now();
    if (
      !Number.isFinite(remaining) || remaining <= 0 || remaining > 86_400_000
    ) {
      return response(403, { error: "invalid_probe_window" });
    }
    const mode = await modeFrom(request);
    if (!mode) return response(400, { error: "only_mode_is_allowed" });
    const username = deps.env("SMTP_USERNAME") ?? "";
    const password = deps.env("SMTP_PASSWORD") ?? "";
    if (!MAILBOX.test(username) || !password) {
      return response(503, { error: "smtp_secrets_not_configured" });
    }
    const config: ProbeConfig = { username, password };
    if (mode === "send-once") {
      if (
        deps.env("SMTP_PROBE_SEND_ENABLED") !== "true" ||
        !await matches(
          request.headers.get("x-smtp-send-token"),
          deps.env("SMTP_PROBE_SEND_TOKEN"),
        )
      ) {
        return response(403, { error: "send_not_authorized" });
      }
      const recipient = deps.env("SMTP_PROBE_RECIPIENT");
      const runId = deps.env("SMTP_PROBE_RUN_ID");
      if (
        recipient?.toLowerCase() !== username.toLowerCase() || !runId ||
        !UUID.test(runId)
      ) {
        return response(503, { error: "own_mailbox_and_run_required" });
      }
      config.runId = runId;
    }
    const completed: string[] = [];
    let stage = "dns";
    let claimed = false;
    try {
      await deps.dns();
      completed.push("dns");
      stage = "tls";
      await deps.tls();
      completed.push("tls");
      stage = "smtp_auth";
      await deps.verify(config);
      completed.push("smtp_auth");
      if (mode === "verify") {
        return response(200, { mode, completed, emailSent: false });
      }
      stage = "claim";
      claimed = await deps.claim(config.runId!);
      if (!claimed) {
        return response(409, {
          error: "run_already_consumed",
          emailRetried: false,
        });
      }
      // Claim is persistent and never released, even on timeout/crash. No automatic resend.
      stage = "smtp_send";
      await deps.send(config);
      return response(200, {
        mode,
        completed,
        smtpAccepted: true,
        inboxDelivery: "requires_manual_confirmation",
      });
    } catch (error: unknown) {
      const rawCode = error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
      const allowedCodes = [
        "EAUTH",
        "EDNS",
        "ETLS",
        "ESOCKET",
        "ETIMEDOUT",
        "ECONNECTION",
        "EENVELOPE",
        "EMESSAGE",
      ];
      const code = typeof rawCode === "string" && allowedCodes.includes(rawCode)
        ? rawCode
        : "PROBE_FAILED";
      // Never return or log exception messages, SMTP responses, envelopes, or secret values.
      return response(502, {
        error: code,
        stage,
        completed,
        runConsumed: claimed,
        delivery: claimed ? "unknown_do_not_retry" : "not_attempted",
      });
    }
  };
}
