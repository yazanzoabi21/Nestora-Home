-- DRAFT ONLY. NOT EXECUTED. Requires inspection results + explicit approval.
-- Run as trusted database administrator. No existing RLS policy is removed or widened.
begin;
do $$
begin
  if current_setting('nestora.phase2.review_approved',true) is distinct from 'yes' then
    raise exception 'Draft: inspect deployed metadata and obtain approval first';
  end if;
  if to_regnamespace('nestora_phase2') is not null then
    raise exception 'Reserved migration schema already exists; reconcile before proceeding';
  end if;
  if current_setting('nestora.phase2.expected_guard_hash',true) is distinct from
    md5(pg_get_functiondef('public.prevent_customer_profile_privilege_changes()'::regprocedure)) then
    raise exception 'Guard differs from reviewed baseline or review hash is missing';
  end if;
  if not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'A trusted BYPASSRLS owner is required to avoid policy recursion';
  end if;
  if to_regprocedure('public.prevent_customer_profile_privilege_changes()') is null then
    raise exception 'Expected deployed profile protection function missing';
  end if;
  if (select proowner from pg_proc where oid='public.prevent_customer_profile_privilege_changes()'::regprocedure)
    <> (select oid from pg_roles where rolname=current_user) then
    raise exception 'Existing guard owner differs from deployer: reconcile helper EXECUTE privileges first';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.profiles'::regclass
    and tgname='protect_customer_profile_privileges'
    and tgfoid='public.prevent_customer_profile_privilege_changes()'::regprocedure
    and tgenabled in ('O','A') and not tgisinternal) then
    raise exception 'Expected enabled profile protection trigger differs; review deployed definition';
  end if;
  if to_regprocedure('public.manage_profile_access_phase2(uuid,uuid,boolean)') is not null then
    raise exception 'Proposed RPC name already exists; do not overwrite';
  end if;
  if exists (select 1 from pg_roles where rolname='nestora_phase2_access_manager') then
    raise exception 'Dedicated writer role already exists; reconcile before staging';
  end if;
  if not exists (select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where r.name='super_admin' and p.is_active is true) then
    raise exception 'No active Super Admin: resolve baseline through separately approved recovery first';
  end if;
end $$;

create schema nestora_phase2;
revoke all on schema nestora_phase2 from public;
grant usage on schema nestora_phase2 to anon,authenticated,service_role;
create table nestora_phase2.rollback_metadata(key text primary key,value text not null);
revoke all on nestora_phase2.rollback_metadata from public,anon,authenticated,service_role;
insert into nestora_phase2.rollback_metadata values
('profile_guard_definition',pg_get_functiondef('public.prevent_customer_profile_privilege_changes()'::regprocedure));

-- No member available to an API session. Only the fixed RPC temporarily executes as this role.
create role nestora_phase2_access_manager nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
do $$ begin execute format('grant nestora_phase2_access_manager to %I',current_user); end $$;
grant usage on schema public,nestora_phase2 to nestora_phase2_access_manager;
grant select(id,role_id,is_active),update(role_id,is_active) on public.profiles to nestora_phase2_access_manager;
grant select(id,name) on public.roles to nestora_phase2_access_manager;
create policy phase2_manager_profile_select on public.profiles for select to nestora_phase2_access_manager using(true);
create policy phase2_manager_profile_update on public.profiles for update to nestora_phase2_access_manager using(true) with check(true);
create policy phase2_manager_role_select on public.roles for select to nestora_phase2_access_manager using(true);

create function nestora_phase2.active_actor_role()
returns text language sql volatile security definer set search_path=''
as $$
 select r.name::text from public.profiles p join public.roles r on r.id=p.role_id
 where p.id=auth.uid() and p.is_active is true limit 1
$$;
revoke all on function nestora_phase2.active_actor_role() from public;
grant execute on function nestora_phase2.active_actor_role() to anon,authenticated,service_role,nestora_phase2_access_manager;

create function nestora_phase2.is_trusted_maintenance()
returns boolean language sql stable security definer set search_path=''
as $$
 select coalesce(auth.role()='service_role',false) or
 (auth.role() is null and exists(select 1 from pg_catalog.pg_roles
   where rolname=session_user and (rolsuper or rolbypassrls)))
$$;
revoke all on function nestora_phase2.is_trusted_maintenance() from public;
grant execute on function nestora_phase2.is_trusted_maintenance() to anon,authenticated,service_role,nestora_phase2_access_manager;

-- A real row UPDATE serializes all profile/role write transactions. Unlike a count
-- or advisory-lock-only check, conflicting repeatable-read transactions must abort.
create table nestora_phase2.access_invariant_lock(singleton boolean primary key check(singleton),revision bigint not null);
insert into nestora_phase2.access_invariant_lock values(true,0);
revoke all on nestora_phase2.access_invariant_lock from public,anon,authenticated,service_role,nestora_phase2_access_manager;
create function nestora_phase2.lock_access_invariant()
returns void language plpgsql volatile security definer set search_path=''
as $$
begin
 update nestora_phase2.access_invariant_lock set revision=revision+1 where singleton;
 if not found then raise exception 'Security invariant lock is missing'; end if;
