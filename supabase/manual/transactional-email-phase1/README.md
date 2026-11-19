# Phase 1 — isolated Hostinger SMTP preparation

CURRENT STATUS: isolated probe DEPLOYED, ACTIVE version 1, with SMTP probing and
sending both disabled and expiry 1970-01-01T00:00:00Z verified. See
`DEPLOYMENT_RESULT.md`. No function invocation, SQL, email or automatic order
email activation occurred. The preparation/access history below is superseded
by that result where it describes deployment status.

Status: LOCAL PREPARATION ONLY. No function deployed, no secrets configured, no
SQL executed, no Hostinger connection/authentication attempted, no email sent.
Automatic order emails, webhooks and recovery schedules are NOT configured.

Deployment-preparation update: the user has authorized only the isolated probe
deployment. `../../../supabase/config.toml` now contains its local deploy config.
CLI 3.2.0 requires interactive account login before deployment can proceed.
See `DEPLOYMENT.md` for the actual blocked status, project-reference evidence,
disabled-setting verification and exact single-function commands. No deployment
or invocation has occurred in this preparation step.

Update: the user supplied a deployed metadata export captured 2026-11-19 at
08:36:46 UTC. See `METADATA_REVIEW.md` for the current verified findings,
corrections to repository-based assumptions, and exact Dashboard preparation
steps. The initial evidence below records the earlier access limitation and is
superseded by that review for the objects included in the export. No live SQL
was executed by the agent; no runtime authorization/SMTP test has been performed.

## Verification evidence and limits

- Existing checkout uses `CustomerCheckoutOrderService` -> `place_customer_order`.
  SQL overloads create the order/address/items/payment transaction and finalize
  discounts, loyalty, gifts and shipping before commit. Use committed database
  data, never browser totals or the initial order INSERT payload.
- Admin notifications remain independent: `AdminNotificationsService` reads and
  marks records in `notifications`. Repository security drafts reference
  `notify_admin_new_order` and `notify_admin_new_order_from_address`; drafts are
  not proof of their currently deployed bodies, trigger bindings or ACLs.
- No Supabase management connector, authenticated CLI, database connection, or
  metadata export is available in this session. The existing metadata inbox
  contains only its README and ignore file. No credential acquisition attempted.
- A GET-only OpenAPI metadata request to the configured production REST endpoint
  using the existing public app key returned HTTP 401. No response body, key,
  customer records or secrets were printed or saved. This does not establish
  whether schema, grants, RPCs or triggers are correct. No mutating RPC was called.
- Live schema/RLS/trigger/RPC/hosted-function authorization verification: BLOCKED
  pending authorized read-only metadata access. SMTP deployed compatibility:
  NOT TESTED. Do not infer a port block from the absence of a test.
- Deno was obtained through the npm cache for local tooling only; no Angular
  dependency or npm package/lockfile was changed. Nodemailer 10.6.0 is scoped to
  the isolated function, pinned with an integrity lock. Local Deno compatibility
  does not prove compatibility with the deployed Supabase runtime.

## Read-only deployed inspection

In the approved project's SQL Editor, run `00_inspect_orders.readonly.sql` as an
authorized DBA. This is one catalog-only SELECT; it reads no customer records,
secret-store values or Auth sessions. It includes columns, indexes, constraints,
order-related triggers and their functions, checkout overloads (including the
renamed shipping wrapper), RLS/policies, function/table/column grants, ownership,
role memberships and relevant extensions.

Also reuse `../security-audit-2026-11-16/00_consolidated_readonly_metadata.sql`
for application policy helpers/dependencies beyond the focused order inventory.
Check all overloads and helper paths; public checkout RPCs are intentionally
available for guests, while internal notification functions must not be callable
as arbitrary business RPCs. Verify actual direct order-write permissions rather
than treating a checkout token as sufficient provenance.

Review/redact existing embedded credential literals in definitions/trigger
arguments BEFORE sharing any export. Use the existing ignored
`../security-audit-2026-11-16/deployed-metadata/` inbox; never commit exports.
Separately obtain an authorized READ-ONLY function inventory/config and exposed
API schema settings; SQL catalogs cannot prove gateway JWT configuration.
No new login, token configuration or production change is authorized by this file.

