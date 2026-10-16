# Nestora Home technical health report

Audit date: 16 October 2026. Repository instructions: AGENTS.md. Changes are local and uncommitted.

## Outcome and limits

Implemented verified client fixes while retaining the existing architecture, product loading and stale-cache display, translations, separate customer/admin authentication, and route structure. No deployment, commit, production mutation, credential edit, database change, or migration change was performed. Package manifests and the lockfile are unchanged.

This is a repository audit with automated checks and guest browser smoke tests, not a certification of every live workflow. Supabase requests failed in the browser environment with a network fetch error. Signed-in operations, actual data correctness, deployed RLS, and GPU inference therefore remain unverified.

## Validation

| Check | Baseline | Final |
| --- | --- | --- |
| Production Angular build | Pass with warnings | Pass with warnings |
| Initial bundle, raw | 660.46 kB | 656.96 kB |
| Initial bundle, estimated transfer | 150.66 kB | 149.70 kB |
| Full-project ESLint | 47 errors | Pass, zero errors |
| Unit tests | 31 passed, 3 failed | 56 passed across 16 files |
| Application TypeScript | Covered by baseline build | Explicit no-emit check passed |
| Test TypeScript | Existing tests compiled | Explicit no-emit check passed |
| Diff whitespace check | Clean worktree | Pass |

Final commands: npm run build -- --stats-json; npm run lint; npm run test -- --watch=false; npx tsc -p tsconfig.app.json --noEmit; npx tsc -p tsconfig.spec.json --noEmit; git diff --check.

Remaining build warnings: initial bundle exceeds the existing 500 kB warning threshold; product reviews CSS is 4.18 kB, account profile CSS is 5.36 kB, and order card CSS is 4.13 kB against a 4 kB warning threshold. PDF transitive dependencies still produce CommonJS warnings. Warning thresholds were preserved, and warnings were not suppressed.

## Root causes and implemented fixes

### Access and authentication

- The super-admin role guard returned true unconditionally. It now checks the active authenticated profile and requires super_admin. Admins are redirected to their area; inactive or other accounts go to login. Removed the unused permissive permission guard from this route; module permission infrastructure remains a placeholder, not an implemented permission system.
- Admin restoration checked the role but ignored is_active. Inactive restored accounts are now denied. Customer authentication computed state now also requires an active profile, matching existing login validation.
- Admin child navigation previously depended only on the initial parent guard. Child routes now revalidate authentication. Concurrent admin profile checks share their pending request; later checks still revalidate rather than retaining a long-lived permission cache.
- Browser-storage method calls could throw even after obtaining the Storage object. Authentication storage now falls back to memory for blocked or full storage. A failed sign-out removal cannot immediately resurrect the old session within that adapter. Language preferences, OAuth return URLs, and guest cart persistence tolerate storage failures.
- Background customer session initialization now handles its rejected promise; callers awaiting initialization still receive the error.

### Cart variants

- The cart UI and checkout tracked variant IDs, but the persistence service explicitly discarded them. Server lookup/insertion/deletion now distinguishes variants; updates retain the selected ID. Existing database support is documented in 20260817090000_create_product_variants.sql; no schema changes were needed.
- Server and guest cart restoration now load and map existing product variants, preserving their prices, stock, images, options, and identifiers. Missing variants remain unavailable instead of silently becoming the base product; inactive variants cannot be treated as in stock.
- Regression tests cover server insertion and restoration, guest restoration, deletion boundaries, and deleted variants. End-to-end checkout with a real account still needs staging verification.

### Product details and search

- Product details read route snapshots only at construction, so navigating between product URLs could retain the previous product. The component now observes identifier changes, cleans up subscriptions, clears obsolete UI state, and ignores stale request responses. Promotion breadcrumbs likewise ignore stale responses.
- A missing slug was passed into a UUID ID query, causing a database type error. UUID fallback is now used only for UUID-shaped identifiers, preserving existing ID links.
- An optional video request could fail the entire details request. Video failure now allows product details to render; the existing video service retains its refresh error state.
- Gallery initialization downloaded every image immediately. Only adjacent gallery images are now preloaded, using the existing preload cache.
- Concurrent normalized text searches now share the same pending request. Existing bounded TTL caching remains; failed requests are removed so retry works.
- Visual search ignored both its similarity argument and requested result limit, sending minimum_similarity=-1 and a forced larger count. It now honors the existing configured 0.45 threshold and requested count, with regression coverage. Removed an unconditional raw-result production log.

### Loading and bundles

