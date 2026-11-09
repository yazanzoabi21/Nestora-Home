# Local development startup

Use **http://localhost:4300/**. Angular serves the application there and proxies `/api/*` to the Node BFF at `127.0.0.1:3000`. The cache uses `127.0.0.1:6379`.

The empty response was caused by sending HTTP to an HTTPS Angular listener. Both local serve configurations now explicitly use HTTP port 4300 and the BFF build. Production build flags are unchanged.

Run these in order in separate PowerShell terminals from the repository root. Keep all three processes running. Use `npm start` or `npm run start:bff` so the readiness check runs before Angular launches. Running `ng serve` directly bypasses that check.

## 1. Cache

A portable Microsoft Garnet Redis-compatible cache and its .NET runtime are installed under the ignored `.tmp/local-bff-garnet` directory. They are local dependencies, not application source or a production store replacement.

```powershell
$env:DOTNET_ROOT_X64 = (Resolve-Path '.tmp/local-bff-garnet/dotnet').Path
& '.\.tmp\local-bff-garnet\server\net10.0\GarnetServer.exe' --bind 127.0.0.1 --port 6379 --lua --lua-transaction-mode --memory 128m --index 16m
```

If using an existing Redis service instead, start that service and set REDIS_URL accordingly. Do not start a second cache on the same port.

## 2. BFF

```powershell
npm run bff:dev
```

Wait for `Nestora BFF listening on loopback port 3000; enabled=true` before starting Angular. If the BFF started before the cache and reported a startup failure, stop its watch process and rerun this command once the cache is ready.

The ignored `bff/.env` must have NODE_ENV=development, BFF_ENABLED=true, BFF_ORIGIN=http://localhost:4300, REDIS_URL=redis://127.0.0.1:6379, PORT=3000, the project's Supabase publishable/anon configuration, and a private random BFF_SESSION_KEY. Preserve an existing generated key. Never use a service-role key.

## 3. Angular

```powershell
npm start
```

`npm run start:bff` is an equivalent explicit BFF-mode option. Do not add `--ssl`, and do not use the previous HTTPS port 4200 URL for this configuration. Hard-refresh http://localhost:4300/ after restarting to discard the previous HTTPS/legacy page.

If port 4300 belongs to another application, use `npm start -- --port 4301` and set `BFF_ORIGIN=http://localhost:4301` in the BFF terminal before starting it. The origin must match the browser exactly for CSRF protection; the proxy target remains port 3000.

## Guest access diagnostics

During the guest-access investigation, Redis and the BFF were stopped. The Angular proxy log showed `ECONNREFUSED 127.0.0.1:3000` (and connection resets while the backend stopped). Those proxy failures can produce HTTP 500 before any BFF authentication or Supabase request runs. Port 4300 was also occupied by a different Angular application. Check which application is serving the URL before diagnosing its API responses.

Check `http://127.0.0.1:3000/api/health` directly: it must return `200` with `ready=true` and `enabled=true`. If direct access fails, restore the cache and BFF first. If the proxy URL fails while direct access works, check Angular's proxy configuration and listening port. A running BFF returns structured `503 SERVICE_UNAVAILABLE` on a shared-store outage; it does not fall back to an insecure session store.

With a healthy backend, `/api/csrf` works without a session, `/api/customer/auth/session` returns `{ "user": null, "session": null, "profile": null, "recovery": false }` for a clean guest, and allowlisted public reads use the restricted publishable/anon key with existing RLS. Expired cookies are cleared; protected operations continue to reject missing sessions. Existing guest cart and guest checkout flows remain separate from authenticated customer data.

Admin login uses `/api/admin/auth/login`; Customer login uses `/api/customer/auth/login`. Protected SDK queries, RPCs and uploads go through the audience-specific `/api/.../supabase/...` proxy. The backend retains Supabase tokens.

Verification: `/` returned HTTP 200 with Nestora HTML; `/api/health` returned HTTP 200 with ready=true and enabled=true; both audience session endpoints returned 200 without token fields; a public catalogue query through the BFF returned 200; an unauthenticated protected admin query returned 401. The cache passed PING, Lua fenced lease operations and atomic GETDEL checks. Successful account login was not exercised without user credentials.
