# Staging discovery and safe alternative — 2026-11-19

HISTORICAL: superseded by the owner's same-project sandbox request and current
ROLLOUT.md. Do not follow the staging-project creation or broad guest-policy
steps below for this rehearsal. Preserved as read-only discovery evidence.

Status: read-only discovery and offline tests completed. No staging environment
was created, no production objects or secrets changed, no function deployed or
invoked, no webhook activated, no checkout performed and no email sent.

## Available environments and production preservation

Supabase CLI projects list returned Nestora Home (ojismppptyrivnxnkcux) and an
unrelated YallaQR project. Nestora preview branches list returned an empty list.
No separate Nestora staging target is available to the authenticated account.
This does not rule out an inaccessible project in another account. Never reuse
the unrelated application as a test target.

Both Angular environment configurations point to production. Do not run a test
checkout using the current local storefront: it would affect production.
Docker and psql are still unavailable on this machine. No purchase, new project,
branch or local database installation was performed.

Read-only production preflight confirms the existing notification trigger and
checkout function hashes unchanged, the new order-email schema absent, and
pg_net/pg_cron absent. The function list contains only hostinger-smtp-probe
(ACTIVE, version 13); there is no production order-email-worker. Secret metadata
digests confirm both probe flags false and the expiry at the epoch. The new
ORDER_EMAIL_ENABLED secret is absent. No plaintext credentials were retrieved.

## Confirmed origin, currency and email DNS

- HTTPS GET https://nestorahomelb.com returned 200 at the same origin with title
  Nestora Home. This is the owner-specified production origin, not a staging
  checkout target. /images/logo-bg.png returned 200 with image/png.
- Live catalog inspection confirms payment_transactions.currency defaults to
  USD; deployed checkout's payment transaction insertion explicitly writes USD.
  Checkout templates and total formatting also explicitly use USD. The schema
  has no separate order currency column or central currency setting. Thus USD
  is verified as the current checkout denomination, rather than guessed.
  Products-only orders without transactions require the reviewed USD fallback
  setting; transaction-backed orders retain their saved currency. No historical
  customer rows were read and historical currency uniformity is not claimed.
- DNS MX: mx1.hostinger.com priority 5; mx2.hostinger.com priority 10.
- SPF: v=spf1 include:_spf.mail.hostinger.com ~all.
- Hostinger DKIM selectors hostingermail-a/b/c._domainkey resolve to their
  corresponding hostingermail-a/b/c.dkim.mail.hostinger.com CNAMEs.
- DMARC: v=DMARC1; p=none. This is monitoring, not an enforcement policy; there
  is no reporting destination in this record. Do not change DNS during rehearsal.
  Record presence does not prove actual signed-message alignment. Inspect
  Authentication-Results in approved delivered test messages for SPF/DKIM/DMARC
  passes and From alignment, plus spam placement and both Reply-To behaviors.

## Hostinger limits and remaining account evidence

The Hostinger connector returned reauthentication required. No account mutation
or token setup was attempted. Reconnect it, or privately use hPanel -> Emails ->
Manage nestorahomelb.com -> plan / View all limits and delivery logs. Confirm the
actual mailbox plan, remaining allowance, normal staff usage and any blocks.
Do not paste credentials or customer delivery logs into chat.

Current official documentation lists rolling 24-hour outbound allowances per
mailbox: Business Starter 1,000; Standard/Premium 3,000. Those are published plan
limits, NOT verification of this account's entitlement. Trial/legacy plans can
differ. There is no verified account-specific per-minute allowance yet.

Sources reviewed:
- https://www.hostinger.com/support/4625828-parameters-and-limits-of-hostinger-email/
- https://www.hostinger.com/support/1583510-is-mass-mailing-supported-at-hostinger/
- https://www.hostinger.com/support/6404796-how-to-check-delivery-logs-for-hostinger-email/

