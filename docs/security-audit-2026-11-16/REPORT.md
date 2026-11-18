# Nestora Home security review — 16 November 2026

**Superseded repository-only assessment below.** The deployed export is now available and its complete hash and all routine hashes have been verified. Use [DEPLOYED_FINDINGS.md](DEPLOYED_FINDINGS.md) and [DEPLOYED_REVIEW.json](DEPLOYED_REVIEW.json) for current confirmed findings, exact identities, metadata-backed migration/rollback and remaining risks. The older statements below about absent metadata describe the earlier investigation, not the current status. Production execution remains unauthorized.

Latest preparation update: [implementation status and compatibility/release gates](IMPLEMENTATION_STATUS.md), [validation results](VALIDATION.md), and [metadata destination](METADATA_REQUEST.md). The SQL test proposal now includes Guest video mutation denial and an existing inactive Admin with forged metadata; it remains unexecuted and incomplete pending deployed schema review.

**Status: investigation and preparation approved; deployed metadata review pending. No application hardening, database execution, deployment, account changes or data changes were performed.** The owner clarified that the original deployed exports reside in a separate ChatGPT conversation and are inaccessible here. See [the consolidated metadata handoff](METADATA_REQUEST.md) for the single read-only script and exact outstanding inputs. Existing SQL migrations/tests remain proposals, not a production-ready release. Only this audit package and manual SQL/test drafts were added. UI, routes, styles, navigation optimizations and session persistence are unchanged. No BFF, Redis, Edge Function or backend infrastructure was introduced.

This is a repository security audit, not certification of the deployed Supabase project. The five concerns supplied in the request are treated as owner-confirmed deployed observations; authenticated exploitation has not been reproduced here. No database credentials or configured Supabase management connector were available. The live 41-table inventory, effective policies/grants, helper definitions and Edge Functions remain unverified. Those gaps must be resolved before the application can be described as hardened.

## Scope and evidence

- Read `AGENTS.md`, direct-Supabase architecture documentation and existing `supabase/manual/phase2-v2` proposals. Those older drafts explicitly say they have not been executed; they are not evidence that production is protected.
- Indexed all **42** versioned migrations: **50 function definition occurrences**, **37 policy definitions**, **95 grant/revoke statements**, and **35 trigger/function change statements**. Historical occurrences are not deployed object counts. The complete source inventory, definitions, file/line references and browser table/RPC references are in [source-inventory.json](source-inventory.json).
- Reviewed Admin/Customer authentication, session lifecycle, Supabase injection tokens, guards, runtime profile-update allowlists, catalog/order/cart/customer/payment/media services, uploads, URL-opening paths, Angular templates and service-worker configuration.
- Dependency evidence: [npm-audit.json](npm-audit.json). Limited current-tree secret scan: [secret-scan.json](secret-scan.json). Environment files were also checked without printing key values: both contain public `sb_publishable_` keys, no detected privileged key. History, hosted configuration, ignored files, generated artifacts and platform secret stores were not comprehensively scanned.
- No `supabase/functions` sources or `supabase/config.toml` are present. No browser `functions.invoke()` calls were found. This does **not** establish that zero Edge Functions are deployed.
- Browser RPC definitions missing from migrations: `refresh_dashboard_statistics` and `can_current_customer_use_discount`. The named helpers `current_user_is_admin()`, `is_nestora_admin()` and `can_manage_customer_offers()` are also absent from versioned SQL. Their security cannot be inferred from their names.

## Prioritized findings and proposed fixes

### S01 — Potential critical privilege-escalation chain: profile fields and role catalogue

**Evidence:** Owner confirms excessive profile/role privileges. In `20260716010000_secure_public_customer_registration.sql:61`, the existing trigger only resets `role_id`, `is_active` and `email` when the **old target row's role** is `customer`. It does not protect `profiles.id`, all privileged identities, or role-catalogue writes. Customer self-update RLS in `20260716000000_add_customer_profile_birthday.sql` does check both old/new `id=auth.uid()`, which can prevent ID reassignment through that particular policy. Other permissive policies and RPCs are unknown.

**Impact:** Grants alone do not prove a successful exploit: an applicable RLS policy/definer path must also allow the write. But writable role definitions can undermine every policy/helper that trusts their names, and the existing customer-only trigger is insufficient defense. Anonymous column grants require removal even where RLS currently denies all rows. Renaming a role or changing an unprotected Admin row can be more dangerous than the obvious customer self-promotion attempt.

