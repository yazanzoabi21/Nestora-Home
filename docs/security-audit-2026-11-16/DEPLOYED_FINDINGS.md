# Deployed-metadata security review

The supplied export was parsed and validated offline. The PostgreSQL jsonb representation matches **1,595,366 characters** and MD5 `6372743879c1d24f0dec261a9330b64d`; all **77** routine definition lengths and MD5 values match. Capture: **2026-11-16 20:40:00.871329 UTC**, PostgreSQL **17.6**, database `postgres`. It contains **41 public tables, all with RLS enabled, 117 policies, 77 routines and 36 triggers** in the inspection scope. This is verified export evidence, not a live connection or successful exploitation test. It cannot establish changes after capture.

The raw export is ignored by `deployed-metadata/.gitignore` and is not tracked. No commit, SQL execution, production data change or deployment was performed. The reduced review manifest contains the exact policy expressions, trigger definitions, relevant original grants, function signatures/owners/security settings/EXECUTE privileges and hashes: `DEPLOYED_REVIEW.json`. It excludes the full raw export and unrelated routine bodies.

## Confirmed authorization defects and exact changes

### Catalog Storage writes — high

`storage.objects` has the following permissive write policies:

| Exact policy name | Command | Current predicate/roles |
|---|---|---|
| `media_library_upload` | INSERT | `bucket_id = 'media-library'`; anon, authenticated |
| `media_library_update` | UPDATE | Same bucket in USING and WITH CHECK; anon, authenticated |
| `media_library_delete` | DELETE | Same bucket; anon, authenticated |
| `Authenticated users can upload product images` | INSERT | `bucket_id = 'product-images'`; authenticated |
| `Authenticated users can update product images` | UPDATE | Same bucket in USING and WITH CHECK; authenticated |
| `Authenticated users can delete product images` | DELETE | Same bucket; authenticated |
| `Authenticated users can upload product videos` | INSERT | `bucket_id = 'product-videos'`; authenticated |
| `Authenticated users can delete product videos` | DELETE | Same bucket; authenticated |

These predicates contain no Admin or ownership check. The draft retains each bucket predicate and adds `(select public.current_user_is_admin())` to every applicable USING/WITH CHECK expression. An UPDATE must satisfy both old and new row predicates, preventing movement into/out of the permitted bucket through that policy. All 15 deployed Storage policies were considered; the remaining seven read/avatar policies are unchanged. There is no deployed product-videos object UPDATE policy, so the draft does not add that authority. The Angular video flow uploads/removes objects and updates video rows.

Affected clients: `src/app/data-access/services/media-library.service.ts`, `upload.service.ts`, `promotions.service.ts`, `product-videos.service.ts`. The media library removes from the stored `bucket_name`; preserve its existing cross-Admin asset access and cleanup. No client code changed.

### Product video rows — high

`public.product_videos`:

- `Authenticated users can insert product videos`: WITH CHECK `true`.
- `Authenticated users can update product videos`: USING `true`, WITH CHECK `true`.
- `Authenticated users can delete product videos`: USING `true`.

The draft replaces those write expressions with the active Admin helper. `Authenticated users can read product videos` (USING `true`) and `Public can read active product videos` (anon, USING `is_active = true`) remain unchanged. Thus the current broader authenticated read contract is preserved; it is not claimed to hide all inactive media from Customers.

### Profile/role privileges and inactive Admin self-reactivation — high

There are **no explicit column ACL entries**. Excessive effective column permissions come from table grants. Exact browser grants, all issued by `postgres` without grant option:

- `profiles`: anon and authenticated each have SELECT, UPDATE, DELETE, MAINTAIN.
- `roles`: anon and authenticated each have SELECT, INSERT, UPDATE, DELETE, MAINTAIN.

Both `Customers can update own profile` and `Users can update own profile` allow authenticated self-updates using/checking `auth.uid() = id`. Two overlapping own-profile SELECT policies are also present. These duplicates are preserved; removing them is unnecessary for the fix.

Trigger `protect_customer_profile_privileges` invokes `public.prevent_customer_profile_privilege_changes()`. Its current body silently restores role/activation/email only when the **old** role is `customer`. It does not protect an Admin's activation. Therefore an inactive Admin's valid JWT has a self-update path to set `is_active=true`; this is a confirmed authorization path in the exported definitions, not a reproduced request.

