import labels from "./templates/labels.json" with { type: "json" };
import bundle from "./templates/bundle.generated.json" with { type: "json" };
import { BUSINESS_MAILBOX, type Job, mailbox, type Message } from "./model.ts";

export interface Templates {
  frame: string;
  section: string;
  item: string;
  detail: string;
  action: string;
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
export function renderMessage(job: Job, site: string, t: Templates): Message {
  const origin = siteOrigin(site), o = job.snapshot;
  const subject = job.kind === "admin"
    ? `New Order Received — #${o.orderNumber}`
    : `Your Nestora Home Order Confirmation — #${o.orderNumber}`;
  const textSections: string[] = [];
  const section = (language: "en" | "ar"): string => {
    const l: Record<string, string> = labels[language];
    const formatter = new Intl.NumberFormat(
      language === "ar" ? "ar-LB" : "en-US",
      {
        style: "currency",
        currency: o.currency,
        currencyDisplay: "code",
      },
    );
    const format = (n: number) => formatter.format(n);
    const date = new Intl.DateTimeFormat(
      language === "ar" ? "ar-LB" : "en-GB",
      {
        timeZone: "Asia/Beirut",
        dateStyle: "long",
        timeStyle: "short",
      },
    ).format(new Date(o.createdAt));
    const heading =
      l[job.kind === "admin" ? "adminHeading" : "customerHeading"];
    const greeting = job.kind === "admin"
      ? "Nestora Home"
      : `${l["greeting"]} ${o.customerName}`;
    const introduction =
      l[job.kind === "admin" ? "adminIntroduction" : "customerIntroduction"];
    const lines = [
      heading,
      greeting,
      introduction,
      `${l["orderLabel"]} #${o.orderNumber}`,
      date,
    ];
    const rows = o.items.map((i) => {
      const variant = [
        i.variant,
        i.sku,
        ...Object.entries(i.attributes).map(([key, value]) =>
          `${key}: ${value}`
        ),
      ].filter(Boolean).join("\n");
      const badge = [i.gift ? l["gift"] : "", i.loyalty ? l["loyalty"] : ""]
        .filter(Boolean).join(" · ");
      lines.push(
        `${i.name}\n${variant}\n${i.quantity} × ${format(i.unitPrice)} = ${
          format(i.total)
        } ${badge}`,
      );
      return fill(t.item, {
        name: i.name,
        variant,
        badge,
        quantity: i.quantity,
        unit: format(i.unitPrice),
        total: format(i.total),
      });
    }).join("");
    const totalRows: Array<[string, string, string?]> = [
      [l["subtotal"], format(o.subtotal)],
      [l["shipping"], format(o.shipping)],
      [l["paymentFee"], format(o.paymentFee)],
    ];
    if (o.discount || o.discountCode) {
      totalRows.push([
        `${l["discount"]} ${o.discountCode}`,
        format(-o.discount),
      ]);
    }
    totalRows.push([l["total"], format(o.total), "grand-total"]);
    const details: Array<[string, string]> = [
      [l["customerName"], o.customerName],
      [l["email"], o.email],
      [l["phone"], o.phone],
      [l["address"], o.address],
      [l["instructions"], o.instructions],
      [l["method"], o.paymentMethod],
      [l["paymentStatus"], l[o.paymentStatus.toLowerCase()] ?? o.paymentStatus],
    ];
    const renderDetails = (list: Array<[string, string, string?]>) =>
      list.filter(([, value]) => Boolean(value)).map(
        ([label, value, className]) => {
          lines.push(`${label}: ${value}`);
          return fill(t.detail, { label, value, className: className ?? "" });
        },
      ).join("");
    const totals = renderDetails(totalRows),
      detailsHtml = renderDetails(details);
    // Guests/unverified checkout contacts receive no account/order link.
    const url = job.kind === "admin"
      ? `${origin}/admin/orders?orderId=${encodeURIComponent(o.id)}`
      : o.userId && o.recipientVerified
      ? `${origin}/shop/customer-account/orders`
      : null;
    const actionLabel =
      l[job.kind === "admin" ? "adminAction" : "customerAction"];
    if (url) lines.push(`${actionLabel}: ${url}`);
    lines.push(l["paymentNotice"], BUSINESS_MAILBOX);
    textSections.push(lines.join("\n"));
    return fill(t.section, {
      ...l,
      heading,
      greeting,
      introduction,
      orderNumber: o.orderNumber,
      date,
      language,
      direction: language === "ar" ? "rtl" : "ltr",
    }, {
      rows,
      totals,
      details: detailsHtml,
      action: url ? fill(t.action, { url, label: actionLabel }) : "",
    });
  };
  const english = section("en"), arabic = section("ar");
  return {
    to: job.recipient,
    replyTo: job.kind === "customer"
      ? BUSINESS_MAILBOX
      : mailbox(o.email.trim())
      ? o.email.trim()
      : undefined,
    subject,
    html: fill(t.frame, {
      title: subject,
      logo: `${origin}/images/logo-bg.png`,
    }, { english, arabic, css: t.css }),
    text: textSections.join("\n\n--------------------\n\n"),
    messageId: `<nestora-order-${job.id}@nestorahomelb.com>`,
  };
}
