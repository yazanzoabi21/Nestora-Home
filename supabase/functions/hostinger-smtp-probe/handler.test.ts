import { createProbeHandler, type ProbeDependencies } from "./handler.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function setup() {
  // Synthetic protocol fixtures only; no environment reads, SMTP, database, or credentials.
  const now = Date.UTC(2026, 10, 19);
  const env: Record<string, string> = {
    SMTP_PROBE_ENABLED: "true",
    SMTP_PROBE_TOKEN: "a".repeat(32),
    SMTP_PROBE_EXPIRES_AT: new Date(now + 60_000).toISOString(),
    SMTP_USERNAME: "probe@example.invalid",
    SMTP_PASSWORD: "synthetic-test-value",
    SMTP_PROBE_SEND_ENABLED: "true",
    SMTP_PROBE_SEND_TOKEN: "b".repeat(32),
    SMTP_PROBE_RECIPIENT: "probe@example.invalid",
    SMTP_PROBE_RUN_ID: "00000000-0000-4000-8000-000000000001",
  };
  const calls: string[] = [];
  const consumed = new Set<string>();
  const deps: ProbeDependencies = {
    env: (name) => env[name],
    now: () => now,
    dns: () => {
      calls.push("dns");
      return Promise.resolve();
    },
    tls: () => {
      calls.push("tls");
      return Promise.resolve();
    },
    verify: () => {
      calls.push("auth");
      return Promise.resolve();
    },
    claim: (id) => {
      if (consumed.has(id)) return Promise.resolve(false);
      consumed.add(id);
      return Promise.resolve(true);
    },
    send: (config) => {
      assert(config.username === env.SMTP_PROBE_RECIPIENT);
      calls.push("send");
      return Promise.resolve();
    },
  };
  const request = (
    body: unknown = { mode: "verify" },
    token = env.SMTP_PROBE_TOKEN,
  ) =>
    new Request("https://example.invalid/probe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-smtp-probe-token": token,
        "x-smtp-send-token": env.SMTP_PROBE_SEND_TOKEN,
      },
      body: JSON.stringify(body),
    });
  return { env, deps, calls, request, handler: createProbeHandler(deps) };
}

Deno.test("disabled and unauthorized probes perform no network operations", async () => {
  const test = setup();
  assert((await test.handler(test.request(undefined, "wrong"))).status === 401);
  test.env.SMTP_PROBE_ENABLED = "false";
  assert((await test.handler(test.request())).status === 503);
  assert(test.calls.length === 0);
});

Deno.test("verify checks DNS, TLS and authentication without sending or claiming", async () => {
  const test = setup();
  test.deps.claim = () => {
    throw new Error("must not claim");
  };
  const response = await test.handler(test.request());
  assert(response.status === 200);
  assert(JSON.stringify(test.calls) === JSON.stringify(["dns", "tls", "auth"]));
  assert((await response.json()).emailSent === false);
});

Deno.test("expired or overlong authorization windows fail closed", async () => {
  for (
    const expiry of ["invalid", "2026-11-18T00:00:00Z", "2026-12-19T00:00:00Z"]
  ) {
    const test = setup();
    test.env.SMTP_PROBE_EXPIRES_AT = expiry;
    assert((await test.handler(test.request())).status === 403);
    assert(test.calls.length === 0);
  }
});

Deno.test("rejects arbitrary recipients, content, oversized requests and non-POST methods", async () => {
  const test = setup();
  for (
    const body of [
      { mode: "verify", to: "other@example.invalid" },
      { mode: "send-once", subject: "override" },
      { mode: "x".repeat(600) },
      null,
    ]
  ) {
    assert((await test.handler(test.request(body))).status === 400);
  }
  assert(
    (await test.handler(new Request("https://example.invalid/probe")))
      .status === 405,
  );
  assert(test.calls.length === 0);
});

Deno.test("send requires its own opt-in, token and the same business mailbox", async () => {
  const test = setup();
  test.env.SMTP_PROBE_SEND_ENABLED = "false";
  assert(
    (await test.handler(test.request({ mode: "send-once" }))).status === 403,
  );
  test.env.SMTP_PROBE_SEND_ENABLED = "true";
  const request = test.request({ mode: "send-once" });
  request.headers.set("x-smtp-send-token", "wrong");
  assert((await test.handler(request)).status === 403);
  test.env.SMTP_PROBE_RECIPIENT = "other@example.invalid";
  assert(
    (await test.handler(test.request({ mode: "send-once" }))).status === 503,
  );
  assert(test.calls.length === 0);
});

Deno.test("a persistent claim allows only one send across concurrent invocations", async () => {
  const test = setup();
  const responses = await Promise.all([
    test.handler(test.request({ mode: "send-once" })),
    test.handler(test.request({ mode: "send-once" })),
  ]);
  assert(responses.map((result) => result.status).sort().join() === "200,409");
  assert(test.calls.filter((call) => call === "send").length === 1);
});

Deno.test("ambiguous sends consume their permit and never automatically retry or leak errors", async () => {
  const test = setup();
  test.deps.send = () => {
    throw Object.assign(new Error(test.env.SMTP_PASSWORD), {
      code: "ETIMEDOUT",
    });
  };
  const first = await test.handler(test.request({ mode: "send-once" }));
  const body = await first.text();
  assert(first.status === 502 && body.includes("unknown_do_not_retry"));
  assert(
    !body.includes(test.env.SMTP_PASSWORD) &&
      !body.includes(test.env.SMTP_USERNAME),
  );
  assert(
    (await test.handler(test.request({ mode: "send-once" }))).status === 409,
  );
});

Deno.test("claim failure prevents sending and reports only a sanitized stage", async () => {
  const test = setup();
  test.deps.claim = () => {
    throw new Error("private database error");
  };
  const response = await test.handler(test.request({ mode: "send-once" }));
  const body = await response.text();
  assert(response.status === 502 && body.includes("claim"));
  assert(
    !body.includes("private database error") && !test.calls.includes("send"),
  );
});

Deno.test("TLS failure stops before authentication, claim or sending", async () => {
  const test = setup();
  test.deps.tls = () => {
    throw new Error("private TLS details");
  };
  const response = await test.handler(test.request({ mode: "send-once" }));
  const body = await response.text();
  assert(response.status === 502 && body.includes("tls"));
  assert(!body.includes("private TLS details") && test.calls.join() === "dns");
});

Deno.test("missing SMTP secrets never initiate network traffic", async () => {
  const test = setup();
  delete test.env.SMTP_PASSWORD;
  assert((await test.handler(test.request())).status === 503);
  assert(test.calls.length === 0);
});
