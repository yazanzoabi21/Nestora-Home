# Same-project sandbox installation and test — explicit approval required

Target ojismppptyrivnxnkcux is PRODUCTION even before launch. Stage 1 approval is
conditional on verified recovery readiness; the current backup-resolution task
permits read-only backup and local refactoring ONLY. Do not execute any database
write/deploy step during that task. Never use db push/config push, all-function
deployment, prune/reset, existing-customer orders or historical backfill.

## A. Disabled installation and deployment

1. Confirm target and run 00, 05 and 06 readonly preflights. Both function hashes must
   match and new schema must be absent. Stop on drift/existing objects. Preserve
   current lower checkout RPC grants; do not replace the dashboard trigger.
   Retain 06's table ACL/RLS, routine and policy fingerprints as the baseline
   for comparison after installation/rollback. If cron.job already exists on a
   later run, also check the proposed job name read-only before installation.
2. Approve enabling pg_net and pg_cron (absent in current metadata). Dashboard ->
   Database -> Extensions: enable each separately. Verify net.http_post supports
   timeout_milliseconds, cron execution identity, and private queue headers/Vault
   access. Do not weaken extension grants to resolve errors.
   Run 05_extension_permissions.readonly.sql: queue/Vault anon/authenticated read
   flags must all be false and timeout_milliseconds must be supported. Proposal
   20 also refuses installation if either role can read any sensitive column.
3. Dashboard -> Edge Functions -> Secrets: retain SMTP_USERNAME equal to
   info@nestorahomelb.com and SMTP_PASSWORD. Never retrieve/copy credentials into
   source, CLI arguments, files, logs, screenshots or chat. Add these privately:

   | Secret | Initial value |
   | --- | --- |
   | ORDER_EMAIL_ENABLED | false |
   | ORDER_EMAIL_SEND_ENABLED | false |
   | ORDER_EMAIL_MODE | sandbox |
   | ORDER_EMAIL_SITE_URL | https://nestorahomelb.com |
   | ORDER_EMAIL_WEBHOOK_TOKEN | NEW random 32-byte token encoded as 64 hex characters |

   Store the SAME new token in Dashboard Vault as ORDER_EMAIL_WEBHOOK_TOKEN.
   Do not embed it in SQL. Platform SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY remain
   server-injected; no frontend keys or Auth SMTP changes. Keep the probe flags
   false and SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z.
4. After a verified backup and explicit installation authorization, SQL Editor
   as postgres: execute 10, then 20 (FUNCTIONS ONLY), then
   read-only 40, 41 and 50. All Stage 1 safety booleans must be true; both DB gates false. Confirm locked sandbox/allowlist,
   new-table RLS, direct API-role access denied and five service-only public RPCs:
   authorize, prepare, claim(boolean), start, finish. PUBLIC/anon/authenticated
   must have no EXECUTE; only service_role and trusted owner may call them.
   Existing checkout/notification hashes and policies must remain unchanged.
   No public.orders foreign keys are added: the two proposed references were
   removed to avoid application-table RI triggers/locks. RPC eligibility still
   validates committed orders; orphan private records cannot authorize sending.
   Do NOT execute 21 in Stage 1. No trigger is attached and no cron job exists.
5. After deployment approval, merge ONLY function-config.proposed.toml's worker
   section into supabase/config.toml, preserving the probe. Do not add static_files.
   HTML/CSS source files now generate a statically imported JSON module; no
   runtime template file reads or Docker bundling are required. From the worker
   directory run the packaging checks, then deploy ONLY the named function from
   the repository root:

   ```text
   deno task package
   deno task check
   deno task test
   deno task test:bundle
   deno task bundle:check
   ```

   ```powershell
   npx --yes supabase@3.2.0 functions deploy order-email-worker --remote=ojismppptyrivnxnkcux --use-api --no-verify-jwt --yes
   npx --yes supabase@3.2.0 functions list --remote=ojismppptyrivnxnkcux --output json
   ```

   --use-api is now intentional. Include templates/bundle.generated.json and
   labels.json in the imported source graph. The generated bundle freshness check
   must pass; never hand-edit generated template content. Local Deno bundling is
   validation only, not the CLI's deployed eszip; remote packaging remains to be
   confirmed by the approved disabled deployment/source read-back before capture.
   verify_jwt=false uses mandatory x-order-email-token authentication. Public keys
   or user JWTs alone never authorize work. Read back ACTIVE version/config/assets
   with all gates false, without invoking the worker or sending a health email.
   Inspect that both imported JSON modules and sandbox.ts are present. Do not
   turn on processing to diagnose a missing template module.

