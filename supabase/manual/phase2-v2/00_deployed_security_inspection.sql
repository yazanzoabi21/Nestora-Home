-- READ ONLY. Run as an authorized database administrator; export results, not credentials.
begin read only;
select current_database(), current_user, version();
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','storage','realtime') order by 1,2,3;
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage','realtime') and c.relkind in ('r','p');
select grantee, table_schema, table_name, privilege_type
from information_schema.table_privileges
where table_schema in ('public','storage','realtime') order by 2,3,1,4;
select grantee, table_schema, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name in ('profiles','roles') order by 2,3,4,1;
select role_name,column_name,has_column_privilege(role_name,'public.profiles',column_name,'UPDATE') as effective_update
from (values ('anon'),('authenticated'),('service_role')) roles(role_name)
cross join information_schema.columns c where c.table_schema='public' and c.table_name='profiles';
select p.oid::regprocedure::text as signature, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by 1;
select c.oid::regclass::text as relation, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid,true) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','auth') order by 1,2;
select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles
where rolname in ('postgres','supabase_admin','authenticator','anon','authenticated','service_role');
select r.rolname as member, parent.rolname as granted_role
from pg_auth_members m join pg_roles r on r.oid=m.member
join pg_roles parent on parent.oid=m.roleid
where r.rolname in ('anon','authenticated','service_role','authenticator');
select d.datname, r.rolname, array(select item from unnest(s.setconfig) item
  where item like 'pgrst.db_pre_request=%' or item like 'pgrst.db_pre_config=%' or item like 'pgrst.db_schemas=%') as safe_settings
from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase
left join pg_roles r on r.oid=s.setrole
where exists (select 1 from unnest(s.setconfig) x where
  x like 'pgrst.db_pre_request=%' or x like 'pgrst.db_pre_config=%' or x like 'pgrst.db_schemas=%');
select current_setting('pgrst.db_pre_request',true) as current_connection_pre_request;
select defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclobjtype, defaclacl
from pg_default_acl;
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
-- Column names only: validates the editable-field allowlist without exporting customer data.
select table_name, column_name, data_type, is_generated, is_identity
from information_schema.columns where table_schema='public' and table_name in ('profiles','roles')
order by table_name,ordinal_position;
select md5(pg_get_functiondef('public.prevent_customer_profile_privilege_changes()'::regprocedure)) as profile_guard_review_hash;
select jsonb_agg(relation order by relation) as rls_manifest,
       md5(string_agg(relation,',' order by relation)) as rls_manifest_review_hash
from (select n.nspname||'.'||c.relname as relation from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))) approved_scope;
-- Aggregate counts only; no automatic NULL backfill or account activation.
select r.name::text as role_name,count(*) as profiles,
 count(*) filter(where p.is_active is true) as active,
 count(*) filter(where p.is_active is false) as inactive,
 count(*) filter(where p.is_active is null) as unknown_activation
from public.profiles p left join public.roles r on r.id=p.role_id group by r.name;
select r.rolname, r.rolcreaterole from pg_roles r where r.rolname=current_user;
select n.nspname,c.relname,c.relkind,c.reloptions,pg_get_viewdef(c.oid,true) as view_definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in('v','m');
select p.proname,md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,
 E'\n' order by p.oid::regprocedure::text)) as all_overloads_definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' group by p.proname;
commit;
-- Also confirm the effective PostgREST db-pre-request configuration in the hosted service,
-- the SQL function owners, exposed schemas, and all active role-management callers.
-- Do not export auth.users, session tables, JWTs, keys, passwords, or customer records.
