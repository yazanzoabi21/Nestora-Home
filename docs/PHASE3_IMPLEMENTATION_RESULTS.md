# Phase 3 implementation results

Implemented locally on 2026-11-03. Production activation is disabled. No Supabase SQL, RLS, tables, functions, authentication settings or deployment were changed. The pending Phase 2 SQL package was not executed or modified.

## Root cause and implementation

The browser was the Supabase Auth SDK caller, so valid access/refresh tokens necessarily reached its login response and persistence. Phase 3 adds a real Node/TypeScript BFF that becomes that caller. It stores tokens in encrypted, shared Redis records and returns opaque Secure/HttpOnly/SameSite cookies plus sanitized identity/profile data. The opt-in Angular transport routes authentication and SDK data/RPC/Storage requests through `/api`; Realtime uses a server-authorized SSE relay. Each upstream authenticated request uses the user's JWT, with current active-audience authorization, rather than a service-role key. Existing layouts, templates, styles, business calculations and response mappers remain in place.

Server-side PKCE covers Google and email flows. Recovery-only sessions cannot read protected data. Customer password changes verify the current password on the backend without replacing the BFF session. Session IDs rotate on sign-in; refresh and logout share fenced Redis leases. CSRF, shared rate limits, explicit resource/method allowlists, profile field restrictions, expiry, response credential checks, no-store behavior, pending-logout handling, cross-tab notifications and request generations protect the new flow.

## Executed validation

- Angular full suite: **128 tests passed across 22 files**. Includes the existing Phase 2 suite plus BFF transport, token-free session/storage, CSRF, SDK query/checkout forwarding, uploads, recovery events, failed-logout retry, stale response rejection and independent Admin sign-out behavior.
- Backend: **21 tests passed, 1 explicitly skipped**, using the actual Supabase SDK with controlled upstream HTTP/WebSocket fixtures. Covers both audiences, secure cookie properties, encrypted/context-bound records, CSRF/rate limits, role/deactivation checks, privilege rejection, concurrent refresh, expiry, logout failure/invalidation, PKCE callback/replay, cross-browser email handling, recovery-only access, password changes, checkout body/idempotency preservation, avatars, route inventory and private WebSocket-to-SSE delivery followed by logout.
- Skipped backend test: real Redis lease/fencing/expiry/atomic-consumption integration requires a disposable `BFF_TEST_REDIS_URL`. No Redis/Docker/WSL service is available here. The production entry point has no memory-store fallback; the test-only store is not compiled into runtime output.
- `npm run build`: passed. Default production client remains on the legacy feature flag.
- `npm run build:bff-client`: passed. Opt-in staging client output is isolated at `dist/nestora-bff-staging`.
- `npm run bff:build` / backend TypeScript build: passed. Test source also passes strict TypeScript via `bff/tsconfig.test.json` (now the backend pretest command).
- `npm run lint`: passed for the full Angular source tree. Separate ESLint over `bff/src/**/*.ts` and `bff/test/**/*.ts`: passed.
- `git diff --check`: passed. Builds retain bundle/style-budget and existing dependency CommonJS warnings; no build errors were reported.
- Isolated backend `npm ci --ignore-scripts`: passed from the bff directory; backend dependency audit reported zero vulnerabilities. No root application dependency was added for the BFF runtime.

## What remains unverified

No live Admin/Customer Supabase login, real Google consent, real checkout mutation, real Redis multi-instance/failover test, Docker build or Chrome/Edge DevTools acceptance was performed. Automated fixtures prove transport behavior and exercise the actual SDK, but do not establish that the live website already satisfies the Network success criterion.

Configure the final same-origin HTTPS ingress, a persistent Node service, authenticated TLS Redis, a stable server-only encryption key, Supabase publishable credentials, and the reviewed OAuth/email redirect allowlists/templates. Then complete the real-data/browser acceptance checklist in PHASE3_BFF.md, including service-worker/client upgrades and independent sessions. Existing legacy sessions require relogin; no browser token is imported into the BFF. Keep production flags off until these gates pass.

Current ordinary production builds still use the existing login flow. The token-free path is selected only by the explicit BFF build plus an enabled/configured backend; it never falls back to direct Supabase authentication when the API is unavailable.

## Exact Phase 3 file list

The earlier Phase 2 changes were already present in the workspace and were preserved. The following list identifies files added or further modified specifically for Phase 3.

