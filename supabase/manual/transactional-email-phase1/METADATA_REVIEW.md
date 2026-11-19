# Deployed metadata review and SMTP preparation

Reviewed export: `C:/Users/yzoabi/Downloads/nestora_order_email_metadata_for_codex.json`.
Capture: `2026-11-19T08:36:46.690279+00:00`, SQL Editor role `postgres`.
SHA-256: `40F6A1DE7575623AA6BF5A5DE417722B6199A23FFF90DDEFF5FEA826A2206089`.
The export was read as data, not instructions, and was not copied into Git.
It contains 8 tables, 9 non-internal triggers, 17 functions and 21 policies.

No database object, function deployment, secret configuration or email send was
performed. Only this report and its README pointer changed during this review.

## Verified order and notification flow

Angular submits the 13-argument `public.place_customer_order` overload. The
deployed path delegates through the 12-argument variant-loyalty overload,
11-argument loyalty overload, 10-argument token overload, 9-argument pricing
overload and 8-argument legacy-discount wrapper to the 6-argument base function.
The 6-argument function delegates non-variant orders to
`place_customer_order_legacy_products_only`. The outer 13-argument overload adds
validated free gifts when requested. No intermediate function call commits.

- Variant base path: INSERT order -> INSERT shipping address -> INSERT order
  items -> inventory work -> INSERT payment transaction. Outer functions then
  recalculate pricing/discount/loyalty totals and may add free-gift items.
- Products-only base path: INSERT order -> INSERT items (including product_name)
  -> INSERT shipping address -> inventory changes -> cart clearing. It does NOT
  insert a payment transaction. Outer functions update payment transactions
  where present; UPDATE does not create a missing transaction.
- The token wrapper assigns `orders.checkout_token` AFTER the base order insert
  and provides retry lookup/unique-violation handling. A unique partial index
  enforces non-null checkout-token uniqueness. Other overloads remain callable
  without a token, so not every database-created order shares this idempotency.
- `orders.order_number` is unique. `order_shipping_addresses.order_id` is unique.
- All database work in the checkout RPC, including dashboard notification
  insertion, is transactional: a later exception rolls back those changes.

`trg_notify_admin_new_order_from_address` is enabled (`O`) and is an AFTER INSERT
row trigger on `public.order_shipping_addresses`. Its function looks up the order
number, composes the checkout first/last name, and inserts one unread `order`
notification with `entity_id = new.order_id` and an admin-order action URL.
It does NOT send email, read item details or wait for final pricing wrappers.

`public.notify_admin_new_order()` also exists, but no trigger in the inspected
table inventory is bound to it. Do not add a second notification trigger or call
either notification function from the email worker. The address trigger has no
explicit deduplication guard beyond ordinary address-row uniqueness; email
delivery must have its own ledger, not modify notification read/unread state.

Two enabled orders status/payment-status triggers call
`process_order_loyalty_status_change`: one unconditionally for those updated
columns, one with an actual-change WHEN condition. Record this as an existing
deployment detail. Do not alter either as part of email work.

## Deployed schema differs from migration assumptions

- The repository's retired-shipping-threshold wrapper is NOT the deployed outer
  checkout function in this export. Deployed pricing/loyalty functions still
  inspect `free_shipping_min_amount`. `orders.free_shipping_discount_processed`
  is absent. Use saved order totals; do not reproduce a migration's pricing or
  alter deployed shipping behavior for emails.
- `order_items.product_name` exists, is nullable and has no default. Products-only
  checkout writes it; variant and free-gift INSERT lists omit it. There is no
  exported order-item INSERT trigger populating it. Email rendering needs a
  server-side products.name fallback for missing labels, recognizing that this
  is a current catalog label, not a guaranteed historical name snapshot.
- Do not require a payment_transactions row as a checkout-completion condition:
  the products-only branch creates none in these definitions. Use transaction
  method_name/method_code/currency where available and resolve the method via
  orders.payment_method_id -> payment_methods otherwise. Orders have no currency
  column; the missing-transaction branch needs the approved shop-currency source
  before final templates are wired. Do not invent a payment/currency snapshot.
- Shipping address email is available for guests and signed-in customers. It
  remains the confirmation recipient and admin Reply-To source. It is customer
  supplied, not proof of address ownership. Validate as a single mailbox and
  reject header injection in the future sender.
