create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option_name text not null,
  option_value text not null,
  name text null,
  sku text null,
  price numeric(10, 2) null,
  sale_price numeric(10, 2) null,
  stock integer null,
  attributes jsonb not null default '{}'::jsonb,
  media_id uuid null references public.media_assets(id) on delete set null,
  image_url text null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_option_name_not_blank check (btrim(option_name) <> ''),
  constraint product_variants_option_value_not_blank check (btrim(option_value) <> ''),
  constraint product_variants_price_positive check (price is null or price > 0),
  constraint product_variants_sale_price_positive check (sale_price is null or sale_price > 0),
  constraint product_variants_sale_below_override check (
    price is null or sale_price is null or sale_price < price
  ),
  constraint product_variants_stock_nonnegative check (stock is null or stock >= 0),
  constraint product_variants_sort_order_nonnegative check (sort_order >= 0),
  constraint product_variants_attributes_object check (jsonb_typeof(attributes) = 'object')
);

create unique index if not exists product_variants_product_option_uidx
  on public.product_variants (product_id, lower(btrim(option_name)), lower(btrim(option_value)));
create unique index if not exists product_variants_sku_uidx
  on public.product_variants (lower(btrim(sku))) where nullif(btrim(sku), '') is not null;
create index if not exists product_variants_product_sort_idx
  on public.product_variants (product_id, sort_order, id);
create index if not exists product_variants_active_product_idx
  on public.product_variants (product_id, sort_order) where is_active = true;
alter table public.product_variants
  add constraint product_variants_id_product_unique unique (id, product_id);

alter table public.product_variants enable row level security;

create policy "Public can read active product variants"
  on public.product_variants for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.products product
      where product.id = product_id and product.is_active = true
    )
  );

create policy "Admins can manage product variants"
  on public.product_variants for all to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
    )
  );

create or replace function public.replace_product_variants(
  p_product_id uuid,
  p_variants jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(coalesce(p_variants, '[]'::jsonb)) <> 'array' then
    raise exception 'Product variants must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) item
    join public.products product
      on lower(btrim(product.sku)) = lower(btrim(item ->> 'sku'))
    where nullif(btrim(item ->> 'sku'), '') is not null
  ) then
    raise exception 'A variant SKU is already used by a product.';
  end if;

  delete from public.product_variants where product_id = p_product_id;

  insert into public.product_variants (
    product_id, option_name, option_value, name, sku, price, sale_price, stock,
    attributes, media_id, image_url, is_active, sort_order
  )
  select
    p_product_id,
    btrim(item.option_name),
    btrim(item.option_value),
    nullif(btrim(item.name), ''),
    nullif(btrim(item.sku), ''),
    item.price,
    item.sale_price,
    item.stock,
    coalesce(item.attributes, '{}'::jsonb),
    item.media_id,
    nullif(btrim(item.image_url), ''),
    coalesce(item.is_active, true),
    coalesce(item.sort_order, item.ordinality - 1)
  from rows from (
    jsonb_to_recordset(coalesce(p_variants, '[]'::jsonb)) as (
      option_name text,
      option_value text,
      name text,
      sku text,
      price numeric,
      sale_price numeric,
      stock integer,
      attributes jsonb,
      media_id uuid,
      image_url text,
      is_active boolean,
      sort_order integer
    )
  ) with ordinality as item;
end;
$$;

revoke all on function public.replace_product_variants(uuid, jsonb) from public, anon;
grant execute on function public.replace_product_variants(uuid, jsonb) to authenticated;

alter table public.cart_items add column if not exists variant_id uuid null
  references public.product_variants(id) on delete cascade;
alter table public.cart_items add constraint cart_items_variant_product_fkey
  foreign key (variant_id, product_id)
  references public.product_variants(id, product_id) on delete cascade;
drop index if exists public.cart_items_cart_product_unique_idx;
alter table public.cart_items drop constraint if exists cart_items_cart_product_unique;
create unique index cart_items_cart_product_variant_uidx
  on public.cart_items (cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists cart_items_variant_id_idx on public.cart_items(variant_id);

alter table public.wishlist add column if not exists variant_id uuid null
  references public.product_variants(id) on delete cascade;
alter table public.wishlist add constraint wishlist_variant_product_fkey
  foreign key (variant_id, product_id)
  references public.product_variants(id, product_id) on delete cascade;
drop index if exists public.wishlist_user_product_uidx;
create unique index wishlist_user_product_variant_uidx
  on public.wishlist (user_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.order_items
  add column if not exists variant_id uuid null references public.product_variants(id) on delete set null,
  add column if not exists variant_name text null,
  add column if not exists variant_sku text null,
  add column if not exists variant_attributes jsonb not null default '{}'::jsonb,
  add column if not exists variant_image_url text null;
alter table public.order_items add constraint order_items_variant_product_fkey
  foreign key (variant_id, product_id)
  references public.product_variants(id, product_id) on delete set null (variant_id);
create index if not exists order_items_variant_id_idx on public.order_items(variant_id);

notify pgrst, 'reload schema';
