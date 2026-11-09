-- DRAFT rollback. Roll back probe and 20 first. No business rows are reverted.
begin;
do $$
declare old_definition text;
begin
 if current_setting('nestora.phase2.rollback_approved',true) is distinct from 'yes' then raise exception 'Rollback approval required'; end if;
 if to_regclass('nestora_phase2.added_policies') is not null then raise exception 'Roll back deactivation controls first'; end if;
 select value into strict old_definition from nestora_phase2.rollback_metadata where key='profile_guard_definition';
 execute old_definition;
end $$;
drop function public.manage_profile_access_phase2(uuid,uuid,boolean);
drop trigger phase2_before_profile_write on public.profiles;
drop trigger phase2_after_profile_write on public.profiles;
drop trigger phase2_before_role_write on public.roles;
drop trigger phase2_after_role_write on public.roles;
drop trigger phase2_protect_role_catalogue on public.roles;
drop policy phase2_manager_profile_select on public.profiles;
drop policy phase2_manager_profile_update on public.profiles;
drop policy phase2_manager_role_select on public.roles;
drop function nestora_phase2.before_access_write();
drop function nestora_phase2.assert_active_super_admin_remains();
drop function nestora_phase2.guard_role_catalogue();
drop function nestora_phase2.lock_access_invariant();
drop function nestora_phase2.active_actor_role();
drop function nestora_phase2.is_trusted_maintenance();
revoke all on public.profiles,public.roles from nestora_phase2_access_manager;
revoke select(id,role_id,is_active),update(role_id,is_active) on public.profiles from nestora_phase2_access_manager;
revoke select(id,name) on public.roles from nestora_phase2_access_manager;
revoke all on schema public,nestora_phase2 from nestora_phase2_access_manager;
do $$ begin execute format('revoke nestora_phase2_access_manager from %I',current_user); end $$;
drop role nestora_phase2_access_manager;
drop table nestora_phase2.access_invariant_lock;
drop table nestora_phase2.rollback_metadata;
drop schema nestora_phase2;
notify pgrst,'reload schema';
commit;