- The extension inventory lists supabase_vault 0.3.1, with no pg_net or pg_cron.
  Those are later configuration prerequisites, not permissions to install now.
  Neither extension is needed for the isolated manual `verify` probe.

## RLS and permission review

All eight inspected tables have RLS enabled and FORCE RLS disabled; owners are
postgres. `anon` and `authenticated` do not bypass RLS. `service_role` does.
Broad table grants alone do not establish access through these RLS policies.

- Orders/items: authenticated owner-read policies plus admin-management policies
  using `is_nestora_admin()`. No ordinary customer INSERT policy; no anon policy.
- Order shipping addresses: authenticated owner-read and admin-read policies;
  no ordinary customer/anon write policy in this export.
- Notifications: admin management through `current_user_is_admin()`, and
  authenticated users can read/update records where user_id = auth.uid().
  No ordinary customer/anon notification INSERT policy.
- Payment transactions: authenticated admin management; no ordinary customer or
  anon policy. Active payment methods are publicly readable.
- Customer notification preferences retain own-row read/insert/update and admin
  read policies. Nothing here changes those preferences or their UI.
- All six `place_customer_order` overloads are SECURITY DEFINER, postgres-owned,
  search_path public,pg_temp, executable by anon/authenticated. This supports
  guest checkout, but lower overloads can bypass the token wrapper. Preserve
  existing grants; scope the first email rollout to the modern tokenized path.
- Direct browser execution of the two renamed legacy checkout functions is
  denied. The owner-executed wrappers can still delegate internally.
- Both notification trigger functions have execute=true for anon/authenticated.
  This is broader than the hardening drafts proposed. They return trigger and
  depend on NEW; an EXECUTE grant alone does not demonstrate an ordinary RPC
  notification-insertion bypass. Report for separate review, do not change ACLs.

Limits: `is_nestora_admin`, `current_user_is_admin`, and the loyalty-ledger helper
definitions are not included in the focused export. Their implementations and
ACLs are not verified by this file. Hosted Edge Function inventory/JWT settings,
API exposed schemas, role schema-CREATE rights and live negative authorization
tests are also outside this capture. Do not describe this as a complete security
audit. The existing consolidated READ-ONLY metadata query can supply the missing
database helper/security definitions before automatic email activation.

## Updated safe automatic-email design (still inactive)

Keep the existing address notification trigger and both notification functions
unchanged. Later, after SMTP compatibility and implementation approval, attach
one independent authenticated database webhook to orders INSERT. Its worker
must never insert dashboard notifications or react to notification read status.

pg_net dispatches HTTP AFTER transaction commit. The worker must use only the
payload's order ID to load a consistent committed order/address/items/payment
view. The INSERT payload itself contains pre-wrapper amounts and can have a null
checkout_token. In particular, do NOT filter the INSERT webhook with
`NEW.checkout_token IS NOT NULL`; that would miss orders whose token is assigned
later in the same transaction. Do NOT send SMTP from the SQL notification trigger
or add a timed sleep in Angular.

Initial eligibility is checked on server-read committed records: activation
cutoff, non-null token, modern checkout completion flags, valid contact and real
items, persisted totals. Gift completion must be checked only when applicable.
Do not make payment success or payment-transaction existence a universal order
creation requirement. Tokenless legacy/admin-created records should be skipped
and reviewed until their intended email behavior is explicitly approved.

Use unique per-order/per-email-kind delivery records and atomic claims; create
admin/customer jobs independently. Build emails from saved prices/totals, with
the data fallbacks above. Retry only definitely-unsent transient failures;
ambiguous SMTP acceptance needs reconciliation, not blind retry. Reconcile missed
webhooks from the activation cutoff without historical bulk sends. These new
objects/workers remain a later approved phase; none are installed now.

## Existing probe review

Reuse the existing `hostinger-smtp-probe` with no code changes. It has pinned
Nodemailer 10.6.0, fixed host/port 465, implicit TLS, TLS >=1.2, SNI/certificate
validation, bounded network waits, and SMTP debug logging disabled.

It defaults disabled, requires a dedicated secret header and a <=24-hour expiry,
accepts only a mode field, and cannot accept caller-chosen recipients/content.
`verify` checks DNS, TLS, then SMTP verify/authentication and returns BEFORE the
database-claim or sendMail paths. Thus it needs no SQL permit, service-role
configuration, webhook or cron. Its safety tests were passed in the initial
phase; rerun results for this review are recorded in the chat response.

