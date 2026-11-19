# Production activation — 2026-11-19

**PRODUCTION AUTOMATIC EMAILS: ACTIVE**

Project ojismppptyrivnxnkcux; website https://nestorahomelb.com.
Activation cutoff: **2026-11-19T20:31:14.206817Z** (22:31:14 Beirut).
Database enabled/send_enabled true, mode production; canary order restriction
cleared, allow_unverified_customer_email false. Edge enabled/send flags read back
as true and mode production; temporary test recipient secret confirmed absent.

## Deployed verification

- New checkout ORD-20261119-EC44EE / 91aa4822-0c0d-4f42-9575-f3d0cbfa294e
  used only info@nestorahomelb.com, real catalog/variant quantities, server discount,
  pickup and unpaid manual COD. Subtotal USD 19.00, discount 1.90, shipping/payment
  fee 0, total USD 17.10. Marked non-fulfillable; preserved permanently.
- Its order INSERT webhook automatically created both jobs and sent the admin
  notification. Customer job remained blocked with zero attempts until the guest
  verification endpoint succeeded, then automatically sent. Both SMTP_ACCEPTED,
  one attempt each. No manual delivery-job enrollment or send permit was used.
- Code issuance delivered a real verification email. The controlled confirmation
  test used a private owner-installed known-code hash for this explicitly marked
  business order, rejected an incorrect code, and confirmed through the deployed
  endpoint. Source tests separately verified that the actual emailed code hashes
  exactly to the issued database challenge. No customer data/recipient was used.
- Repeated checkout returned the same order/total. Repeated recovery/webhooks did
  not resend accepted jobs. No unexpected recipient, duplicate delivery row or
  historical-order backfill was observed.
- Signed webhook HTTP responses were 200. Cron is active every five minutes with
  command select nestora_order_email.recover(); bounded post-cutoff recovery.
  The first scheduled run after final activation, 20:35 UTC, succeeded and its
  worker request returned HTTP 200; both accepted deliveries remained at one attempt.
- Dashboard notification exists for this order. Existing checkout and dashboard
  database definitions retain original hashes c73b3999991c0b6bcf823f0d4db1a37c and
  df3a0db3ce2c4d0d08279a19dd4b592c respectively.
- Public worker RPC denied anonymous access; oversized verification body returned
  413, invalid ownership disclosed no order/recipient and sent nothing, invalid
  confirmation returned 400. Private tables retain RLS; browser roles cannot
  execute order-email RPCs.
- Hostinger publication incrementally uploaded and verified new immutable files,
  translations, index.html and ngsw.json against local build bytes. Old assets
  and all existing website files were retained. Entry-file rollback was exercised
  successfully during a transient upload interruption, before final publication.

## Checks

Angular production build passed with existing bundle/style/CommonJS warnings;
full ESLint passed; 30 test files / 165 tests passed. Deno strict checks and lint
passed; 31 source tests and 25 bundled worker tests passed; deployment bundle
passed. Deployed source graph was downloaded and compared with local sources.
Live transaction-rollback SQL security/guest/quota tests and atomic claim tests
passed, including two parallel claims obtaining a single job, disabled starts,
code expiry/failure/cooldown limits and accepted/uncertain replay prevention.

Hostinger quota was verified at 100 messages/24h. Application limits are 60/day,
10/hour (application throttle, not an inferred Hostinger quota), including both
order messages, verification messages and failed attempts. Forty daily messages
remain for unrelated mailbox traffic. Quota rejections defer 24 hours.

SPF includes Hostinger, DKIM selector a has a published public key, and all three
Hostinger rotation aliases remain intact (b/c currently publish empty/revoked
keys at Hostinger). DMARC is p=none. From/envelope align to the business domain;
DNS was not altered. New canary messages were Delivered / is_spam=false in the
provider log, versus is_spam=true for earlier sandbox copies.
Final post-cutoff messages were independently verified SMTP_ACCEPTED in the ledger;
the provider log had not yet exposed their final delivery events when checked.

## Limits and operations

Guests verify per order without registering. They must retain the checkout tab's
capability; no unverified-recipient bypass exists. Inbox placement elsewhere is
not guaranteed; external received Authentication-Results headers and browser
visual responsive checks were unavailable. Existing layout conventions, wrapping
and 44px controls are used. Ambiguous SMTP acceptance stays uncertain for manual
reconciliation rather than risking duplicate emails. Routine eligible orders
process automatically; quota overflow waits for capacity/recovery.

See [PRODUCTION.md](PRODUCTION.md) for modified architecture, operating limits,
recovery and immediate disable instructions. No credentials are stored here.
