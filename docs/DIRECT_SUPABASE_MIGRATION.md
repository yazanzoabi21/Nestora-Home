# Direct Angular + Supabase migration

Date: 11 November 2026. Source baseline: `ad196a5`; backup before removal: `07921ba`.

## Result

The application uses the official Supabase JavaScript client directly. The backend runtime source, isolated package manifest/lock, server environment file, Redis integration, frontend authentication transport, CSRF/session APIs, SSE relay, development proxy, conditional environment and startup scripts were deleted. `npm start` runs `ng serve` on port 4300. Port 3000 and Redis are not required and were stopped before direct live verification.

Newer catalogue caching, direct database services, Angular Signals, request sharing, profile payload allowlists, route guards and UI workflows were retained. The password-reset page was restored from the pre-intermediary implementation; only its obsolete server-confirmation branch was removed. No styles, responsive breakpoints, product data, accounts, database migrations or RLS policies were changed.

## Authentication and performance

- Separate Admin and Customer SDK clients retain separate `nestora-admin-auth` and `nestora-customer-auth` storage keys. Remember Me selects local storage; session-only login selects session storage. Both persist sessions and enable SDK automatic refresh.
- Only the Customer client consumes OAuth/email callback URLs; the Admin client cannot accidentally import a Customer callback session. Password recovery uses the SDK recovery event and identity verification before updating a password.
- Failed provider login does not log out an existing session. Cleanup applies when a newly established session fails authorization. Temporary profile/identity/server errors preserve credentials and remain retryable. Explicit logout is shared per audience and retains its distinction between local cleanup and confirmed remote revocation.
- Profile queries share concurrent requests and do not run SDK data retries on authorization lookups. Customer profile initialization and catalogue/review/product caches remain shared. Admin order operations use the SDK's local session check before the existing database RPC, avoiding an extra remote identity request for every operation.
- Guest offers use an independent anonymous SDK client and a public audience filter. They cannot inherit Admin credentials. Customer and Admin queries, uploads, RPCs and native Realtime use their own SDK credentials.

## Security

Only the existing publishable key is configured in Angular. No service-role key, server encryption key or secret credential was added to frontend code. Access and refresh tokens are browser-managed again, as explicitly accepted in the request. They are not logged by the migration.

Privileged order/inventory/loyalty/review work remains in the existing Supabase database functions. For example, `update_admin_order_status` and `remove_admin_order_item` check `auth.uid()`, the active profile and Admin/Super Admin role in trusted SQL. No privileged operation was moved into browser-only authorization and no new Edge Function is required to replace the removed transport.

Inventory/product-variant/promotion replacement functions use invoker security and therefore depend on their tables' deployed RLS. Discount gift replacement has an explicit active Admin check. The definition of the existing `refresh_dashboard_statistics` RPC is not present in the versioned SQL; its deployed security mode, grants and role checks require inspection. This migration does not claim that an uninspected deployed function is secure merely because the Admin UI calls it.

**Production security verification remains blocked:** the repository's `supabase/manual/phase2-v2` documentation records profile-privilege and account-deactivation hardening as proposed and not confirmed deployed. Source inspection and anonymous probes cannot establish authenticated field-level privileges, cross-customer isolation or deactivation enforcement on the deployed database. Review the existing read-only inspection and staging checklist with an authorized database administrator before certifying production security. No policy was weakened or changed to bypass this uncertainty; adding a browser check or an Edge Function would not repair an independently writable database privilege field.

## Validation

| Check | Result |
| --- | --- |
| Initial direct migration regression run | 30 passed: installed SDK, audience independence, Remember Me, session restoration, expired-token refresh, failure retention and public access |
| First full Angular suite | 153 passed across 28 files |
| Final full Angular suite | 155 passed / 156; one untouched analytics line-chart test timed out during the concurrent build/test run. The isolated chart rerun passed all 3 tests. All migration/auth/transport/security regression tests passed |
| Production Angular build | Passed after migration; existing initial-bundle/style budget and CommonJS warnings remain |
| Full Angular lint | Passed |
| Plain `npm start` | Started Angular independently; HTML returned 200 at `http://localhost:4300/` |
| Backend dependencies | No Redis/Fastify dependency in the root application manifest or dependency tree |
| Runtime source audit | No intermediary imports, endpoints, feature flags, session APIs or CSRF logic remain in Angular |
| Database changes | `git diff --name-only -- supabase` is empty |
| Live anonymous direct reads | Products, categories, promotions, discounts and offers returned 200 |
| Live public reviews RPC | `get_public_product_reviews` returned 200 |
| Live anonymous protected reads | Orders, profiles and carts returned no rows; customer addresses returned 401 |
| Live native Supabase Realtime | Public products channel reached `SUBSCRIBED`; no rows were mutated to manufacture events |

Regression coverage also checks Admin role rejection, Customer signup/recovery, route guards, cancellation of delayed responses, upload/RPC credential ownership, propagation of database policy denials without anonymous fallback, checkout/cart/order query routing, and cache sharing. Test records are confined to intercepted test HTTP; no mock application data or production test rows were created.

## Remaining live/deployment checks