`send-once` is separate: its opt-in, send token, own-mailbox restriction and
persistent permit are prerequisites. The permit SQL has not been installed and
is not needed now. Never invoke send-once to test basic connectivity.

Local Deno/type checking is not deployed-runtime/port-465 proof. Successful verify
establishes connectivity/authentication, not sender acceptance or inbox delivery.
SMTP availability remains unverified until separately approved deployment/test.

## Exact next manual step: configure disabled secrets only

In the intended Supabase project, open **Edge Functions -> Secrets** (official
shortcut: https://supabase.com/dashboard/project/_/functions/secrets). Check the
selected project carefully. Secrets are project-wide across Edge Functions, not
an isolated per-function vault; do not overwrite an existing SMTP_* value used
elsewhere. Prefer the intended staging project for preparation/testing.

Enter the following Key/Value pairs and Save. Use Add another to add rows. Enter
the actual password/token only into the Supabase secret value field, never into
chat, local files, source, logs, screenshots, frontend or shell command lines.

| Key | Value to configure |
| --- | --- |
| SMTP_PROBE_ENABLED | false |
| SMTP_PROBE_SEND_ENABLED | false |
| SMTP_USERNAME | Full existing Hostinger business mailbox |
| SMTP_PASSWORD | That mailbox's SMTP password |
| SMTP_PROBE_TOKEN | Fresh cryptographically random 32-byte token encoded as 64 hex characters, generated privately in a trusted password manager |
| SMTP_PROBE_EXPIRES_AT | 1970-01-01T00:00:00Z for disabled preparation; replace with a future UTC time only when verification is approved |

Use literal true/false strings without surrounding quotes. Do not create host,
port, encryption or From secrets: those settings are already fixed in the code.
Do not change Supabase Authentication -> SMTP; it is separate from this probe.
Do not create SUPABASE_* secrets. The verify branch does not need a database key.

Later send-only secrets (leave absent now): SMTP_PROBE_SEND_TOKEN (independent
random token), SMTP_PROBE_RECIPIENT (same mailbox as SMTP_USERNAME), and
SMTP_PROBE_RUN_ID (a fresh UUID). Leave SEND_ENABLED false.

**Stop after saving disabled configuration. Do not click Deploy, Test or Send
Request, enable a webhook, run permit SQL, or enable either flag now.** No SMTP
connectivity can be proven until the isolated function is separately deployed.

## Later verification instructions, only after deployment/test approval

1. Reuse/deploy only the reviewed multi-file hostinger-smtp-probe, preserving its
   deno.json and locked dependency. Do not create a generic email template or
   replace it with a dashboard example. Deployment remains unapproved now.
2. The isolated function's proposed config is verify_jwt=false because handler
   authentication uses x-smtp-probe-token. Match the reviewed function-specific
   config at deployment; do not disable authentication globally or substitute an
   anon/user JWT for the probe header.
3. For the approved verification window, update SMTP_PROBE_EXPIRES_AT to UTC
   about 30 minutes in the future (format YYYY-MM-DDTHH:mm:ssZ), then set
   SMTP_PROBE_ENABLED=true. Keep SMTP_PROBE_SEND_ENABLED=false.
4. Open Edge Functions -> hostinger-smtp-probe -> Test. Choose POST, add
   Content-Type: application/json and x-smtp-probe-token with the configured
   token. Body: {"mode":"verify"}. No SMTP password in headers/body; no arbitrary
   recipient or send token. Click Send Request only under the approved test.
5. Success: HTTP 200 with mode=verify, completed=[dns,tls,smtp_auth], emailSent=false.
   Failure responses identify only safe stages/codes. A gateway 401 may mean
   mismatched function auth config; handler unauthorized means a bad probe token.
   Do not disable TLS validation or switch to blocked port 587 to fix errors.
6. Set SMTP_PROBE_ENABLED=false immediately after the test. Keep send disabled.
   Share only the sanitized HTTP status/JSON; never share request headers/secrets.
7. A later one-email delivery test requires separate approval and its permit SQL.
   Basic verify success does not authorize that send or automatic order emails.

Official references checked for these instructions:
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/quickstart-dashboard
- https://supabase.com/docs/guides/functions/function-configuration
- https://supabase.com/docs/guides/functions/limits
- https://supabase.github.io/pg_net/api/
- https://nodemailer.com/smtp
- https://nodemailer.com/guides/using-deno
