# Production order emails

The previous v5 implementation deliberately allowed only enrolled sandbox orders.
The production extension reuses its ledger, signed webhook, SMTP transport,
deduplication and bounded recovery. It never enables the unverified-recipient
switch. See the dated activation result for the actual deployed status.

## Recipient authorization

Admin destination is always info@nestorahomelb.com. Its Reply-To is the valid
saved customer email, omitted when invalid. Customer destination must equal the
saved order contact and either the order owner's confirmed Auth email or the
email verified specifically for that order. Customer Reply-To is the business
mailbox. Database claim and start recheck eligibility, snapshot and recipient;
the worker also rejects malformed recipients and unsafe headers.

Guests need no account. Checkout generates an unguessable UUID capability and
completes independently of email. A separate endpoint issues an eight-digit code
to the stored order contact, without order details. It requires both order ID and
checkout capability; callers cannot supply an alternative destination. Codes
expire after ten minutes, allow five incorrect attempts, and are consumed once.
Verification atomically releases only the unattempted confirmation for that order.
The capability stays in sessionStorage in the checkout tab for at most 24 hours;
it never enters links, analytics or logs. The verification page supports reloads
in that tab. Losing the tab requires a separate support workflow; no bypass exists.

Abuse controls: 60 API requests/hour per salted IP hash; request cooldown 60s;
3 code messages/order/day, 3/email/hour and 5/email/day; 10/IP/hour and 30/IP/day.
Order/email/global controls remain authoritative even if an IP header is spoofed.
Private tables have RLS and no browser grants; verification/worker RPCs are
service-role only. No browser can mark an address verified directly.

## Delivery and limits

Hostinger's actual Starter Business Email Free Trial limit is 100 outgoing
messages/24h (confirmed by hPanel and mail_orders_plan rate_limit_outbound).
No provider hourly allowance was supplied. The application reserves every SMTP
attempt before sending: 60/rolling 24h, 10/hour (our throttle), two concurrent
jobs, customer confirmations 3/email/hour and 10/email/day. Both order messages,
verification messages and failed attempts count. Forty messages/day remain for
other mailbox use; external mailbox traffic is not measurable by this ledger.
Hostinger quota rejections defer retry 24 hours. Network failures with ambiguous
SMTP acceptance become uncertain and never replay automatically.

From and envelope sender use the business domain, TLS certificate verification
is mandatory, and stable message IDs prevent retries changing identity. Messages
have text and escaped HTML, Auto-Submitted and X-Auto-Response-Suppress headers.
Existing Hostinger SPF, DKIM aliases and DMARC monitoring policy were preserved.
Provider delivery/spam flags are evidence for the approved mailbox, not a promise
of inbox placement elsewhere. Raw external recipient Authentication-Results
headers were not available through the connector.

## Activation and recovery

70 adds production authorization; 72 adds bounded missing-signal recovery; 73/76
restrict rehearsal to the approved business order. 71 and 74 are rollback-only
security/claim tests. 77 sets a fresh cutoff and removes the rehearsal restriction
only after both controlled messages were accepted. Do not rerun 77: advancing
the cutoff would exclude otherwise eligible pending orders.

Independent Edge secrets ORDER_EMAIL_ENABLED, ORDER_EMAIL_SEND_ENABLED and
ORDER_EMAIL_MODE must agree with database gates. ORDER_EMAIL_TEST_RECIPIENT is
only a temporary rehearsal guard and is removed for production. Existing SMTP,
service and signed webhook secrets remain private and unchanged.

The existing order INSERT trigger queues a signed pg_net request after commit.
Queue failures are isolated from checkout. Cron nestora-order-email-recovery
runs every five minutes, calling nestora_order_email.recover(): at most 50 missing
signals from the last seven days, always on/after the activation cutoff. Claims,
retries, expiration and cleanup are bounded. Historical orders and tombstones are
preserved; no pre-cutoff backfill is permitted. Admin Dashboard notification and
checkout database functions were left unchanged and their definition hashes checked.

## Immediate disable

Run 80_pause.proposed.sql through the trusted database owner to set both DB gates
false, then set Edge secrets ORDER_EMAIL_ENABLED=false and
ORDER_EMAIL_SEND_ENABLED=false using the authenticated Supabase CLI. For a hard
pause, suspend cron with 81_suspend-recovery.proposed.sql. A message already
submitted to SMTP may finish. Never delete ledger entries or reset accepted or
uncertain states. Preserve the cutoff when resuming.

## Validation boundaries

Angular build, full lint and 165 tests passed. Deno strict checking/lint, 31 source
tests, 25 bundled worker tests and deployment bundling passed. Live rollback SQL
covered ownership, expiry, attempts, replay, quotas, authorization and disabling;
parallel claims returned one job. Public unauthorized calls were rejected. The
approved mailbox alone was used for live tests. Known-code confirm fixtures are
owner-installed only on explicitly controlled business orders; there is no API
that can install one. Issuance tests separately prove the emailed code hashes to
the database challenge. Browser visual checks were unavailable due to the Windows
browser-control error; responsive layout uses existing conventions, wrapping and
44px controls. No external-customer inbox test was performed.
