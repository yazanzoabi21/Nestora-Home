-- Initialize customer profiles for both password and OAuth signups. Provider
-- metadata is used only for customer-facing profile fields; role assignment
-- remains controlled by the database.
create or replace function public.handle_public_customer_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_role_id uuid;
  provisioned_role text;
begin
  -- raw_app_meta_data can only be assigned by the trusted Admin API/service role.
  -- Public callers can modify raw_user_meta_data, so it never controls roles.
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
    avatar_url,
    is_active
  ) values (
    new.id,
    customer_role_id,
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    ),
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'picture',
          ''
        )
      ),
      ''
    ),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_public_customer_signup() from public, anon, authenticated;
