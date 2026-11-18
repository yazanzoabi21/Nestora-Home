-- SUPERSEDED for metadata handoff by 00_consolidated_readonly_metadata.sql.
-- READ ONLY. Run with an authorized DBA connection; retain results privately.
-- Function/view definitions may contain sensitive implementation details.
begin read only;
select version(), current_user, current_database();
select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner, c.reloptions, c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname not like 'pg_%' and n.nspname not in ('information_schema')
  and c.relkind in ('r','p','v','m','S','f') order by 1,2;
select count(*) as public_tables, count(*) filter(where c.relrowsecurity) as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p');
select * from pg_policies order by schemaname,tablename,policyname;
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema in ('public','storage','realtime') order by 1,2,ordinal_position;
select n.nspname,c.relname,r.role_name,v.privilege,
       has_table_privilege(r.role_name,c.oid,v.privilege) as effective_privilege
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
where n.nspname in ('public','storage','realtime') and c.relkind in ('r','p','v','m')
order by 1,2,3,4;
select n.nspname,c.relname,a.attname,a.attacl,r.role_name,v.privilege,
       has_column_privilege(r.role_name,c.oid,a.attnum,v.privilege) as effective_privilege
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
where n.nspname in ('public','storage','realtime') and c.relkind in ('r','p','v','m')
order by 1,2,a.attnum,4,5;
select p.oid::regprocedure::text as signature, n.nspname, p.prokind,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig,p.proacl,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname not like 'pg_%' and n.nspname<>'information_schema'
  and p.prokind in ('f','p') order by 2,1;
select n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as definition,
       p.oid::regprocedure::text as function_signature,pg_get_functiondef(p.oid) as function_definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and n.nspname in ('public','auth','storage') order by 1,2,3;
select n.nspname,c.relname,c.reloptions,pg_get_viewdef(c.oid,true) as definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in ('v','m');
select schemaname,tablename,rulename,definition from pg_rules
where schemaname in ('public','storage');
select r.rolname,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolinherit,r.rolcanlogin
from pg_roles r order by r.rolname;
select member.rolname as member,parent.rolname as granted_role,m.admin_option
from pg_auth_members m join pg_roles member on member.oid=m.member
join pg_roles parent on parent.oid=m.roleid order by 1,2;
select nspname,nspacl,pg_get_userbyid(nspowner) as owner,
       has_schema_privilege('anon',oid,'CREATE') as anon_create,
       has_schema_privilege('authenticated',oid,'CREATE') as authenticated_create
from pg_namespace where nspname not like 'pg_%' and nspname<>'information_schema';
select defaclrole::regrole,defaclnamespace::regnamespace,defaclobjtype,defaclacl from pg_default_acl;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets;
select pubname,puballtables,pubinsert,pubupdate,pubdelete,pubtruncate from pg_publication;
select * from pg_publication_tables;
-- Do not dump arbitrary database settings: they can contain secrets.
select d.datname,r.rolname,x.setting
from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase
left join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) x(setting)
where x.setting like 'pgrst.db_pre_request=%' or x.setting like 'pgrst.db_pre_config=%'
   or x.setting like 'pgrst.db_schemas=%';
select extname,extversion from pg_extension;
-- Compare installed migration names only. Do not execute migration history as a rebuild.
select version,name from supabase_migrations.schema_migrations order by version;
commit;
