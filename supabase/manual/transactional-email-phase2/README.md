# Phase 2 — one Hostinger SMTP delivery test (approval pending)

CURRENT UPDATE: the user approved preparation only. Permit SQL is now installed;
all 14 catalog permission checks passed; the subject-updated probe is ACTIVE
version 6 with both enable flags false and expiry reset/verified at the 1970
baseline. See `PREPARATION_RESULT.md` for actual evidence and next manual steps.
The actual email test remains unapproved and has NOT been invoked. Installation
and deployment instructions below record the original plan; do not repeat them.

## Current evidence and scope

The user reports the deployed verification succeeded for DNS, TLS and SMTP
authentication with emailSent=false. Accept this as the completed connectivity
gate. It is not evidence that a message has been accepted or delivered yet.

Read-only CLI checks during preparation found hostinger-smtp-probe ACTIVE version
4. A source download into ignored `.tmp/smtp-probe-phase2-review` was compared
against the local probe: handler.ts and deno.json are byte-identical; index.ts
differs only in the newly requested subject, edited locally during this phase.
The deployed version still has the previous bilingual compatibility-test subject.
The source download made no hosted changes and invoked no function.

Both SMTP_PROBE_ENABLED and SMTP_PROBE_SEND_ENABLED were verified false by secret
digest comparison. SMTP_PROBE_EXPIRES_AT does not match the 1970 disabled baseline;
its actual value was not retrieved. Neither enable flag nor expiry was changed.

No SQL executed, no deploy performed, no secrets written, no email sent. No
checkout, existing RLS policy, notification trigger or automatic email flow changed.
The only proposed RLS configuration is on a NEW isolated permit table; it creates
no policies and does not change any existing table's RLS.

## Reviewed one-use SQL

Use the existing `../transactional-email-phase1/probe-permit.proposed.sql` only
after explicit approval. The local proposal was hardened to require postgres as
the trusted BYPASSRLS owner and set bounded SQL/lock timeouts. It deliberately
uses CREATE without OR REPLACE/IF NOT EXISTS: a name collision fails rather than
overwriting an unreviewed deployed object.

It creates ONLY:

- Private schema nestora_email_probe, denying application-role schema access.
- consumed_runs table, primary key run_id, RLS enabled, no browser policies and
  no direct application grants, including no direct service_role table access.
- public.claim_nestora_smtp_probe(uuid), SECURITY DEFINER owned by postgres,
  search_path=pg_catalog, fully qualified private table reference, static SQL,
  EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role.

The function atomically INSERTs the UUID with ON CONFLICT DO NOTHING. Its boolean
return permits only the winning request to call sendMail. The claim commits in
its own REST request before SMTP submission. Repeated/concurrent calls with the
same server-configured run UUID cannot produce another sendMail call.

The table/function/REVOKE operations are in one transaction, closing the default
PUBLIC function-EXECUTE privilege window described by PostgreSQL. No SQL call
from Angular is introduced. The RPC accepts only a UUID and can neither send
mail nor read SMTP credentials.

Limits: this is at-most-one SMTP submission attempt PER RUN, not guaranteed
exactly-once inbox delivery. A crash/timeout after a claim consumes it permanently
even if no mail arrives. Do not clear claims, generate a replacement UUID or
automatically retry a failed/ambiguous test. A stable Message-ID helps identify
the message; it is not an SMTP idempotency guarantee. A different UUID intentionally
permits another attempt, so authorizing a new run is a new decision.

The SQL is reviewed locally, NOT executed or integration-tested in PostgreSQL.
After approval/installation, run `01_verify_probe_permissions.readonly.sql` and
require every boolean to be true. These SELECTs inspect catalogs only and do NOT
call the claim RPC. A false/missing result or SQL error blocks sending.

## Prepared message and recipient

From name: Nestora Home.
Subject: **Nestora Home — SMTP Test** (fixed in local index.ts).
Body: the existing brief EN/AR technical-test notice, explicitly not an order.
From, To, Reply-To and the single SMTP envelope recipient are all SMTP_USERNAME.
No CC/BCC, caller-chosen message, product/customer data, attachment, or tracking.

The handler additionally requires SMTP_PROBE_RECIPIENT to match SMTP_USERNAME;
it still uses the SMTP username itself to construct the actual envelope/message.
Thus the test cannot be redirected to a different configured recipient. Validate
the actual full business mailbox in your own Dashboard before approving the send;
its plaintext value is not available to the CLI/agent.

SMTP credentials remain only in the existing Supabase secrets. No password is
copied, rotated, requested in chat, passed in an invocation or written locally.

## Exact sequence AFTER explicit approval

All steps below are pending. Do not execute them based only on this preparation
document. Approve the named project and the one own-mailbox test first.

1. Confirm project ojismppptyrivnxnkcux and keep BOTH enable flags false. Set
   SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z as the preparation baseline.
2. In that project's SQL Editor, as postgres, execute the reviewed existing
   probe-permit.proposed.sql ONCE. Do not run checkout/order migrations or change
   any existing policy. If permit objects already exist, stop for read-only
   inspection; do not delete/recreate or bypass a collision.
3. Execute only the catalog SELECTs in 01_verify_probe_permissions.readonly.sql;
   confirm all booleans true. Do NOT call claim_nestora_smtp_probe as a dry run.
4. Deploy ONLY the reviewed subject update to the existing probe, while disabled:

   ```powershell
   Set-Location -LiteralPath 'C:\Users\yzoabi\Projects\Angular\Nestora-Home'
   npx --yes supabase@3.2.0 functions deploy hostinger-smtp-probe --remote=ojismppptyrivnxnkcux --no-verify-jwt --use-api --yes
   npx --yes supabase@3.2.0 functions list --remote=ojismppptyrivnxnkcux --output json
   ```

   Read back the deployment metadata; do not invoke another verify test or deploy
   any other function. Keep the existing x-smtp-probe-token authentication.
