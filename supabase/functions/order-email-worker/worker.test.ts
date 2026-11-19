import { BUSINESS_MAILBOX, type Job, mailbox, parseJob } from "./model.ts";
import { createHmac } from "node:crypto";
import { authenticateSignal } from "./auth.ts";
import { assertProduction, assertProductionEnvelope } from "./production.ts";
import { loadTemplates, renderMessage, siteOrigin } from "./render.ts";
import { type Dependencies, handler, smtpFailure } from "./worker.ts";
import {
  assertSandbox,
  deliverSandbox,
  SANDBOX_PROJECT_URL,
  sandboxMessage,
} from "./sandbox.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function throws(run: () => unknown) {
  let failed = false;
  try {
    run();
  } catch {
    failed = true;
  }
  assert(failed);
}
// Isolated protocol/security fixtures only. Never seeded into a database or production UI.
const orderId = "00000000-0000-4000-8000-000000000001";
function fixture(kind: "admin" | "customer" = "customer"): Job {
  return {
    sandbox: true,
    deliveryMode: "send",
    id: kind === "admin"
      ? "00000000-0000-4000-8000-000000000002"
      : "00000000-0000-4000-8000-000000000003",
    orderId,
    claimToken: "00000000-0000-4000-8000-000000000004",
    kind,
    attempt: 1,
    recipient: BUSINESS_MAILBOX,
    snapshot: {
      id: orderId,
      orderNumber: "TEST-SECURITY",
      createdAt: "2026-11-19T10:00:00Z",
      userId: null,
      customerName: "Test <script>alert(1)</script>",
      email: "customer@example.invalid",
      phone: "",
      address: "Test address <svg onload=alert(1)>",
      instructions: "Leave at door & call",
      subtotal: 10,
      shipping: 2,
      paymentFee: 1,
      discount: 1,
      discountCode: "TEST&CODE",
      total: 12,
      currency: "USD",
      paymentMethod: "Cash on Delivery",
      paymentStatus: "unpaid",
      status: "processing",
      recipientVerified: false,
      items: [{
        name: "Test <img onerror=alert(1)>",
        variant: "Size <large>",
        sku: "TEST-SKU",
        attributes: { color: "Green & beige" },
        quantity: 2,
        unitPrice: 5,
        total: 10,
        gift: false,
        loyalty: false,
      }],
    },
  };
}
const token = "a".repeat(64);
Deno.test("production recipients require order-scoped authorization and USD", () => {
  const job = fixture("customer");
  job.sandbox = false;
  job.recipient = job.snapshot.email;
  throws(() => parseJob(job));
  job.snapshot.recipientVerified = true;
  assert(parseJob(job).recipient === job.snapshot.email);
  job.recipient = "other@example.invalid";
  throws(() => parseJob(job));
  job.recipient = job.snapshot.email;
  job.snapshot.currency = "EUR";
  throws(() => parseJob(job));
});
Deno.test("production transport validates headers, flags, and project", async () => {
  const job = fixture("customer");
  job.sandbox = false;
  job.snapshot.recipientVerified = true;
  job.recipient = job.snapshot.email;
  const message = renderMessage(
    parseJob(job),
    "https://nestorahomelb.com",
    await loadTemplates(),
  );
  const config = {
    enabled: "true",
    sendEnabled: "true",
    mode: "production",
    projectUrl: SANDBOX_PROJECT_URL,
  };
  assertProductionEnvelope(message, config);
  throws(() =>
    assertProductionEnvelope(message, {
      ...config,
      testRecipient: BUSINESS_MAILBOX,
    })
  );
  assert(message.replyTo === BUSINESS_MAILBOX);
  throws(() => assertProduction({ ...config, enabled: "false" }));
  throws(() =>
    assertProductionEnvelope(message, { ...config, sendEnabled: "false" })
  );
  throws(() =>
    assertProductionEnvelope(message, {
      ...config,
      projectUrl: "https://example.invalid",
    })
  );
  throws(() =>
    assertProductionEnvelope({
      ...message,
      to: "a@example.invalid,b@example.invalid",
    }, config)
  );
  throws(() =>
    assertProductionEnvelope({
      ...message,
      subject: "subject\r\nBcc: attacker@example.invalid",
    }, config)
  );
  throws(() =>
    assertProductionEnvelope({
      ...message,
      replyTo: "a@example.invalid\r\nBcc: b@example.invalid",
    }, config)
  );
});
Deno.test("explicit mailbox quota rejection is deferred; ambiguous quota text is never replayed", () => {
  assert(
    smtpFailure({
      responseCode: 550,
      command: "MAIL FROM",
      response: "550 Daily sending limit exceeded",
    }).code === "SMTP_QUOTA_REJECTED",
  );
  assert(
    smtpFailure({ command: "CONN", response: "quota" }).state === "uncertain",
  );
});
function request(
  body: unknown = { mode: "recover" },
  credential = token,
): Request {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", credential).update(
    `nestora-order-email-v1\n${timestamp}\n${nonce}\n${raw}`,
  ).digest("hex");
  return new Request("https://example.invalid/worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-order-email-signature": signature,
      "x-order-email-timestamp": timestamp,
      "x-order-email-nonce": nonce,
    },
    body: raw,
  });
}
function setup(jobs: unknown[] = [fixture()]) {
  const calls: string[] = [], outcomes: Array<Record<string, unknown>> = [];
  const deps: Dependencies = {
    ready: () => Promise.resolve(),
    enabled: () => true,
    sendEnabled: () => true,
    token: () => token,
    rpc(name, args) {
      calls.push(name);
      if (name === "order_email_claim") {
        return Promise.resolve(jobs.shift() ?? null);
      }
      if (name === "order_email_finish") outcomes.push(args);
      return Promise.resolve(true);
    },
    render(job) {
      return Promise.resolve({
        to: job.recipient,
        subject: "Test",
        html: "",
        text: "",
        messageId: `<${job.id}@example.invalid>`,
      });
    },
    send(message) {
      calls.push("smtp");
      return Promise.resolve({
        messageId: message.messageId,
        reference: "QUEUE_ID",
      });
    },
  };
  return { deps, calls, outcomes, handle: handler(deps) };
}