## Probe safety and secrets

`../../functions/hostinger-smtp-probe/` contains an isolated Edge Function using
Nodemailer over `smtp.hostinger.com:465`, implicit TLS, minimum TLS 1.2,
certificate/SNI validation, bounded network waits, no pooling and no SMTP debug
logging. It independently checks DNS and TLS, then uses `verify()` for SMTP
connectivity/authentication without a message. Only `send-once` calls `sendMail`.

Configure values ONLY through the approved project's Supabase Edge Function
Secrets UI. Do not create a local SMTP `.env`, put values in shell commands,
source code, invocation query strings, Git, Angular, screenshots or chat.

| Secret name | Value/configuration |
| --- | --- |
| `SMTP_USERNAME` | Full existing Hostinger business mailbox |
| `SMTP_PASSWORD` | Mailbox SMTP password, entered directly in Supabase secrets |
| `SMTP_PROBE_ENABLED` | Absent/false until an approved verification window |
| `SMTP_PROBE_TOKEN` | Independently generated random token, at least 32 characters |
| `SMTP_PROBE_EXPIRES_AT` | UTC timestamp in the future, at most 24 hours away |
| `SMTP_PROBE_SEND_ENABLED` | Absent/false until a separately approved one-email test |
| `SMTP_PROBE_SEND_TOKEN` | Separate random token, at least 32 characters |
| `SMTP_PROBE_RECIPIENT` | Must equal SMTP_USERNAME; no other recipient is accepted |
| `SMTP_PROBE_RUN_ID` | Fresh UUID for the single approved send attempt |

The platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are needed
only for the persistent send permit. Never expose them or accept them from callers.
Do not enable SMTP/verbose request/header logging during invocation.

The proposed config deliberately uses `verify_jwt = false` because this probe
authenticates a dedicated server-only secret, not customer JWTs. Every invocation
must pass handler authentication; user JWTs/public API keys alone authorize nothing.
There is no CORS support and no recipient/content/order-data override.

## Exact approval gates and sequence

1. Identify the approved staging Supabase project and business mailbox. Supply
   authorized read-only metadata access/export, or run the catalog SELECTs there.
   No secret values are required in chat.
2. Approve configuring the listed Edge Function secrets directly in Supabase.
   Initially leave both enable flags false. This step has NOT been performed.
3. Approve deployment of ONLY `hostinger-smtp-probe` to the named project. Review
   `function-config.proposed.toml`; it is not an active CLI configuration. The
   command after approval is `supabase functions deploy hostinger-smtp-probe
   --project-ref <APPROVED_PROJECT_REF> --no-verify-jwt`. No webhook, cron or order
   function is deployed. A production-project deployment needs explicit approval.
4. Approve a short verification window: enable only `SMTP_PROBE_ENABLED`, set
   expiry, then manually invoke POST with header `x-smtp-probe-token` and JSON
   `{"mode":"verify"}`. Do NOT invoke from Angular. Expected successful response:
   completed DNS/TLS/SMTP-auth stages and `emailSent:false`.
5. ONLY after connectivity succeeds, approve the NEW probe-only objects in
   `probe-permit.proposed.sql` on that target. This creates an isolated schema,
   RLS-enabled consumption table with no browser policies/grants, and one
   service-role-only claim RPC. It does not alter any existing policy or order
   object. Without these objects, sending fails closed at the claim stage.
6. Separately approve ONE external email to the exact configured own business
   mailbox. Set send enable/token/run secrets. Invoke once with the same probe
   header plus `x-smtp-send-token` and `{"mode":"send-once"}`. Do not retry with a
   new run ID without renewed approval. The DB permit atomically allows at most
   one sendMail attempt per run across isolates/restarts. There is no retry loop.
7. Confirm the message actually arrives; inspect full headers for SPF/DKIM/DMARC
   alignment and correct sender/Reply-To/Arabic UTF-8 content. SMTP acceptance
   alone is NOT inbox delivery. This probe is plain text; branded HTML inbox
   rendering belongs to the later template implementation.
8. Disable BOTH flags immediately; remove temporary probe tokens, revoke/delete
   the isolated function after recording sanitized results. Retain consumed-run
   evidence until the probe is disabled/removed. Do not drop/clear that ledger
   while sending can still run. Cleanup of deployed objects needs approval.

