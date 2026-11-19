import { BUSINESS_MAILBOX, mailbox, type Message } from "./model.ts";
import { SANDBOX_PROJECT_URL, type SandboxConfig } from "./sandbox.ts";

export function assertProduction(config: SandboxConfig, sending = false): void {
  if (
    config.enabled !== "true" || config.mode !== "production" ||
    config.projectUrl !== SANDBOX_PROJECT_URL ||
    (sending && config.sendEnabled !== "true")
  ) {
    throw Object.assign(new Error("PRODUCTION_DISABLED"), {
      code: "EENVELOPE",
    });
  }
}

// Recipient authorization is rechecked in the database immediately before SMTP.
// Independently reject header injection, extra recipients, and unsafe sender headers.
export function assertProductionEnvelope(
  message: Message,
  config: SandboxConfig,
): void {
  assertProduction(config, true);
  if (
    !mailbox(message.to) ||
    (message.replyTo !== undefined && !mailbox(message.replyTo)) ||
    /[\r\n]/.test(message.subject) || message.subject.startsWith("[TEST]") ||
    !/^<nestora-order-[0-9a-f-]{36}@nestorahomelb\.com>$/.test(
      message.messageId,
    ) ||
    (message.to !== BUSINESS_MAILBOX && message.replyTo !== BUSINESS_MAILBOX)
  ) {
    throw Object.assign(new Error("PRODUCTION_ENVELOPE"), {
      code: "EENVELOPE",
    });
  }
  if (
    config.testRecipient !== undefined &&
    (config.testRecipient !== BUSINESS_MAILBOX ||
      message.to !== BUSINESS_MAILBOX)
  ) {
    throw Object.assign(new Error("CANARY_RECIPIENT"), { code: "EENVELOPE" });
  }
}