## B. Separate capture approval — one NEW named order

Before capture, obtain separate Stage 2 approval for attaching the new trigger
and scheduling recovery. Keep both DB/Edge sending/processing gates false, set
nestora.order_email_hooks_approved='yes' and paste 21_activate-hooks.proposed.sql
in that SAME approved SQL Editor script. This is the ONLY file that attaches
trg_order_email_signal and schedules nestora-order-email-recovery. Confirm the
original dashboard notification trigger is unchanged, then follow capture steps.

1. Keep ORDER_EMAIL_SEND_ENABLED=false and DB send_enabled=false throughout.
   Set ORDER_EMAIL_ENABLED=true only after capture approval. In one SQL Editor
   script/session, set the flag and paste proposal 30 below it:

   ```sql
   set nestora.order_email_activation_approved = 'yes';
   -- Paste reviewed 30_sandbox-activation.proposed.sql in this SAME script.
   ```

   Record its fresh cutoff. It enables capture only, fixes verified USD, locks
   recipient to the business mailbox, and budgets at most two send attempts per
   hour and rolling day. Ordinary public orders are never automatically enrolled.
2. Approve ONE ordinary new test order. Use real current products/prices and the
   business mailbox as checkout contact; guests need no registration. Obtain its
   real UUID via the normal Admin Dashboard/owner view. Confirm checkout success
   and existing dashboard notification. Do not alter/delete customer records,
   force lower RPCs, or reuse an order created before this cutoff.
3. Enroll ONLY that approved UUID. In one SQL Editor script:

   ```sql
   set nestora.order_email_test_order_id = '<actual approved NEW order UUID>';
   set nestora.order_email_enroll_approved = 'yes';
   -- Paste reviewed 32_enroll-test-order.proposed.sql in this SAME script.
   ```

   It reopens the durable signal and queues a post-commit capture wake. The
   original INSERT webhook may already have discarded the unapproved ID; explicit
   enrollment safely recovers that case. Cron also recovers every five minutes.
4. Expect two captured jobs, attempts=0, no SMTP references/reservations. Worker
   loads, validates and renders before marking captured. Owner-only inspection:

   ```sql
   select email_kind,state,attempts,captures,captured_at,snapshot
   from nestora_order_email.deliveries
   where order_id = '<actual approved NEW order UUID>'::uuid;
   ```

   Compare each snapshot to final committed order/items/payment/address: prices,
   subtotal, discount, gifts, loyalty, variants, shipping, fees, total and USD.
   Preview actual approved values with the existing renderer locally WITHOUT
   SMTP if needed. Keep exports ignored/private; never post snapshots in chat.
   Layout previews in .tmp/order-email-previews/ are placeholders, not data proof.
5. For approved replay/authorization checks, Dashboard -> Edge Functions -> worker
   -> Test: POST, Content-Type application/json, x-order-email-token entered
   privately; body {"mode":"recover"}. A wrong/missing token must yield 401.
   Correct replay must leave two jobs/zero sends. The token cannot enroll orders.
   Use 40/50 readonly queries and the acceptance matrix before send approval.

## C. Separate approval for TWO messages to the mailbox

1. Approve the exact order and subjects [TEST] New Order / [TEST] Order Confirmation.
   Both To/envelope/Reply-To addresses are info@nestorahomelb.com. Customer contact
   remains escaped in the body but cannot become a recipient or Reply-To.
2. Keep Edge send false while authorizing in SQL Editor:

   ```sql
   set nestora.order_email_test_order_id = '<same approved NEW order UUID>';
   set nestora.order_email_send_approved = 'yes';
   -- Paste reviewed 33_authorize-test-send.proposed.sql in this SAME script.
   ```

   It requires two unchanged captured jobs/zero attempts, opens a fixed 30-minute
   permit for this order and enables DB send gating. Claim/start recheck current
   finalization, cutoff, fingerprint and permit. Authorization replay cannot renew
   attempted jobs. Do not reset states, reservations or tombstones to force sends.
3. Set ORDER_EMAIL_SEND_ENABLED=true as the FINAL approved step. Next approved
   recovery/cron sends the two jobs. Initial quota permits only two send attempts
   per rolling day; a definite failure may therefore defer the other message.
   Stop and review instead of increasing budgets/retrying an uncertain outcome.
   Extra orders, verification messages, resends or increased budgets need approval.