end $$;
revoke all on function nestora_phase2.lock_access_invariant() from public;
grant execute on function nestora_phase2.lock_access_invariant() to nestora_phase2_access_manager;

create function nestora_phase2.before_access_write()
returns trigger language plpgsql volatile security definer set search_path=''
as $$
begin
 if tg_op='TRUNCATE' then raise exception 'TRUNCATE of identity/role tables is prohibited' using errcode='42501'; end if;
 perform nestora_phase2.lock_access_invariant();
 return null;
end $$;
revoke all on function nestora_phase2.before_access_write() from public;
create function nestora_phase2.assert_active_super_admin_remains()
returns trigger language plpgsql volatile security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id
   where r.name='super_admin' and p.is_active is true) then
   raise exception 'At least one active Super Admin must remain' using errcode='23514';
 end if;
 return null;
end $$;
revoke all on function nestora_phase2.assert_active_super_admin_remains() from public;
create trigger phase2_before_profile_write before insert or update or delete or truncate on public.profiles
 for each statement execute function nestora_phase2.before_access_write();
create trigger phase2_after_profile_write after insert or update or delete on public.profiles
 for each statement execute function nestora_phase2.assert_active_super_admin_remains();
create trigger phase2_before_role_write before insert or update or delete or truncate on public.roles
 for each statement execute function nestora_phase2.before_access_write();
create trigger phase2_after_role_write after insert or update or delete on public.roles
 for each statement execute function nestora_phase2.assert_active_super_admin_remains();

-- SECURITY INVOKER is intentional: current_user distinguishes a direct authenticated
-- UPDATE from the dedicated RPC owner. A caller-controlled GUC is NOT authorization.
create or replace function public.prevent_customer_profile_privilege_changes()
returns trigger language plpgsql volatile security invoker set search_path=''
as $$
declare editable text[]:=array['full_name','email','phone','birthday','avatar_media_id','avatar_url'];
begin
 if nestora_phase2.is_trusted_maintenance() then return new; end if;
 if auth.role() is distinct from 'authenticated' or nestora_phase2.active_actor_role() is null then
   raise exception 'Active account required' using errcode='42501';
 end if;
 if new.id is distinct from old.id then raise exception 'Profile identity cannot be changed' using errcode='42501'; end if;
 if current_user='nestora_phase2_access_manager'
   and nestora_phase2.active_actor_role()='super_admin' then
   editable:=array['role_id','is_active'];
 end if;
 if (to_jsonb(new)-editable) is distinct from (to_jsonb(old)-editable) then
   raise exception 'Use the authorized management RPC for privileged changes' using errcode='42501';
 end if;
 return new;
end $$;

-- Role names/IDs are authorization data. Browser role-catalogue writes are forbidden,
-- including for Super Admins. Ordinary profile assignment remains available via RPC.
create function nestora_phase2.guard_role_catalogue()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if not nestora_phase2.is_trusted_maintenance() then
   raise exception 'Role catalogue maintenance requires a trusted server workflow' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function nestora_phase2.guard_role_catalogue() from public;
create trigger phase2_protect_role_catalogue before insert or update or delete on public.roles
 for each row execute function nestora_phase2.guard_role_catalogue();

create function public.manage_profile_access_phase2(p_profile_id uuid,p_role_id uuid,p_is_active boolean)
returns void language plpgsql volatile security definer set search_path=''
as $$
begin
 perform nestora_phase2.lock_access_invariant();
 -- Check again AFTER serialization: another transaction may have revoked this actor.
 if auth.role() is distinct from 'authenticated' or nestora_phase2.active_actor_role() is distinct from 'super_admin' then
   raise exception 'Active Super Admin access required' using errcode='42501';
 end if;
 if p_profile_id is null or p_role_id is null or p_is_active is null then
   raise exception 'Profile, role and explicit activation state are required' using errcode='22023';
 end if;
 if not exists(select 1 from public.roles where id=p_role_id) then raise exception 'Role not found' using errcode='22023'; end if;
 update public.profiles set role_id=p_role_id,is_active=p_is_active where id=p_profile_id;
 if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
 -- AFTER STATEMENT invariant rejects last-admin demotion/deactivation, even self changes.
end $$;
-- Required only during ownership transfer; not retained as a runtime capability.
grant create on schema public to nestora_phase2_access_manager;
alter function public.manage_profile_access_phase2(uuid,uuid,boolean) owner to nestora_phase2_access_manager;
revoke create on schema public from nestora_phase2_access_manager;
revoke all on function public.manage_profile_access_phase2(uuid,uuid,boolean) from public,anon,service_role;
grant execute on function public.manage_profile_access_phase2(uuid,uuid,boolean) to authenticated;
do $$
begin
 if pg_has_role('authenticator','nestora_phase2_access_manager','MEMBER')
   or pg_has_role('authenticated','nestora_phase2_access_manager','MEMBER')
   or pg_has_role('anon','nestora_phase2_access_manager','MEMBER')
   or pg_has_role('service_role','nestora_phase2_access_manager','MEMBER') then
   raise exception 'Dedicated writer role is reachable by an API role';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
