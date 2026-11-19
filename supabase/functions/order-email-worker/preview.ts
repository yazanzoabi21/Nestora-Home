// Layout-only previews show field placeholders, never invented product/customer data.
import labels from "./templates/labels.json" with { type: "json" };
import { escapeHtml, loadTemplates } from "./render.ts";
const t = await loadTemplates();
const fill = (
  source: string,
  values: Record<string, string>,
  slots: Record<string, string> = {},
) =>
  source.replace(
    /\[\[(\w+)\]\]|\{\{\s*(\w+)\s*\}\}/g,
    (_, slot: string, key: string) =>
      slot ? slots[slot] ?? "" : escapeHtml(values[key] ?? `{{${key}}}`),
  );
await Deno.mkdir("../../../.tmp/order-email-previews", { recursive: true });
for (const kind of ["admin", "customer"] as const) {
  const section = (language: "en" | "ar") => {
    const l: Record<string, string> = labels[language];
    const row = fill(t.item, {
      name: "{{product_name}}",
      variant: "{{variant_details}}",
      badge: "{{gift_or_loyalty}}",
      quantity: "{{quantity}}",
      unit: "{{unit_price}}",
      total: "{{line_total}}",
    });
    const totals = ["subtotal", "shipping", "paymentFee", "discount", "total"]
      .map((key) =>
        fill(t.detail, {
          label: l[key],
          value: `{{${key}}}`,
          className: key === "total" ? "grand-total" : "",
        })
      ).join("");
    const details = [
      "customerName",
      "email",
      "phone",
      "address",
      "instructions",
      "method",
      "paymentStatus",
    ].map((key) =>
      fill(t.detail, { label: l[key], value: `{{${key}}}`, className: "" })
    ).join("");
    return fill(t.section, {
      ...l,
      language,
      direction: language === "ar" ? "rtl" : "ltr",
      heading: l[kind === "admin" ? "adminHeading" : "customerHeading"],
      greeting: "{{customer_name}}",
      introduction:
        l[kind === "admin" ? "adminIntroduction" : "customerIntroduction"],
      orderNumber: "{{order_number}}",
      date: "{{order_date}}",
    }, {
      rows: row,
      totals,
      details,
      action: kind === "admin"
        ? fill(t.action, {
          url: "#approved-admin-order-link",
          label: l["adminAction"],
        })
        : "",
    });
  };
  await Deno.writeTextFile(
    `../../../.tmp/order-email-previews/${kind}.html`,
    fill(t.frame, {
      title: `Nestora Home — ${kind} layout preview (placeholders)`,
      logo: "../../public/images/logo-bg.png",
    }, { english: section("en"), arabic: section("ar"), css: t.css }),
  );
}
console.log(
  "Created admin.html and customer.html placeholder previews in .tmp/order-email-previews",
);
