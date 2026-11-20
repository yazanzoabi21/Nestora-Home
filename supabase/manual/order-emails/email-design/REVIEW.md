# Order email design review — 20 November 2026

## Deployment status

Implemented locally only. No Edge Function deployment, database/schema change, checkout change, payment change, SMTP send, DNS change or Hostinger publication was performed for this redesign.

The deployed worker was downloaded to `.tmp/order-email-design-baseline/supabase/functions/order-email-worker` before editing. Its implementation matched the then-current local worker after line-ending normalization. Keep that ignored directory as the exact rollback source; do not replace it with the redesigned files.

Read-only production verification after implementation: enabled=true, send_enabled=true, automatic_confirmations_enabled=true, max_hour=10, max_day=60. Original activation cutoff remains `2026-11-19T22:31:14.206817+02:00`; automatic confirmation start remains `2026-11-20T10:09:34.560742+02:00`. Automatic production emails remain active with their existing deployed design.

## Implementation

- Shared 600px fluid table frame, inline essential styles, Outlook conditional table/96 DPI settings, mobile overrides, existing public logo, forest green/ivory/beige/subtle gold palette.
- Admin and authorized customer invoices show finalized snapshot prices, quantities, variants, SKU/attributes, gifts/loyalty lines, coupons, shipping, payment fees when present, total, order number/date and payment status. Prices are never recomputed from the current catalog.
- Pay Now is a disabled table cell with Coming Soon, not an anchor/form/payment URL. Paid orders show Payment received; zero totals and refunded/cancelled/unknown statuses have appropriate non-payment states.
- Admin includes checkout contact/address/notes and uses a validated customer Reply-To. Customer Reply-To remains info@nestorahomelb.com. Existing authenticated admin/account links remain separate from the disabled payment control.
- Existing bilingual catalog labels use their stored English segment. English attributes replace redundant Arabic-only variant captions when available. Arabic-only catalog data without an English counterpart is preserved rather than inventing a product translation; customer-entered names, address and notes are never translated. Static template copy is English only.
- Existing authorization remains decisive: unverified guest customers receive a branded minimal receipt, with no order number, items, amounts, customer details, private links or Pay Now. This design does not add OTP or expand recipient permissions.
- Optional thumbnail enrichment performs at most two read-only REST requests with a shared 2.5 second timeout. It uses saved order-item variant images first, then current product images when missing. No image lookup occurs for private guest receipts. Failure leaves a usable placeholder and cannot reject an otherwise valid email. URL allowlisting permits only public project storage and owned-site assets, excluding signed URLs, query strings, credentials and third-party origins.
- auth.ts, worker.ts, smtp.ts, production.ts and sandbox.ts remain identical to the downloaded deployed baseline after line-ending normalization. Webhook authorization, atomic claims, recovery, quota accounting, delivery outcomes and duplicate protection were not changed.

## Preview artifacts and validation

Open `output/order-email-design/admin-preview.html`, `customer-verified-preview.html` and `customer-private-preview.html` for desktop/mobile side-by-side views. Raw `.html`, plain `.txt` and locally generated multipart `.eml` files are alongside them. These contain only previously finalized, explicitly owned test orders sent to the business mailbox. Preview generation denies network/environment access and uses Nodemailer streamTransport, never SMTP.

The verified invoice uses actual saved $19 subtotal, NESTORA10 discount $1.90, $0 shipping and $17.10 total. The guest receipt uses the owned automatic-confirmation order without exposing its order data. Product thumbnails and logo are actual public assets, not illustrative substitutions.

Validation completed:

- Deno type check, lint, template-source/bundle consistency and production bundling passed.
- 31 worker tests passed both from source and from a bundled artifact, with filesystem/network/environment denied. Coverage includes recipient authorization, escaping/header injection, disabled payment states, gifts/zero-price lines, thumbnail URL validation and failures, minimal-guest privacy, concurrent replays, quotas, SMTP failure/uncertain recovery and signed webhook replay protection.
- Angular production build and Angular lint passed; build retains existing size/style/CommonJS warnings. This redesign changes no Angular source. Existing unrelated working-tree changes from preceding tasks were preserved.
- Browser layouts inspected at desktop, 390px and 320px; no horizontal overflow. Essential layout uses inline table styles rather than relying on media queries.
- Local multipart MIME round-trip validation confirmed plain text plus HTML and expected Reply-To. No new template has been sent through live SMTP yet.
- Public logo and two actual product images returned HTTP 200. Product PNGs are approximately 1.26/1.31MB and logo approximately 642KB; they can load slowly or be blocked by email-client image settings. Text and alt/placeholder fallbacks remain readable. The optional Supabase image-transform endpoint returned 403; no paid capability or storage setting was enabled.

Native Gmail, Outlook desktop and Apple Mail rendering/inbox delivery have not been tested. Browser previews and MIME/structural tests do not establish native-client compatibility or guarantee inbox placement. Realistic current HTML sizes are approximately 12.8KB admin, 10.8KB verified customer and 4.6KB minimal guest; very large orders can produce larger messages.

## Safe future deployment

1. Review the HTML previews, current source diff and this report. Keep the baseline rollback directory outside any public upload. Refresh the deployed download into a different timestamped directory if production has changed; do not overwrite the baseline. Compare auth/SMTP/workflow files before selecting the rollback version.
2. From the worker directory run `npx --yes deno task check`, `npx --yes deno lint`, `npx --yes deno task test`, `npx --yes deno task test:bundle`, `npx --yes deno task bundle:check` and `npx --yes deno task preview`. Validate the generated static JSON module is current. Check production quota headroom and pending/in-flight jobs using SELECT only.
3. After deployment is authorized, deploy only `order-email-worker` to project `ojismppptyrivnxnkcux`, retaining its existing JWT-verification configuration and signed-webhook protection. Do not run database push/migrations, deploy other functions, change email flags/secrets/quotas/cutoffs or upload preview files to public_html. No Angular publication is required for this worker-only redesign.
4. Download the deployed worker into a fresh verification directory and compare its module graph with the reviewed local version. Confirm ready/auth gates and optional image GET requests work with existing service-role SELECT privileges (verified present). Inspect sanitized function logs for rendering/SMTP errors without printing customer data or credentials.
5. Use one newly authorized test checkout with an owned address; never replay already accepted historical jobs. Confirm exactly one accepted admin job and one accepted customer job, correct Reply-To and payment status, readable images/totals, no OTP, and privacy-safe unverified receipt. Test an authorized detailed customer invoice with an owned verified address separately if needed. Inspect delivered messages in Gmail/Outlook/Apple Mail before calling native-client validation complete. Keep test orders clearly marked not for fulfilment.

## Rollback

If delivery or rendering regresses, redeploy only the previously downloaded worker from `.tmp/order-email-design-baseline` (or the newer verified predeployment snapshot selected above) using that directory as the CLI workdir and the same project/function configuration. Download/read back to confirm restoration. The rollback restores the active no-OTP workflow and old email design together; it requires no SQL rollback.

Do not disable the automatic email system, reset activation cutoffs, clear delivery ledgers, reset accepted/uncertain jobs, replay SMTP messages or migrate database objects during rollback. Existing atomic claims and recovery must continue handling in-flight jobs. Check subsequent owned-order delivery and active settings again after restoration.
