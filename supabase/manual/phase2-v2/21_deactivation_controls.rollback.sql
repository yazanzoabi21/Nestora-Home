-- DRAFT rollback v2. Remove staging probe first. No pre-existing policy is removed.
begin;
do $$
declare target record; configured text;
begin
 if current_setting('nestora.phase2.rollback_approved',true) is distinct from 'yes' then raise exception 'Rollback approval required'; end if;
 select split_part(setting,'=',2) into configured from pg_db_role_setting s,unnest(s.setconfig) setting
 where s.setrole=(select oid from pg_roles where rolname='authenticator')
 and s.setdatabase=(select oid from pg_database where datname=current_database()) and setting like 'pgrst.db_pre_request=%';
 if configured is distinct from 'nestora_phase2.check_active_data_api_account' then raise exception 'Hook changed: manual reconciliation required'; end if;
 execute format('alter role authenticator in database %I reset pgrst.db_pre_request',current_database());
 for target in select * from nestora_phase2.added_policies loop
   execute format('drop policy %I on %I.%I',target.policy_name,target.schema_name,target.table_name);
 end loop;
end $$;
drop function nestora_phase2.check_active_data_api_account();
drop function nestora_phase2.public_rpc_fingerprint(text);
drop table nestora_phase2.added_policies;
delete from nestora_phase2.rollback_metadata where key in('public_rpc_manifest','policy_manifest');
notify pgrst,'reload config'; notify pgrst,'reload schema';
commit;