These are approval instructions, not authorization to execute them. No action in
steps 1-8 requiring new access, secrets, SQL writes, deployment or an external
message has been taken.

## Failures and compatibility decision

Responses expose only stage, allowlisted error code and completed stages, never
raw exceptions, server responses, credentials or recipient addresses. Failures
are classified as DNS, TLS, SMTP-auth, claim or SMTP-send. A timeout after a claim
is ambiguous: the permit stays consumed and the result says
`unknown_do_not_retry`. A crash after a claim can also lose this test message;
this is intentionally at-most-one attempt, not an exactly-once delivery guarantee.

Supabase documents outbound port 25/587 restrictions, not a blanket port-465 ban.
DNS failure, bad credentials, invalid certificate, missing claim RPC and a socket
timeout are different failures; do not label them all an unsupported SMTP port.
Record the deployed runtime/project/region, stage and sanitized code before
deciding. A local TCP success never proves Edge Function egress compatibility.

If deployed port 465/native SMTP is incompatible, the simplest no-BFF alternative
is a transactional HTTPS email API called server-side from the Edge Function with
the same verified business From address and customer Reply-To. Keep the Hostinger
mailbox/MX for replies, preserve existing DNS and approve any provider/DNS/secrets
change separately. This keeps the address, but changes the outbound provider.
If outbound delivery must itself remain through Hostinger SMTP, a dedicated
server-side SMTP worker is an alternative, with extra hosting/operations; it need
not sit in the checkout request path.

## Conditional next phase — not implemented or activated

Final order-mail implementation waits for successful DEPLOYED compatibility and
live authorization review. Proposed components:

- Orders INSERT database webhook -> authenticated order-mail Edge Function.
  Never trigger from dashboard read/unread changes or broad order UPDATE events.
- Re-read completed server-side order/address/items/payment snapshots; require
  verified checkout provenance. Reuse existing names, amounts, currency,
  variants, gifts and loyalty semantics; never accept email details from clients.
- A restricted per-order/per-email-kind ledger with a unique constraint, atomic
  claims, independent admin/customer status and capped retries with backoff for
  definitely-unsent failures. Treat SMTP-acceptance uncertainty as a separate
  review state; a stable Message-ID is not provider idempotency.
- Fixed business sender/admin recipient. Admin Reply-To uses validated checkout
  email; customer confirmation goes to that same checkout contact, including
  guests. Do not substitute changing profile data silently.
- Separate branded EN/AR HTML template files and plain-text alternatives,
  escaped server data, RTL Arabic sections and readable money/payment labels.
  No persisted locale was found; bilingual receipts initially avoid changing
  checkout. Confirm initial transactional-receipt treatment separately from the
  existing optional `order_updates` preference.
- Scheduled reconciliation recovers missed webhook events from an activation
  cutoff; no historical bulk send. Preserve checkout RPCs and dashboard
  notifications and their RLS/ACL behavior.
- Staging regression coverage: guest/authenticated checkout, tokens/replays,
  discounts, variants, loyalty/gifts, rolled-back orders, spoofed requests,
  concurrent workers, partial delivery failure, missed webhooks, ambiguous SMTP,
  and responsive EN/AR inbox rendering.

No automatic order-mail function, migration, webhook or schedule is included in
this phase. Generating production-ready bindings before the schema/transport
gates pass would rely on unverified assumptions.

## Local validation

From `supabase/functions/hostinger-smtp-probe`, using Deno 2:

```text
deno task check
deno task test
deno lint
deno fmt --check
```

Tests use synthetic protocol fixtures and injected operations, with NO network,
environment or database permissions. They do not connect to Hostinger or send
mail. Database claim concurrency and SQL must still be executed/tested in the
approved staging database; handler simulations do not prove database behavior.

Also run repository `npm run build` and `npm run lint`. See the final chat report
for actual command results; this document does not claim live SMTP validation.

## References

- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/function-configuration
- https://nodemailer.com/guides/using-deno
- https://nodemailer.com/smtp
- https://support.hostinger.com/en/articles/1575756-how-to-get-email-account-configuration-details-for-hostinger-email
- https://www.rfc-editor.org/rfc/rfc5321
