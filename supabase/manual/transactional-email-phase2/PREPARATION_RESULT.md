# Approved Phase 2 preparation result — 2026-11-19

COMPLETED. No function invocation, SMTP connection or email send was performed.
Automatic customer/admin order emails remain inactive. The actual test still
requires separate user authorization.

## SQL installation

Authenticated CLI inventory confirmed Nestora Home, ojismppptyrivnxnkcux.
Read-only catalog preflight found no existing nestora_email_probe schema or
public.claim_nestora_smtp_probe(uuid), avoiding accidental replacement.

The approved probe-permit.proposed.sql was rechecked and executed successfully
through Supabase CLI 3.2.0 db query on the explicit project, exit 0. Its owner
guard passed. Installed only the isolated schema, consumed_runs table, primary
key, table RLS without policies, and service-only claim function/ACLs in one
transaction. No existing checkout, notification, RLS policy or unrelated object
was modified. Application roles have no direct permit-table access.

The --read-only preflight used supabase_read_only_user. The actual installation
used the normal management query connection and passed the required postgres
owner/BYPASSRLS guard. No role-switch or security bypass was added.

## Permission verification

01_verify_probe_permissions.readonly.sql was executed after installation. The
first run showed only the last SELECT's results because of Management API result
handling. The local checker was consolidated into a single SELECT and rerun.
All 14 checks returned TRUE:

- anon_claim_denied, anon_schema_denied
- customer_claim_denied, customer_schema_denied
- service_claim_allowed, public_execute_denied
- no_unexpected_execute_grants, no_direct_application_table_grants
- trusted_function_owner, trusted_table_owner
- security_definer, fixed_search_path
- permit_rls_enabled, no_browser_policies

Among application roles, only service_role has EXECUTE. The postgres owner and
trusted administrative capabilities are not represented as denied access.
No permit claim was invoked or consumed to perform these catalog checks.

## Function deployment and read-back

Deployed ONLY hostinger-smtp-probe using the approved explicit-project command.
Read-back metadata: ACTIVE, version 6, verify_jwt=false, import map enabled.
Source was downloaded read-only into ignored
.tmp/smtp-probe-phase2-preparation-readback. Deployed index.ts, handler.ts and
deno.json exactly match reviewed local files. Subject is exactly:

Nestora Home — SMTP Test

No other function, migration, SQL outside the approved permit installation,
webhook, cron or order-email worker was deployed. No runtime invocation was used
to verify deployment.

## Disabled state and errors

The expiry differed from the requested disabled baseline at preflight. The three
explicitly approved controls were set to their exact baseline, and all were
verified by local comparison of CLI secret digests after deployment:

```text
SMTP_PROBE_ENABLED=false
SMTP_PROBE_SEND_ENABLED=false
SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z
```

Both enable flags remained false throughout. Existing SMTP username/password and
probe token were untouched and not read as plaintext. Send-only secrets were not
created. No SQL-installation, privilege-check or deployment errors occurred; the
multi-SELECT output limitation above was corrected locally and all checks rerun.

All 10 offline handler safety tests passed again. Angular source was unchanged;
the production build/full lint already passed for the reviewed subject update in
the preceding preparation, and were not repeated for this catalog-check change.

## Exact next manual steps — send remains approval-gated

1. In project ojismppptyrivnxnkcux -> Edge Functions -> Secrets, retain the six
   existing values, keeping both flags false and the expiry at the baseline.
2. Prepare the three send-only secrets in that same Dashboard. Do not put values
   into chat, source, local files, screenshots, logs or shell arguments:

   | Key | Value |
   | --- | --- |
   | SMTP_PROBE_RECIPIENT | Exact authenticated Hostinger business mailbox, identical to SMTP_USERNAME |
   | SMTP_PROBE_SEND_TOKEN | New independent random 32-byte token encoded as 64 hex characters; retain privately |
   | SMTP_PROBE_RUN_ID | Fresh UUID for the ONE approved attempt |

   A non-secret UUID can be generated using [guid]::NewGuid().ToString(). Generate
   the send token privately in a trusted password manager. Keep the original
   SMTP_PROBE_TOKEN available privately for the request header. Its CLI hash
   cannot be used to invoke. No SMTP password goes in the request.
3. STOP. Do not turn either flag on or click Test/Send Request before separate
   authorization of the actual one-email test. Do not rerun permit installation
   or call the claim function as a dry run.
4. ONLY AFTER test approval: set expiry to UTC ~30 minutes ahead, then enable
   SMTP_PROBE_ENABLED; set SMTP_PROBE_SEND_ENABLED=true last when ready.
5. Edge Functions -> hostinger-smtp-probe -> Test. POST, Content-Type:
   application/json, x-smtp-probe-token: original token, x-smtp-send-token: new
   send token. Body exactly {"mode":"send-once"}. Click Send Request ONCE.
6. Immediately restore all three disabled baseline values regardless of the
   response, BEFORE opening Webmail. Verify by Dashboard/read-only CLI digest
   comparison; do not invoke the function to confirm disablement.
7. SMTP success must include smtpAccepted=true. Then open Hostinger Webmail and
   confirm exactly one Inbox message with the requested subject, the right From/
   To and the run UUID in Message-ID. A Sent copy or HTTP 200 alone is insufficient.
8. Do not retry on timeout/failure, change the run UUID or clear consumed_runs.
   The permit allows at most one submission attempt per UUID, not guaranteed
   delivery. Any second attempt requires a new explicit decision. Retain the
   consumed permit and report only sanitized response/receipt evidence.

No mailbox read connection is available to the agent; actual Inbox verification
will require user confirmation in Webmail or separately authorized mailbox access.
