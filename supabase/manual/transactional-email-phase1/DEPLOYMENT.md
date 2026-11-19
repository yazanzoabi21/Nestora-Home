# Isolated SMTP probe deployment handoff — 2026-11-19

COMPLETED UPDATE: after the user authenticated, the isolated probe was deployed
and read back as ACTIVE version 1. All three disabled controls were verified.
See `DEPLOYMENT_RESULT.md` for current evidence. The original handoff below is
historical; do not repeat its login/deployment steps or invoke the probe now.

## Actual status

Deployment is authorized by the user but NOT completed. Supabase CLI 3.2.0 was
obtained in the npm cache; `projects list --output json` returned:
`Access token not provided.` No login, deployment, function invocation, secret
write, SQL, migration, permit-table installation or email send was performed.

Both Angular environment files independently identify the intended hosted ref:
`ojismppptyrivnxnkcux` (`ojismppptyrivnxnkcux.supabase.co`). The authenticated
account's project name/membership cannot be checked until CLI login succeeds.
Compare the ref against the Nestora Home Dashboard before any deployment.

The user reports all six secrets are configured. Their remote values were NOT
independently read back. Required pre/post-deployment values remain:

```text
SMTP_PROBE_ENABLED=false
SMTP_PROBE_SEND_ENABLED=false
SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z
```

`supabase/config.toml` is now the minimal local function configuration. It affects
only the named function's entrypoint, dependency map and verify_jwt setting on
function deployment. It does not push hosted database/Auth settings. Never use
`config push`, `db push`, `migration up`, or deploy without the explicit function
name for this task.

## Authentication review

Gateway user-JWT verification is disabled ONLY for this function, as previously
reviewed. The handler requires x-smtp-probe-token with a configured random secret
of at least 32 characters and a live <=24-hour authorization window before SMTP
work. It defaults disabled. Public API keys/user JWTs alone do not authorize it.
The HTTP endpoint is reachable and can return denial responses; unauthorized
callers cannot execute SMTP checks or send mail through the reviewed handler.

The send branch also needs a separate enabled flag/token, same-mailbox recipient
and a persistent service-only claim. Those are not configured/installed for this
deployment. Keep send disabled. No authentication test invocation is permitted
in this deployment-only step, including requests expected to be rejected.

Local validation rerun: all 10 offline safety tests PASS; Deno type check PASS.
Probe TypeScript is unchanged. Only TOML and planning documentation changed, so
the Angular build was not rerun for this deployment-preparation step.

## Exact manual commands

Open your own PowerShell terminal. Login interactively; do not paste any access
token into chat, source, shell arguments, or a tracked file.

```powershell
Set-Location -LiteralPath 'C:\Users\yzoabi\Projects\Angular\Nestora-Home'
npx --yes supabase@3.2.0 login
npx --yes supabase@3.2.0 projects list --output json
```

Verify that the account lists `ojismppptyrivnxnkcux` as the intended Nestora Home
project. Also compare Dashboard -> Project Settings -> General -> Reference ID
and the project ref in its URL. Stop if it is not the intended project.

In that project's Edge Functions -> Secrets, confirm the three required disabled
values above. If values are masked and cannot be verified, explicitly re-save
only those three non-sensitive controls to the exact values above. Do not change
SMTP_USERNAME, SMTP_PASSWORD or SMTP_PROBE_TOKEN, and never enable either flag.

Then deploy exactly one function, with an explicit remote target and no pruning:

```powershell
npx --yes supabase@3.2.0 functions deploy hostinger-smtp-probe --remote=ojismppptyrivnxnkcux --no-verify-jwt --use-api --yes
```

This command bundles server-side without Docker. The checked-in deno.json and
lock pin Nodemailer; config.toml specifies the function entrypoint/import map.
There is no database-link/password step and no database command in this sequence.

Read back deployment metadata without invoking the endpoint:

```powershell
npx --yes supabase@3.2.0 functions list --remote=ojismppptyrivnxnkcux --output json
```

Confirm the exact slug is ACTIVE and its function-specific gateway setting is
verify_jwt=false in the metadata/Dashboard. Reconfirm the three disabled secret
controls. Report only function slug/status/version and those non-sensitive
control values; never share credentials, request headers, or CLI debug output.
Do not click Test/Send Request or fetch the function URL at this stage.

If you prefer the agent to finish the already-authorized deployment, complete
only login and return after the CLI session is available; the remaining metadata
checks and named-function deployment can then continue without new approval.

## Next phase: non-sending authenticated verification, NOT executed now

After deployment is confirmed and the verification window is authorized:

1. Keep SMTP_PROBE_SEND_ENABLED=false. Set SMTP_PROBE_EXPIRES_AT to UTC about
   30 minutes ahead, then set SMTP_PROBE_ENABLED=true.
2. Dashboard -> Edge Functions -> hostinger-smtp-probe -> Test.
3. POST, Content-Type: application/json, x-smtp-probe-token: the secret value.
   Body: {"mode":"verify"}. Do not supply SMTP_PASSWORD or any recipient.
4. Expected HTTP 200:
   {"mode":"verify","completed":["dns","tls","smtp_auth"],"emailSent":false}.
5. Immediately restore SMTP_PROBE_ENABLED=false and the expired timestamp above;
   leave send disabled. Share only the sanitized result.

The verify path needs no permit SQL, webhook, cron, service-role configuration or
email send. Success proves DNS/TCP/TLS/authentication, not inbox delivery. No
automatic order emails are activated by deployment or this future verification.

CLI flags were checked against installed 3.2.0 help and official documentation:
https://supabase.com/docs/reference/cli/supabase-functions-deploy
