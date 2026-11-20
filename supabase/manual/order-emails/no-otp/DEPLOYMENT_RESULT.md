# Automatic order receipts without post-checkout OTP — 2026-11-20

## Actual deployed state

The compatible `order-email-worker` and scoped SQL `10_install.sql` / `30_activate.sql`
are deployed on production project `ojismppptyrivnxnkcux`. Downloaded worker source
and imported JSON templates/labels match the local source graph. No secrets were
read or changed. The old deployed worker graph and original database function
definitions are retained in ignored `.tmp/order-email-no-otp-baseline` for rollback.

Automatic release started **2026-11-20 10:09:34.560742 Asia/Beirut**. The original
activation cutoff remains **2026-11-19 22:31:14.206817 Asia/Beirut**. Existing blocked
orders were not released or requeued. Sending remains enabled; global limits are
unchanged at **60 attempts per rolling day / 10 per hour**, including failed and
verification attempts. Recovery remains active every five minutes.

**Frontend publication is pending.** Hostinger continues to require reauthentication.
No live Hostinger files were overwritten. The new Angular production output is
`dist/nestora-home/browser`. The old live frontend is compatible: its automatic
verification request recognizes new eligible orders as complete without sending
a verification code. Publish the new frontend to remove the card entirely.

## Release and privacy rules

- A private context is captured only during the actual checkout RPC, for the
  matching authenticated user or guest. The context and signal commit with the
  order. The checkout wrapper assigns its replay token after inserting the order;
  the new trigger therefore also captures that token UPDATE. Checkout RPCs,
  payment rules, inventory/replay logic and the Admin notification function were
  not rewritten; their protected hashes match the baseline.
- Automatic permission and recipient verification are separate facts. Unverified
  recipients get a fixed bilingual receipt containing **no customer name, address,
  phone, notes, purchased items, totals, order number/ID, capability or private link**.
  A confirmed matching account email can retain the detailed customer template.
  Admin mail remains independently addressed to `info@nestorahomelb.com`.
- Recipient addresses are validated and taken only from the saved order. The
  public worker still requires HMAC/timestamp/one-use nonce authentication.
  Claim/start/finish RPCs remain service-only; new context data/functions are private
  with RLS and no browser-role grants. SMTP credentials stay server-side.
- The live ingress probe showed that X-Forwarded-For is spoofable. It is **not**
  used for the new limits. Supabase supplied CF-Connecting-IP normally and rejected
  the forged CF header request. Only an HMAC of the normalized CF IP is retained;
  its random salt is confined to the existing private settings table. Missing or
  malformed trusted ingress fails closed for automatic unverified release.
- IP and authenticated-account limits are **3 attempts/hour and 10/day per email
  kind**. Admin and customer counters are independent. Existing customer-recipient
  limits remain **3/hour and 10/day**. Reservations count attempts before SMTP and
  serialize under the existing settings-row lock. Throttled jobs defer; unique
  order/kind rows and atomic claims prevent duplicates. Uncertain SMTP acceptance
  remains a manual-reconciliation state rather than an automatic resend.

## Production evidence

One real, non-fulfillable, pickup/manual-COD guest test used only the owned business
mailbox and a real catalog item, with no payment capture or delivery:

- Order `NH-20261120081106-3C75B7FC`
- ID `3c75b7fc-903c-4915-abb5-dec58c81735e`
- USD 1.00, unpaid. Notes explicitly say DO NOT FULFILL, SHIP OR CHARGE.
- Exactly two delivery rows, admin and customer; each `SMTP_ACCEPTED`, one attempt.
- Recipient verification remains false; automatic permission is true. Zero code
  messages were reserved, including after the old-UI compatibility request.
- Checkout replay returned the same order and total. A fresh signed webhook replay
  did not resend either accepted delivery. Admin Dashboard notification exists.
- Unsigned worker and anonymous claim/prepare calls returned 401. A forged checkout
  capability got a non-disclosing no-op response and sent nothing.
- Zero automatic jobs reference orders before the new automatic-release boundary.

Actual deployed guest and authenticated checkout RPCs were also exercised inside
rollback transactions with an owned-address temporary customer fixture. Both used
real catalog/server prices and tested stock/idempotency, trusted IP selection,
and exactly two pending jobs without verification. No temporary account, order,
stock change or outbound HTTP work from those tests was committed. This is not a
browser sign-in / authenticated external-inbox test.

## Validation and rollback

Angular production build and full lint pass, with existing bundle/style/CommonJS
warnings. Worker strict checks, lint, 26 source tests, the same 26 bundled tests,
template freshness and deployment bundling pass. The unchanged compatibility
verification handler passes all 6 tests. SQL security tests pass against installed
production definitions in rollback transactions, including quota enforcement,
recipient/capability binding, claim fencing, accepted/uncertain replay protection,
bounded recovery, legacy UI behavior, kill switch, original cutoff and ACLs.
The temporary ingress diagnostic RPC was removed. The final Angular suite passes
**171 tests across 32 files**, including guest/customer checkout without any Edge
verification call and rendered success pages without verification controls.

Immediate automatic-only pause (admin and legacy verified sending stay enabled):

```sql
update nestora_order_email.settings set automatic_confirmations_enabled=false;
```

`90_rollback.sql` restores exact baseline function definitions, removes the context
trigger, preserves the original cutoff/main send gates and fences unattempted
unverified jobs. Private context records/columns are retained for audit. It does
not reset accepted/uncertain deliveries. The complete installation, security tests
and rollback were rehearsed in one rolled-back transaction and the original
function hashes were verified. An SMTP operation already past its send boundary
cannot be recalled. Retain the compatible worker during rollback; its parser also
accepts original jobs. Prior worker source is available if a separate source
rollback is needed. Reinstallation after rollback requires a reviewed forward
script because retained columns/tables deliberately remain.

## Manual frontend publication

1. Back up current Hostinger entry files, manifests and overwritten assets outside
   `public_html`; retain all old hashed chunks for existing clients and rollback.
2. Upload the **contents** of `dist/nestora-home/browser`, preserving `.htaccess`,
   `.well-known` and independently managed hosting files. Do not upload this SQL
   directory, the repository root, backups, `.tmp`, secrets or Supabase source.
3. Upload new hashed dependencies before switching `index.html`; publish `ngsw.json`
   last. Preserve bytes: the local service-worker hashes were verified.
4. Check direct route refreshes, guest/customer success pages and service-worker
   updates. The success message is translated in English/Arabic; order details,
   summary, loyalty and existing navigation remain. No OTP service/card is compiled.
5. If publication fails, restore the backed-up entry/manifest/assets while retaining
   newly uploaded chunks for clients that already loaded the new version.

Removing OTP cannot establish ownership of a typed email address; receipt-only
content and bounded sending reduce that exposure. Distributed abuse can still
consume the finite shared budget. SMTP acceptance establishes provider acceptance,
not guaranteed final delivery, inbox placement or a bounded delivery time. Mobile
visual checks and deployed-new-frontend browser verification await publication.
