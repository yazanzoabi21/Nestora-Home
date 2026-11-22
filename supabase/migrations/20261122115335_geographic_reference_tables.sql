begin;

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  iso_code text not null unique check (iso_code ~ '^[A-Z]{2}$'),
  name_en text not null check (btrim(name_en) <> ''),
  name_ar text not null check (btrim(name_ar) <> ''),
  is_enabled_for_delivery boolean not null default false,
  sort_order integer not null default 0
);

create table public.provinces (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries (id),
  name_en text not null check (btrim(name_en) <> ''),
  name_ar text not null check (btrim(name_ar) <> ''),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  unique (country_id, name_en),
  unique (country_id, id)
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces (id),
  name_en text not null check (btrim(name_en) <> ''),
  name_ar text not null check (btrim(name_ar) <> ''),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  unique (province_id, name_en),
  unique (province_id, id)
);

create index countries_delivery_order on public.countries (sort_order, name_en, id)
  where is_enabled_for_delivery;
create index provinces_active_order on public.provinces (country_id, sort_order, name_en, id)
  where is_active;
create index cities_active_order on public.cities (province_id, sort_order, name_en, id)
  where is_active;

alter table public.countries enable row level security;
alter table public.provinces enable row level security;
alter table public.cities enable row level security;

revoke all on public.countries, public.provinces, public.cities from public, anon, authenticated;
grant select on public.countries, public.provinces, public.cities to anon, authenticated;

create policy "Read delivery countries" on public.countries for select to anon, authenticated
  using (is_enabled_for_delivery);

create policy "Read active delivery provinces" on public.provinces for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.countries country
      where country.id = provinces.country_id and country.is_enabled_for_delivery
    )
  );

create policy "Read active delivery cities" on public.cities for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.provinces province
      where province.id = cities.province_id and province.is_active
    )
  );

alter table public.customer_addresses
  add column country_id uuid references public.countries (id),
  add column province_id uuid,
  add column city_id uuid,
  add constraint customer_addresses_location_complete check (num_nonnulls(country_id, province_id, city_id) in (0, 3)),
  add constraint customer_addresses_province_country_fk
    foreign key (country_id, province_id) references public.provinces (country_id, id),
  add constraint customer_addresses_city_province_fk
    foreign key (province_id, city_id) references public.cities (province_id, id);

create index customer_addresses_country_province_idx
  on public.customer_addresses (country_id, province_id) where country_id is not null;
create index customer_addresses_province_city_idx
  on public.customer_addresses (province_id, city_id) where province_id is not null;

notify pgrst, 'reload schema';

commit;