Existing worker defaults (40 attempts/hour, 200/24h, two active jobs; customer
3/hour and 10/24h) are safety budgets, not inferred plan allowances. Two emails
per order consume sender capacity; retry attempts and other mailbox use require
headroom. A message sent to the sender's own mailbox also consumes inbound
capacity. Use stricter rehearsal budgets and do not test failure retries against
Hostinger by deliberately using bad passwords or bursting requests. The built-in
hosting PHP mail/sendmail limits are not this SMTP mailbox's limits.

## Safest rehearsal sequence — approve target first

1. Approve a fresh isolated Supabase staging project (including any cost), or
   identify an existing isolated project and grant access. Prefer a dedicated
   project with no production data, secrets or inherited automation. Approve
   enabling pg_net/pg_cron there only. A local Docker Supabase plus mail capture
   is an optional first stage after installing Docker; it cannot prove deployed
   Edge-to-Hostinger connectivity or actual inbox delivery.
2. Prepare a schema-only copy of the reviewed live checkout/RLS/functions. Do not
   restore production customer/Auth/order data, Vault secrets, webhook queues,
   schedules, SMTP credentials or storage exports. Review all copied functions,
   triggers and network endpoints for production references before installation.
   Supply only approved non-personal catalog/configuration data needed for the
   real checkout tests; no production stock writes or invented prices.
3. Use an isolated local checkout build/config pointing ONLY to that staging
   Supabase URL/key. Do not edit environment.prod.ts or expose a staging checkout
   on the production site. Compare original checkout/notification definitions
   and RLS before/after. The customer site origin in email links remains the
   confirmed public origin; staged order links cannot prove production order
   access. Test staging routes/auth separately and never submit an order there
   through a production endpoint.
4. Before installing proposals, create reviewed staging-specific copies. Current
   10/30/31 proposals contain the production worker reference and 30 enables
   settings. Do NOT execute them verbatim. Add an exact staging target assertion,
   set the staging worker URL, verified USD setting and new cutoff, retain
   sandbox mode, and omit production activation proposal 31 entirely.
5. Harden the staging transport independently of the ledger: require staging
   project identity and a nonempty exact recipient allowlist immediately before
   SMTP envelope submission, with no recipient rewrite or fallback. Block any
   recipient not approved, including the admin mailbox unless allowlisted.
   Lock the staging installer to sandbox mode. These local hardening changes and
   tests are preparation for the selected target; not yet implemented/deployed.
6. First run with an isolated local SMTP capture/test adapter and NO Hostinger
   password. Install the new private ledger/service-only RPCs and independent
   signal trigger/recovery in staging only. Exercise actual SQL transactions,
   concurrent sessions, HTTP/webhook authentication, recovery and deterministic
   SMTP responses without Internet delivery. Do not claim capture acceptance is
   Hostinger acceptance. A local capture service is test tooling, not a BFF or
   a replacement production provider.
7. Complete STAGING_VALIDATION.md with real saved staging order values: guest and
   authenticated COD, other configured methods, missing payment transaction,
   multiple products/variants, discounts, loyalty and gifts. Compare each rendered
   line/fee/total/currency against the committed DB snapshot. Verify finalization,
   rollback, token replay and original dashboard notification count. Force
   concurrent claims, lost webhook, processing lease expiry, ambiguous DATA,
   explicit 450/550 and accepted-then-status-write failure in isolation only.
8. Only after capture tests pass and exact recipients/message count are approved,
   configure Hostinger credentials privately in STAGING Edge secrets. They cannot
   be recovered from production secret digests; owner must provision them.
   Use a separate webhook token in staging Vault/secrets; never reuse the probe
   token. Keep the production worker/probe gates untouched.
9. Initial delivery allowlist: info@nestorahomelb.com only, subject to final owner
   confirmation of the controlled test. One genuine new staging order produces
   exactly two expected messages to that same owned mailbox (admin/customer).
   Any distinct customer test address needs explicit approval before allowlisting.
   Use a two-attempt global budget, per-kind uniqueness and no automatic test
   resend. If only one submission fits the Edge time window, recovery may submit
   the other; it must not duplicate either. Inbox success must be verified by the
   owner in Hostinger, separately from stored SMTP acceptance. Unexpected/ambiguous
   results stop sending for manual reconciliation.