The role catalogue's `Nestora admins manage` ALL policy checks `current_user_is_admin()`. A Customer's excessive role grants alone do **not** prove successful role-catalogue escalation: Customer RLS still denies that write. Likewise, the existing Customer trigger blocks the obvious self-promotion update. The draft removes these latent grant paths and protects against other writers rather than overstating the current exploitability.

The draft revokes browser profile/role table privileges, restores authenticated SELECT, and permits profile UPDATE only on `full_name,email,phone,birthday,avatar_url,avatar_media_id`. Existing Customer email protection remains; Admin personal email edits remain possible. No browser role creation/promotion/identity/activation authority is granted. A strengthened existing trigger raises 42501 on browser changes to `id`, `role_id` or `is_active`, including Admin rows. A restrictive active-account UPDATE policy prevents inactive personal edits; own-profile SELECT is retained for existing login/status handling. Service-role/DBA provisioning remains trusted and no users or role rows are altered.

### Trusted helpers and inactive-account paths

- `public.current_user_is_admin()` is STABLE SECURITY DEFINER, owned by postgres, search_path public. It joins qualified profiles/roles by `auth.uid()`, accepts lowercased `admin`/`super_admin`, but uses `coalesce(p.is_active,true)=true`. Draft: `p.is_active IS TRUE`, empty search path, same signature/role matching/EXECUTE contract.
- `public.is_nestora_admin()` already has an empty search path and delegates to the first helper. Its definition is preserved; the delegate becomes strict.
- `public.can_manage_customer_offers()` uses qualified live tables and normalized role-name lookup, but also accepts NULL activation. Draft: strict activation and empty search path; preserve its existing normalization, signature and grants.
- `private.is_admin()` already has an empty search path but accepts NULL activation. Draft: strict activation, retaining its role normalization and grants.

Six policies with inline role checks are tightened: `Admins can manage customer contact messages`, `Admins can manage customer content`, `Admins can manage customer FAQs`, `Admins can manage product variants`, `Admins can manage reviews`, and `admins can update loyalty settings`. The settings policy keeps its `id=true` WITH CHECK. Other existing policies that already use a trusted helper inherit its stricter activation behavior.

A new private, postgres-owned, STABLE SECURITY DEFINER helper `private.nestora_active_actor_20261116()` checks the current UID and strict activation through the profile PK. No caller ID/metadata parameter exists. PUBLIC/anon EXECUTE is revoked; authenticated EXECUTE uses the already-existing private schema USAGE. Fourteen restrictive policies add activation checks to private tables and profile UPDATE without adding owner privileges or changing public catalog SELECT. Existing ownership/parent policies remain necessary and intact.

### Privileged RPCs and checkout — integrity risk

The manifest inventories all 77 routines, including managed trigger/event functions. Application decisions:

| RPC group | Deployed result and prepared control |
|---|---|
| `update_admin_order_status`, `remove_admin_order_item`, `adjust_customer_loyalty_points`, `replace_discount_gift_products` | Already require active Admin/Super Admin before side effects. Bodies/grants preserved. Their exact P0001 Admin-denial message is recognized separately in tests; arbitrary P0001/constraint errors never count as authorization success. |
| Embedding status/upsert/delete | Already require active Admin/Super Admin. Preserved. |
| `update_inventory_stock`, `replace_product_variants`, `replace_promotion_products`, `refresh_analytics`, `refresh_dashboard_statistics` | Invoker functions rely on table RLS rather than explicit entry checks. Add early active Admin checks for API callers, retaining trusted postgres/service_role calls and invoker semantics. This avoids converting them into RLS-bypassing definers. |
| Review submission/edit, product history, cart free gifts | Definer ownership checks lack consistent activation gates. Add strict active-account checks before effects; preserve existing ownership/validation logic. |
| Three `get_my_*` loyalty RPCs | Add inactive-JWT denial. SQL getters become PLpgSQL with the same signatures/results/stability; preserve existing anonymous getter results. This language change needs staging compilation/positive tests. |
| `can_current_customer_use_discount` | Its deployed definition counts own orders and exposes only eligibility. Add inactive-JWT denial; preserve Guest behavior and existing discount logic. |
| Internal ledger append, order attachment/restoration/recalculation and renamed checkout legacy functions | Already not executable by browser roles. Reassert revocations without dropping functions; trusted owner call chains remain. |
| Trigger-returning application functions | Revoke unnecessary browser EXECUTE. Existing trigger definitions/enabled states stay unchanged. Trigger execution does not require the browser to have direct function EXECUTE. |
| Public search, image search/count, published reviews | Preserve definitions and grants. No blanket RPC revocation. |

