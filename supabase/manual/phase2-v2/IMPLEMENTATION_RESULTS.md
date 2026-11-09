# Phase 2 implementation results — 2026-11-03

## Actual changes and root causes

Admin post-login profile failures could leave an SDK session behind. Customer logout could throw before clearing local state. The installed Supabase SDK can return a remote sign-out error before removing its local session. TypeScript-only profile DTOs were passed directly into database updates, permitting unexpected runtime fields. Guard lookup failures could reject navigation, and cached customer authorization could outlive activation changes.

The implementation adds one independent lifecycle queue per audience, invalidates stale work, stops token refresh during cleanup and removes exactly the audience's auth/user/PKCE keys across both browser stores and the memory fallback. It then uses the supported public SDK signOut API with empty storage to finish local removal, and verifies SDK getSession is null. Late writes stay blocked until explicit authentication. Logout reports remote-revocation uncertainty separately from local cleanup. Auth navigation is outside the authorization cleanup transaction.

Customer protected-action identities and route boundaries refresh authorization. Failed profile reads clear stale profile state; initialization can retry. Signup confirmation, Google callback persistence/return URLs, recovery-event proof and independent audience behavior have regression coverage. Personal-profile updates reject privileged/unknown fields before any mutation and construct explicit allowed payloads. Super Admin database role management remains reserved for the reviewed RPC after manual installation; no management UI was invented.

No templates, styles, dashboard components, checkout calculations, database settings or existing migrations were changed. UI messages use existing toast/translation infrastructure. BFF/token hiding remains a later phase; browser Supabase sessions still exist.

## Executed validation

- `node node_modules/@angular/cli/bin/ng.js test --watch=false`: PASS, 117 tests / 21 files (exit 0). Includes installed Supabase SDK with offline HTTP interception, failed remote logout, in-flight token refresh, new sign-in after logout, two independent audience SDK clients, login/logout cancellation, stale profiles, guard failures, privileged-field injection, retryable initialization, signup and Google/recovery flows. No production authentication/data mutation was used.
- `npm run build`: PASS (exit 0). Initial bundle 660.50 kB exceeds the 500 kB warning budget but remains below the 1 MB error limit. Untouched component CSS and dependency CommonJS warnings remain.
- `npm run lint`: PASS, all files (exit 0).
- `git diff --check`: PASS.
- Offline SQL parsing: PASS for all seven SQL files, SQL/PLpgSQL bodies and dynamic statement templates; see SQL_PARSE_REPORT.json. No SQL execution, object/ACL resolution or live hook validation.

## Manual work still requiring approval

Use README.md and STAGING_VALIDATION.md. Review read-only 00 metadata, approve the actual guard hash and complete policy/RPC manifests, then install 10 and 20 in staging manually. Use 30/31 only for staging hook proof. Validate migration/rollback, last-Super-Admin concurrency, managed timestamps, deployed permissions, Storage/Realtime, checkout and all listed acceptance paths before approving production SQL. Existing RLS policies are not dropped or widened by the proposal; selective new restrictions still need feature validation.

These Angular improvements are not a database authorization boundary. Direct REST/RPC privilege escalation and deactivation enforcement are not claimed fixed on production until the SQL is approved, validated and manually applied. Live multi-tab OAuth, production checkout/uploads and external role-management callers were not exercised; automated offline tests do not replace those staging checks.

## Exact modified and added files


