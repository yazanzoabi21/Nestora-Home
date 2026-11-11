# BFF stability investigation — 11 November 2026

The BFF was retained and repaired. No Git rollback, database migration, RLS change, privileged credential exposure, or production BFF activation was performed. Existing uncommitted work was preserved.

## Observed root causes

1. At the start of the investigation there were no listeners on `127.0.0.1:3000` or port `6379`. An Angular process was listening on `::1:4300`. Angular's `/api/**` proxy targets port 3000, so `ECONNREFUSED` and a proxy-generated `/api/csrf` HTTP 500 occur before the BFF CSRF handler can execute. Historical logs show successful starts and watch restarts, but no evidence establishing a particular application exception as the reason the processes stopped. It would be inaccurate to claim a proven crash stack trace.
2. `npm start` previously ran a readiness check followed by Angular; it did not start or supervise the BFF/cache. The documented setup required three independent terminals. Direct `ng serve` bypasses the readiness check.
3. `RedisStore` explicitly set `reconnectStrategy: false`. After a temporary cache disconnect, requests could not recover without restarting the BFF. Initial connection errors were logged generically, and configuration loading happened outside startup error handling.
4. The previous local Garnet command enabled neither append-only persistence nor recovery. Stopping that volatile store destroys server sessions even if the browser still has its opaque cookie. Missing server records are legitimately expired sessions; they cannot be reconstructed from the cookie. Newly persisted records now survive cache restarts when the same data directory and encryption key are retained.
5. The BFF login handler mapped every Supabase password-login error to `401 INVALID_CREDENTIALS`. Shared frontend login cleanup called logout on every failed attempt, including transport/service failures. Services discarded error status/type by wrapping errors in generic `Error` instances; the login page then displayed the credential message. Profile failures and some protected-navigation paths could also clear or appear to discard an established session.
6. In Git HEAD, `BffAuthClient.readSession()` published `SIGNED_OUT` for every failed session read, and `BffApi` treated unrelated 401 responses as session invalidation. Existing uncommitted changes already repaired these paths and shared concurrent session reads; those repairs were preserved and covered by regression tests.

## Architecture and rollback decision

Development's default Angular serve configuration uses `development,bff` and `proxy.bff.json`. The BFF holds encrypted Supabase credentials in Redis, uses separate audience cookies, validates identity/active roles, and proxies allowlisted queries with user JWTs or the publishable key. Realtime is relayed through same-origin SSE. Supabase remains responsible for RLS and database authorization; privileged RPC work remains in the existing trusted database functions.

The default production build currently uses `environment.ts`, where `bffEnabled=false`; the explicit `build:bff-client` command opts into the BFF build. This pre-existing distinction was preserved. `environment.prod.ts` is not configured as a production file replacement in `angular.json`.

Git history was inspected, including the direct-Supabase token factory in `ad196a5` before the BFF introduction in `00ae6f6`. The current factory still retains the direct SDK branch. A rollback was unnecessary after local startup, real cache recovery, security tests and both build modes succeeded. No blanket checkout of earlier files was used, which would risk overwriting unrelated UI/business changes.

## Repair

- `npm start` and `start:bff` now manage startup: reuse/start the configured cache, launch the BFF, wait for Redis-backed readiness and matching development origin, then launch Angular. A child service exiting stops the services owned by the launcher. Existing external services are never stopped. Occupied ports and mismatched BFF origins fail explicitly. `start:client` retains the manual backend workflow.
- The installed Windows Garnet cache starts with AOF, commit-wait and recovery under the ignored `.tmp/local-bff-garnet/data` directory. There is no memory fallback, installation/download, key regeneration or production store replacement. Other environments must supply Redis themselves.
- Redis connection retries have bounded backoff, no offline command queue and a 15-second initial startup deadline. Established connections automatically reconnect after outages. Requests fail closed with 503 while disconnected, without deleting session cookies.
- Startup diagnostics identify configuration, Redis, app initialization or listener failure without logging credentials or connection URLs. Development health reports its configured origin so the launcher can reject a CSRF origin mismatch before Angular starts.
- Only structured credential rejections become incorrect-credential responses. Network, ambiguous upstream errors and 5xx remain service failures. Refresh deletion requires a recognized credential/session rejection; outages retain the server record.
- Login lifecycle cleanup preserves sessions and the previous remember-me preference on temporary failures. Admin/Customer profile reads preserve error status; ordinary failed refreshes retain existing profile state. Confirmed inactive/missing/unauthorized identities continue to fail authorization.
- Protected navigation during an outage is cancelled for an established session; cached roles do not authorize a new destination. Initial protected access without a validated identity remains denied.
- CSRF acquisition is shared across audiences, has a 10-second deadline, and shares failures for one second to limit outage storms. A structured `CSRF_FAILED` can fetch a fresh nonce and retry once because the backend rejected the request before its handler. Network failures and 5xx never replay mutations. Successful session results are not cached across later authorization checks.
- The login page uses English/Arabic service-unavailable text for temporary failures. No HTML, CSS, layout, responsive breakpoints, data model, database policy, or unrelated business logic was changed by this repair. Existing signals/state and the shared auth lifecycle are reused.

