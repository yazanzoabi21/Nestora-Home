# Connectivity verification status — 2026-11-19 09:40 UTC

Result: NOT INVOKED. Hostinger SMTP deployed compatibility remains UNVERIFIED.
The single approved verification request has not been used.

Authenticated metadata checks confirmed hostinger-smtp-probe remains ACTIVE,
version 1, in project ojismppptyrivnxnkcux, with verify_jwt=false and the existing
handler authentication unchanged. Secret digest comparisons confirmed:

```text
SMTP_PROBE_ENABLED=false
SMTP_PROBE_SEND_ENABLED=false
SMTP_PROBE_EXPIRES_AT=1970-01-01T00:00:00Z
```

The existing SMTP_PROBE_TOKEN appears in the remote inventory, but only as a hash.
Its original value is not available in the current process environment. The CLI
has no function invoke command or plaintext secret retrieval command. No token
was recovered, rotated, logged, written locally or requested in chat. No enable
flags or expiration values were changed because authenticated invocation could
not be prepared with the existing token.

No SQL, deployment, function invocation, SMTP connection or email send occurred.
No restoration was necessary: the disabled settings remained unchanged and were
verified. No SMTP credentials or business logic changed.

## Manual Dashboard fallback

Use the original probe token from your private secure storage. Do not use its
hash from secrets list and do not share it in chat. If the original is unavailable,
stop before enabling; replacing it would be a separate configuration action.

1. Select project ojismppptyrivnxnkcux -> Edge Functions -> Secrets.
2. Keep SMTP_PROBE_SEND_ENABLED=false throughout.
3. Temporary expiry generated at 09:40:02 UTC:
   SMTP_PROBE_EXPIRES_AT=2026-11-19T10:10:02Z. If that window has elapsed, generate
   a new UTC time 30 minutes ahead; do not use an expired value or a value more
   than 24 hours ahead. Then set SMTP_PROBE_ENABLED=true and Save.
4. Edge Functions -> hostinger-smtp-probe -> Test. Select POST. Set headers
   Content-Type: application/json and x-smtp-probe-token: ORIGINAL TOKEN.
   Body exactly {"mode":"verify"}. No recipient, SMTP password or send token.
5. Click Send Request ONCE. Do not automatically repeat on failure/timeout.
6. Regardless of result, immediately save the three disabled control values at
   the top of this file. Never enable sending. No redeployment or SQL is needed.
7. Expected success is HTTP 200 with
   {"mode":"verify","completed":["dns","tls","smtp_auth"],"emailSent":false}.
   Share only the HTTP status/sanitized response and confirmation of reset,
   never headers, secret values or screenshots containing credentials.

Until that response is obtained, DNS, deployed TLS/port-465 connectivity and SMTP
authentication are not established. Even a successful verify is not proof of
sender acceptance or inbox delivery and does not authorize an email send.