**Proposal:** Remove table-level **and column-level** browser write grants, including grants to SQL `PUBLIC`; verify effective inherited privileges. Allowlist existing personal fields. Deny browser writes to role IDs, activation and identity for Customers **and Admins**. Preserve Customer name/phone/birthday/avatar edits and existing Admin personal email/name/phone/avatar edits. Retain the current customer email guard; profile email must not become an alternative Auth identity update path. Registration continues through the existing trusted Auth trigger.

No Admin creation/promotion feature or new role-management RPC is proposed: the app does not have that feature. This intentionally avoids the older Phase 2 proposal's new management RPC, global lock and last-Super-Admin invariant. Trusted existing provisioning remains a separately controlled maintenance operation. Audit every exposed definer writer before claiming the protected fields are unreachable through RPC.

### S02 — High: arbitrary authenticated product-video mutations

**Evidence:** Owner confirms authenticated INSERT/UPDATE/DELETE policies with unrestricted conditions. The policy/table creation is missing from migrations. `data-access/services/product-videos.service.ts` shows legitimate Admin upload, reorder, delete and Storage cleanup.

**Impact:** Any Customer can call REST directly to change catalog media regardless of Angular guards. Database row restrictions alone do not protect Storage objects or already public download URLs.

**Proposal:** Add restrictive mutation policies requiring a trusted live active Admin/Super Admin check. Keep authenticated table privileges needed by real Admins; revoking all authenticated video writes would break their dashboard. Preserve intended public video SELECT. Review `storage.objects` mutations independently for `product-videos`; require the same active Admin authority on INSERT, UPDATE and DELETE, including bucket/path changes. Keep public downloads only where intentionally public.

### S03 — High: inactive-account authorization is inconsistent

**Evidence:** Admin policies for profiles, reviews, promotion products, variants, help pages/FAQs/contact messages and loyalty settings/ledger omit `is_active`. Owner-based cart/address/wishlist/history policies check identity without activation. `submit_product_review`, `edit_own_product_review`, `record_product_view`, loyalty read RPCs and `replace_cart_free_gifts` do not consistently check active profiles. Some newer Admin RPCs already correctly check activation.

**Impact:** A deactivated account with a still-valid signed JWT can retain private access or mutations. Browser logout/guards cannot revoke SQL authority, and restrictive RLS does not constrain a function owner that bypasses RLS.

**Proposal:** Add operation-specific restrictive policies to private tables and Admin mutations; retain public catalog reads and anonymous guest checkout. Add active-account/role/ownership checks **inside each exposed definer RPC**, before side effects. Missing/NULL activation must fail closed. Review the three existing helpers for live `auth.uid()` lookup, explicit role membership, `is_active IS TRUE`, trusted ownership, a fixed search path and no caller-supplied identity/metadata trust. Preserve their current signatures and intended module-specific permissions; do not blindly replace `can_manage_customer_offers()` with a broader generic Admin check.

Do not add Data API hooks or extra navigation checks as a substitute. No routing/performance/session changes are proposed. Test Data API, RPC, Storage and Realtime separately using the same still-valid token after deactivation.

### S04 — High: checkout replay can reach post-idempotency mutations; older entry points remain callable

**Evidence:** `20260716130000_idempotent_customer_inventory_checkout.sql:31` returns an existing order for a matching token/owner (guest token plus email for guest orders). Later wrapper `20260820100000_remove_automatic_free_shipping_threshold.sql:34` calls the underlying chain, loads the returned order, accepts caller-supplied shipping/payment method IDs, recalculates totals and updates the order and payment transaction **without checking that this was a new order or that its status still permits changes**. Several earlier `place_customer_order` overloads retain anon/authenticated EXECUTE grants. The current browser calls the 13-argument overload.

**Impact:** Source-supported replay/tampering risk, not a reproduced production exploit. Replaying a known own-order token with changed method/discount arguments can reach repricing after idempotency has returned an existing result. Whether a particular discount/loyalty path makes the effect exploitable depends on installed functions and constraints. Earlier overloads also bypass later checks, including the idempotency requirement. This is an integrity concern, not evidence of cross-customer token guessing.

