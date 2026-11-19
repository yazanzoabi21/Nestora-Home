import {
  hash,
  type VerificationDependencies,
  verificationHandler,
} from "./handler.ts";
function assert(value: unknown): asserts value {
  if (!value) throw new Error("Assertion failed");
}
const orderId = "00000000-0000-4000-8000-000000000001";
const checkoutToken = "00000000-0000-4000-8000-000000000002";
function request(body: unknown, origin = "https://nestorahomelb.com") {
  return new Request("https://example.invalid/verify", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
function setup(permit: unknown = { recipient: "info@nestorahomelb.com" }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let sent = 0;
  let sentCode = "";
  const deps: VerificationDependencies = {
    enabled: () => true,
    ipHash: () => Promise.resolve("a".repeat(64)),
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(
        name === "order_email_verification_guard" ? true : permit,
      );
    },
    send(message) {
      sent++;
      assert(message.to === "info@nestorahomelb.com");
      assert(message.replyTo === "info@nestorahomelb.com");
      assert(/\b\d{8}\b/.test(message.text));
      sentCode = message.text.match(/\b\d{8}\b/)?.[0] ?? "";
      return Promise.resolve();
    },
  };
  return {
    deps,
    calls,
    sent: () => sent,
    code: () => sentCode,
    handle: (r: Request) => verificationHandler(deps)(r),
  };
}
Deno.test("verification requests send only to database-authorized recipient and never return code", async () => {
  const s = setup();
  const response = await s.handle(
    request({ action: "request", orderId, checkoutToken }),
  );
  assert(response.status === 200);
  assert(s.sent() === 1);
  assert(await response.text() === '{"requested":true}');
  assert(
    s.calls.find((call) => call.name === "order_email_verification_request")
      ?.args["p_code_hash"] === await hash(`${orderId}:${s.code()}`),
  );
  assert(
    s.calls.some((call) =>
      call.name === "order_email_verification_request" &&
      typeof call.args["p_code_hash"] === "string"
    ),
  );
});
Deno.test("denied ownership requests reveal no recipient and send nothing", async () => {
  const s = setup(null);
  const response = await s.handle(
    request({ action: "request", orderId, checkoutToken }),
  );
  assert(response.status === 200);
  assert(s.sent() === 0);
  assert(await response.text() === '{"requested":true}');
});
Deno.test("cross-origin, recipient overrides, oversize bodies, and disabled gates fail closed", async () => {
  const s = setup();
  assert(
    (await s.handle(
      request(
        { action: "request", orderId, checkoutToken },
        "https://evil.invalid",
      ),
    )).status === 403,
  );
  assert(
    (await s.handle(
      request({
        action: "request",
        orderId,
        checkoutToken,
        recipient: "other@example.invalid",
      }),
    )).status === 400,
  );
  assert(
    (await s.handle(request({ padding: "x".repeat(1025) }))).status === 413,
  );
  s.deps.enabled = () => false;
  assert(
    (await s.handle(request({ action: "request", orderId, checkoutToken })))
      .status === 503,
  );
  assert(s.sent() === 0);
});
Deno.test("API throttle precedes challenge generation and SMTP", async () => {
  const s = setup();
  s.deps.rpc = () => Promise.resolve(false);
  assert(
    (await s.handle(request({ action: "request", orderId, checkoutToken })))
      .status === 429,
  );
  assert(s.sent() === 0);
});
Deno.test("confirmation binds the code to the order, rejects malformed codes and never sends directly", async () => {
  const s = setup(true);
  assert(
    (await s.handle(
      request({ action: "confirm", orderId, checkoutToken, code: "12345678" }),
    )).status === 200,
  );
  const call = s.calls.find((call) =>
    call.name === "order_email_verification_confirm"
  );
  assert(call?.args["p_code_hash"] === await hash(`${orderId}:12345678`));
  assert(
    (await s.handle(
      request({ action: "confirm", orderId, checkoutToken, code: "1234" }),
    )).status === 400,
  );
  assert(s.sent() === 0);
});
Deno.test("SMTP errors do not release confirmation and return only sanitized failure", async () => {
  const s = setup();
  s.deps.send = () => Promise.reject(new Error("sensitive SMTP diagnostic"));
  const response = await s.handle(
    request({ action: "request", orderId, checkoutToken }),
  );
  assert(response.status === 503);
  assert(!(await response.text()).includes("sensitive"));
  assert(
    !s.calls.some((call) => call.name === "order_email_verification_confirm"),
  );
});
