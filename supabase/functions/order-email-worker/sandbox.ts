import { BUSINESS_MAILBOX, type Job, type Message } from "./model.ts";

export const SANDBOX_PROJECT_URL = "https://ojismppptyrivnxnkcux.supabase.co";
export interface SandboxConfig {
  enabled: string | undefined;
  sendEnabled: string | undefined;
  mode: string | undefined;
  projectUrl: string | undefined;
  testRecipient?: string;
}
// There is deliberately no production-recipient branch in this deployment.
export function assertSandbox(config: SandboxConfig, sending = false): void {
  if (
    config.enabled !== "true" || config.mode !== "sandbox" ||
    config.projectUrl !== SANDBOX_PROJECT_URL ||
    (sending && config.sendEnabled !== "true")
  ) {
    throw Object.assign(new Error("SANDBOX_DISABLED"), { code: "EENVELOPE" });
  }
}
export function sandboxMessage(job: Job, message: Message): Message {
  if (job.sandbox !== true || job.recipient !== BUSINESS_MAILBOX) {
    throw new Error("SANDBOX_RECIPIENT");
  }
  return {
    ...message,
    to: BUSINESS_MAILBOX,
    replyTo: BUSINESS_MAILBOX,
    subject: `[TEST] ${
      job.kind === "admin" ? "New Order" : "Order Confirmation"
    } — #${job.snapshot.orderNumber}`,
  };
}
export function assertSandboxEnvelope(
  message: Message,
  config: SandboxConfig,
): void {
  assertSandbox(config, true);
  if (
    message.to !== BUSINESS_MAILBOX || message.replyTo !== BUSINESS_MAILBOX ||
    !/^\[TEST\] (New Order|Order Confirmation) — #[^\r\n]+$/.test(
      message.subject,
    )
  ) {
    throw Object.assign(new Error("SANDBOX_RECIPIENT"), { code: "EENVELOPE" });
  }
}
// Check immediately adjacent to the transport call, never trust renderer/DB fields.
export async function deliverSandbox<T>(
  message: Message,
  config: () => SandboxConfig,
  transport: (message: Message) => Promise<T>,
): Promise<T> {
  assertSandboxEnvelope(message, config());
  return await transport(message);
}