Six deployed `place_customer_order` overloads are callable by anon/authenticated: 6, 9, 10, 11, 12 and 13 arguments. The 10-argument function returns an existing order, while outer loyalty/free-gift wrappers can continue into checks/mutations. The 12-argument function can reprice an older order when its variant processing flag is false; the 13-argument function can apply gifts when its gift flag is false. Existing processed flags protect some paths, so this is **not** a claim that every replay always changes every order.

The draft preserves the Angular-used 13-argument contract and original new-order logic. At its start it checks authenticated activation, requires a token, takes a transaction advisory lock for the token, locks an existing order and authorizes it by current owner or the existing Guest token/email contract. A replay returns persisted order/payment/loyalty summary values **before** any outer gift, inventory, pricing or loyalty logic. Changed arguments return the immutable existing result. SQL NULL ownership/email cannot authorize a replay (`IS NOT TRUE` denial). Five earlier public overloads lose browser/PUBLIC EXECUTE; their postgres-owned internal calls remain. Hash collisions serialize unrelated tokens but do not authorize them. Test concurrency, new checkout, Guest retries, paid/completed/cancelled retries and external integrations before production.

## Trigger, grant and compatibility review

All 36 trigger definitions/enabled states are inventoried. Existing Auth triggers `on_auth_user_created` and `on_public_customer_signup` both run; the former assigns Customer while the latter handles conflicts/trusted provisioning. Both order triggers `process_order_loyalty_status_change` and `trg_process_order_loyalty_status_change` invoke the same loyalty function. They remain unchanged to avoid an unverified business-flow change; test signup/provisioning and ledger idempotency. Trigger duplication is a review risk, not proof of double credits.

All API role attributes/memberships in the export were checked: anon/authenticated lack superuser/BYPASSRLS, have no memberships as members and cannot CREATE in public/private. postgres has BYPASSRLS and owns the application routines. Role/schema boundary and protected effective-grant postconditions are included in the draft. No view or materialized view is present in the export scope. Customer private tables have own/parent policies; no cross-customer broad SELECT was identified in those exported policies. This is not a substitute for API/embedded-join/Realtime testing.

Preserved contracts:

- **Search by Image:** browser file processing/worker/model/search flow unchanged; `search_products_by_image` and `get_customer_image_search_index_count` remain available to Guest and Customer. No Storage call was found in that inspected chain. Real browser/network acceptance remains pending and must confirm any external behavior.
- **Avatars:** deployed `Users can upload own avatar`, `Users can update own avatar`, `Users can delete own avatar` enforce `bucket_id='avatars'` and first folder = current Auth UID. `Public can view avatars` remains. No avatar policy or image-processing code changed. Existing own-avatar behavior for inactive JWTs is not tightened by this catalog patch.
- **Public media:** all four buckets remain public, all read policies and bucket size/MIME settings stay unchanged. Admins continue managing other Admins' catalog files. `product-videos` remains MP4-only, 50MB; avatar/product-image limits remain 10MB; media-library has no configured size/MIME cap.
- **Authentication/UI/performance:** no frontend, environment, token/session storage, route, layout, worker, index or dependency file changes. New activation lookups use the existing profile PK and policy initplans. Runtime plans/latency are not measured yet.

## Deliverables and rollback

- `40_deployed_hardening.proposed.sql`: self-contained, approval-gated, rerunnable target DDL/ACL state; **supersedes** old 10/11/20 drafts. Changes 17 policies, adds 14 restrictive policies and one helper, changes 18 function bodies, reasserts browser EXECUTE revocations on 30 exact routine signatures. Does not DML business tables or change existing trigger definitions.
- `41_deployed_hardening.rollback.sql`: restores the exact exported affected function definitions, original policy expressions/roles/commands and original effective direct grants, including grantor/grant options; removes only added policies/helper without CASCADE. Unchanged grants/owners are retained. Restoration is privilege-equivalent; internal ACL array ordering is not a security contract. This deliberately reopens the old vulnerabilities and needs separate rollback approval.
- `50_readonly_postchecks.sql`: 96 effective privilege checks, all must return true after installation. No business rows returned.
- `90_negative_authorization.proposed.sql`: rollback-only staging SQL test proposal with real existing fixtures and Guest/Customer/active Admin/inactive Admin claims; includes Admin RPC denials and Guest/Customer image-search calls.
- `92_rpc_acl_negative.proposed.sql`: staging assertion wrapper for the 96 exact-signature/column privilege checks.
- `storage-authorization.proposed.cjs`: staging Storage API test proposal; requires signed tokens and real operator-selected PNG/MP4 files, refuses the application's configured project, verifies fixture roles/activation, uploads isolated assets and checks cleanup. Includes catalog Guest/Customer/inactive Admin negatives, active Admin positives, avatar ownership and Guest downloads. Run twice with the active fixture respectively Admin and Super Admin. It is not a browser image-processing or complete move/Realtime test.
- `prepare-deployed-drafts.cjs`: deterministic offline generator/metadata validator; no SQL client/network/execution. `validate-package.cjs`: ten independent offline consistency assertions. `validate-drafts.cjs`: SQL/PLpgSQL grammar checks.

