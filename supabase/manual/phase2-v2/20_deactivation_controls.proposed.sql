-- DRAFT v2: explicit operation manifest, not all public tables automatically.
-- Requires staged Angular cleanup/recovery changes FIRST. No SQL has been executed.
begin;
do $$
declare manifest jsonb; public_rpcs jsonb; item jsonb; qname text; command text; predicate text; policy_name text;
begin
 if current_setting('nestora.phase2.review_approved',true) is distinct from 'yes' then raise exception 'Approval required'; end if;
 if to_regprocedure('nestora_phase2.active_actor_role()') is null then raise exception 'Migration 10 required'; end if;
 if to_regclass('nestora_phase2.added_policies') is not null then raise exception 'Already applied'; end if;
 manifest:=nullif(current_setting('nestora.phase2.policy_manifest',true),'')::jsonb;
 public_rpcs:=nullif(current_setting('nestora.phase2.public_rpc_manifest',true),'')::jsonb;
 if manifest is null or jsonb_typeof(manifest)<>'array' or jsonb_array_length(manifest)=0 then raise exception 'Reviewed nonempty policy manifest required'; end if;
 if public_rpcs is null or jsonb_typeof(public_rpcs)<>'array' then raise exception 'Reviewed public RPC manifest required (explicit [] allowed only after review)'; end if;
 if current_setting('nestora.phase2.expected_manifest_hash',true) is distinct from md5(manifest::text||public_rpcs::text) then raise exception 'Manifest hash does not match reviewed canonical JSON'; end if;
 if coalesce(current_setting('pgrst.db_pre_request',true),'')<>'' or exists(
   select 1 from pg_db_role_setting s,unnest(s.setconfig) setting
   where s.setrole in(0,(select oid from pg_roles where rolname='authenticator'))
    and s.setdatabase in(0,(select oid from pg_database where datname=current_database()))
    and setting like 'pgrst.db_pre_request=%' and setting<>'pgrst.db_pre_request=') then
   raise exception 'Existing hook: explicitly compose it after inspection, never overwrite it';
 end if;
 create table nestora_phase2.added_policies(schema_name text,table_name text,policy_name text,primary key(schema_name,table_name,policy_name));
 revoke all on nestora_phase2.added_policies from public,anon,authenticated,service_role,nestora_phase2_access_manager;
 insert into nestora_phase2.rollback_metadata values('public_rpc_manifest',public_rpcs::text),('policy_manifest',manifest::text);
 for item in select value from jsonb_array_elements(manifest) loop
   if item->>'schema' not in('public','storage') or item->>'schema' is null
    or item->>'table' is null or item->>'command' is null then raise exception 'Invalid policy manifest entry'; end if;
   command:=lower(item->>'command');
   if command not in('select','insert','update','delete','all') then raise exception 'Invalid policy command'; end if;
   if item->>'schema'='storage' and item->>'table'<>'objects' then raise exception 'Only storage.objects is supported'; end if;
   qname:=format('%I.%I',item->>'schema',item->>'table');
   if not exists(select 1 from pg_class where oid=to_regclass(qname) and relkind in('r','p') and relrowsecurity) then raise exception 'Missing table or RLS disabled: %',qname; end if;
   if command in('select','all') and item->>'reviewed_read_scope' is distinct from 'private' then
     raise exception 'SELECT/ALL requires explicit private-read review: %',qname;
   end if;
   policy_name:='phase2_active_'||command;
   if exists(select 1 from pg_policies where schemaname=item->>'schema' and tablename=item->>'table' and policyname=policy_name) then raise exception 'Policy collision on %',qname; end if;
   predicate:='((select nestora_phase2.active_actor_role()) is not null)';
   execute format('create policy %I on %s as restrictive for %s to authenticated %s %s',
    policy_name,qname,upper(command),
    case when command in('select','update','delete','all') then 'using ('||predicate||')' else '' end,
    case when command in('insert','update','all') then 'with check ('||predicate||')' else '' end);
   insert into nestora_phase2.added_policies values(item->>'schema',item->>'table',policy_name);
 end loop;
 -- Approval also requires verifying every private table/view and every non-Data-API
 -- access path is covered; this script cannot infer business confidentiality.
end $$;

create function nestora_phase2.public_rpc_fingerprint(rpc_name text)
returns text language sql stable security definer set search_path=''
as $$
 select md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,
   E'\n' order by p.oid::regprocedure::text))
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and p.proname=rpc_name
$$;
revoke all on function nestora_phase2.public_rpc_fingerprint(text) from public;

create function nestora_phase2.check_active_data_api_account()
returns void language plpgsql volatile security definer set search_path=''
as $$
declare route text; route_match text[]; rpc_name text; allowed jsonb; request_headers jsonb; selected_schema text;
begin
 perform set_config('nestora.phase2.hook_ran','v2',true);
 if auth.role() is distinct from 'authenticated' or nestora_phase2.active_actor_role() is not null then return; end if;
 route:=nullif(current_setting('request.path',true),'');
 if route is null then raise exception 'Request path missing; staging verification required' using errcode='42501'; end if;
 request_headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 if request_headers->>'accept-profile' is not null and request_headers->>'content-profile' is not null
   and (request_headers->>'accept-profile') is distinct from (request_headers->>'content-profile') then
   raise exception 'Conflicting schema headers denied' using errcode='42501';
 end if;
 selected_schema:=case when current_setting('request.method',true) in('GET','HEAD')
   then coalesce(request_headers->>'accept-profile','public')
   else coalesce(request_headers->>'content-profile','public') end;
 if selected_schema<>'public' then raise exception 'Inactive account: non-public schema denied' using errcode='42501'; end if;
 -- Delegate only canonical RLS-table routes to the reviewed policy manifest.
 -- Encoded/ambiguous RPC paths and views fail closed for inactive sessions.
 if route ~ '^/[a-z_][a-z_0-9]*$' and exists(select 1 from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=substring(route from 2) and c.relkind in('r','p') and c.relrowsecurity) then return; end if;
 route_match:=regexp_match(route,'/rpc/([^/]+)$');
 if route_match is null then raise exception 'Unrecognized inactive-account route' using errcode='42501'; end if;
 rpc_name:=route_match[1];
 select value::jsonb into allowed from nestora_phase2.rollback_metadata where key='public_rpc_manifest';
 if exists(select 1 from jsonb_array_elements(allowed) item where item->>'name'=rpc_name
   and item->>'definition_hash'=nestora_phase2.public_rpc_fingerprint(rpc_name)) then return; end if;
 raise exception 'Active account required' using errcode='42501';
end $$;
revoke all on function nestora_phase2.check_active_data_api_account() from public;
grant execute on function nestora_phase2.check_active_data_api_account() to anon,authenticated,service_role;
do $$ begin execute format('alter role authenticator in database %I set pgrst.db_pre_request=%L',
 current_database(),'nestora_phase2.check_active_data_api_account'); end $$;
notify pgrst,'reload config'; notify pgrst,'reload schema';
commit;
-- Actual hook invocation, default public schema, overloaded public RPCs,
-- Storage, views and Realtime remain mandatory staging release gates.