- [src/app/core/guards/auth-security.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/auth-security.spec.ts) — Authentication, guard, persistence or installed-SDK regression tests.
- [src/app/core/guards/auth.guard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/auth.guard.ts) — Active-role validation and safe navigation after lookup failures.
- [src/app/core/guards/customer-auth.guard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/customer-auth.guard.ts) — Active-role validation and safe navigation after lookup failures.
- [src/app/core/guards/guest.guard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/guest.guard.ts) — Active-role validation and safe navigation after lookup failures.
- [src/app/core/guards/permission.guard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/permission.guard.ts) — Active-role validation and safe navigation after lookup failures.
- [src/app/core/guards/role.guard.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/guards/role.guard.ts) — Active-role validation and safe navigation after lookup failures.
- [src/app/core/services/auth/admin-auth.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/admin-auth.service.spec.ts) — Authentication, guard, persistence or installed-SDK regression tests.
- [src/app/core/services/auth/admin-auth.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/admin-auth.service.ts) — Transactional authorization, failed-login cleanup, active identity checks and safe profile payloads.
- [src/app/core/services/auth/auth-session-lifecycle.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/auth-session-lifecycle.spec.ts) — Authentication, guard, persistence or installed-SDK regression tests.
- [src/app/core/services/auth/auth-session-lifecycle.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/auth-session-lifecycle.ts) — Shared per-audience serialization, cancellation and SDK/storage teardown.
- [src/app/core/services/auth/customer-auth.service.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/customer-auth.service.spec.ts) — Authentication, guard, persistence or installed-SDK regression tests.
- [src/app/core/services/auth/customer-auth.service.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/customer-auth.service.ts) — Fresh authorization, logout, retryable restoration, OAuth/signup/recovery and safe profile payloads.
- [src/app/core/services/auth/profile-update.util.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/profile-update.util.spec.ts) — Authentication, guard, persistence or installed-SDK regression tests.
- [src/app/core/services/auth/profile-update.util.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/services/auth/profile-update.util.ts) — Runtime allowlists for personal profile mutations.
- [src/app/core/tokens/supabase.tokens.spec.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/tokens/supabase.tokens.spec.ts) — Authentication, guard, persistence or installed-SDK regression tests.
- [src/app/core/tokens/supabase.tokens.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/core/tokens/supabase.tokens.ts) — Targeted auth/user/PKCE cleanup and suppression of late writes.
- [src/app/features/auth/pages/login/login.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/auth/pages/login/login.component.ts) — Duplicate-submission protection and separate post-login data errors.
- [src/app/features/customer/components/customer-account/customer-account.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/features/customer/components/customer-account/customer-account.component.ts) — Localized logout outcome handling; existing layout preserved.
- [src/app/shared/ui/user-menu/user-menu.component.ts](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/app/shared/ui/user-menu/user-menu.component.ts) — Localized logout outcome handling; existing layout preserved.
- [src/assets/i18n/translations.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/src/assets/i18n/translations.json) — English/Arabic post-login and logout messages.
- [supabase/manual/phase2-v2/00_deployed_security_inspection.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/00_deployed_security_inspection.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/10_profile_privileges.proposed.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/10_profile_privileges.proposed.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/11_profile_privileges.rollback.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/11_profile_privileges.rollback.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/20_deactivation_controls.proposed.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/20_deactivation_controls.proposed.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/21_deactivation_controls.rollback.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/21_deactivation_controls.rollback.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/30_staging_hook_probe.proposed.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/30_staging_hook_probe.proposed.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/31_staging_hook_probe.rollback.sql](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/31_staging_hook_probe.rollback.sql) — Manual-only inspection, migration, rollback or staging probe; NOT executed.
- [supabase/manual/phase2-v2/IMPACT_REVIEW.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/IMPACT_REVIEW.md) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/IMPLEMENTATION_RESULTS.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/IMPLEMENTATION_RESULTS.md) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/README.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/README.md) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/REGRESSION_TESTS.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/REGRESSION_TESTS.md) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/SQL_PARSE_REPORT.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/SQL_PARSE_REPORT.json) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/STAGING_VALIDATION.md](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/STAGING_VALIDATION.md) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/policy-manifest.template.json](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/policy-manifest.template.json) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
- [supabase/manual/phase2-v2/validate-proposals.cjs](C:/Users/yzoabi/Projects/Angular/Nestora-Home/supabase/manual/phase2-v2/validate-proposals.cjs) — Manual rollout, staging/regression checklist, parse evidence or exact implementation manifest.