Deno.test("validates real snapshot arithmetic and gift/loyalty zero-price lines", () => {
  const job = fixture();
  job.snapshot.items.push({
    ...job.snapshot.items[0],
    name: "Gift",
    quantity: 1,
    unitPrice: 0,
    total: 0,
    gift: true,
  });
  job.snapshot.items.push({
    ...job.snapshot.items[0],
    name: "Points item",
    quantity: 1,
    unitPrice: 0,
    total: 0,
    loyalty: true,
  });
  assert(parseJob(job).snapshot.items.length === 3);
  const changed = structuredClone(job);
  changed.snapshot.total = 0;
  throws(() => parseJob(changed));
  changed.snapshot.total = 12;
  changed.snapshot.items[1].total = 1;
  throws(() => parseJob(changed));
});
Deno.test("rejects header injection, forged recipients, missing labels and oversized item sets", () => {
  for (
    const email of [
      "x:y@example.invalid",
      "x(comment)@example.invalid",
      "x@-example.invalid",
      "x..y@example.invalid",
    ]
  ) {
    assert(!mailbox(email));
  }
  assert(mailbox("first.last+orders@example.invalid"));
  const changed = fixture();
  changed.recipient = "customer@example.invalid\r\nBcc: x@example.invalid";
  throws(() => parseJob(changed));
  const header = fixture();
  header.snapshot.orderNumber = "ORDER\nSubject: injected";
  throws(() => parseJob(header));
  const admin = fixture("admin");
  admin.recipient = "attacker@example.invalid";
  throws(() => parseJob(admin));
  const unnamed = fixture();
  unnamed.snapshot.items[0].name = "";
  throws(() => parseJob(unnamed));
  const huge = fixture();
  huge.snapshot.items = Array.from(
    { length: 101 },
    () => huge.snapshot.items[0],
  );
  throws(() => parseJob(huge));
});
Deno.test("escapes both language sections, preserves unpaid status and safe Reply-To", async () => {
  const templates = await loadTemplates(), job = fixture();
  const customer = renderMessage(
    parseJob(job),
    "https://example.invalid",
    templates,
  );
  assert(
    customer.html.includes("&lt;script&gt;") &&
      !customer.html.includes("<script>"),
  );
  assert(
    customer.html.includes("&lt;img onerror=") &&
      !customer.html.includes("<img onerror="),
  );
  assert(
    customer.html.includes('dir="rtl"') &&
      customer.html.includes("غير مدفوع") && customer.html.includes("Unpaid"),
  );
  assert(
    customer.replyTo === BUSINESS_MAILBOX &&
      customer.subject ===
        "Your Nestora Home Order Confirmation — #TEST-SECURITY",
  );
  assert(!customer.html.includes("/shop/customer-account/orders"));
  assert(
    customer.text.includes("Cash on Delivery") && customer.text.includes("USD"),
  );
  const admin = renderMessage(
    parseJob(fixture("admin")),
    "https://example.invalid",
    templates,
  );
  assert(
    admin.replyTo === "customer@example.invalid" &&
      admin.html.includes(`/admin/orders?orderId=${orderId}`),
  );
  assert(admin.subject === "New Order Received — #TEST-SECURITY");
});
Deno.test("only verified account contacts receive a guarded customer order-list link", async () => {
  const job = fixture();
  job.snapshot.userId = orderId;
  job.snapshot.recipientVerified = true;
  const message = renderMessage(
    parseJob(job),
    "https://example.invalid",
    await loadTemplates(),
  );
  assert(
    message.html.includes(
      "https://example.invalid/shop/customer-account/orders",
    ),
  );
  for (
    const site of [
      "http://example.invalid",
      "https://user:pass@example.invalid",
      "https://example.invalid/?token=x",
    ]
  ) {
    throws(() => siteOrigin(site));
  }
});
Deno.test("does not invent a valid Reply-To for invalid checkout email on an admin job", async () => {
  const job = fixture("admin");
  job.snapshot.email = "invalid\r\nBcc: attacker";
  assert(
    renderMessage(
      parseJob(job),
      "https://example.invalid",
      await loadTemplates(),
    ).replyTo === undefined,
  );
});
Deno.test("classifies explicit rejections, pre-submission failures and ambiguous DATA safely", () => {
  assert(smtpFailure({ responseCode: 450, command: "DATA" }).state === "retry");
  assert(
    smtpFailure({ responseCode: 550, command: "DATA" }).state === "failed",
  );
  assert(smtpFailure({ code: "EAUTH" }).state === "failed");
  assert(
    smtpFailure({ code: "ETIMEDOUT", command: "CONN" }).state === "uncertain",
  );
  assert(
    smtpFailure({ code: "ECONNECTION", command: "CONN" }).state === "uncertain",
  );
  assert(
    smtpFailure({
      code: "ESOCKET",
      originalCode: "ECONNREFUSED",
      command: "CONN",
    }).state === "retry",
  );
  assert(smtpFailure({ code: "EDNS", command: "CONN" }).state === "retry");
  assert(
    smtpFailure({ code: "ETIMEDOUT", command: "DATA" }).state === "uncertain",
  );
  assert(smtpFailure(new Error("secret")).state === "uncertain");
  assert(
    smtpFailure({ responseCode: 421, command: "QUIT" }).state === "uncertain",
  );
  assert(smtpFailure({ responseCode: 450 }).state === "uncertain");
});
Deno.test("unauthorized, disabled and invalid-scope requests never access delivery data", async () => {
  const test = setup();
  assert((await test.handle(request(undefined, "wrong"))).status === 401);
  test.deps.enabled = () => false;
  assert((await test.handle(request())).status === 503);
  assert(test.calls.length === 0);
  test.deps.enabled = () => true;
  for (
    const body of [{ mode: "send", to: "attacker@example.invalid" }, {
      mode: "recover",
      to: "x",
    }, {
      type: "UPDATE",
      schema: "public",
      table: "orders",
      record: { id: orderId },
    }, { mode: "x".repeat(5000) }]
  ) {
    assert((await test.handle(request(body))).status === 400);
  }
  assert(test.calls.length === 0);
});
Deno.test("webhook values are ignored except for validated order ID", async () => {
  const test = setup([]);
  let prepared: unknown;
  test.deps.rpc = (name, args) => {
    if (name === "order_email_prepare") prepared = args;
    return Promise.resolve(name === "order_email_claim" ? null : true);
  };
  const response = await test.handle(
    request({
      type: "INSERT",
      schema: "public",
      table: "orders",
      record: { id: orderId, total: 0, email: "attacker@example.invalid" },
    }),
  );
  assert(
    response.status === 200 &&
      JSON.stringify(prepared) === JSON.stringify({ p_order_id: orderId }),
  );
});
Deno.test("one recipient rejection does not suppress the other recipient", async () => {
  const test = setup([fixture("admin"), fixture("customer")]);
  test.deps.send = (message) => {
    test.calls.push("smtp");
    if (message.subject.startsWith("[TEST] New Order")) {
      return Promise.reject({ responseCode: 550, command: "RCPT TO" });
    }
    return Promise.resolve({
      messageId: message.messageId,
      reference: "QUEUE",
    });
  };
  const response = await test.handle(request());
  const result = await response.json();
  assert(
    result.accepted === 1 && result.failed === 1 && test.outcomes.length === 2,
  );
});
Deno.test("concurrent webhook replays cannot obtain the same atomic claim twice", async () => {
  const test = setup([fixture()]);
  await Promise.all([test.handle(request()), test.handle(request())]);
  assert(test.calls.filter((c) => c === "smtp").length === 1);
});
Deno.test("failed acceptance write never resubmits SMTP or records a retry", async () => {
  const test = setup([fixture()]);
  const rpc = test.deps.rpc;
  test.deps.rpc = async (name, args) => {
    if (name === "order_email_finish") throw new Error("database timeout");
    return await rpc(name, args);
  };
  assert((await test.handle(request())).status === 503);
  await test.handle(request());
  assert(
    test.calls.filter((c) => c === "smtp").length === 1 &&
      test.outcomes.length === 0,
  );
});
Deno.test("ambiguous SMTP failure is recorded as uncertain without leaking error text", async () => {
  const test = setup();
  test.deps.send = () =>
    Promise.reject({
      command: "DATA",
      code: "ETIMEDOUT",
      message: "SMTP_PASSWORD=secret",
    });
  const result = await test.handle(request());
  const body = await result.text();
  assert(
    test.outcomes[0]["p_state"] === "uncertain" && !body.includes("secret"),
  );
});
Deno.test("a stale claim or disabled start never reaches SMTP", async () => {
  const test = setup();
  const rpc = test.deps.rpc;
  test.deps.rpc = async (name, args) =>
    name === "order_email_start" ? false : await rpc(name, args);
  await test.handle(request());
  assert(!test.calls.includes("smtp"));
});
Deno.test("corrupt snapshots fail before SMTP and do not expose database content", async () => {
  const job = fixture();
  job.snapshot.total = 999;
  const test = setup([job]);
  const result = await test.handle(request());
  assert(
    result.status === 200 && test.outcomes[0]["p_state"] === "failed" &&
      !test.calls.includes("smtp"),
  );
});

