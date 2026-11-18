# Security acceptance matrix — proposed, unexecuted database cases

The 156 existing Angular tests passed. Every database/API/Storage/Realtime case below remains pending. Do not confuse the two results. Use existing operator-approved **staging** fixtures; do not create mock users/data or touch production records. Capture pass/fail and SQLSTATE/status, without JWTs, credentials or customer payloads in logs.

## Metadata-backed package update

The export is now reviewed; current findings and migration/rollback pair **40/41** are in `DEPLOYED_FINDINGS.md`. The old 10/11/20 proposals are superseded. Static tests are validated only; no database or API harness was executed.

- `90_negative_authorization.proposed.sql` now covers Guest/Customer video INSERT, claimed-role forgery, active Admin positives, inactive helper/private-data/RPC denials, image-search RPC availability and the profile trigger independently of column ACLs. It requires existing active-public video/product fixtures; Admin RPC negatives deliberately require authorization **before target lookup**, using valid typed IDs even for a different resource type. Only 42501 or the exact deployed Admin-denial message can pass those negatives.
- `92_rpc_acl_negative.proposed.sql` asserts all 96 signature/column privilege postconditions without invoking application RPCs. It needs the same explicit staging database selection, but no business fixtures.
- `storage-authorization.proposed.cjs` performs real Storage API tests only when explicitly configured and executed later. It uses current SDK upload/update/upsert/copy/move/remove/info calls, isolated paths, current signed JWTs and operator-selected existing PNG/MP4 files. It refuses the application's configured Supabase project. Required local JSON configuration keys: `stagingExecutionApproved: true`, `supabaseUrl`, `expectedProjectRef`, `publishableKey`, absolute `imageFile` and `videoFile`; `actors.customer`, `actors.admin`, `actors.inactiveAdmin` each require `id` and `token`. Store that credential configuration **inside the ignored deployed-metadata inbox**, never in tracked docs or command arguments. The prepared invocation is `node supabase/manual/security-audit-2026-11-16/storage-authorization.proposed.cjs <absolute-ignored-config-path>`; it was NOT run here. Run again with an active Super Admin fixture. Never reuse a production project or production tokens.
- Storage test uploads are not rolled back by SQL. The harness removes only its random isolated paths, checks cleanup and fails on network/format/missing-object errors rather than counting them as authorization success. A failure still requires operator review for residual staging assets. These tests do not replace browser image processing/search, actual checkout replay/concurrency, external integrations or Realtime tests below.

## Database harness

`supabase/manual/security-audit-2026-11-16/90_negative_authorization.proposed.sql` is an initial executable psql proposal. It validates real fixture ownership/roles before changing to API roles, and runs all assertions with `SECURITY INVOKER`. Required variables:

- `staging_approved=yes` and `staging_database`: exact approved staging database name.
- `customer_a`, `customer_b`: two distinct existing active Customer Auth UUIDs.
- `admin_id`: an existing active `admin` or `super_admin` profile UUID. Run separately with each role for the full matrix.
- `inactive_admin_id`: an existing inactive Admin/Super Admin profile UUID. The harness never creates or deactivates an account.
- `order_a`, `order_b`: existing orders belonging to A and B respectively.
- `video_id`: existing publicly visible product-video row approved for transactional tests.

Run through `psql -X --set=ON_ERROR_STOP=on` with a securely supplied **staging** connection and `--set=<name>=<value>` for each variable, using `--file=supabase/manual/security-audit-2026-11-16/90_negative_authorization.proposed.sql`. Do not put credentials/JWTs in arguments or saved transcripts. The database-name check is an operator interlock, not proof that a remote host is staging: verify host/project independently. No harness was executed during this review.

Expected results: unauthorized reads return zero rows or an explicit permission denial. Unauthorized UPDATE/DELETE must affect zero rows or raise authorization denial. Unauthorized INSERT/column writes must fail authorization; constraint, validation, missing fixture and missing-object errors **must not** count as authorization success. Positive controls must affect/return the expected rows so an empty database or global lockout cannot pass.

## Required matrix

| Area | Anonymous | Active Customer A / B | Active Admin / Super Admin | Inactive/NULL/missing profile |
|---|---|---|---|---|
| Profile | No private SELECT or writes | A reads/edits approved own fields; B inaccessible; deny `id`, `role_id`, `is_active`, unauthorized email, forged insert/upsert/delete | Keep personal edits/customer reads; deny role catalogue/protected-field writes | No protected writes; own status read only if required for existing login behavior |
| Role catalogue | No writes at table **or column** level | Deny INSERT/UPDATE/DELETE/TRUNCATE; cannot rename Customer role or forge Admin ID | Deny browser catalogue writes too; trusted provisioning remains separate | Deny |
| Catalog/video/media | Public active projection only; no mutations | Deny INSERT/UPDATE/DELETE, bulk update, upsert, activation, price/stock edits | Verify create/edit/delete/reorder/upload, variants/promotions/offers/discounts/inventory/content and own module permissions | Public projection only, no Admin mutation |
| Orders/payments | No private reads or direct writes | Own orders only; B's items/address/payment hidden; no totals/status/paid/refund/provider-ID/loyalty flag edits | Existing order/status/item-removal/payment/refund/inventory/loyalty flows remain usable | No protected read/write/RPC |
| Child-row ownership | No access | Forge other parent IDs, move own child row to another customer, change both owner and parent; all denied | Existing management retained | Denied |
| Cart/wishlist/addresses/preferences/history | No private access | Own CRUD works where currently supported; foreign IDs/embedded joins/bulk queries/owner reassignment denied; A/B tested both directions | Preserve current capabilities, without introducing new rights | Denied |
| Loyalty | Public settings only | Own ledger/balance/history; deny ledger insert/update/delete and forged points/redemptions | Existing authorized adjustments/settings/status transitions succeed | Private balance/history/redemption denied |
| Contact form | Preserve valid guest INSERT; no read/update/delete | Own submitted identity only, not B; no administration access | Existing message administration succeeds | Verify explicit approved contact-submission policy |
| Views/analytics/dashboard | No private data/aggregates | Cannot read Admin customer/analytics/dashboard projections | Dashboard/customers/notifications/charts/exports work | Denied |

