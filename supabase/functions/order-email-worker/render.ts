import labels from "./templates/labels.json" with { type: "json" };
import bundle from "./templates/bundle.generated.json" with { type: "json" };
import { BUSINESS_MAILBOX, type Job, mailbox, type Message } from "./model.ts";
import { publicImageUrl } from "./product-images.ts";
import { SANDBOX_PROJECT_URL } from "./sandbox.ts";

export interface Templates {
  frame: string;
  section: string;
  item: string;
  detail: string;
  action: string;
  receipt: string;
  image: string;
  imagePlaceholder: string;
  grandTotal: string;
  css: string;
}
export function loadTemplates(): Promise<Templates> {
  if (
    bundle.version !== 1 ||
    Object.values(bundle.templates).some((value) => !value.trim())
  ) {
    return Promise.reject(new Error("INVALID_TEMPLATE_BUNDLE"));
  }
  // JSON is part of the static module graph, not a runtime filesystem asset.
  return Promise.resolve({ ...bundle.templates });
}
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
}
/** Select an existing English catalog label; never invent a translation. */
export function englishCatalogLabel(value: string): string {
  const english = value.split(/\s*[|]\s*/).find((part) =>
    /[A-Za-z]/.test(part) && !/\p{Script=Arabic}/u.test(part)
  );
  return english?.trim() || value;
}
function fill(
  template: string,
  values: Record<string, unknown>,
  slots: Record<string, string> = {},
): string {
  // Raw slots are supplied only from these trusted rendered partials/static CSS, never order data.
  return template.replace(
    /\[\[(\w+)\]\]|\{\{\s*(\w+)\s*\}\}/g,
    (_, slot: string, key: string) =>
      slot ? slots[slot] ?? "" : escapeHtml(values[key]),
  );
}
export function siteOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash || url.pathname !== "/"
  ) {
    throw new Error("INVALID_SITE_URL");
  }
  return url.origin;
}
export function paymentPresentation(
  order: Job["snapshot"],
): { action: string; note: string } {
  const status = order.paymentStatus.toLowerCase();
  if (status === "paid") {
    return {
      action: "Payment received",
      note: "No payment action is required",
    };
  }
  if (order.total === 0) {
    return { action: "No payment required", note: "Order total is zero" };
  }
  if (
    ["refunded", "partially_refunded", "cancelled", "canceled"].includes(
      status,
    ) ||
    ["cancelled", "canceled", "refunded"].includes(order.status.toLowerCase())
  ) {
    return {
      action: "No payment action available",
      note: "Online payments are not available",
    };
  }
  return ["unpaid", "pending", "failed", "partially_paid"].includes(status)
    ? {
      action: "Pay Now · Coming Soon",
      note: "Disabled preview — no payment action available",
    }
    : {
      action: "Payment action unavailable",
      note: "Online payments are coming soon",
    };
}

