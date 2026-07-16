-- Public Auth signups are always customers. Admin and super-admin provisioning must
-- continue through the trusted service-role/database process.
create or replace function public.handle_public_customer_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_role_id uuid;
  provisioned_role text;
begin
  -- raw_app_meta_data can only be assigned by the trusted Admin API/service role.
  -- Public signUp callers can modify raw_user_meta_data, so it is never trusted here.
  provisioned_role := lower(coalesce(new.raw_app_meta_data ->> 'role', ''));
  if provisioned_role in ('admin', 'super_admin', 'staff') then
    return new;
  end if;

  select id into customer_role_id
  from public.roles
  where name = 'customer'
  limit 1;

  if customer_role_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Customer role is not configured.';
  end if;

  insert into public.profiles (
    id,
    role_id,
    full_name,
    email,
    phone,
    is_active
  ) values (
    new.id,
    customer_role_id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_public_customer_signup() from public, anon, authenticated;

drop trigger if exists on_public_customer_signup on auth.users;
create trigger on_public_customer_signup
after insert on auth.users
for each row execute function public.handle_public_customer_signup();

-- A customer may edit personal details, but can never promote or reactivate the
-- profile by submitting a hand-crafted REST request.
create or replace function public.prevent_customer_profile_privilege_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_role_name text;
begin
  select name into old_role_name from public.roles where id = old.role_id;

  if old_role_name = 'customer' and auth.role() <> 'service_role' then
    new.role_id := old.role_id;
    new.is_active := old.is_active;
    new.email := old.email;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_customer_profile_privilege_changes() from public, anon, authenticated;

drop trigger if exists protect_customer_profile_privileges on public.profiles;
create trigger protect_customer_profile_privileges
before update on public.profiles
for each row execute function public.prevent_customer_profile_privilege_changes();

-- Direct profile inserts are not part of public registration; the auth trigger owns them.
revoke insert on public.profiles from anon, authenticated;