The initial harness covers core profile/role permissions, A's own and B's foreign order/profile reads, Guest/Customer/inactive-Admin video UPDATE/DELETE denial, active Admin video/order access and legitimate Customer personal edits. The inactive test includes forged Admin metadata to detect reliance on claims instead of current trusted database authority. It is **not** the complete matrix. Extend it after live schema review with foreign child rows, INSERT/upsert cases, symmetric B cases, active Super Admin coverage and every exposed RPC signature. No absent fixture should be silently treated as a passing negative test.

## RPC and checkout acceptance

1. Call every exposed RPC overload as anon, A, B, Admin and inactive user through real PostgREST, not just SQL role switching. Verify signed/expired/tampered JWT handling; never count malformed arguments as authorization denial. Unauthenticated Admin RPC calls must fail before target lookup/side effects.
2. Prove internal `append_customer_loyalty_ledger_entry`, order restoration/recalculation and legacy checkout routines cannot be called externally. Verify legitimate trusted call chains still work after EXECUTE revocation. Verify `refresh_dashboard_statistics`, `can_current_customer_use_discount` and all three Admin helpers from their **actual** deployed definitions.
3. Checkout: maintain anonymous and Customer orders, server-calculated prices, variants, shipping/payment methods, promo limits/free gifts/loyalty and stock checks. Use existing explicit staging data only. Tampered prices/totals/negative quantities/forged cart or variant IDs must fail or be recomputed safely.
4. Replay the same token with same arguments: return the same persisted order without additional orders, stock deductions, discount consumption, loyalty entries or transaction mutations. Replay with different items/shipping/payment/discounts/email/owner: reject or return immutable original result, never alter the recorded transaction.
5. Repeat after paid/completed/cancelled status and concurrently in two sessions. A must not retrieve B's order; guest token/email mismatches must not return private order data. Test all publicly executable lower-arity overloads, not only the one Angular normally calls.
6. As a still-valid inactive JWT, call review/history/gift/loyalty and checkout RPCs directly. Definer functions must enforce deactivation internally even when RLS is bypassed. Preserve legitimate anonymous guest checkout, without downgrading an authenticated blocked call into guest authority.

## Storage, Realtime, Edge and compatibility

- For the three catalog buckets (`media-library`, `product-images`, `product-videos`): Guest, Customer and inactive-Admin upload/update/delete denied, including bulk, upsert, copy/move and cross-bucket destinations. Verify all overlapping policies. Active Admin and Super Admin upload/edit/reorder/delete/failed-upload cleanup work, including assets uploaded by another Admin. Preserve intentional public downloads. Review SVG/HTML/MIME spoofing, server size caps and public/private download expectations. Direct Storage API tests are necessary even if database tests pass.
- Avatars: Customer and Admin upload to their existing Auth UUID folder, retain processing/profile linking and current reads; reject foreign-folder write/delete, forged ownership and moves. Verify existing Admin avatar-picker use of media-library independently. Do not apply catalog mutation restrictions to all buckets.
- Search by Image: as both Guest and Customer, select/drag a supported file, complete current processing/embedding/search, and verify active matching products, index-count behavior, model caching and no new auth requirement. Confirm actual network calls and any upload behavior remain identical. Preserve public `search_products_by_image` and `get_customer_image_search_index_count`; Admin embedding status/upsert/delete remain Admin-only. Foreign/private product data and embedding mutations must remain inaccessible to Guests/Customers. No blanket Storage or RPC revocation is acceptable as a shortcut.
- Private Realtime subscription as A must not deliver B's data. Test stale JWT deactivation, token refresh/reconnect, DELETE event semantics and private Broadcast/Presence if used. Public catalog channels stay usable. Already delivered data cannot be revoked.
- For each deployed Edge Function: invalid/absent token, Customer-to-Admin action, foreign resource IDs, webhook replay/signature failure, malformed payloads and service-key boundary tests. Check CORS and external URL/redirect validation; CORS alone is not authorization.
- Verify email and Google signup, recovery proof/expired links, independent Admin/Customer sessions, logout/refresh/remember-me unchanged. Existing profile fields/avatar, cart/preferences, Customer orders/invoices, Admin dashboards/exports and payment/status management must remain functional.
- Trial CSP in report-only mode with desktop/tablet/mobile flows before enforcement; do not change layout/routes/session persistence or disable performance optimizations to satisfy the audit.
- Rehearse exact rollback and re-run positive controls. Rollback testing must not mutate production or be mistaken for a security fix.