**Proposal:** Inspect/fingerprint **every overload and renamed legacy function**. Keep only the current required public entry point callable by browsers; revoke external execution on internal overloads while retaining calls from verified trusted owners. Do not DROP functions used internally. Make the outermost operation lock/authorize the token and return the persisted result before any replay-side writes; bind method/discount/item parameters to the original checkout or reject mismatches. Replays of paid/completed/cancelled orders must not reprice transactions, spend/refund points, reconsume discounts or change stock. Keep server-side pricing, guest checkout and current RPC contract.

The checkout body rewrite is deliberately not fabricated against an unknown deployed function chain. It needs reviewed definitions, then a separate SQL-only patch and concurrent replay tests. Drafts 10/20 do **not** resolve this finding.

### S05 — High if live grants/policies permit it: cross-customer records and privileged views/RPCs

**Evidence:** Frontend ownership filters exist for orders, addresses, carts, preferences, wishlist, history and loyalty. Most base schema/policies for orders, order items, shipping addresses, payments, customers, dashboard/analytics, notifications and media are absent. `customers` is queried as an Admin data source, but its deployed relation kind/definition is unknown. `profiles` includes an Admin read policy that queries `profiles` recursively; if deployed verbatim without another architecture change, that can cause RLS recursion rather than safe authorization.

**Impact:** `.eq('user_id', userId)` in Angular is not a security boundary. A broad permissive policy, owner-executed view, materialized view, definer RPC, publication or exposed schema can bypass intended isolation despite RLS being enabled on 41 tables. No actual cross-customer data leak was demonstrated in this review.

**Proposal:** Require owner/active-account or existing active-Admin authority on private rows, and parent-order/cart ownership for child rows. Preserve approved Admin customer/order/export access. Validate both UPDATE `USING` and `WITH CHECK`; deny owner reassignment and forged parent IDs. Prefer existing secure invoker views where compatible; inspect owner semantics/materialized outputs before changing any view. Replace recursive Admin profile policies with a reviewed non-recursive private helper. Review `refresh_dashboard_statistics` and `can_current_customer_use_discount` before granting access or certifying their results.

### S06 — Medium, potentially high if sensitive values are stored: column-level data exposure

**Evidence:** Checkout explicitly selects `payment_methods.config`. Product migrations add `cost_price` but contain no associated column protection. Public reviews RPC intentionally returns reviewer/admin UUIDs and reviewer name/avatar; its null limit can return all published reviews. Source payment seed config contains integration flags rather than credentials; live values were not read.

**Proposal:** Verify effective column privileges and safe public contracts. Keep payment config strictly public configuration; never place provider credentials there. Prevent public/Customer reads of cost/margin and sensitive private config if currently exposed. PostgreSQL column grants apply to all `authenticated` users, including Admins: do not revoke those columns blindly and break Admin direct queries. If role-dependent field projection is needed, propose a safe view/RPC plus minimal data-access change for approval after inspecting actual callers. Published reviewer identity/limits require an explicit privacy decision; no UI/content contract was changed here.

### S07 — Confirmed dependency advisories; reachability varies

`npm audit --json` exited 1 and reports **61 vulnerable package entries: 4 critical, 22 high, 34 moderate, 1 low**. These counts include inherited/development findings, not 61 proven exploitable application bugs.

