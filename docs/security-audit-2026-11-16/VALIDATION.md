# Preparation validation — 16 November 2026

Re-run after the deployed metadata review and local migration/rollback/test preparation:

| Check | Result | Limit |
|---|---|---|
| `npm run build` | PASS, exit 0 | Existing initial bundle warning (660.52 kB vs 500 kB), three component style-budget warnings and CommonJS warnings remain. No app/dependency changes. |
| `npm run lint` | PASS, exit 0 | All configured Angular source files pass. Does not lint SQL semantics. |
| `npm run test -- --watch=false` | PASS, exit 0; 156 tests in 28 files | Existing application unit tests, not Supabase authorization acceptance. |
| Complete export validation | PASS | PostgreSQL jsonb character count/MD5 and all 77 routine lengths/hashes match. Counts match capture; 41 public tables have RLS. Offline export evidence only. |
| `validate-drafts.cjs` with externally installed `libpg-query` | PASS, exit 0; all eleven SQL files and dynamic templates parse | Offline PostgreSQL 18 grammar/PLpgSQL only; target database is PostgreSQL 17.6. No database connection, catalog resolution or policy behavior verification. Includes SQL-language bodies. Details: `supabase/manual/security-audit-2026-11-16/SQL_PARSE_REPORT.json`. |
| `validate-package.cjs` | PASS, ten consistency assertions | Verifies paired definitions/grants, Storage coverage, preserved read/avatar/search contracts and early checkout guard placement. Not an authorization execution or proof of idempotency. |
| Node syntax checks | PASS | Preparation, package/parser validation and Storage test CJS scripts parse; Storage harness was not executed. |
| Git export exclusion | PASS | `git check-ignore -v` matches the inbox rule; `git ls-files` returns no export. No commit performed. |
| Staging SQL negative/positive authorization | NOT RUN | Explicitly approved staging connection/fixtures unavailable. 90/92 drafts prepared; 92 contains 96 assertions. |
| Storage/JWT/PostgREST/RPC/Edge/Realtime acceptance | NOT RUN | Edge source/config and approved staging environment still required. Storage API harness prepared, not executed. |
| Checkout replay/concurrency and exact rollback rehearsal | NOT RUN | Before-state is now available and rollback prepared; approved staging execution remains pending. |

No SQL execution (including migrations or authorization probes), production execution, deployment or business-data change occurred. No application dependency was added. Metadata-backed 40/41 drafts now supersede old proposals. Platform Storage policy-management configuration and external callers still need review. Successful app tests, checksum validation or syntax parsing must not be reported as proof that the deployed application is hardened.
