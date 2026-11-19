export type Kind = "admin" | "customer";
export type Outcome =
  | "accepted"
  | "retry"
  | "failed"
  | "uncertain"
  | "captured";
export interface Item {
  name: string;
  variant: string;
  sku: string;
  attributes: Readonly<Record<string, string>>;
  quantity: number;
  unitPrice: number;
  total: number;
  gift: boolean;
  loyalty: boolean;
}
export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  userId: string | null;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  instructions: string;
  subtotal: number;
  shipping: number;
  paymentFee: number;
  discount: number;
  discountCode: string;
  total: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  recipientVerified: boolean;
  items: Item[];
}
export interface Job {
  sandbox: true;
  deliveryMode: "capture" | "send";
  id: string;
  orderId: string;
  kind: Kind;
  recipient: string;
  claimToken: string;
  attempt: number;
  snapshot: Order;
}
export interface Message {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  messageId: string;
}
export interface Acceptance {
  messageId: string;
  reference: string | null;
}
export const BUSINESS_MAILBOX = "info@nestorahomelb.com";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function mailbox(value: string): boolean {
  const [local, domain, ...extra] = value.split("@");
  return value.length <= 254 && Boolean(local && domain) &&
    extra.length === 0 && local.length <= 64 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") && !local.includes("..") && domain.includes(".") &&
    domain.split(".").every((label) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)
    );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_SNAPSHOT");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 2000): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" || value.length > limit) {
    throw new Error("INVALID_SNAPSHOT");
  }
  return value;
}
function money(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    value > 1e10
  ) throw new Error("INVALID_MONEY");
  return value;
}
export function parseJob(value: unknown): Job {
  const j = record(value), o = record(j["snapshot"]);
  if (
    j["sandbox"] !== true ||
    !["capture", "send"].includes(String(j["deliveryMode"]))
  ) {
    throw new Error("SANDBOX_REQUIRED");
  }
  if (
    !UUID.test(text(j["id"])) || !UUID.test(text(j["orderId"])) ||
    !UUID.test(text(j["claimToken"])) ||
    !["admin", "customer"].includes(text(j["kind"])) ||
    !Number.isInteger(j["attempt"]) ||
    Number(j["attempt"]) < 1 || Number(j["attempt"]) > 5
  ) throw new Error("INVALID_JOB");
  if (
    !Array.isArray(o["items"]) || !o["items"].length || o["items"].length > 100
  ) throw new Error("INVALID_ITEMS");
  const items = o["items"].map((value): Item => {
    const i = record(value);
    const quantity = Number(i["quantity"]);
    if (
      !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 ||
      !text(i["name"]).trim()
    ) throw new Error("INVALID_ITEMS");
    const attributes: Record<string, string> = {};
    if (i["attributes"] !== null && i["attributes"] !== undefined) {
      for (const [key, value] of Object.entries(record(i["attributes"]))) {
        if (Object.keys(attributes).length >= 20) {
          throw new Error("INVALID_ITEMS");
        }
        attributes[text(key, 100)] = text(value, 200);
      }
    }
    return {
      name: text(i["name"], 300),
      variant: text(i["variant"], 300),
      sku: text(i["sku"], 100),
      attributes,
      quantity,
      unitPrice: money(i["unitPrice"]),
      total: money(i["total"]),
      gift: i["gift"] === true,
      loyalty: i["loyalty"] === true,
    };
  });
  const order: Order = {
    id: text(o["id"]),
    orderNumber: text(o["orderNumber"], 100),
    createdAt: text(o["createdAt"], 100),
    userId: o["userId"] === null ? null : text(o["userId"]),
    customerName: text(o["customerName"], 300),
    email: text(o["email"], 254),
    phone: text(o["phone"], 100),
    address: text(o["address"]),
    instructions: text(o["instructions"]),
    subtotal: money(o["subtotal"]),
    shipping: money(o["shipping"]),
    paymentFee: money(o["paymentFee"]),
    discount: money(o["discount"]),
    discountCode: text(o["discountCode"], 100),
    total: money(o["total"]),
    currency: text(o["currency"], 3),
    paymentMethod: text(o["paymentMethod"], 200),
    paymentStatus: text(o["paymentStatus"], 80),
    status: text(o["status"], 80),
    recipientVerified: o["recipientVerified"] === true,
    items,
  };
  if (
    order.id !== j["orderId"] || !UUID.test(order.id) || !order.orderNumber ||
    /[\r\n]/.test(order.orderNumber) ||
    !Number.isFinite(Date.parse(order.createdAt)) ||
    !/^[A-Z]{3}$/.test(order.currency) || !order.paymentMethod ||
    !order.address || !order.customerName || !order.paymentStatus ||
    Math.abs(items.reduce((sum, i) => sum + i.total, 0) - order.subtotal) >
      0.011 ||
    Math.abs(
        Math.max(
          0,
          order.subtotal + order.shipping + order.paymentFee - order.discount,
        ) - order.total,
      ) > 0.011
  ) {
    throw new Error("INCONSISTENT_ORDER");
  }
  for (const item of items) {
    if (
      (item.gift || item.loyalty)
        ? item.total !== 0
        : Math.abs(item.unitPrice * item.quantity - item.total) > 0.011
    ) throw new Error("INCONSISTENT_ITEMS");
  }
  const recipient = text(j["recipient"], 254), kind = j["kind"] as Kind;
  if (
    !mailbox(recipient) ||
    recipient !== BUSINESS_MAILBOX
  ) {
    throw new Error("INVALID_RECIPIENT");
  }
  return {
    sandbox: true,
    deliveryMode: j["deliveryMode"] as "capture" | "send",
    id: j["id"] as string,
    orderId: order.id,
    claimToken: j["claimToken"] as string,
    kind,
    recipient,
    attempt: Number(j["attempt"]),
    snapshot: order,
  };
}