Rollback scope is this captured before-state only. It must not run over unrelated later policy/function/grant changes. The forward draft checks modified function fingerprints/owners, target policy identities/roles and key trust boundaries. It does not comprehensively fingerprint all policy expressions/ACLs, publications or hosted configuration. Re-export and review metadata drift before either direction. Staging rehearsal must include two forward applications, rollback, comparison to the before-state, then roll-forward. No rehearsal has been executed.

`storage.objects` is owned by `supabase_storage_admin`, not postgres; table DML grants are not owner DDL authority. Supabase's [supautils policy-management mechanism](https://github.com/supabase/supautils/blob/master/README.md#manage-policies) can authorize CREATE/ALTER/DROP POLICY without changing ownership. Its effective configuration is **not present in this export**. `05_readonly_execution_prerequisites.sql` retrieves the relevant settings for review; staging must establish that the intended owner can perform both forward and rollback Storage policy operations. No script changes managed ownership, installs extensions, grants reserved roles or attempts to bypass platform restrictions.

## Remaining risks and release checklist

1. Review the exact forward/rollback diff and resolve capture drift. **No production execution is authorized.** Keep exports and credential config ignored; do not stage them with force.
2. Supply an explicitly approved isolated staging project and existing active Customer A/B, active Admin/Super Admin, inactive Admin and owned orders/video fixtures. Compile/execute only there after test-execution authorization. A database named `postgres` alone does not distinguish staging from production.
3. Run SQL/API/Storage positive and negative tests, browser image search/avatar flows, Admin media/order/discount/loyalty/inventory flows, checkout concurrency/replays, signup, authentication persistence and exact rollback/roll-forward checks. SQL role switching does not validate JWT signatures or Storage behavior. All runtime authorization/rollback results remain pending.
4. Actual deployed Edge Function source, per-function JWT configuration, hosted Auth/API settings and external/cron callers are not in this SQL export. Service-key code bypasses RLS and must be reviewed separately. Do not infer that no Edge Functions exist.
5. **Confirmed remaining cost-data exposure:** anon/authenticated have effective SELECT on `products.cost_price`, and active-product SELECT policies admit both. The products Realtime publication includes that column too. This patch does not hide cost values: authenticated includes Admins whose direct `ProductsService` queries require that column. A safe Customer projection plus an Admin-authorized cost-access contract and corresponding minimal data-access change needs separate design/review. `payment_methods.config` is also publicly selectable for active methods; no values were inspected, so a secret leak is not established. Keep it limited to public integration flags. Public reviewer identity and the broader authenticated video-read contract are preserved. Public media remain downloadable through known URLs; avatar MIME restrictions and media-library size caps need compatibility review before tightening. No secret-store values were requested.
6. The existing 61 dependency advisory entries remain in the prior report; no dependency fix/major upgrade is included here. App unit tests do not prove those dependencies safe or measure deployment security.
7. Obtain separate explicit production approval only after presenting staging results and final artifact fingerprints. Use the reviewed transaction, then read-only postchecks and specifically approved smoke tests. Stop on drift, false postconditions or feature failures; do not improvise broad grants.

The export also shows broad default grants on future public tables/sequences/functions for both postgres and supabase_admin creators. Those defaults are unchanged in this targeted patch. Every future migration must explicitly scope grants and review definer EXECUTE; present-object hardening does not automatically secure newly created RPCs. The application Realtime publication contains categories, loyalty ledger/settings, variants and products; private ledger event delivery/deactivation must be tested independently, including DELETE behavior.
