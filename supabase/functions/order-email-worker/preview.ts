// Read-only preview input must be captured from explicitly owned, finalized test orders.
// No SMTP/network/env access: streamTransport builds local MIME without delivering anything.
import nodemailer from "nodemailer";
import { BUSINESS_MAILBOX, parseJob } from "./model.ts";
import { escapeHtml, loadTemplates, renderMessage } from "./render.ts";
import { withProductImages } from "./product-images.ts";
import { SANDBOX_PROJECT_URL } from "./sandbox.ts";
const input = "../../../.tmp/order-email-design-baseline/preview-data.json";
const output = "../../../output/order-email-design";
const raw: unknown = JSON.parse(await Deno.readTextFile(input));
if (!Array.isArray(raw) || raw.length !== 3) {
  throw new Error("Three owned preview records required");
}
const templates = await loadTemplates();
const gallery = await Deno.readTextFile(
  new URL("./preview-gallery.html", import.meta.url),
);
await Deno.mkdir(output, { recursive: true });
const transport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: "unix",
});
for (const value of raw) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid preview entry");
  }
  const entry = value as Record<string, unknown>;
  const name = String(entry["name"]);
  if (!["admin", "customer-verified", "customer-private"].includes(name)) {
    throw new Error("Invalid preview name");
  }
  const job = parseJob(entry["job"]);
  if (
    job.recipient !== BUSINESS_MAILBOX ||
    job.snapshot.email !== BUSINESS_MAILBOX
  ) throw new Error("Owned business mailbox only");
  const decorated = await withProductImages(
    job,
    (path) =>
      Promise.resolve(
        path.startsWith("/rest/v1/order_items")
          ? entry["items"]
          : entry["products"],
      ),
    "https://nestorahomelb.com",
    SANDBOX_PROJECT_URL,
  );
  const message = renderMessage(
    decorated,
    "https://nestorahomelb.com",
    templates,
  );
  await Deno.writeTextFile(output + "/" + name + ".html", message.html);
  await Deno.writeTextFile(output + "/" + name + ".txt", message.text);
  const info = await transport.sendMail({
    from: { name: "Nestora Home", address: BUSINESS_MAILBOX },
    ...message,
  });
  if (!(info.message instanceof Uint8Array)) {
    throw new Error("Buffered MIME output required");
  }
  await Deno.writeFile(output + "/" + name + ".eml", info.message);
  const previewTitle = name === "admin"
    ? "Nestora Home — New Order"
    : name === "customer-verified"
    ? "Nestora Home — Order Confirmation"
    : "Nestora Home — Private Guest Receipt";
  await Deno.writeTextFile(
    output + "/" + name + "-preview.html",
    gallery.replaceAll("{{name}}", escapeHtml(name)).replaceAll(
      "{{previewTitle}}",
      escapeHtml(previewTitle),
    ),
  );
  console.log(
    JSON.stringify({
      preview: name,
      htmlBytes: new TextEncoder().encode(message.html).length,
      thumbnails: decorated.snapshot.items.filter((item) =>
        item.imageUrl
      ).length,
      sent: false,
    }),
  );
}
transport.close();