10. Disable both staging gates after the test, reconcile active/uncertain jobs,
    retain deduplication tombstones, remove staging credentials when finished and
    record evidence without unnecessary PII. Production deployment/activation
    remain separate future approvals.

## Guest confirmations without registration

The existing broad allow_unverified_customer_email flag is NOT ownership proof
or a complete abuse-prevention policy. Do not enable it globally for production.
For the own-business sandbox address only, explicit owner approval and the exact
transport/DB allowlists permit a registration-free test under the existing sandbox
exception. This does not validate a future general guest-verification flow.

Recommended production policy: optional, order-scoped mailbox verification AFTER
checkout commits. A guest can keep the order without registering or verifying.
Requesting email verification/confirmation is optional; SMTP is never awaited by
checkout. A confirmed Auth email continues to use the existing verified path.

Implementation proposal requiring review before code/schema changes:

- The guest explicitly requests one receipt for the saved checkout email. Show
  an EN/AR explanation; do not reuse marketing or account order-update settings
  as guest consent or treat a checkbox as proof of address ownership.
- Bind a server-issued checkout-session capability to the committed order,
  normalized contact hash and purpose; order UUID/number alone never authorizes
  a challenge or receipt. Do not expose checkout tokens or order details in URLs.
  Challenge-request capability issuance/session proof must be designed explicitly:
  the current publicly callable checkout RPC alone cannot prove consent/ownership.
- A separate authenticated server endpoint checks the capability, real committed
  order, cutoff and exact saved email. Atomically limit challenge attempts globally,
  per recipient and per session/IP using private keyed hashes, short retention,
  cooldowns and optional bot challenge. An initial conservative policy is one
  challenge/order, one/recipient/hour, three/recipient/day, five/session/hour and
  twenty challenges globally/day, also consuming the shared mailbox budget.
  This limits unsolicited verification mail; it cannot eliminate it entirely.
- Send a short-lived, single-use verification code (10-minute expiry, five guesses,
  hashed at rest) without order/customer/item details. Approve this additional
  message type and budget separately. No Supabase Auth user is created.
- On successful proof, service-only code records verification bound to that exact
  order/email. Prepare/claim/start must recheck it; email changes invalidate it.
  Replace the broad production bypass with confirmed-Auth OR this scoped proof.
  Keep (order_id,email_kind) uniqueness and no automatic replay after uncertainty.
- Today blocked customer jobs are terminal. Supporting later verification needs
  a narrowly scoped service-only release/prepare transition that can release ONLY
  an unsent UNVERIFIED_CONTACT job for the matching proof, never accepted,
  submitting, uncertain or other blocked jobs. Refactor signal preparation so it
  does not permanently discard a pending verification, and test races/expiry.
- Missing/declined/expired verification leaves the order and admin notification
  intact; show the existing order confirmation onscreen. No guest account link
  or arbitrary destination is introduced. Verification endpoints are not a BFF.

This guest ownership workflow is NOT implemented in the current worker. It needs
additional private state, tightly scoped endpoints and optional checkout-followup
UI, so it cannot truthfully be described as complete without a reviewed scope and
tests. With no staging available, the user's stop-before-action condition applies.

## Tests executed now and approval boundary

Worker strict typecheck and lint passed; all 15 offline tests passed again.
These cover arithmetic/gifts/loyalty, escaped EN/AR rendering, safe links and
Reply-To, forged/unauthorized requests, duplicate claim simulations, independent
recipient failures, definite rejection retries and uncertain acceptance handling.
They do not run checkout RPCs, a real ledger, webhook, cron or SMTP.

Live workflow, exact staged prices/discounts/variants/gifts, database concurrency,
real retry/recovery and inbox rendering remain unexecuted. No Angular source was
changed; the previously reported build/lint remain prior evidence, not a new
full application validation run. Only this documentation was added.

Next manual decision: identify/approve the isolated staging project (including
cost), approve the registration-free verification scope, confirm the exact test
mailboxes, and reconnect Hostinger or privately confirm the mailbox limits.
Then prepare the target-specific hardening/configuration and capture-only
rehearsal. Do not install/activate anything in production as a fallback.