- The service worker prefetched every root JavaScript file, defeating network deferral of lazy admin and AI features. Main entry files and CSS remain prefetched; code chunks and WASM use on-demand caching.
- In the final generated manifest, 109 code assets totaling 4,825,112 raw bytes use lazy caching. This is an avoided automatic prefetch cost, not an equivalent reduction of the initial Angular bundle or a measured improvement in page timing.
- Highcharts provisioning moved from application bootstrap into the existing lazy admin route scope. Shared translation JSON is fetched once per loader and reused for both languages.
- Admin PDF and spreadsheet modules are dynamically imported only when an export is requested. Export actions prevent concurrent execution, expose busy state, and report failures. The final lazy spreadsheet chunk is about 432 kB; PDF generation is also separate.
- Touched components use OnPush. Existing signals, computed filters, route lazy loading, cache TTLs, realtime subscriptions, and mobile/desktop shared filter state were retained.

### UI, accessibility, and cleanup

- Checkout field labels now explicitly reference their controls. The custom select had mouse-only interactions and nested interactive controls inside a label; it now uses a styled native select with keyboard and mobile platform support. Existing inputs and form controls remain the API.
- Avatar preview and shipping dialogs now provide keyboard dismissal and focus trapping. Backdrop interaction no longer requires a non-focusable inner click handler.
- All-products and new-arrivals error states now offer retry and translated English/Arabic guidance instead of exposing a raw fetch exception.
- Removed unused imports, interfaces, catch bindings, and values; corrected array typings and migrated remaining touched constructor injection. Unused UI scaffold selectors now follow the app prefix.
- Existing adminTableCell and checkout select event APIs were preserved with narrow, documented lint exceptions rather than breaking consumers or globally weakening lint rules.
- Replaced outdated starter tests and supplied appropriate test providers. Test doubles and fixture values exist only in specs; no application mock catalog or customer data was added.

## Feature coverage

| Area | Repository findings and verification |
| --- | --- |
| Customer catalog, home, categories, offers, flash deals | Routes, services, filters, sorting, pagination, cache and realtime paths inspected; Angular/lint checks pass. Guest layouts and failure states checked. Actual content cannot be verified while Supabase fetches fail. |
| Product details, reviews, images, videos | Source paths inspected; route and lookup fixes implemented. Existing video/cache tests pass. Real media and reviews require reachable data. |
| AI visual search | Worker, DINO model settings, image preparation, RPC/index contracts, ranking and overlay behavior inspected; existing and new tests pass. Runtime is currently forced to WASM in DinoImageEmbeddingService.prepare; WebGPU selection remains disabled in existing code. Model download, hardware inference, and match quality were not benchmarked. |
| Cart, wishlist, checkout, orders, invoices | Services, ownership checks and checkout arguments inspected; variant persistence fixed and tested. Empty guest cart and checkout redirect verified. No order was placed and no signed-in invoice was generated. Wishlist currently presents product-level state; this was preserved. |
| Authentication, Google, password reset, profile | Guest forms render and unauthorized route redirects work. Active-profile checks and storage failures tested. Google redirects, email delivery, password mutation and account updates require test accounts. |
| Admin management | Implemented routes include dashboard, analytics, products, categories, inventory, reviews, discounts, promotions, media, shipping, payments, loyalty settings, orders, customers, notifications, profile and help. Static/build checks pass; real mutations and statistics require staging credentials. |
| Super admin | The route and layout exist, but the route has no child screens and the layout template is empty. Store management, role editing and other empty scaffold folders were not treated as implemented features. Role boundary now has tests. |

### Browser checks

Headless Microsoft Edge served the production build locally using an isolated browser profile. Ten guest routes were checked at 390, 768 and 1440 px: home, products, a missing product URL, cart, checkout, customer login, registration, forgot password, admin and super admin. No uncaught JavaScript exceptions, empty app shells, or horizontal overflow were observed in those snapshots. Empty checkout redirects to cart; both protected role areas redirect to admin login.

A longer product-list check observed the real fetch failure; initial short snapshots were still showing skeletons and are not evidence that products loaded. Final product and new-arrival failure states were additionally checked at all three widths, including translated retry text. Mobile filters trapped focus, locked background scroll, closed on Escape, and restored body scrolling. Arabic restored lang=ar, dir=rtl, and translated the products heading without overflow at 390 px.

These checks do not validate a populated cart, actual product transitions, or signed-in dialogs. No Lighthouse/Core Web Vitals score, scrolling frame-rate measurement, or real-device GPU result is claimed. Initial bundle size did not regress; additional cart variant relation data should be measured with a real catalog.

## Remaining findings and prioritized actions

### P0: dependency security remediation

npm audit returned 39 advisories: 3 critical, 19 high, 16 moderate and 1 low, including development and transitive dependencies. Critical findings include build-tool dependency chains; severity counts do not establish production exploitability. Direct affected packages include Angular framework/build/CLI, Transformers.js, PostCSS, Vitest and SheetJS.