- Successful real-account Admin/Customer login, logout and refresh **after this migration** were not exercised. The earlier real Admin login used the now-removed transport and is not evidence for the new path. Computer use was stopped by the user; no further browser interaction was performed.
- Live authenticated CRUD, dashboard data, order placement, checkout mutations, private loyalty/review authorization, Storage uploads and realtime change delivery require authorized test accounts/disposable data. Native SDK transport is regression-tested; no production account or order was modified to substitute for that acceptance work.
- OAuth/email redirects must allow the current `/auth/customer-callback` and `/auth/customer-reset-password` URLs. Old server-issued recovery links and opaque sessions cannot become SDK sessions; sign in again or request a fresh recovery link. Old HttpOnly cookies may remain in the browser until expiry/site-cookie cleanup, but no application code reads or depends on them.
- Production hosting must serve the Angular artifact with SPA fallback and allow HTTPS/WebSocket connections to the Supabase project. Any previously deployed server/proxy/Redis resources must be decommissioned in that hosting environment; no deployment credentials were available here.

## Generated-file cleanup limitation

All tracked backend code, packages, configurations and obsolete documentation were deleted, including the ignored server `.env`. Automatic approval review rejected recursive shell deletion with “blocked by policy.” A safer Recycle Bin operation returned “Attempted to perform an unauthorized operation,” and the user stopped desktop cleanup.

Consequently these generated local directories remain: `bff/` (orphaned `node_modules` and empty source/output folders), `.tmp/local-bff-garnet/` (portable cache/runtime/downloads/data), `dist/nestora-bff-staging/` (old generated staging output), and an empty `src/app/core/services/bff/` directory. The compiled server JavaScript was also deleted individually, so no backend application source or executable build remains in `bff/`. These residual folders are not referenced, built, required or running. Standard generated-directory ignore rules keep dependency/build residue out of source control. Complete physical removal of this residue requires filesystem permission or manual cleanup; it is not claimed completed.

The new production artifact is `dist/nestora-home`. Do not deploy the obsolete generated staging directory.

## Changed/deleted source manifest

The following manifest is relative to backup `07921ba`. `M` means modified, `D` deleted, and `A` added. The source history remains available in Git.

```text
M	.gitignore
M	angular.json
D	bff/.env.example
D	bff/Dockerfile
D	bff/nginx.example.conf
D	bff/package-lock.json
D	bff/package.json
D	bff/src/app.ts
D	bff/src/config.ts
D	bff/src/main.ts
D	bff/src/policy.ts
D	bff/src/realtime.ts
D	bff/src/revocations.ts
D	bff/src/security.ts
D	bff/src/sessions.ts
D	bff/src/store.ts
D	bff/src/supabase.ts
D	bff/test/auth.test.ts
D	bff/test/callback-security.test.ts
D	bff/test/helpers.ts
D	bff/test/realtime.test.ts
D	bff/test/redis.test.ts
D	bff/test/revocations.test.ts
D	bff/test/security.test.ts
D	bff/test/store-recovery.test.ts
D	bff/test/surface.test.ts
D	bff/tsconfig.json
D	bff/tsconfig.test.json
D	docs/BFF_STABILITY_INVESTIGATION.md
M	docs/LOCAL_STARTUP.md
D	docs/PHASE3_BFF.md
D	docs/PHASE3_IMPLEMENTATION_RESULTS.md
M	package.json
D	proxy.bff.json
D	scripts/check-bff.mjs
D	scripts/start-dev.mjs
D	src/app/core/models/auth/browser-auth.models.ts
M	src/app/core/services/auth/admin-auth.service.spec.ts
M	src/app/core/services/auth/admin-auth.service.ts
M	src/app/core/services/auth/auth-request-error.spec.ts
M	src/app/core/services/auth/auth-request-error.ts
M	src/app/core/services/auth/auth-session-lifecycle.spec.ts
M	src/app/core/services/auth/auth-session-lifecycle.ts
D	src/app/core/services/auth/customer-auth-performance.spec.ts
M	src/app/core/services/auth/customer-auth.service.spec.ts
M	src/app/core/services/auth/customer-auth.service.ts
D	src/app/core/services/bff/bff-api.spec.ts
D	src/app/core/services/bff/bff-api.ts
D	src/app/core/services/bff/bff-auth-client.ts
D	src/app/core/services/bff/bff-realtime-channel.ts
D	src/app/core/services/bff/bff-supabase-client.spec.ts
D	src/app/core/services/bff/bff-supabase-client.ts
M	src/app/core/services/supabase/supabase.service.ts
M	src/app/core/tokens/supabase.tokens.ts
M	src/app/data-access/services/categories.service.ts
D	src/app/data-access/services/customer-bff-routing.spec.ts
M	src/app/data-access/services/customer-offers.service.ts
M	src/app/data-access/services/discounts.service.ts
M	src/app/data-access/services/orders.service.ts
M	src/app/data-access/services/promotions.service.ts
M	src/app/features/auth/pages/customer-reset-password/customer-reset-password.component.html
M	src/app/features/auth/pages/customer-reset-password/customer-reset-password.component.spec.ts
M	src/app/features/auth/pages/customer-reset-password/customer-reset-password.component.ts
M	src/app/features/customer/home/pages/home-page/home-public-data.service.ts
M	src/app/features/customer/services/customer-catalog.service.ts
M	src/app/features/customer/services/customer-product-videos.service.ts
M	src/app/features/customer/services/customer-reviews.service.spec.ts
M	src/app/features/customer/services/customer-settings.service.ts
M	src/assets/i18n/translations.json
D	src/environments/environment.bff.ts
M	src/environments/environment.ts
A	docs/DIRECT_SUPABASE_MIGRATION.md
A	src/app/core/services/auth/direct-supabase.spec.ts
A	src/app/data-access/services/customer-direct-routing.spec.ts
```