- Locked Angular core/compiler/router are **21.2.17**. Angular's [i18n event-handler XSS advisory](https://github.com/angular/angular/security/advisories/GHSA-jj27-h5hq-8x99) and [host-binding sanitization advisory](https://github.com/angular/angular/security/advisories/GHSA-hh8m-fm6v-7cvg) affect those versions. Patch Angular packages coherently within the supported 21.x line after resolving all current applicable ranges; no major upgrade or route change is needed for this proposal. Some router/common advisories are SSR-specific; the current build uses the browser application builder and no SSR entry point was found.
- Audit critical entries include `dompurify`, `piscina`, `proxy-addr` and the dependent `@angular/build` package. Build/development tools are distinct from shipped browser execution. DOMPurify/jsPDF and Highcharts export/HTML/chart-option paths need focused reachability checks and compatible patches.
- `xlsx` **0.18.5** has known prototype-pollution/ReDoS advisories and no npm-registry fix according to npm audit. Current code uses it for **export**, with no workbook import reader found; do not claim malicious spreadsheet import is currently exposed. Evaluate the [vendor's maintained distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) or a compatible replacement while preserving exports.
- Transformers' suggested npm fix is a **major** upgrade through the `sharp` chain. Do not run `npm audit fix --force`; first determine the browser/build path and a compatible security fix.

No dependencies or lockfiles were changed. Re-audit at implementation time; registry advisories can change.

## Client, token, XSS and infrastructure observations

| Area | Observation / required action |
|---|---|
| Supabase keys | Public publishable keys are expected in a direct-browser app. No detected service-role JWT, `sb_secret_` key or private-key block in the limited current-tree scan. This is not a historical/hosted secret clearance. |
| Sessions | Separate Admin/Customer storage keys; public client never imports either session. Existing persistent/session-only behavior, refresh and logout lifecycle are retained. Browser-readable tokens remain exposed to same-origin XSS; this cannot be eliminated while retaining the requested browser persistence architecture. |
| Server authority | Storage-key names, profile signals and client guards are not trusted authorization. Supabase must verify signed tokens and SQL must enforce live roles/ownership. A customer using the Admin client/key directly must still fail. |
| Guard behavior | Admin role/active checks and failure-boundary tests exist. Customer authorization uses initialized/cached state. Existing fast navigation is deliberately preserved; no new guard refresh loops or routing changes. |
| XSS | No application `innerHTML`/`srcdoc`, `bypassSecurityTrust*`, `eval`, `new Function`, `document.write` or `insertAdjacentHTML` sinks found in the source search. Ordinary Angular bindings and scheme-checked offer/notification links are used; media-library `window.open(asset.file_url)` needs a scheme allowlist if an untrusted writer can control that field. This is not a complete third-party-library audit. |
| Headers | No CSP/Trusted Types or hosting header configuration found in this repository. Actual HTTP headers were not inspected. Propose report-only CSP first, then compatible enforcement, frame restrictions, MIME sniffing protection, referrer policy and HSTS after confirming HTTPS/subdomains. Account for Angular styles, Supabase HTTPS/WSS, image/model/worker/WASM sources and export libraries; do not ship an untested blanket policy. See [Angular security guidance](https://angular.dev/best-practices/security). |
| Service worker | No configured API data groups caching private responses. Current static asset caching remains unchanged. Hosting caches/private export handling still require deployment review. |
| Uploads | File MIME/size checks in browsers are bypassable. Verify server bucket MIME/size rules, owner folder checks, insert/update/delete policies and SVG/HTML handling. Avatar writes must be limited to the caller's UUID folder; product/media writes require active Admin authority. No MIME/bucket changes applied. |
| Public abuse | Guest checkout and contact form are intentionally public. Verify hosted Auth rate limits/CAPTCHA/redirect allowlists, confirmation/recovery settings and native platform abuse controls. RLS is not a distributed anti-spam/rate-limiting mechanism. No new infrastructure or UI challenge was introduced. |
| Admin authentication | Hosted MFA/password/session policies were not available. Enforcing a new MFA level without a compatible existing sign-in flow would risk locking out Admins; not included in the minimal patch. |

## SQL/function/trigger coverage and remaining verification

| Source object group | Assessment |
|---|---|
| Signup/profile guard | Latest signup trigger pins empty search path and assigns Customer role from trusted app metadata rules. User metadata supplies display fields only. Reconcile any additional `auth.users` triggers, profile insert policies and privileged RPC writers. Existing profile guard is partial (S01). |
| Order placement | All versioned definitions and wrappers indexed/reviewed, including guest ownership, pricing, stock, discounts, loyalty and idempotency. Internal overload EXECUTE and replay behavior need S04 fixes. No payment-provider success should be accepted from a browser. |
| Admin order item/status RPCs | Latest `remove_admin_order_item` and `update_admin_order_status` explicitly check live active Admin/Super Admin before side effects. Internal restoration/recalculation routines revoke PUBLIC/anon/authenticated execution. Verify effective inherited grants and trusted owners in deployment. |
| Inventory/variant/promotion RPCs | `update_inventory_stock`, `replace_product_variants`, `replace_promotion_products`, `refresh_analytics` use invoker security and depend on RLS/ACLs. Lack of an inline Admin check is not by itself proof of escalation. Add scoped gates while preserving legitimate invoker permissions. Verify analytics EXECUTE defaults; missing explicit revoke is a review item. |
| Reviews/history/loyalty | Review writes use current Auth ID and own-review checks; history uses current Auth ID; private loyalty reads bind to current Auth ID. Active-account enforcement is incomplete. Internal ledger append revokes browser execution; ledger mutation trigger preserves immutability. |
| Gift/embedding management | Gift-product replacement and embedding Admin RPCs check active Admin authority. Cart free gifts check cart ownership; add activation check. Public image search is a deliberate bounded projection over active products. |
| Public search/reviews | Site search is invoker-based with active/published filters. Public review RPC pins search path and explicitly projects author fields rather than granting broad profiles access. Review direct review-table field exposure separately. Index count exposes only an aggregate. |
| Triggers | Address normalization/default promotion, loyalty accounting, variant repricing and timestamp triggers must remain intact. Security-definer trigger execution requires correct upstream DML authorization even if direct RPC execution is revoked. Stock/sold-count trigger/function pair is dropped by the later rollback migration; do not count historical definitions as live controls. |
| Search paths/default grants | Many functions pin `public, pg_temp`, some only `public`; verify no untrusted CREATE in resolution schemas, temporary-object resolution and owner role memberships. Fully qualify objects before narrowing search paths; blindly changing all to `''` can break functions. Review owner-specific default ACLs and every overload's effective EXECUTE. |
| Live-only objects | All unversioned tables/policies/helpers/RPCs, private schemas, views/materialized views, rules, schema/default/sequence grants, auth triggers, Storage and Realtime require inspection. RLS-enabled count alone is insufficient. |

Authoritative guidance: [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security), [function security](https://supabase.com/docs/guides/database/functions), [RLS and views](https://supabase.com/docs/guides/database/postgres/row-level-security), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth).

## Review package and implementation sequence

Manual SQL lives in `supabase/manual/security-audit-2026-11-16/`, outside automatic migration discovery:

1. **`00_inspect.sql`**: read-only catalog inventory across policies, effective table/column privileges, function/procedure bodies and ACLs, triggers, views/rules, roles/memberships, schemas/default ACLs, bucket metadata, publications, exposed-schema/hook settings and installed migration names. Run only using an authorized DBA connection and retain results privately. It reads metadata, not customer rows. If a hosted schema/catalog is unavailable, document the failure and obtain the equivalent authorized export; do not infer absence.
2. **`10_core_controls.proposed.sql`**: draft profile/role grant allowlists, non-recursive private active-account/Admin helpers, and restrictive Admin mutation policies on the scoped business tables. No existing policies are dropped; no new permissive authorization is added. Approval gate and RLS/owner/effective privilege checks fail closed. Tables/columns/callers must be reconciled with the live manifest. Private helper schema must not be exposed through the Data API.
3. **`20_customer_isolation.proposed.sql`**: draft private order/payment/child-row and owner-table restrictions, plus active Admin controls over contact-message administration. Public catalog and guest contact insertion are retained. Confirm preference `customer_id` is the Auth UUID, as current frontend code assumes. This draft does not resolve missing permissive grants/policies for existing Admin features and must not be used to invent them.
4. **Not yet generated:** deployed-definition-specific patches for the existing three helpers, all definer RPC gates, checkout replay/overload access, Storage mutation policies, sensitive public projections and live-only objects. Creating those final SQL patches requires the read-only metadata. **10/20 alone are not a comprehensive hardening release.**
5. **`90_negative_authorization.proposed.sql`**: staging-only transactional role/claim-switched database tests using operator-selected existing fixtures, plus positive own-edit/Admin controls. No mock users or fixture rows are created. Tests are not wired into production or normal app startup.
6. **`11_core_controls.rollback.sql`**: guarded policy/helper-removal skeleton that intentionally ROLLBACKs. Exact original ACL restoration cannot be generated until the deployed baseline is available. It is clearly marked incomplete and must not be treated as a ready rollback.

Before installation, snapshot all affected definitions, owners, policies, table/column/schema/default/function ACLs and existing hooks with a reviewed schema-only export. Finalize an exact object manifest and before/after diff. Confirm trusted internal checkout writers still bypass RLS intentionally and retain function EXECUTE. Use short explicit transactions; all proposed changes are authorization metadata, not data backfills. Do not replay historical migrations containing seed/update/delete statements.

For Edge Functions, obtain a read-only deployed list and their source/configuration, including `verify_jwt`/handler validation, caller role/ownership checks, service-key usage, CORS, request limits, webhooks/signature checks, redirect/URL fetch allowlists, secret/log handling and dependency versions. A publishable API key alone is not user authentication. No Edge deployment or creation is proposed without evidence it is needed.

## Impact assessment

| Flow | Intended result / release gate |
|---|---|
| Customer profile edits | Existing payloads continue to work; forbidden columns return permission errors. Customer email remains guarded, not silently enabled. Avatar upload/storage and birthday flows require staging coverage. |
| Admin profile edits | Personal fields remain writable; identity/role/activation edits are denied. No dashboard role-creation/promotion feature is removed or added. |
| Admin management | Products, variants, videos/uploads, categories, promotions, offers, inventory, orders/status/refunds, payments, customer views, content, dashboard and exports remain usable by existing authorized active Admins. Restrictive gates AND with existing module permissions; they do not broaden them. |
| Customer/guest commerce | Guest checkout retains its public RPC contract; private rows stay hidden. Customer cart/preferences/wishlist/orders/loyalty retain shared service behavior. Signed-in inactive users cannot use stale JWTs for protected operations once **all** RPC/Storage gates are installed. |
| Public catalog | Public SELECT/published projections remain available; mutations require Admin authority. Sensitive fields require separate projection review. |
| Runtime and contention | No new network hop, background service, frontend check loop or global profile-write serialization. Existing lookups use profile/role keys; inspect staging query plans/policy recursion and latency before release. No speed guarantee is made without measurement. |
| Existing data | No users, roles, orders, products, records, role values or activation values are updated by the proposed authorization migrations. No mock data or schema backfill. |
| Responsive behavior | No UI/layout/component/state changes, so no responsive redesign or visual testing was needed for this review. |

## Validation actually performed

| Check | Result |
|---|---|
| `npm run build` | **PASS**, exit 0. Existing initial bundle 660.50 kB exceeds the 500 kB warning; three component style budget warnings and existing CommonJS warnings remain. No optimization changes proposed. |
| `npm run lint` | **PASS**, all source files. No targeted fallback required. |
| `npm run test -- --watch=false` | **PASS**, **156 tests in 28 files**, including existing auth/guard/profile-payload/independent-session/direct-routing tests. These are existing tests, not proof of database authorization. |
| `npm audit --json` | Exit 1, 61 vulnerable package entries as detailed above. No automatic fixes applied. |
| Limited secret scan | No matched privileged JWT/secret-key/private-key patterns in scanned tracked text. Public environment keys inspected separately. See scope limits above. |
| Draft SQL syntax | **PASS**, all five SQL files, PL/pgSQL bodies, SQL-language helper bodies and representative generated policies/REVOKEs, using `libpg-query` PG18.4 grammar installed in a temporary external directory. psql variables/meta-commands preprocessed for parsing only. See `SQL_PARSE_REPORT.json`. This is **not** target-PG execution/type/owner/ACL validation. |
| New SQL authorization tests | **NOT EXECUTED**: no reviewed staging connection/fixtures and changes await approval. A passing parser is not an authorization test pass. |
| Live database/Storage/Realtime/Edge security | **NOT VERIFIED**. No authenticated production reads, mutation probes, migrations, test accounts or security setting changes performed. |

## Rollback instructions

1. Before release, save the exact baseline from the deployed catalog/schema export and prepare owner/grantor-aware restoration SQL. Include both table ACLs and explicit column ACLs, grant options, original definitions/owners and default privileges for each affected object creator. Keep that artifact private and version it with the approved migration.
2. Rehearse forward migration and rollback on a staging clone with existing approved fixtures. Verify Admin CRUD, public reads and Customer edits before and after. ROLLBACK of a SQL transaction does not undo external webhook/email effects; never use production mutation tests.
3. For post-commit rollback, remove this package's private-table policies before helper functions; restore only this package's changed ACLs/definitions from the saved snapshot in the **same reviewed transaction**. Preserve unrelated later migrations and other packages' policies. Do not use `DROP ... CASCADE` or `GRANT ALL` as a recovery shortcut. The supplied skeleton intentionally stops short of a committed rollback.
4. Revoke newly added personal-field grants that did not exist before, restore original grants exactly, restore any subsequently approved RPC/Storage/helper modifications from their captured definitions, then request PostgREST schema reload. Restore dependency lockfile/package changes only if a dependency patch was actually released.
5. Re-run the same authorization/functional matrix. Restoring the original ACLs can reopen known vulnerabilities; prefer a narrowly reviewed forward correction where possible. Authorization-only rollback does not restore or change business records.

## Approval requested

Approve the security-only direction and proceeding to read-only deployed metadata review and completion of the SQL/test package. Implementation/deployment readiness depends on that evidence and staging acceptance. Approval of this report is **not** permission to execute production changes; production execution remains a separate explicit decision, as requested.