Deno.test("missing server configuration or static assets consumes no delivery jobs", async () => {
  const test = setup();
  test.deps.ready = () => Promise.reject(new Error("private configuration"));
  const result = await test.handle(request());
  assert(
    result.status === 503 && test.calls.length === 0 &&
      !(await result.text()).includes("private configuration"),
  );
});

Deno.test("capture renders both sandbox copies without SMTP or consuming send starts", async () => {
  const jobs = [fixture("admin"), fixture("customer")];
  jobs.forEach((j) => j.deliveryMode = "capture");
  const test = setup(jobs);
  test.deps.sendEnabled = () => false;
  const result = await (await test.handle(request())).json();
  assert(result.captured === 2 && result.accepted === 0);
  assert(test.outcomes.every((o) => o["p_state"] === "captured"));
  assert(
    !test.calls.includes("smtp") && !test.calls.includes("order_email_start"),
  );
});

Deno.test("a disabled send gate cannot send even if the database returns a send job", async () => {
  const test = setup();
  test.deps.sendEnabled = () => false;
  await test.handle(request());
  assert(
    !test.calls.includes("smtp") && !test.calls.includes("order_email_start"),
  );
});

Deno.test("missing sandbox identity, real recipients and forged modes fail closed", () => {
  const job = fixture();
  for (const value of [undefined, "true"]) {
    throws(() => parseJob({ ...job, sandbox: value }));
  }
  throws(() => parseJob({ ...job, deliveryMode: "production" }));
  throws(() => parseJob({ ...job, recipient: job.snapshot.email }));
});

