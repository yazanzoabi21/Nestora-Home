# Phase 2 v2 — manual database security migrations

Angular companion fixes are implemented in this change. **No SQL, database configuration, or production deployment has been executed.** These reviewed SQL files are deliberately outside `supabase/migrations` so normal CLI migration commands cannot apply them accidentally.

## Files to run manually, only after approval and staging validation

1. `00_deployed_security_inspection.sql`: read-only metadata inspection. Review locally; function definitions can contain sensitive implementation details.
2. `10_profile_privileges.proposed.sql`: protect privileged profile fields, add `manage_profile_access_phase2(uuid,uuid,boolean)`, and prevent removal of the last active Super Admin. All browser privilege edits, including Super Admin self-edits, must use this RPC. Existing personal fields remain editable under existing RLS. NULL activation remains denied; no accounts are automatically activated.
3. `20_deactivation_controls.proposed.sql`: add only reviewed restrictive table/operation policies and an inactive-account Data API RPC gate. It preserves pre-existing policies. **Do not run with an empty or assumed manifest.** Populate and approve `policy-manifest.template.json` using actual deployed metadata, including Storage/private data and every exposed RPC overload. Preserve public catalogue/guest operations explicitly.
4. `30_staging_hook_probe.proposed.sql`, then `31_staging_hook_probe.rollback.sql`: staging-only hook verification/removal. Never install this diagnostic probe in production.

The filenames retain `.proposed.sql` because execution is not approved. The scripts are complete review-gated migration templates, not a claim that unknown deployed objects or hosting configuration have been validated. No application code invokes the new management RPC before installation; this repository has no implemented Super Admin management page.

## Required interlocks

Migration 10 requires the reviewed deployed guard definition hash and approval setting. Migration 20 additionally requires reviewed canonical policy/RPC manifests and their combined hash. Follow `STAGING_VALIDATION.md` for the exact settings and request-marker hook proof. Keep the `nestora_phase2` schema private. Existing hooks cause a stop rather than being overwritten.

Do not bypass a failed precondition. Hosted-role privileges, guard ownership, managed timestamp triggers and target PostgreSQL compatibility must be checked on staging. The private invariant row serializes profile/role writes; measure registration/profile-write contention. Test direct Super Admin PATCH rejection, management RPC success, concurrent last-admin deactivation, NULL profiles, Auth-delete cascades and rollback before release.

## Rollback order

Remove the staging probe with `31_staging_hook_probe.rollback.sql`; roll back deactivation controls with `21_deactivation_controls.rollback.sql`; then profile controls with `11_profile_privileges.rollback.sql`. Original guard SQL is captured on installation. Rollback removes only this package's objects/policies and does not reverse subsequent business role changes. It can reopen the original authorization gaps.

## Offline validation

`validate-proposals.cjs` parses outer SQL, PL/pgSQL, SQL function bodies and generated policy/configuration templates without connecting to a database. It accepts a separately installed `libpg-query` via `PHASE2_SQL_PARSER` (absolute module path), or normal Node resolution. No production/package dependency was added. `SQL_PARSE_REPORT.json` records this run; PG18 grammar parsing is not target-server execution, object/ACL resolution, concurrency validation or proof of actual PostgREST hook support.

## Application changes and regression scope

- Admin/Customer authorization is transactional, with audience-only teardown on credential/profile failure, and serialized login/logout. Epochs and profile request invalidation prevent late responses from restoring logged-out UI state.
- Local SDK and persistence cleanup proceeds even when remote logout fails. Automatic refresh is stopped; late writes are blocked until explicit sign-in. The other audience, cart/preferences and remember-me choice are preserved. Remote revocation uncertainty is surfaced separately. Issued access JWTs can remain valid until expiry; database authorization remains essential ([Supabase sign-out documentation](https://supabase.com/docs/reference/javascript/auth-signout)).
- Personal update payloads have runtime allowlists. Guards check active roles, refresh customer authorization at protected boundaries, and redirect safely after API failures. These Angular checks do not secure direct REST/RPC access; that protection remains pending manual SQL validation/installation.
- Signup confirmation, OAuth callback/remember-me, recovery proof, independent sessions, contact/avatar edits, checkout/cart/orders/dashboard/export/uploads must remain covered. No layout or business-domain service was redesigned. BFF/token hiding is not part of Phase 2.

`REGRESSION_TESTS.md`, `STAGING_VALIDATION.md`, and `IMPACT_REVIEW.md` retain the database acceptance checklist. Their unexecuted staging cases are distinct from the Angular/SDK tests run for this change. See `IMPLEMENTATION_RESULTS.md` for actual commands and file changes.
