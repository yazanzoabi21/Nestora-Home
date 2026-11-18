-- Nestora Home: consolidated READ-ONLY deployed security metadata inspection.
-- Execute this ENTIRE file in Supabase SQL Editor as an authorized project DBA.
-- One SELECT, one result row. No DDL, DML, role switches, session-setting changes,
-- temporary objects, application RPC calls, or reads of business/customer records.
-- Does NOT read auth.users/session tables, vault values, passwords or secret settings.
-- IMPORTANT: function bodies, defaults and trigger arguments can contain embedded
-- credentials. Review/redact credential literals before sharing; retain SQL logic,
-- signatures, owners, privileges, predicates and search_path settings.
-- Export the full security_metadata result (JSON or SQL Editor CSV), not a screenshot.
-- SQL cannot retrieve deployed Edge Function source/config or hosted Auth settings.

with
api_roles as (
  select oid,rolname from pg_catalog.pg_roles
  where rolname in ('anon','authenticated','service_role','authenticator')
),
namespaces as (
  select n.* from pg_catalog.pg_namespace n
  where n.nspname not like 'pg\_%' escape '\' and n.nspname<>'information_schema'
),
-- Include all application schemas plus Storage/Realtime. Managed schemas still appear
-- in the schema privilege inventory; their user/session data is never read.
application_namespaces as (
  select n.* from namespaces n where n.nspname not in (
    'auth','storage','realtime','supabase_migrations','vault','extensions','graphql',
    'graphql_public','supabase_functions','net','pgsodium','pgsodium_masks','cron',
    '_analytics','_realtime','_supavisor','pgbouncer','pgmq','pgmq_public'
  )
),
relations as (
  select c.*,n.nspname from pg_catalog.pg_class c
  join namespaces n on n.oid=c.relnamespace
  where (n.oid in (select oid from application_namespaces) or n.nspname in ('storage','realtime'))
    and c.relkind in ('r','p','v','m','S','f')
),
triggers as (
  select t.*,c.relname,n.nspname from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join namespaces n on n.oid=c.relnamespace
  where not t.tgisinternal and
    (n.oid in (select oid from application_namespaces) or n.nspname in ('auth','storage','realtime'))
),
routines as (
  select p.*,n.nspname from pg_catalog.pg_proc p
  join namespaces n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and (
    n.oid in (select oid from application_namespaces)
    or p.oid in (select tgfoid from triggers)
    or p.oid in (select evtfoid from pg_catalog.pg_event_trigger)
    or (n.nspname='auth' and p.proname in ('uid','role','jwt'))
  )
),
sections(section,payload) as (
  select 'capture',jsonb_build_object(
    'format_version',1,'captured_at_utc',pg_catalog.now() at time zone 'UTC',
    'database',pg_catalog.current_database(),'session_user',session_user,'current_user',current_user,
    'server_version',pg_catalog.current_setting('server_version'),
    'server_version_num',pg_catalog.current_setting('server_version_num'),
    'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),
    'query_is_read_only',true,
    'public_table_count',(select count(*) from relations where nspname='public' and relkind in ('r','p')),
    'public_rls_enabled_count',(select count(*) from relations where nspname='public' and relkind in ('r','p') and relrowsecurity),
    'routine_count',(select count(*) from routines),'trigger_count',(select count(*) from triggers),
    'policy_count',(select count(*) from pg_catalog.pg_policy p where p.polrelid in (select oid from relations)))
  union all
  select 'relations',coalesce(jsonb_agg(jsonb_build_object(
    'schema',nspname,'name',relname,'kind',relkind,'owner',pg_catalog.pg_get_userbyid(relowner),
    'rls_enabled',relrowsecurity,'force_rls',relforcerowsecurity,
    'options',reloptions,'explicit_acl',relacl::text,'replica_identity',relreplident,
    'partition_parent',relispartition) order by nspname,relname),'[]'::jsonb) from relations
  union all
  select 'policies',coalesce(jsonb_agg(jsonb_build_object(
    'schema',schemaname,'table',tablename,'name',policyname,'permissive',permissive,
    'roles',roles,'command',cmd,'using',qual,'with_check',with_check)
    order by schemaname,tablename,policyname),'[]'::jsonb)
  from pg_catalog.pg_policies where (schemaname,tablename) in (select nspname,relname from relations)
  union all
  select 'columns',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'position',a.attnum,'name',a.attname,
    'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
    'identity',a.attidentity,'generated',a.attgenerated,'explicit_acl',a.attacl::text,
    'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid))
    order by r.nspname,r.relname,a.attnum),'[]'::jsonb)
  from relations r join pg_catalog.pg_attribute a on a.attrelid=r.oid
  left join pg_catalog.pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped and r.relkind<>'S'
  union all
  select 'relation_acl_entries',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'grantor',pg_catalog.pg_get_userbyid(x.grantor),
    'grantee',case when x.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(x.grantee) end,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
    order by r.nspname,r.relname,x.grantee,x.privilege_type),'[]'::jsonb)
  from relations r cross join lateral pg_catalog.aclexplode(coalesce(r.relacl,
    pg_catalog.acldefault(case when r.relkind='S' then 'S'::"char" else 'r'::"char" end,r.relowner))) x
  union all
  select 'column_acl_entries',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'column',a.attname,
    'grantor',pg_catalog.pg_get_userbyid(x.grantor),
    'grantee',case when x.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(x.grantee) end,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
    order by r.nspname,r.relname,a.attnum,x.grantee,x.privilege_type),'[]'::jsonb)
  from relations r join pg_catalog.pg_attribute a on a.attrelid=r.oid
  cross join lateral pg_catalog.aclexplode(a.attacl) x where a.attnum>0 and not a.attisdropped
  union all
  select 'effective_table_privileges',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'role',a.rolname,
    'select',pg_catalog.has_table_privilege(a.oid,r.oid,'SELECT'),
    'insert',pg_catalog.has_table_privilege(a.oid,r.oid,'INSERT'),
    'update',pg_catalog.has_table_privilege(a.oid,r.oid,'UPDATE'),
    'delete',pg_catalog.has_table_privilege(a.oid,r.oid,'DELETE'),
    'truncate',pg_catalog.has_table_privilege(a.oid,r.oid,'TRUNCATE'),
    'references',pg_catalog.has_table_privilege(a.oid,r.oid,'REFERENCES'),
    'trigger',pg_catalog.has_table_privilege(a.oid,r.oid,'TRIGGER'))
    order by r.nspname,r.relname,a.rolname),'[]'::jsonb)
  from relations r cross join api_roles a where r.relkind in ('r','p','v','m','f')
  union all
  select 'effective_column_privileges',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'column',c.attname,'role',a.rolname,
    'select',pg_catalog.has_column_privilege(a.oid,r.oid,c.attnum,'SELECT'),
    'insert',pg_catalog.has_column_privilege(a.oid,r.oid,c.attnum,'INSERT'),
    'update',pg_catalog.has_column_privilege(a.oid,r.oid,c.attnum,'UPDATE'),
    'references',pg_catalog.has_column_privilege(a.oid,r.oid,c.attnum,'REFERENCES'))
    order by r.nspname,r.relname,c.attnum,a.rolname),'[]'::jsonb)
  from relations r join pg_catalog.pg_attribute c on c.attrelid=r.oid
  cross join api_roles a where c.attnum>0 and not c.attisdropped and r.relkind in ('r','p','v','m','f')
  union all
  select 'effective_sequence_privileges',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'sequence',r.relname,'role',a.rolname,
    'usage',pg_catalog.has_sequence_privilege(a.oid,r.oid,'USAGE'),
    'select',pg_catalog.has_sequence_privilege(a.oid,r.oid,'SELECT'),
    'update',pg_catalog.has_sequence_privilege(a.oid,r.oid,'UPDATE'))
    order by r.nspname,r.relname,a.rolname),'[]'::jsonb)
  from relations r cross join api_roles a where r.relkind='S'
  union all
  select 'routines',coalesce(jsonb_agg(jsonb_build_object(
    'schema',p.nspname,'name',p.proname,
    'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
    'arguments',pg_catalog.pg_get_function_arguments(p.oid),
    'result',pg_catalog.pg_get_function_result(p.oid),'kind',p.prokind,
    'language',l.lanname,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,'volatility',p.provolatile,'leakproof',p.proleakproof,
    'explicit_acl',p.proacl::text,
    'security_settings',(select coalesce(jsonb_agg(setting order by setting),'[]'::jsonb)
      from unnest(p.proconfig) as settings(setting)
      where split_part(setting,'=',1) in ('search_path','row_security','role','session_authorization')),
    'definition',pg_catalog.pg_get_functiondef(p.oid),
    'definition_chars',length(pg_catalog.pg_get_functiondef(p.oid)),
    'definition_md5',md5(pg_catalog.pg_get_functiondef(p.oid)),
    'effective_execute',(select coalesce(jsonb_object_agg(a.rolname,pg_catalog.has_function_privilege(a.oid,p.oid,'EXECUTE') order by a.rolname),'{}'::jsonb) from api_roles a))
    order by p.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)),'[]'::jsonb)
  from routines p join pg_catalog.pg_language l on l.oid=p.prolang
  union all
  select 'routine_acl_entries',coalesce(jsonb_agg(jsonb_build_object(
    'schema',p.nspname,'name',p.proname,'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
    'grantor',pg_catalog.pg_get_userbyid(x.grantor),
    'grantee',case when x.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(x.grantee) end,
    'privilege',x.privilege_type,'grantable',x.is_grantable)
    order by p.nspname,p.proname,p.oid,x.grantee),'[]'::jsonb)
  from routines p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
  union all
  select 'triggers',coalesce(jsonb_agg(jsonb_build_object(
    'schema',t.nspname,'relation',t.relname,'name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_catalog.pg_get_triggerdef(t.oid,true),'function_schema',n.nspname,
    'function_name',p.proname,'function_identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
    'constraint_trigger',t.tgconstraint<>0,'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred)
    order by t.nspname,t.relname,t.tgname),'[]'::jsonb)
  from triggers t join pg_catalog.pg_proc p on p.oid=t.tgfoid
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  union all
  select 'views',coalesce(jsonb_agg(jsonb_build_object(
    'schema',nspname,'name',relname,'kind',relkind,'owner',pg_catalog.pg_get_userbyid(relowner),
    'options',reloptions,'definition',pg_catalog.pg_get_viewdef(oid,true))
    order by nspname,relname),'[]'::jsonb) from relations where relkind in ('v','m')
  union all
  select 'rules',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'name',w.rulename,'enabled',w.ev_enabled,
    'definition',pg_catalog.pg_get_ruledef(w.oid,true)) order by r.nspname,r.relname,w.rulename),'[]'::jsonb)
  from pg_catalog.pg_rewrite w join relations r on r.oid=w.ev_class where w.rulename<>'_RETURN'
  union all
  select 'constraints',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'name',c.conname,'type',c.contype,
    'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
    'definition',pg_catalog.pg_get_constraintdef(c.oid,true)) order by r.nspname,r.relname,c.conname),'[]'::jsonb)
  from pg_catalog.pg_constraint c join relations r on r.oid=c.conrelid
  union all
  select 'indexes',coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'relation',r.relname,'name',ic.relname,'valid',i.indisvalid,
    'ready',i.indisready,'unique',i.indisunique,'definition',pg_catalog.pg_get_indexdef(i.indexrelid))
    order by r.nspname,r.relname,ic.relname),'[]'::jsonb)
  from pg_catalog.pg_index i join relations r on r.oid=i.indrelid
  join pg_catalog.pg_class ic on ic.oid=i.indexrelid
  union all
  select 'roles',coalesce(jsonb_agg(jsonb_build_object(
    'name',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls,'inherit',rolinherit,
    'can_login',rolcanlogin,'create_role',rolcreaterole,'create_db',rolcreatedb,
    'replication',rolreplication) order by rolname),'[]'::jsonb) from pg_catalog.pg_roles
  union all
  select 'role_memberships',coalesce(jsonb_agg(jsonb_build_object(
    'member',member.rolname,'granted_role',parent.rolname,'grantor',pg_catalog.pg_get_userbyid(m.grantor),
    'admin_option',m.admin_option,'inherit_option',to_jsonb(m)->'inherit_option',
    'set_option',to_jsonb(m)->'set_option') order by member.rolname,parent.rolname),'[]'::jsonb)
  from pg_catalog.pg_auth_members m join pg_catalog.pg_roles member on member.oid=m.member
  join pg_catalog.pg_roles parent on parent.oid=m.roleid
  union all
  select 'schemas',coalesce(jsonb_agg(jsonb_build_object(
    'name',n.nspname,'owner',pg_catalog.pg_get_userbyid(n.nspowner),'explicit_acl',n.nspacl::text,
    'effective_api_privileges',(select coalesce(jsonb_agg(jsonb_build_object(
      'role',a.rolname,'usage',pg_catalog.has_schema_privilege(a.oid,n.oid,'USAGE'),
      'create',pg_catalog.has_schema_privilege(a.oid,n.oid,'CREATE')) order by a.rolname),'[]'::jsonb) from api_roles a))
    order by n.nspname),'[]'::jsonb) from namespaces n
  union all
  select 'database_api_privileges',coalesce(jsonb_agg(jsonb_build_object(
    'role',a.rolname,'create',pg_catalog.has_database_privilege(a.oid,pg_catalog.current_database(),'CREATE'),
    'temporary',pg_catalog.has_database_privilege(a.oid,pg_catalog.current_database(),'TEMP'),
    'connect',pg_catalog.has_database_privilege(a.oid,pg_catalog.current_database(),'CONNECT'))
    order by a.rolname),'[]'::jsonb) from api_roles a
  union all
  select 'default_privileges',coalesce(jsonb_agg(jsonb_build_object(
    'creator',pg_catalog.pg_get_userbyid(d.defaclrole),'schema',n.nspname,
    'object_type',d.defaclobjtype,'acl',d.defaclacl::text)
    order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]'::jsonb)
  from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
  union all
  select 'safe_postgrest_settings',jsonb_build_object(
    'current_connection',jsonb_build_object(
      'db_schemas',pg_catalog.current_setting('pgrst.db_schemas',true),
      'db_pre_request',pg_catalog.current_setting('pgrst.db_pre_request',true),
      'db_pre_config',pg_catalog.current_setting('pgrst.db_pre_config',true)),
    'role_database_settings',(select coalesce(jsonb_agg(jsonb_build_object(
      'database',d.datname,'role',r.rolname,'setting',x.setting) order by d.datname,r.rolname,x.setting),'[]'::jsonb)
      from pg_catalog.pg_db_role_setting s left join pg_catalog.pg_database d on d.oid=s.setdatabase
      left join pg_catalog.pg_roles r on r.oid=s.setrole
      cross join lateral unnest(s.setconfig) as x(setting)
      where split_part(x.setting,'=',1) in ('pgrst.db_schemas','pgrst.db_pre_request','pgrst.db_pre_config')))
  union all
  select 'storage_buckets',coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'public',public,'file_size_limit',file_size_limit,
    'allowed_mime_types',allowed_mime_types) order by id),'[]'::jsonb) from storage.buckets
  union all
  select 'publications',coalesce(jsonb_agg(jsonb_build_object(
    'name',p.pubname,'owner',pg_catalog.pg_get_userbyid(p.pubowner),'all_tables',p.puballtables,
    'insert',p.pubinsert,'update',p.pubupdate,'delete',p.pubdelete,'truncate',p.pubtruncate)
    order by p.pubname),'[]'::jsonb) from pg_catalog.pg_publication p
  union all
  select 'publication_tables',coalesce(jsonb_agg(to_jsonb(p) order by p.pubname,p.schemaname,p.tablename),'[]'::jsonb)
  from pg_catalog.pg_publication_tables p
  union all
  select 'event_triggers',coalesce(jsonb_agg(jsonb_build_object(
    'name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'tags',e.evttags,
    'owner',pg_catalog.pg_get_userbyid(e.evtowner),'function_schema',n.nspname,
    'function_name',p.proname,'function_identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid))
    order by e.evtname),'[]'::jsonb)
  from pg_catalog.pg_event_trigger e join pg_catalog.pg_proc p on p.oid=e.evtfoid
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  union all
  select 'catalog_dependencies',coalesce(jsonb_agg(jsonb_build_object(
    'object',pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid),
    'references',pg_catalog.pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'type',d.deptype)
    order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid),'[]'::jsonb)
  from pg_catalog.pg_depend d where
    (d.classid='pg_catalog.pg_proc'::regclass and d.objid in (select oid from routines)) or
    (d.classid='pg_catalog.pg_policy'::regclass and d.objid in
      (select oid from pg_catalog.pg_policy where polrelid in (select oid from relations))) or
    (d.classid='pg_catalog.pg_rewrite'::regclass and d.objid in
      (select oid from pg_catalog.pg_rewrite where ev_class in (select oid from relations)))
  union all
  select 'extensions',coalesce(jsonb_agg(jsonb_build_object(
    'name',e.extname,'version',e.extversion,'schema',n.nspname,
    'owner',pg_catalog.pg_get_userbyid(e.extowner)) order by e.extname),'[]'::jsonb)
  from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  union all
  select 'scope_limits',jsonb_build_array(
    'No business rows, Auth users/sessions, passwords, JWTs or secret-store contents are queried.',
    'No API/RPC/authorization/mutation test is performed. Owner-confirmed concerns remain unverified until this output is reviewed.',
    'Routine definitions, trigger arguments and defaults may embed credentials; redact credential literals before sharing.',
    'Managed schema internals are excluded except relevant trigger routines, event triggers and auth.uid/role/jwt helpers; extension routine metadata may be present.',
    'SQL Editor connection settings may differ from effective hosted PostgREST configuration; verify exposed schemas and pre-request configuration separately.',
    'SQL catalog dependencies do not capture all runtime/dynamic SQL or external callers.',
    'Deployed Edge Function inventory/source/auth configuration and hosted Auth settings require separate authorized export; absence here does not mean none exist.',
    'Storage bucket configuration is read; object names, uploaded file contents and signed download URLs are not.'
  )
),
report as (
  select jsonb_object_agg(section,payload order by section) as metadata from sections
)
select metadata as security_metadata,
       length(metadata::text) as export_characters,
       md5(metadata::text) as export_md5
from report;