Deno.test("both test subjects and Reply-To are fixed regardless of renderer or checkout contact", async () => {
  const test = setup([fixture("admin"), fixture("customer")]);
  const messages: Array<{ to: string; replyTo?: string; subject: string }> = [];
  test.deps.send = (message) => {
    messages.push(message);
    return Promise.resolve({ messageId: message.messageId, reference: null });
  };
  await test.handle(request());
  assert(messages.length === 2);
  assert(
    messages.every((m) =>
      m.to === BUSINESS_MAILBOX && m.replyTo === BUSINESS_MAILBOX
    ),
  );
  assert(messages[0].subject.startsWith("[TEST] New Order — #"));
  assert(messages[1].subject.startsWith("[TEST] Order Confirmation — #"));
});

Deno.test("final SMTP boundary independently rejects any real recipient or permissive configuration", async () => {
  const config = {
    enabled: "true",
    sendEnabled: "true",
    mode: "sandbox",
    projectUrl: SANDBOX_PROJECT_URL,
  };
  const job = fixture();
  const message = sandboxMessage(job, {
    to: "attacker@example.invalid",
    replyTo: job.snapshot.email,
    subject: "forged",
    html: "",
    text: "",
    messageId: `<${job.id}@example.invalid>`,
  });
  let calls = 0;
  const transport = () => {
    calls++;
    return Promise.resolve(true);
  };
  const cases = [
    { ...config, enabled: undefined },
    { ...config, sendEnabled: "false" },
    { ...config, mode: "production" },
    { ...config, mode: undefined },
    { ...config, projectUrl: "https://other.supabase.co" },
  ];
  for (const c of cases) {
    let rejected = false;
    try {
      await deliverSandbox(message, () => c, transport);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  for (
    const bad of [
      { ...message, to: job.snapshot.email },
      { ...message, replyTo: job.snapshot.email },
      { ...message, to: `${BUSINESS_MAILBOX},attacker@example.invalid` },
      { ...message, subject: "New Order" },
    ]
  ) {
    let rejected = false;
    try {
      await deliverSandbox(bad, () => config, transport);
    } catch {
      rejected = true;
    }
    assert(rejected);
  }
  assert(calls === 0);
  assert(await deliverSandbox(message, () => config, transport));
  assert(Number(calls) === 1);
  throws(() => assertSandbox({ ...config, mode: "production" }));
});

Deno.test("signed webhook rejects stale, future, changed-body and legacy bearer credentials", async () => {
  const valid = request();
  const body = await valid.clone().text();
  assert(await authenticateSignal(valid, body, token));
  assert(!await authenticateSignal(valid, body + " ", token));
  assert(!await authenticateSignal(valid, body, token, Date.now() + 301000));
  assert(!await authenticateSignal(valid, body, token, Date.now() - 31000));
  const legacy = new Request("https://example.invalid", {
    method: "POST",
    headers: { "x-order-email-token": token },
    body,
  });
  assert(!await authenticateSignal(legacy, body, token));
});

Deno.test("an authenticated copied webhook nonce can be consumed only once", async () => {
  const test = setup([fixture()]);
  const original = test.deps.rpc;
  const used = new Set<string>();
  test.deps.rpc = async (name, args) => {
    if (name === "order_email_consume_wake") {
      const nonce = String(args["p_nonce"]);
      if (used.has(nonce)) return false;
      used.add(nonce);
      return true;
    }
    return await original(name, args);
  };
  const signed = request();
  const replies = await Promise.all([
    test.handle(signed.clone()),
    test.handle(signed.clone()),
  ]);
  assert(replies.filter((r) => r.status === 409).length === 1);
  assert(test.calls.filter((c) => c === "smtp").length === 1);
});
