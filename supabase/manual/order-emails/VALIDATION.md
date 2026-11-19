# Sandbox preparation validation — 2026-11-19

## Backup-blocker resolution revision (current)

Native PostgreSQL 17.2 tools were located outside PATH; live server is 17.6.
Owner supplied Session Pooler and public CA details. The masked local backup
completed and was independently decrypted/hash/full-decode verified; see
BACKUP_RESULT.md and the external manifest/verification.json. No production DDL/deployment
is authorized during this backup-resolution task. See BACKUP.md for coverage,
encryption portability and restore limitations.

Local SQL changes: 20 now defines functions only; new 21 separately attaches
trigger/cron with a Stage 2 approval guard. Public.orders FKs were removed from
10 to avoid RI triggers/locks; service-only eligibility remains. New 41 verifies
no Stage 1 processing; 91 provides private-only Stage 1 pause/revoke.

Current checks: 16 SQL files / 20 routine bodies plus three negative activation/FK
regressions passed; 20 worker tests, Deno typecheck/lint, Angular production build
and Angular lint passed. Existing build warnings remain. PowerShell syntax and
DPAPI encryption/hash/corruption/protected-file and four read-only/identity
negative self-tests pass without database access. The observed session default
is off but the explicit metadata transaction and native pg_dump snapshot are
read-only. The old default-based check was corrected without relaxing TLS or
actual transaction validation. Native archive/role metadata are encrypted outside Git.

The following records describe earlier revisions; current backup status and new
Stage 1 scope supersede the earlier combined installation counts/instructions.

Local implementation ONLY. No production SQL writes, function deployment,
webhook activation, checkout test, worker invocation or email sending performed.
Existing SMTP connectivity/inbox success is prior owner-reported probe evidence.

## Executed checks for this revision

| Check | Result |
| --- | --- |
| Live preflight, explicitly production/read-only | Existing notification and outer-checkout hashes unchanged; original address notification trigger remains; new schema absent; pg_net/pg_cron absent; existing legacy overload permissions unchanged |
| Extension ACL inspection, read-only | Existing Vault decrypted view denies any-column SELECT to anon/authenticated. Queue and HTTP signature checks must be repeated after approved extension enablement; currently absent |
| Angular production build | Passed; initial 662.77 kB with existing 500 kB warning; existing component-style/CommonJS warnings; below error budget |
| Angular lint | Passed |
| Angular unit suite | 29 files, 161 tests passed; npm run test -- --watch=false |
| Worker strict typecheck | Passed |
| Worker offline tests | 20 passed, zero failures; no network/SMTP/database |
| Docker-free packaging | Generated JSON matches all six HTML/CSS sources; 20 tests also pass from a single bundled JS file outside the source folder, with runtime filesystem/network/environment permissions denied |
| Full worker graph build | Local Deno bundle of index.ts: 46 modules, 496.72 KB; no server invocation; not a deployed eszip validation |
| Existing SMTP probe | Strict typecheck and 10 regression tests passed; no invocation or network |
| Worker lint/format | Passed |
| SQL offline grammar | 13 files and 19 SQL/PLpgSQL bodies parsed; no SQL executed |

New tests verify two capture renders without SMTP/start calls, zero delivery when
send disabled despite a forged send-mode job, invalid/missing sandbox identity,
actual-customer recipients denied, fixed test subjects/Reply-To, and independent
final transport denial for wrong mode/project/flags/recipient/header fields.
Existing tests cover real-value arithmetic checks, gifts/loyalty, EN/AR escaping,
safe links, unpaid wording, unauthorized/forged events, duplicate-claim simulations,
separate recipient failures, stale claims, explicit rejection, ambiguous DATA,
QUIT/unknown-stage failure and SMTP acceptance followed by a DB-write failure.

## Reproduce

In supabase/functions/order-email-worker/:

```text
deno task check
deno task test
deno task test:bundle
deno task bundle:check
deno lint
deno fmt --check
deno task preview
```

In the repository root:

```text
npm run build
npm run lint
npm run test -- --watch=false
deno run --no-config --no-lock --node-modules-dir=none --allow-read --allow-env --allow-ffi supabase/manual/order-emails/validate-sql.ts
git diff --check
```

The isolated SQL parser flags avoid inheriting Angular node_modules resolution.
Validation-only packages use SQL grammar v17 and PLpgSQL wrapper v18, not runtime
worker dependencies. First use downloads parser packages into Deno's cache.

## Evidence retained and limits

Earlier read-only inspection verified https://nestorahomelb.com and its logo
return 200, deployed checkout explicitly writes USD and payment currency defaults
to USD. Source checkout formatting is USD. No historical customer rows were read.
Hostinger MX/SPF/DKIM records exist; DMARC p=none is monitoring-only. Account
connector requires reconnection to confirm actual plan/usage; published limits
are not proof of this mailbox's remaining allowance. See historical discovery.

Both production probe flags were rechecked as false through secret digests;
the expiry was previously verified at the epoch and is unchanged. New order-email
enabled/send/mode secrets are absent. Root config remains probe-only, and activation
31 is now a local unconditional refusal. No real-recipient path is deployable.

PostgreSQL is unavailable locally. Docker is no longer needed for template
packaging: loadTemplates imports the generated JSON module, not static files.
The official --use-api deployment still requires explicit approval, and its
hosted runtime/source graph must be checked while disabled. SQL grammar and mocked atomic-claim
tests DO NOT prove installed function resolution, RLS/ACL behavior, real SQL
concurrency, cron/webhook dispatch or production performance. Those require the
approved installation and controlled test in ROLLOUT.md. Verify both rendered
captures against actual saved test-order prices/variants/discounts/gifts/fees,
then separately approve two sends and confirm actual inbox receipt/layout.

No new runtime dependencies, Angular components/state or responsive behavior were
changed. Existing unrelated customer UI/environment working-tree edits were
preserved. The email templates keep their existing responsive EN/AR layout.

Required next approvals: extensions/private schema and disabled worker deployment;
capture activation/new cutoff and one exact new test order; then, only after
capture/permission checks, its two-message send and immediate pause. Real customer
and guest delivery needs separate future implementation/policy approval.
