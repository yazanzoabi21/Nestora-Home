create table if not exists public.promotion_products (
  promotion_id uuid not null,
  product_id uuid not null,
  sort_order integer not null default 0,
  promotional_price numeric(10, 2) null,

  constraint promotion_products_pkey
    primary key (promotion_id, product_id),
  constraint promotion_products_promotion_id_fkey
    foreign key (promotion_id)
    references public.promotions(id)
    on delete cascade,
  constraint promotion_products_product_id_fkey
    foreign key (product_id)
    references public.products(id)
    on delete cascade,
  constraint promotion_products_sort_order_check
    check (sort_order >= 0),
  constraint promotion_products_price_check
    check (promotional_price is null or promotional_price >= 0)
);

create index if not exists promotion_products_promotion_idx
  on public.promotion_products (promotion_id, sort_order);

alter table public.promotion_products enable row level security;

drop policy if exists "Public can read active promotion products"
  on public.promotion_products;
create policy "Public can read active promotion products"
  on public.promotion_products
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.promotions promotion
      where promotion.id = promotion_id
        and promotion.is_active = true
        and (promotion.start_date is null or promotion.start_date <= current_timestamp)
        and (promotion.end_date is null or promotion.end_date >= current_timestamp)
    )
    and exists (
      select 1
      from public.products product
      where product.id = product_id
        and product.is_active = true
    )
  );

drop policy if exists "Admins can manage promotion products"
  on public.promotion_products;
create policy "Admins can manage promotion products"
  on public.promotion_products
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and role.name in ('admin', 'super_admin')
    )
  );

create or replace function public.replace_promotion_products(
  p_promotion_id uuid,
  p_product_ids uuid[]
) returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.promotion_products
  where promotion_id = p_promotion_id;

  insert into public.promotion_products (
    promotion_id,
    product_id,
    sort_order,
    promotional_price
  )
  select
    p_promotion_id,
    selected.product_id,
    selected.ordinality - 1,
    null
  from unnest(coalesce(p_product_ids, array[]::uuid[]))
    with ordinality as selected(product_id, ordinality);
end;
$$;

revoke all on function public.replace_promotion_products(uuid, uuid[]) from public;
grant execute on function public.replace_promotion_products(uuid, uuid[]) to authenticated;