export function renderMessage(job: Job, site: string, t: Templates): Message {
  const origin = siteOrigin(site), o = job.snapshot;
  const l = labels.en;
  const receiptOnly = !job.sandbox && job.kind === "customer" &&
    !o.recipientVerified;
  const documentLabel = job.kind === "admin"
    ? "NEW ORDER"
    : "ORDER CONFIRMATION";
  const frame = (content: string, title: string) =>
    fill(t.frame, {
      title,
      preheader: receiptOnly
        ? l.receiptHeading
        : documentLabel + " · #" + o.orderNumber,
      logo: origin + "/images/logo-bg.png",
      documentLabel,
    }, { content, css: t.css });
  const messageId = "<nestora-order-" + job.id + "@nestorahomelb.com>";
  if (receiptOnly) {
    // Deliberately interpolate NO snapshot data: even order ID/items/total remain private.
    return {
      to: job.recipient,
      replyTo: BUSINESS_MAILBOX,
      subject: l.receiptSubject,
      text: [l.receiptHeading, l.receiptBody, l.receiptNotice, BUSINESS_MAILBOX]
        .join("\n\n"),
      html: frame(fill(t.receipt, l), l.receiptSubject),
      messageId,
    };
  }
  const subject = job.kind === "admin"
    ? "New Order Received — #" + o.orderNumber
    : "Your Nestora Home Order Confirmation — #" + o.orderNumber;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: o.currency,
    currencyDisplay: "symbol",
  });
  const format = (value: number) => formatter.format(value);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Beirut",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(o.createdAt));
  const heading = job.kind === "admin"
    ? "A new order has arrived"
    : "Thank you for your order!";
  const introduction = job.kind === "admin"
    ? l.adminIntroduction
    : l.customerIntroduction;
  const lines = [
    documentLabel,
    heading,
    introduction,
    "Order #" + o.orderNumber,
    "Date: " + date + " (Asia/Beirut)",
    "Order total: " + format(o.total) + " " + o.currency,
  ];
  const action = paymentPresentation(o);
  lines.push(action.action, action.note);
  const rows = o.items.map((item) => {
    const name = englishCatalogLabel(item.name);
    const attributes = Object.entries(item.attributes).map(([key, value]) =>
      englishCatalogLabel(key) + ": " + englishCatalogLabel(value)
    );
    const variantLabel = englishCatalogLabel(item.variant);
    const variant = [
      // Prefer explicit English attributes over a redundant Arabic-only variant label.
      /\p{Script=Arabic}/u.test(variantLabel) && attributes.length &&
        attributes.every((value) => !/\p{Script=Arabic}/u.test(value))
        ? ""
        : variantLabel,
      item.sku ? "SKU: " + item.sku : "",
      ...attributes,
    ].filter(Boolean).join("\n");
    const badge = [item.gift ? l.gift : "", item.loyalty ? l.loyalty : ""]
      .filter(Boolean).join(" · ");
    lines.push(
      name,
      variant,
      "Qty: " + item.quantity + " × " + format(item.unitPrice) + " = " +
        format(item.total),
      badge,
    );
    const imageUrl = publicImageUrl(item.imageUrl, origin, SANDBOX_PROJECT_URL);
    const thumbnail = imageUrl
      ? fill(t.image, { imageUrl, name })
      : t.imagePlaceholder;
    return fill(t.item, {
      name,
      variant,
      badge,
      quantity: item.quantity,
      unit: format(item.unitPrice),
      total: format(item.total),
    }, { thumbnail });
  }).join("");
  const totalRows: Array<[string, string]> = [[l.subtotal, format(o.subtotal)]];
  if (o.discount || o.discountCode) {
    totalRows.push([
      l.discount + (o.discountCode ? " · " + o.discountCode : ""),
      format(o.discount ? -o.discount : 0),
    ]);
  }
  totalRows.push(["Shipping fee", format(o.shipping)]);
  if (o.paymentFee) totalRows.push([l.paymentFee, format(o.paymentFee)]);
  const renderDetails = (list: Array<[string, string]>) =>
    list.filter(([, value]) => Boolean(value)).map(([label, value]) => {
      lines.push(label + ": " + value);
      return fill(t.detail, { label, value });
    }).join("");
  const totals = renderDetails(totalRows) +
    fill(t.grandTotal, { total: format(o.total), currency: o.currency });
  lines.push("Total: " + format(o.total) + " " + o.currency);
  const statusLabels: Readonly<Record<string, string>> = {
    paid: "Paid",
    unpaid: "Unpaid",
    pending: "Pending",
    failed: "Failed",
    refunded: "Refunded",
    partially_refunded: "Partially refunded",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    partially_paid: "Partially paid",
  };
  const details: Array<[string, string]> = [[l.method, o.paymentMethod], [
    l.paymentStatus,
    statusLabels[o.paymentStatus.toLowerCase()] ?? o.paymentStatus,
  ]];
  // Full personal/customer information is for the fixed business mailbox only.
  if (job.kind === "admin") {
    details.push(
      [l.customerName, o.customerName],
      [l.email, o.email],
      [l.phone, o.phone || "Not provided"],
      [l.address, o.address],
      [l.instructions, o.instructions || "None provided"],
    );
  }
  const detailsHtml = renderDetails(details);
  const url = job.kind === "admin"
    ? origin + "/admin/orders?orderId=" + encodeURIComponent(o.id)
    : o.userId && o.recipientVerified
    ? origin + "/shop/customer-account/orders"
    : null;
  const actionLabel = job.kind === "admin" ? l.adminAction : l.customerAction;
  if (url) lines.push(actionLabel + ": " + url);
  const closing = job.kind === "admin"
    ? "Please review this order before fulfilment."
    : "Thank you for making Nestora Home part of your home.";
  lines.push(closing, l.paymentNotice, BUSINESS_MAILBOX);
  const content = fill(t.section, {
    heading,
    introduction,
    orderNumber: o.orderNumber,
    date,
    total: format(o.total),
    currency: o.currency,
    paymentAction: action.action,
    paymentActionNote: action.note,
    detailsHeading: job.kind === "admin"
      ? "Customer & payment details"
      : "Payment details",
    closing,
    paymentNotice: l.paymentNotice,
  }, {
    rows,
    totals,
    details: detailsHtml,
    action: url ? fill(t.action, { url, label: actionLabel }) : "",
  });
  return {
    to: job.recipient,
    replyTo: job.kind === "customer"
      ? BUSINESS_MAILBOX
      : mailbox(o.email.trim())
      ? o.email.trim()
      : undefined,
    subject,
    html: frame(content, subject),
    text: lines.filter(Boolean).join("\n"),
    messageId,
  };
}