- [.gitignore](C:/Users/yzoabi/Projects/Angular/Nestora-Home/.gitignore) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [angular.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/angular.json) — Disabled-by-default flags, isolated builds, scripts, dependencies or same-origin dev routing.
- [bff/.env.example](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/.env.example) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [bff/Dockerfile](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/Dockerfile) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [bff/nginx.example.conf](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/nginx.example.conf) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [bff/package-lock.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/package-lock.json) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [bff/package.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/package.json) — Disabled-by-default flags, isolated builds, scripts, dependencies or same-origin dev routing.
- [bff/src/app.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/app.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/config.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/config.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/main.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/main.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/policy.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/policy.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/realtime.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/realtime.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/security.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/security.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/sessions.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/sessions.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/store.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/store.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/src/supabase.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/src/supabase.ts) — Server runtime: configuration, secure sessions, Supabase gateway, authorization or Realtime relay.
- [bff/test/auth.test.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/test/auth.test.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [bff/test/helpers.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/test/helpers.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [bff/test/realtime.test.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/test/realtime.test.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [bff/test/redis.test.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/test/redis.test.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [bff/test/security.test.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/test/security.test.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [bff/test/surface.test.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/test/surface.test.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [bff/tsconfig.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/tsconfig.json) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [bff/tsconfig.test.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/bff/tsconfig.test.json) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [docs/PHASE3_BFF.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/docs/PHASE3_BFF.md) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [docs/PHASE3_IMPLEMENTATION_RESULTS.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/docs/PHASE3_IMPLEMENTATION_RESULTS.md) — Backend packaging/deployment example, dependency lock, ignored output, or implementation/runbook documentation.
- [ngsw-config.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/ngsw-config.json) — Keep API routes outside service-worker navigation/cache handling.
- [package.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/package.json) — Disabled-by-default flags, isolated builds, scripts, dependencies or same-origin dev routing.
- [proxy.bff.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/proxy.bff.json) — Disabled-by-default flags, isolated builds, scripts, dependencies or same-origin dev routing.
- [src/app/core/models/auth/browser-auth.models.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/models/auth/browser-auth.models.ts) — Explicit browser interfaces that have no token fields.
- [src/app/core/services/auth/admin-auth.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/admin-auth.service.spec.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [src/app/core/services/auth/admin-auth.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/admin-auth.service.ts) — Token-free session types and stale/cross-tab authorization-state handling.
- [src/app/core/services/auth/auth-session-lifecycle.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/auth-session-lifecycle.ts) — Token-free session types and stale/cross-tab authorization-state handling.
- [src/app/core/services/auth/customer-auth.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/customer-auth.service.ts) — Token-free session types and stale/cross-tab authorization-state handling.
- [src/app/core/services/bff/bff-api.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/bff/bff-api.ts) — Token-free same-origin browser authentication/data/Realtime transport.
- [src/app/core/services/bff/bff-auth-client.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/bff/bff-auth-client.ts) — Token-free same-origin browser authentication/data/Realtime transport.
- [src/app/core/services/bff/bff-realtime-channel.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/bff/bff-realtime-channel.ts) — Token-free same-origin browser authentication/data/Realtime transport.
- [src/app/core/services/bff/bff-supabase-client.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/bff/bff-supabase-client.spec.ts) — Authentication/data/Realtime/Redis security regression coverage and strict test typing.
- [src/app/core/services/bff/bff-supabase-client.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/bff/bff-supabase-client.ts) — Token-free same-origin browser authentication/data/Realtime transport.
- [src/app/core/services/supabase/supabase.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/supabase/supabase.service.ts) — Narrow client typing compatible with token-free transport.
- [src/app/core/tokens/supabase.tokens.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/tokens/supabase.tokens.ts) — Opt-in BFF client factories and targeted legacy credential cleanup.
- [src/app/features/customer/services/customer-catalog.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-catalog.service.ts) — Use the shared Realtime interface with either transport.
- [src/app/features/customer/services/customer-product-videos.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-product-videos.service.ts) — Use the shared Realtime interface with either transport.
- [src/app/features/customer/services/customer-settings.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/services/customer-settings.service.ts) — One server transaction for password verification/change.
- [src/app/shared/utils/avatar-upload.util.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/utils/avatar-upload.util.ts) — Narrow client typing compatible with token-free transport.
- [src/environments/environment.bff.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/environments/environment.bff.ts) — Disabled-by-default flags, isolated builds, scripts, dependencies or same-origin dev routing.
- [src/environments/environment.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/environments/environment.ts) — Disabled-by-default flags, isolated builds, scripts, dependencies or same-origin dev routing.
