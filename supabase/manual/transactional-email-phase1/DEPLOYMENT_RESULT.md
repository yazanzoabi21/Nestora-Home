# SMTP probe deployment result — 2026-11-19

Result: DEPLOYED AND DISABLED. SMTP connectivity/authentication/delivery remain
untested. No function invocation was made, including rejected-request tests.

## Verified target and scope

Authenticated CLI project inventory confirmed Nestora Home,
`ojismppptyrivnxnkcux`, ACTIVE_HEALTHY, ap-southeast-1. Both Angular environment
files identify the same hosted project. Before deployment, functions list was
empty. After deployment it contains only `hostinger-smtp-probe`.

Command executed successfully with Supabase CLI 3.2.0:

```text
supabase functions deploy hostinger-smtp-probe --remote=ojismppptyrivnxnkcux --no-verify-jwt --use-api --yes
```

Only deno.json, index.ts and handler.ts were uploaded for that function. No other
function, database migration, SQL, permit objects or hosted global config was
deployed. Probe source code was unchanged.

## Metadata read-back

- Name/slug: hostinger-smtp-probe
- Function ID: dcef6596-2e4d-4186-bdfb-f889b824d248
- Status: ACTIVE
- Version: 1
- verify_jwt: false (dedicated handler secret-header authentication retained)
- Import map enabled, pointing to the function's deno.json
- Bundle SHA-256: adf356a41bf9fe5a427eac6d986f5a1e086c1c404126701f6325b6866ea89f29

The gateway setting is intentional: public/user JWTs alone cannot authorize SMTP
work through the reviewed handler. Runtime auth behavior was not tested because
the user prohibited invoking the function.

## Disabled secret controls

CLI secret digests were compared locally against SHA-256 hashes of the expected
non-sensitive control literals, both before and after deployment. Final checks:

```text
SMTP_PROBE_ENABLED=false
SMTP_PROBE_SEND_ENABLED=false
SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z
```

Preflight found that SMTP_PROBE_SEND_ENABLED's digest did not match literal
false. In accordance with the user's requirement to keep sending disabled, only
that control was explicitly set to false, then verified. No attempt was made to
recover its previous value. SMTP username/password/token were not changed or
read as plaintext, and no credential values are recorded here.

No checkout, RLS, existing dashboard notifications or business logic changed.
No automatic order-email webhook, worker, cron or delivery ledger was activated.

## Next step — not performed

Keep the current disabled values until the user authorizes a non-sending SMTP
verification window. Then follow METADATA_REVIEW.md or DEPLOYMENT.md for POST
mode=verify, with the dedicated secret header, an expiry within 24 hours and only
SMTP_PROBE_ENABLED temporarily true. Keep sending disabled. No permit SQL is
needed. A later successful verify would not itself prove inbox delivery.

Dashboard:
https://supabase.com/dashboard/project/ojismppptyrivnxnkcux/functions/hostinger-smtp-probe/details