4. Expect separate accepted states/stable Message-IDs and sanitized SMTP queue
   references when available. Edge time limits may leave the second job for the
   next recovery cycle. Replays cannot create a third job. Owner verifies actual
   inbox receipt separately, plus subjects, values, EN/AR/RTL/mobile layout, links,
   Reply-To and SPF/DKIM/DMARC alignment. Capture is never counted as delivery.
5. Immediately disable ORDER_EMAIL_SEND_ENABLED and ORDER_EMAIL_ENABLED, then
   execute reviewed 80_pause.proposed.sql. Read back both DB gates false/permits
   cleared. Reconcile already-submitting calls; disable cannot retract SMTP.

## D. Immediate disable and scoped rollback

Emergency pause: both Edge flags false, then 80_pause.proposed.sql. No checkout
or original notification change. Preserve orders/contacts/delivery tombstones.

For Stage 1 ONLY (no trigger/schedule attached), use 91_stage1_rollback.proposed.sql
after disabling the Edge flags. It touches only private state and new RPC grants,
never issues DROP TRIGGER on orders, and refuses if Stage 2 hooks exist. Keep shared
extensions and existing business objects. The following 90 removal is for later
Stage 2/3 only, after separate approval and worker reconciliation.

For separately approved removal, wait for active workers to drain/reconcile AFTER
pausing and BEFORE running 90: it revokes finish too, so revoking it during an
in-flight send could prevent acceptance recording. Never reset a stale claim to
force sending; expired processing/submitting rows need reviewed reconciliation.
Then run 90. It removes ONLY the new
trigger/recovery cron and revokes five new service RPCs. After workers drain,
revoke the new Vault/Edge token and remove ONLY order-email-worker if approved.
Keep shared SMTP credentials, probe, existing policies/functions and extensions.
Cron removal stops automatic retention; agree owner cleanup. Reinstallation needs
a reviewed forward change; do not rerun CREATE scripts over existing data.

## Remaining proof and future production

Installation ACL/extension checks, hosted module packaging, actual capture, SQL concurrent
claims/lease recovery and inbox proof remain unexecuted. Probe compatibility and
offline mocks do not establish these. Real customer delivery requires separate
code/migration and guest-policy review: this worker/schema cannot switch recipients
through a setting, and proposal 31 is retired. No production activation is approved.

## Production risks and exact approval scope

Stage 1 authorization covers, only after verified backup: enabling pg_net/pg_cron; five new private
tables and their indexes/RLS/constraints; nine ledger/eligibility/authorization
functions plus two webhook/trigger functions; five public service-only RPC
grants; five ORDER_EMAIL_*
Edge secrets and a matching new Vault token; merging the worker-only config and
deploying ONLY the disabled worker. This excludes proposals 21/30/32/33,
new orders, invocation, capture activation, SMTP or customer delivery.

No existing checkout function, notification trigger or policy is replaced.
The public.orders FKs were removed and Stage 1 does not attach a trigger or cron.
It creates only private tables and service-only functions, without orders writes
or exclusive application-table locks. Keep bounded lock_timeout=5s and
statement_timeout=30s; stop on contention or unexpected schema needs. Stage 2
trigger DDL does lock orders and requires a separately approved quiet window. The enabled
trigger's durable-ID insert is transaction-local and its failure can roll back
checkout; HTTP enqueue failures are caught. Disabled trigger processing only
reads its own setting. Never drop the private schema while the trigger remains.

Pausing changes only private email state; 90 drops only the new orders trigger,
not the existing address-notification trigger. Trigger removal also needs a
table lock (90 uses lock_timeout=5s). For an approved pause, apply bounded session
lock/statement timeouts before 80 and stop if it times out; Edge gates must stay
false. Re-run 00/06 after pause/removal and compare protected hashes/policy/ACL
baseline. No orders, customers or acceptance tombstones are deleted. Live
checkout performance, installed ACLs and rollback concurrency cannot be proven
by catalog inspection alone; they remain controlled post-installation checks.

Packaging references:
- https://supabase.com/docs/guides/functions/quickstart (API deployment without Docker)
- https://supabase.com/docs/guides/functions/limits (static-file limitation)
- https://docs.deno.com/examples/importing_json/ (static JSON modules)
