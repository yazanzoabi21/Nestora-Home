-- READ-ONLY CATALOG CHECKS ONLY, for AFTER separately approved permit installation.
-- Do not invoke claim_nestora_smtp_probe here: that would consume the send permit.
-- One result row: the Management API returns only the final statement's results.
with function_checks as (
  select pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' as trusted_function_owner,
    p.prosecdef as security_definer,
    'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
    not exists (
      select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) as public_execute_denied,
    not exists (
      select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      where a.privilege_type = 'EXECUTE' and a.grantee not in (
        p.proowner, (select oid from pg_catalog.pg_roles where rolname = 'service_role')
      )
    ) as no_unexpected_execute_grants
  from pg_catalog.pg_proc p
  where p.oid = 'public.claim_nestora_smtp_probe(uuid)'::regprocedure
), table_checks as (
  select c.relrowsecurity as permit_rls_enabled,
    pg_catalog.pg_get_userbyid(c.relowner) = 'postgres' as trusted_table_owner,
    not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid) as no_browser_policies
  from pg_catalog.pg_class c where c.oid = 'nestora_email_probe.consumed_runs'::regclass
)
select f.*, t.*,
  pg_catalog.has_schema_privilege('anon', 'nestora_email_probe', 'USAGE') = false as anon_schema_denied,
  pg_catalog.has_schema_privilege('authenticated', 'nestora_email_probe', 'USAGE') = false as customer_schema_denied,
  pg_catalog.has_function_privilege('anon', 'public.claim_nestora_smtp_probe(uuid)', 'EXECUTE') = false as anon_claim_denied,
  pg_catalog.has_function_privilege('authenticated', 'public.claim_nestora_smtp_probe(uuid)', 'EXECUTE') = false as customer_claim_denied,
  pg_catalog.has_function_privilege('service_role', 'public.claim_nestora_smtp_probe(uuid)', 'EXECUTE') as service_claim_allowed,
  not exists (
    select 1 from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
    where c.oid = 'nestora_email_probe.consumed_runs'::regclass
      and a.grantee in (0, (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
        (select oid from pg_catalog.pg_roles where rolname = 'service_role'))
  ) as no_direct_application_table_grants
from function_checks f cross join table_checks t;
