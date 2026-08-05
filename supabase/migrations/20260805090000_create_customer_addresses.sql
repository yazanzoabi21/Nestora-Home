create table if not exists public.customer_addresses (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text not null check (char_length(btrim(phone)) between 3 and 40),
  street_address text not null check (char_length(btrim(street_address)) between 1 and 240),
  apartment_or_building text null check (apartment_or_building is null or char_length(btrim(apartment_or_building)) <= 160),
  city text not null check (char_length(btrim(city)) between 1 and 120),
  area_or_district text null check (area_or_district is null or char_length(btrim(area_or_district)) <= 120),
  country text not null check (char_length(btrim(country)) between 1 and 120),
  postal_code text null check (postal_code is null or char_length(btrim(postal_code)) <= 40),
  delivery_notes text null check (delivery_notes is null or char_length(btrim(delivery_notes)) <= 500),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_user_created_idx
  on public.customer_addresses (user_id, created_at desc);

create unique index if not exists customer_addresses_one_default_uidx
  on public.customer_addresses (user_id)
  where is_default;

create or replace function public.prepare_customer_address()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.label := btrim(new.label);
  new.full_name := btrim(new.full_name);
  new.phone := btrim(new.phone);
  new.street_address := btrim(new.street_address);
  new.apartment_or_building := nullif(btrim(new.apartment_or_building), '');
  new.city := btrim(new.city);
  new.area_or_district := nullif(btrim(new.area_or_district), '');
  new.country := btrim(new.country);
  new.postal_code := nullif(btrim(new.postal_code), '');
  new.delivery_notes := nullif(btrim(new.delivery_notes), '');
  new.updated_at := now();

  if tg_op = 'INSERT' and not exists (
    select 1 from public.customer_addresses where user_id = new.user_id
  ) then
    new.is_default := true;
  end if;

  if new.is_default and (tg_op = 'INSERT' or old.is_default is distinct from true) then
    update public.customer_addresses
    set is_default = false, updated_at = now()
    where user_id = new.user_id
      and id <> new.id
      and is_default;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_customer_address() from public, anon, authenticated;

drop trigger if exists prepare_customer_address_row on public.customer_addresses;
create trigger prepare_customer_address_row
before insert or update on public.customer_addresses
for each row execute function public.prepare_customer_address();

create or replace function public.promote_customer_address_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.is_default then
    update public.customer_addresses
    set is_default = true
    where id = (
      select id
      from public.customer_addresses
      where user_id = old.user_id
      order by created_at asc, id asc
      limit 1
    );
  end if;
  return old;
end;
$$;

revoke all on function public.promote_customer_address_after_delete() from public, anon, authenticated;

drop trigger if exists promote_customer_address_after_delete_row on public.customer_addresses;
create trigger promote_customer_address_after_delete_row
after delete on public.customer_addresses
for each row execute function public.promote_customer_address_after_delete();

alter table public.customer_addresses enable row level security;

create policy "Customers can read their addresses"
  on public.customer_addresses for select
  to authenticated
  using (user_id = auth.uid());

create policy "Customers can create their addresses"
  on public.customer_addresses for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Customers can update their addresses"
  on public.customer_addresses for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Customers can delete their addresses"
  on public.customer_addresses for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.customer_addresses to authenticated;
revoke all on public.customer_addresses from anon;

notify pgrst, 'reload schema';
