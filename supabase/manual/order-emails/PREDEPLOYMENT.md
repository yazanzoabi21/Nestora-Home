# Pre-deployment review — 2026-11-19

HISTORICAL REVIEW: the stricter Stage 1 request supersedes the combined trigger/
cron installation below. Current 20 installs functions only; new 21 requires
separate Stage 2 approval. Public.orders FKs were removed from 10. See updated
ROLLOUT.md and BACKUP.md. No Stage 1 database work has yet been executed.

Only read-only production verification and local packaging changes were performed.
No extension installation, database write/migration, deployment, function call,
activation, new order or email. Target is ojismppptyrivnxnkcux, treated as production.

## Read-only production results

Executed 00_preflight.readonly.sql, 05_extension_permissions.readonly.sql and new
06_conflicts.readonly.sql using the CLI --read-only flag. Catalog inspection ran
as supabase_read_only_user. Last conflict baseline was captured at
2026-11-19T14:58:53.245390+02:00. No customer rows, Vault values or queue headers read.

- PostgreSQL 17.6. Installed Vault 0.3.1. Available but NOT installed: pg_net
  0.20.4 and pg_cron 1.6.4. pg_cron preload is present. Actual extension grants,
  net.http_post signature and cron execution identity need rechecking after the
  separately approved installation. No cron.job relation currently exists.
- No nestora_order_email/net/cron schema, proposed public RPC name or
  trg_order_email_signal conflict. No cron job can currently conflict because
  pg_cron is absent; repeat the name check if installation state changes.
- Existing address-notification trigger is enabled. Both reviewed notification
  and outer-checkout hashes match. All four protected order/payment tables have
  RLS enabled. Recorded eleven protected routine/ACL fingerprints and protected
  policy fingerprint 5d7a91d11ce7fdb6fe363c0e2eda54b8 for later comparison.
- anon/authenticated/service_role cannot CREATE in public. Current default
  public-function ACLs grant anon/authenticated EXECUTE, so the proposals' explicit
  revocations IN THE SAME TRANSACTION are essential. New RPC ACLs cannot be tested
  before installation. Existing six lower checkout overloads remain callable;
  the two named legacy entry points remain denied. No existing grant is changed.
- anon/authenticated cannot SELECT any column of vault.decrypted_secrets.
  Queue ACL inspection is not yet possible because pg_net is absent.
- Only hostinger-smtp-probe is deployed (ACTIVE version 13). Its two flags match
  false and expiry matches the epoch through digest-only checks. All five new
  ORDER_EMAIL_* secrets are absent. Root config remains probe-only.

40_postchecks and 50_operations are post-installation diagnostics, not applicable
preflights: their private relations do not exist. They were deliberately not
executed or reported as passing. Raw catalog baseline is in ignored
.tmp/order-email-package/preflight06.json; no credentials/customer data included.

## Docker-free packaging resolution

Original blocker: loadTemplates used Deno.readTextFile for HTML/CSS; Supabase's
--use-api deployment does not support static_files. HTML and CSS remain separate
authoritative files. package-templates.ts now deterministically creates
templates/bundle.generated.json, imported statically by render.ts alongside
labels.json. package:check rejects a stale generated module. No HTML/CSS strings
were moved into authored TypeScript and no runtime dependency was added.

Verified locally: 20 worker tests with runtime read/network/env denied, then the
same 20 tests from a single bundled JS file outside the source folder with those
permissions denied. Full index.ts graph bundles to 496.72 KB across 46 modules.
This validates local import closure, not the hosted compiler/runtime. The Deno
bundle tool is experimental and used only for validation; deployment uses the
reviewed CLI --use-api path, not the generated JS artifact. Read back imported
JSON modules/config/source after disabled deployment before approving capture.

References:
- https://supabase.com/docs/guides/functions/quickstart
- https://supabase.com/docs/guides/functions/limits
- https://docs.deno.com/examples/importing_json/

## Sandbox and public-order isolation

Reviewed unchanged logic: database mode/recipient/allowlist constraints lock the
mailbox, processing/send defaults are false, cutoff is NULL, and broad guest
recipient sending is prohibited. The worker separately checks exact project and
sandbox mode, processing/send flags, recipient, Reply-To and [TEST] subject at
the final transport boundary. SMTP envelope and headers contain only the mailbox.

The HTTP signal cannot authorize an order. Only the owner/service-only RPC can
enroll one finalized post-cutoff order, then authorize its two unchanged captured
jobs for 30 minutes. Claim/start recheck finalization, fingerprint/cutoff/permit.
Unenrolled public orders create no jobs/customer snapshots; an enabled trigger
would temporarily store IDs only. No backfill. Changing mode cannot switch this
worker to real recipients; retired proposal 31 raises unconditionally.

Offline tests verify transport/gating and mocked claims. Actual SQL role denial,
concurrency, webhook/cron recovery and final order data need approved installation
and capture. No SMTP/inbox proof for the new worker is claimed.

## Requested next approval and bounded risks

The exact executable sequence and secrets are in ROLLOUT.md section A:

1. Approve enabling pg_net/pg_cron, then repeat 00/05/06 and inspect their ACLs.
2. Configure five ORDER_EMAIL_* Edge values while both flags are false, and store
   only the new matching webhook token in Vault. Reuse existing server SMTP secrets.
3. Install 10, then 20 as postgres, both DB gates false. This creates one private
   schema, five tables/indexes/RLS/constraints, nine core functions plus two
   webhook functions, five service-only RPC grants, one independent trigger and
   one five-minute cron. Compare protected fingerprints and run 40/50 afterward.
4. Merge only proposed worker config, run packaging/tests, deploy ONLY
   order-email-worker with --use-api while disabled, and read back ACTIVE status,
   config/module sources and flags. No invocation or email is included.

No approval is requested yet for 30/32/33, capture activation, orders or sends.

FK/trigger DDL can briefly block orders; proposals 10/20 have 5-second lock and
30-second statement timeouts. Use a quiet window and stop on contention. The
enabled durable-ID insert can roll back a checkout if that database operation
fails; HTTP queue failures are caught and SMTP is outside checkout. Thus no
honest zero-impact guarantee follows from read-only review. Disabled state skips
signal work but still checks the private setting; the proposed cron performs
bounded private cleanup. Do not drop private objects while their trigger remains.

Pause/rollback targets only NEW email objects, never checkout, existing policies
or trg_notify_admin_new_order_from_address. Nevertheless trigger removal takes
a table lock (90 has 5-second lock timeout). Production installation/performance
and rollback concurrency remain unproven until approved controlled checks.

## Disable and rollback order

1. Set Edge SEND_ENABLED=false, then ENABLED=false (full ORDER_EMAIL_ names).
2. Execute approved 80_pause with bounded session lock/statement timeouts. It
   clears only private enabled/send gates and order permits. Read them back.
3. Drain/reconcile in-flight workers BEFORE 90, since 90 revokes finish too.
   Already-submitting SMTP may finish. Do not reset/replay uncertain jobs; stale
   processing/submitting states need reviewed owner reconciliation.
4. If removal is approved, execute 90: drop ONLY the new orders trigger,
   unschedule ONLY the new recovery job, revoke ONLY five new service RPCs.
   Preserve ledger/tombstones, orders/customer records, existing notifications,
   checkout functions, shared SMTP credentials, probe and extensions.
5. Re-run 00/06 and compare baseline fingerprints. After workers drain, revoke
   new webhook token/remove only worker if approved. Cron removal stops private
   retention; agree owner cleanup. Never use schema drop/reset as rollback.

Stop here for installation approval.