5. Dashboard -> Edge Functions -> Secrets. Retain the existing SMTP_USERNAME,
   SMTP_PASSWORD and SMTP_PROBE_TOKEN. Configure the three send-only values below
   without sharing them in chat, local files, logs, screenshots or shell arguments:

   | Secret | Required value |
   | --- | --- |
   | SMTP_PROBE_RECIPIENT | The exact authenticated Hostinger business mailbox, same as SMTP_USERNAME |
   | SMTP_PROBE_SEND_TOKEN | Independently generated random 32-byte value encoded as 64 hex characters, retained privately |
   | SMTP_PROBE_RUN_ID | A fresh UUID for THIS ONE APPROVED attempt; never reuse/reset consumed claims |

   Generate the non-secret UUID with `[guid]::NewGuid().ToString()` if desired.
   Generate the secret token privately in a trusted password manager. Do not use
   the original probe token as the send token. Ensure the platform-injected
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are available to the deployed
   function; do not create, print or copy new SUPABASE_* secrets.
6. Prepare the Dashboard test request BEFORE enabling. You need the original
   SMTP_PROBE_TOKEN from private storage; the CLI secret hash is not its value.
   No original token is currently available to the agent, so do not assume the
   agent can invoke on your behalf. Do not replace/bypass authentication silently.
7. For the approved short window, set SMTP_PROBE_EXPIRES_AT to UTC ~30 minutes
   ahead and SMTP_PROBE_ENABLED=true. Set SMTP_PROBE_SEND_ENABLED=true LAST, once
   the permit, recipient, new run UUID and authenticated request are ready.
8. Dashboard -> Edge Functions -> hostinger-smtp-probe -> Test:

   - HTTP method: POST.
   - Content-Type: application/json.
   - x-smtp-probe-token: original probe token.
   - x-smtp-send-token: new independent send token.
   - Body exactly: {"mode":"send-once"}.
   - No recipient/password/subject/UUID override in the body or query string.

   Click Send Request EXACTLY ONCE. Do not click again or run a separate
   unauthorized/duplicate test against the live endpoint. No automatic retries.
9. IMMEDIATELY after the request finishes or fails, BEFORE checking Webmail,
   restore and save ALL controls, regardless of HTTP result:

   ```text
   SMTP_PROBE_ENABLED=false
   SMTP_PROBE_SEND_ENABLED=false
   SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z
   ```

   Independently verify these values via CLI digest comparison or Dashboard
   control-value read-back. Do not invoke the function to prove it is disabled.
   Retain the consumed-run evidence; never clear it to retry. After disablement,
   remove the temporary SMTP_PROBE_SEND_TOKEN if approved as test cleanup.

## Separate acceptance and inbox checks

Expected successful response:

```json
{
  "mode": "send-once",
  "completed": ["dns", "tls", "smtp_auth"],
  "smtpAccepted": true,
  "inboxDelivery": "requires_manual_confirmation"
}
```

The code requires one accepted recipient and zero rejected recipients before
returning smtpAccepted=true. Do not treat HTTP 200 alone or a consumed permit as
delivery evidence. On HTTP 502 with runConsumed=true, acceptance may be unknown;
on HTTP 409, the run was already consumed. Neither authorizes another attempt.
No raw SMTP error/response or secret value is exposed by the handler.

After disabling, open Hostinger Webmail for the authenticated mailbox. Find the
single message with the exact subject and test time, and check its From/To,
plain-text EN/AR body and Message-ID:
`<nestora-smtp-probe-RUN_UUID@MAILBOX_DOMAIN>`. Verify it is actually in Inbox;
a message found only in Spam is arrival evidence but not an Inbox pass. Check
Spam and Sent for diagnosis, but a Sent copy alone does not prove delivery.
Inspect authentication headers if available. A self-addressed mailbox test does
not establish external-domain deliverability.

Actual inbox verification needs the user to open Webmail/confirm receipt or
separately authorized read-only mailbox access. No such mailbox connection is
currently available to the agent. Share only sanitized status/receipt evidence;
never forward request tokens, passwords or full headers with sensitive data.

Record separately: SMTP accepted yes/no/unknown; actual Inbox receipt yes/no;
number of matching messages; request/run identifier; controls restored yes/no.
If no mail appears, diagnose this run without sending again or replacing its UUID.

## Approval scope required

Approve ONLY: installing the new isolated permit objects and checking their
permissions, deploying the subject-only probe update while disabled, configuring
the send-only secrets and short window, ONE send-once request to the exact own
business mailbox, immediate disablement/read-back and agreed temporary-token
cleanup. This does not approve automatic order emails, customer emails, webhook
or cron setup, any existing RLS/checkout/notification change, or a second attempt.

## Validation and references

Executed for this preparation: Deno type check PASS; all 10 offline handler tests
PASS; Deno lint and format check PASS; Angular production build PASS with the
existing 662.77 kB initial-bundle warning, unrelated style-budget warnings and
CommonJS warnings; full application lint PASS. No credentials were used by those
tests. The SQL proposal and catalog-check SQL were not executed or verified
against PostgreSQL; their live permissions remain an after-approval gate.

Offline handler tests cover unauthorized requests, same-mailbox restriction,
single atomic claim winner, replay denial, claim failure and ambiguous SMTP
failure without resending. They simulate claims and are not PostgreSQL proof.
No SQL was executed as part of preparation. See the chat report for actual
Deno/build/lint results for this revision.

- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://supabase.com/docs/guides/functions/secrets
- https://nodemailer.com/usage/
- https://www.rfc-editor.org/rfc/rfc5321
