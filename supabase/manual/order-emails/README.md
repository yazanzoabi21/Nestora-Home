# Order email implementation

Current implementation and operating procedures are described in
[PRODUCTION.md](PRODUCTION.md). The owner subsequently authorized production
implementation, controlled testing and activation. The sandbox notes below are
historical and do not describe the current production-capable code.

## Historical sandbox notes

The owner's same-project sandbox request supersedes the earlier separate-staging
plan. No remote writes, deployments, activation or sending are authorized yet.
Use ROLLOUT.md; STAGING_REHEARSAL.md is historical discovery.

The prior implementation lacked an independent final SMTP recipient restriction,
per-order enrollment and capture-only stage. This revision adds all three.

## Invariants

- SMTP From, To, envelope and Reply-To are fixed to info@nestorahomelb.com. Both
  copies use distinct [TEST] subjects. No Cc/Bcc/recipient override is accepted.
  A bad transport recipient is rejected, not rewritten. The renderer cannot
  bypass the independently checked final transport. No new runtime dependency.
- ORDER_EMAIL_MODE must equal sandbox and SUPABASE_URL must equal the approved
  project URL. There is no real-customer delivery branch. Wrong/missing settings
  fail closed. SQL constraints lock mode/allowlist/recipient. Retired proposal 31
  always raises; a configuration change cannot activate customer delivery.
- Independent Edge enabled/send flags and DB enabled/send_enabled gates.
  Capture renders/validates actual committed snapshots without SMTP, start calls,
  send attempts or mailbox quota reservations. Captures are bounded to five.
- Only post-cutoff order-ID signals are queued by the independent INSERT trigger;
  dispatch occurs after commit. Unenrolled public orders receive no jobs/customer
  snapshots. Their transient identifiers are cleaned in bounded batches after
  one day. No historical-order scan/backfill exists.
- Owner/service-only order_email_sandbox_authorize(id,false) enrolls ONE finalized
  committed order after cutoff and stores its snapshot fingerprint. It reopens
  the signal if the original unapproved event was already discarded. The HTTP
  webhook credential cannot enroll or authorize an order.
- Capture creates separate admin/customer jobs addressed only to the mailbox.
  Each is rendered and marked captured. authorize(id,true) separately requires
  two unchanged captured jobs and zero send attempts; its permit lasts 30 minutes.
  Current eligibility, cutoff and fingerprint are rechecked at claim and start.
- Unique(order_id,email_kind), atomic claims, claim UUID fencing, bounded retry
  and recovery remain. Ambiguous SMTP acceptance never auto-replays. Existing
  submitting calls may finish during disable. SMTP cannot guarantee exactly-once
  inbox delivery across the database/network acceptance boundary.
- Guest checkout needs no registration for these sandbox copies. The broad
  unverified-customer switch is constrained false. General guest verification
  remains a separate proposal; no actual guest address can receive email here.

## Preserved functionality

No Angular source, existing checkout RPC, original dashboard trigger, existing
RLS or Auth SMTP setting is changed. Checkout never awaits HTTP/SMTP. The durable
ID insert is transactional local DB work; its failure can roll back checkout,
which needs installation rehearsal. HTTP enqueue errors are caught; recovery
uses indexed durable signals. Existing dashboard notifications remain separate.

EN/AR templates still use actual stored prices/fees/discounts, real variants,
zero-price gifts/loyalty, label-only product fallback and escaped dynamic values.
Both HTML and plain text remain. USD fallback and site origin were verified
read-only. Sandbox Reply-To intentionally stays the mailbox; the underlying
future production Reply-To renderer is tested offline but is not deployable as
real-customer delivery in this revision.

## Modified local files

Worker: index.ts, model.ts, worker.ts, sandbox.ts and worker.test.ts. render.ts
now imports a generated JSON template module. package-templates.ts derives it
from the separate HTML/CSS sources; check prevents stale generated data. This
removes runtime filesystem reads and allows Docker-free --use-api deployment.
Root deployment config remains probe-only until explicit deployment approval.

SQL: 05 extension ACL check; 06 catalog/conflict/fingerprint preflight;
10 ledger/constraints/approvals/RPCs; 20 webhook
and recovery functions with a queue/Vault access guard, WITHOUT attachment or invocation;
new 21 is the separately approved Stage 2 trigger/cron activation;
30 capture activation; new 32 enroll, 33 authorize, 80 pause; 40 postchecks;
90 rollback; 31 retired. validate-sql.ts checks every proposal. Documentation and
acceptance matrix are updated. Nothing is added to supabase/migrations.

Public.orders foreign keys are intentionally omitted from the two new ID tables
to avoid RI triggers/application-table DDL locks in Stage 1. Eligibility checks
remain service-only. Deleted/unavailable orders cannot pass claim/start; private
orphan IDs are harmless, and terminal payload retention remains bounded.

See BACKUP.md and backup-readonly.ps1 for the free Windows logical-backup workflow.
No password is accepted as a script argument or saved to a credential file.

Read ROLLOUT.md for exact setup and approvals, VALIDATION.md for executed checks
and runtime gaps, and STAGING_VALIDATION.md for the sandbox acceptance matrix.