Both npm audit fix --ignore-scripts and an explicitly scoped npm update within current version ranges failed in the installed npm 10.9.2 Arborist peer resolver with Cannot read properties of null (reading 'edgesOut'). No package or lockfile change resulted. Do not use a forced major update as an automatic substitute. Reproduce dependency installation with the project's declared npm@11.1.0 in a clean environment, resolve the peer dependency graph, update compatible patches together, and rerun all checks.

Transformers.js remediation is reported as a major upgrade and needs inference/index compatibility testing. npm reports no registry fix for xlsx@0.18.5; SheetJS documents its authoritative distribution and newer releases outside the stale npm registry. Export is currently write-only, which limits relevance of file-parser advisories, but does not eliminate the dependency-maintenance task. References: [Angular advisories](https://github.com/angular/angular/security/advisories), [SheetJS installation guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

### P1: database policy review before trusting live authorization

The checked-in migration 20260720000000_allow_admins_read_profiles.sql attaches a SELECT policy to public.profiles that queries public.profiles again. This self-reference risks recursive RLS evaluation and failed authenticated profile reads; the migration also omits an active-account condition. This is a source-level finding, not a confirmed diagnosis of the browser network failure or the deployed database state.

Required database work: inspect deployed policies and grants; test customer/admin/inactive/anonymous access in staging; replace recursive role lookup with an appropriately secured, restricted helper or another non-recursive authorization design; include active-account requirements consistently. Verify column privileges and the existing customer privilege-protection trigger. Review product/order/storage policies as the repository contains incremental migrations rather than a complete base schema. No SQL, policies, grants, or migrations were changed. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

### P1: restore real backend verification

Determine why browser Supabase calls fail from this environment (configuration, network, project availability, or CORS need investigation; no cause is asserted). Then verify product/variant cart restoration across sign-in/reload, free gifts, stock validation, checkout idempotency, order ownership, invoices, admin stock restoration, upload permissions, OAuth redirects and password recovery using non-production test accounts.

### P2: cache correctness and scale

- Customer promotion caches have no TTL; check long-running sessions and promotion expiry/update invalidation. Do not replace the existing catalog cache with unconditional network-first loading.
- Catalog and review-count reads lack explicit pagination. Verify behavior beyond the configured Supabase row limit; review counts currently download matching review rows. Introduce paging or an existing compatible aggregate only after measuring and documenting the backend contract.
- Queries generally rely on network defaults for timeout behavior. Introduce bounded cancellation for reads where needed; avoid blindly retrying order or inventory mutations.
- Sidebar badge refresh repeats equivalent count queries; coalesce pending identical reads or combine counts after profiling.
- Evaluate incremental catalog refresh, responsive image variants, LCP loading priority, and remaining style budgets using a populated representative store. Do not resize original production uploads during an audit.

### P2: incomplete features and maintenance

Analytics export and the admin help request action remain placeholders. Permission service/guard scaffolding is incomplete; no module-level permission system is claimed. Several packages, including NgRx, AOS, Day.js, Lodash, image-lazyload/file-drop helpers and PrimeFlex, have no matching application imports in the source search; verify all configuration/build usage before removing them after dependency installation is reliable. Package removal was not attempted around a broken resolver.

## Modified files

The manifest below covers implementation and test changes; this report is an additional new file. Existing reusable controls/state were improved in place; no global state library or application data layer was added.

- [ngsw-config.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/ngsw-config.json)
- [src/app/app.config.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/app.config.ts)
- [src/app/app.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/app.spec.ts)
- [src/app/app.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/app.ts)
- [src/app/core/guards/role.guard.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/role.guard.spec.ts)
- [src/app/core/guards/role.guard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/role.guard.ts)
- [src/app/core/services/auth/admin-auth.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/admin-auth.service.spec.ts)
- [src/app/core/services/auth/admin-auth.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/admin-auth.service.ts)
- [src/app/core/services/auth/customer-auth.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/customer-auth.service.spec.ts)
- [src/app/core/services/auth/customer-auth.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/customer-auth.service.ts)
- [src/app/core/services/navigation/admin-global-search.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/navigation/admin-global-search.service.ts)
- [src/app/core/services/translation/translation.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/translation/translation.service.ts)
- [src/app/core/tokens/supabase.tokens.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/tokens/supabase.tokens.spec.ts)
- [src/app/core/tokens/supabase.tokens.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/tokens/supabase.tokens.ts)
- [src/app/data-access/services/admin-notifications.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/data-access/services/admin-notifications.service.ts)
- [src/app/data-access/services/dashboard.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/data-access/services/dashboard.service.ts)
- [src/app/data-access/services/product-image-embedding.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/data-access/services/product-image-embedding.service.spec.ts)
- [src/app/data-access/services/product-image-embedding.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/data-access/services/product-image-embedding.service.ts)
- [src/app/features/admin/admin.routes.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/admin.routes.ts)
- [src/app/features/admin/analytics/analytics.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/analytics/analytics.spec.ts)
- [src/app/features/admin/analytics/analytics.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/analytics/analytics.ts)
- [src/app/features/admin/dashboard/dashboard/dashboard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/dashboard/dashboard/dashboard.ts)
- [src/app/features/admin/profile/profile.component.html](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/profile/profile.component.html)
- [src/app/features/admin/profile/profile.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/profile/profile.component.ts)
- [src/app/features/admin/promotions-ads/promotions-ads.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/promotions-ads/promotions-ads.component.ts)
- [src/app/features/admin/shipping/shipping.component.html](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/shipping/shipping.component.html)
- [src/app/features/admin/shipping/shipping.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/admin/shipping/shipping.component.ts)
- [src/app/features/customer/checkout/checkout-delivery/checkout-delivery.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/checkout/checkout-delivery/checkout-delivery.component.ts)
- [src/app/features/customer/checkout/checkout-payment/checkout-payment.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/checkout/checkout-payment/checkout-payment.component.ts)
- [src/app/features/customer/checkout/shared/checkout-form-field/checkout-form-field.component.html](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/checkout/shared/checkout-form-field/checkout-form-field.component.html)
- [src/app/features/customer/checkout/shared/checkout-form-field/checkout-form-field.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/checkout/shared/checkout-form-field/checkout-form-field.component.ts)
- [src/app/features/customer/pages/all-products/all-products.html](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/all-products/all-products.html)
- [src/app/features/customer/pages/all-products/all-products.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/all-products/all-products.ts)
- [src/app/features/customer/pages/contact/customer-contact.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/contact/customer-contact.component.ts)
- [src/app/features/customer/pages/content-page/customer-content-page.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/content-page/customer-content-page.component.ts)
- [src/app/features/customer/pages/faq/customer-faq.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/faq/customer-faq.component.ts)
- [src/app/features/customer/pages/new-arrivals/new-arrivals.html](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/new-arrivals/new-arrivals.html)
- [src/app/features/customer/pages/new-arrivals/new-arrivals.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/pages/new-arrivals/new-arrivals.ts)
- [src/app/features/customer/product-details/product-details.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/product-details/product-details.component.ts)
- [src/app/features/customer/promotions/pages/flash-deals/flash-deals-page/flash-deals-page.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/promotions/pages/flash-deals/flash-deals-page/flash-deals-page.ts)
- [src/app/features/customer/services/customer-cart.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-cart.service.spec.ts)
- [src/app/features/customer/services/customer-cart.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-cart.service.ts)
- [src/app/features/customer/services/customer-catalog.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-catalog.service.spec.ts)
- [src/app/features/customer/services/customer-catalog.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-catalog.service.ts)
- [src/app/features/customer/services/customer-recently-viewed.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-recently-viewed.service.ts)
- [src/app/features/customer/services/customer-search.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-search.service.spec.ts)
- [src/app/features/customer/services/customer-search.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-search.service.ts)
- [src/app/features/customer/services/customer-shopping-state.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-shopping-state.service.ts)
- [src/app/features/super-admin/super-admin.routes.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/super-admin/super-admin.routes.ts)
- [src/app/shared/ui/admin-table/admin-table.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/admin-table/admin-table.component.ts)
- [src/app/shared/ui/badge/badge.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/badge/badge.component.ts)
- [src/app/shared/ui/button/button.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/button/button.component.ts)
- [src/app/shared/ui/card/card.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/card/card.component.ts)
- [src/app/shared/ui/chart-card/chart-card.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/chart-card/chart-card.component.ts)
- [src/app/shared/ui/empty-state/empty-state.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/empty-state/empty-state.component.ts)
- [src/app/shared/ui/export-report/export-report.html](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/export-report/export-report.html)
- [src/app/shared/ui/export-report/export-report.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/export-report/export-report.ts)
- [src/app/shared/ui/form-field/form-field.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/form-field/form-field.component.ts)
- [src/app/shared/ui/loader/loader.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/loader/loader.component.ts)
- [src/app/shared/ui/modal/modal.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/modal/modal.component.ts)
- [src/app/shared/ui/table/table.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/table/table.component.ts)
- [src/app/shared/ui/user-menu/user-menu.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/user-menu/user-menu.component.ts)
- [src/app/shared/utils/initials-avatar.util.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/utils/initials-avatar.util.ts)
- [src/assets/i18n/translations.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/assets/i18n/translations.json)

## Local evidence

Ignored local outputs are retained under .tmp/health/: dependency-audit.json, browser-results.json, browser-network-results.json, browser-final-results.json, screenshots, and the final build/test/lint/typecheck logs. They are diagnostic artifacts and are not committed project assets.