## Files changed by this investigation

Backend:

- `bff/src/app.ts`
- `bff/src/main.ts`
- `bff/src/store.ts`
- `bff/src/supabase.ts`
- `bff/test/auth.test.ts`
- `bff/test/helpers.ts`
- `bff/test/store-recovery.test.ts` (new)

Startup/documentation:

- `package.json`
- `scripts/start-dev.mjs` (new)
- `docs/LOCAL_STARTUP.md`
- `docs/PHASE3_BFF.md`
- `docs/BFF_STABILITY_INVESTIGATION.md` (new)

Angular:

- `src/app/core/guards/role.guard.ts`
- `src/app/core/guards/customer-auth.guard.ts`
- `src/app/core/guards/auth-security.spec.ts`
- `src/app/core/services/auth/admin-auth.service.ts`
- `src/app/core/services/auth/customer-auth.service.ts`
- `src/app/core/services/auth/auth-session-lifecycle.ts`
- `src/app/core/services/auth/auth-session-lifecycle.spec.ts`
- `src/app/core/services/auth/auth-request-error.ts` (new)
- `src/app/core/services/bff/bff-api.ts`
- `src/app/core/services/bff/bff-api.spec.ts` (new)
- `src/app/core/services/bff/bff-supabase-client.spec.ts`
- `src/app/features/auth/pages/login/login.component.ts`
- `src/assets/i18n/translations.json`

Other files already modified when work began were preserved, including `bff/src/sessions.ts`, `src/app/core/guards/auth.guard.ts`, `src/app/core/services/bff/bff-auth-client.ts`, and the customer home page/public-data service. The working-tree diff therefore includes earlier changes as well as this investigation.

## Validation

| Check | Result |
| --- | --- |
| `npm run build` | Passed; existing bundle/style budget and CommonJS warnings remain |
| `npm run build:bff-client` | Passed; production compilation of the opt-in BFF transport |
| `npm run bff:build` | Passed |
| `npm run lint` | Passed across all Angular files |
| Focused Angular core/auth/routing regression suite | 110 passed across 12 files, including outage navigation, 500/503 session retention, CSRF deduplication/recovery and SDK persistence |
| `npm run bff:test` | 72 passed, 3 optional real-store tests skipped without environment variables |
| Real Garnet recovery test with `BFF_TEST_GARNET_ROOT` | 1 passed; starts a disposable cache on an ephemeral port, interrupts it, verifies 503/no cookie clearing, restarts it with persistent data, verifies the same BFF/store connection recovers and records survive |
| Original full Angular suite run | 166 passed, 2 analytics-chart tests timed out (line/column SVG); these tests also timed out in a separate isolated rerun, with 1 pie-chart test passing |
| Managed cold startup | Local persistent cache, BFF and Angular launched in order on port 4301; port 4300 was already occupied |
| Live same-origin probes through Angular | Health, CSRF, Admin/Customer guest session, products, categories, promotions and discounts all returned 200; unauthenticated protected Admin orders returned 401 |
| Live public realtime | Product subscription 200, SSE 200, heartbeat received; no production rows were mutated to manufacture events |
| Login/logout/reload/restoration regression coverage | Both audiences, cookie/session restoration after BFF recreation, token refresh, outage preservation, logout isolation, delayed responses, CSRF recovery and denied access covered using the existing test upstream fixtures/installed SDK |

Logs are under the ignored `.tmp/stability-*` paths. The backend test fixtures are test-only; no mock data was added to the application or Supabase.

## Limits and remaining acceptance work

Successful live Admin/Customer password login, browser reload with real authenticated cookies, live private realtime event delivery, Google login and production hosting/HA were not verified without supplied accounts and access. No user was created or production order placed to bypass that limitation. Source migrations were inspected, but this is not a live audit of every deployed RLS policy. Production activation remains disabled.

The BFF build still requires a running BFF. During a complete process/network outage, public API reads and realtime are unavailable until it recovers; existing realtime reconnect backoff is preserved. Session retention does not grant offline authorization, bypass expiry/revocation, or recover records lost before persistence was enabled. Production must keep the encryption key consistent and supply persistent private TLS Redis plus process supervision.

Start locally with `npm start`; if the default port is occupied use `node scripts/start-dev.mjs --port 4301`. The investigation's managed stack is on `http://localhost:4301/`; the pre-existing process on port 4300 was left untouched.
