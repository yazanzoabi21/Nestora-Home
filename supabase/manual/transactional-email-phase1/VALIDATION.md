# Phase 1 validation — 2026-11-19

Later metadata-review update: the user supplied the SQL Editor export captured
at 08:36:46 UTC. `METADATA_REVIEW.md` supersedes the original metadata-access
limitation below for the exported objects, while documenting missing helper and
hosted-function settings. The existing 10 offline probe tests were rerun and all
passed. No source code changed in that review, so the Angular build/lint results
below remain the earlier Phase 1 results, not a new execution. No SQL, deployed
SMTP test, secret configuration, deployment or email send was performed.

## Executed locally

- Deno 2.9.6: `deno task check` PASS for the Edge entrypoint and tests.
- `deno task test`: PASS, 10 tests; no network/environment/database permissions.
  Covers default-disabled/unauthorized behavior, non-sending verification,
  expiry, invalid/oversized input, separate send authorization, own-mailbox
  restriction, concurrent claims, consumed ambiguous attempts, safe failures,
  TLS-stage stopping and missing-secret failure.
- `deno lint`: PASS, 3 TypeScript files.
- `deno fmt --check`: PASS.
- `npm run build`: PASS. Initial bundle 662.77 kB exceeds warning budget 500 kB,
  below error budget 1 MB. Existing unrelated component-style and CommonJS
  dependency warnings remain. No Angular/npm dependency was added by this phase.
- `npm run lint`: PASS, all application files.
- GET-only public REST metadata request: HTTP 401. No business records, response
  body, key or credentials logged/saved. No mutation or business RPC invoked.

## Not executed / not established

- Live catalog SQL, triggers, policy/RPC grants and hosted function auth settings:
  blocked by lack of an authorized read-only management/database connection.
- Proposed permit SQL: reviewed locally only; not parsed/executed against a
  PostgreSQL instance. Actual ACL and concurrent-claim behavior remain staging
  acceptance checks. Unit-test claims are injected protocol simulations.
- No Supabase Edge Function deployed and no Edge Function secrets configured.
- No DNS/TLS/SMTP connection to Hostinger attempted from this machine or a
  deployed function. No SMTP credentials read, requested in chat or stored locally.
- No external test email sent; SMTP acceptance/inbox delivery not established.
- Supabase port-465 compatibility remains UNVERIFIED, not unsupported.
- No changes to existing checkout, notifications, migrations, RLS or production
  business logic. Pre-existing working-tree changes were left untouched.
- Branded order templates and automatic delivery implementation remain gated
  on deployed compatibility and live schema verification, per the approved scope.
