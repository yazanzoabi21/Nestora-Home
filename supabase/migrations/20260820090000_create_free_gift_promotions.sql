alter table public.discounts
  add column if not exists gift_quantity integer not null default 1;

alter table public.discounts
  drop constraint if exists discounts_gift_quantity_check;
alter table public.discounts
  add constraint discounts_gift_quantity_check check (gift_quantity > 0);

create table if not exists public.discount_gift_products (
  id uuid primary key default extensions.uuid_generate_v4(),
  discount_id uuid not null references public.discounts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint discount_gift_products_unique unique (discount_id, product_id)
);

create index if not exists discount_gift_products_discount_order_idx
  on public.discount_gift_products(discount_id, is_active, sort_order);

alter table public.discount_gift_products enable row level security;

create policy "Customers read available gift products"
  on public.discount_gift_products for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.discounts discount
      where discount.id = discount_id
        and discount.discount_type = 'free_gift'
        and discount.is_active = true
        and (discount.start_date is null or discount.start_date <= now())
        and (discount.end_date is null or discount.end_date >= now())
    )
    and exists (
      select 1 from public.products product
      where product.id = product_id
        and product.is_active = true
        and coalesce(product.stock, 0) > 0
    )
  );

create policy "Admins manage gift products"
  on public.discount_gift_products for all to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and profile.is_active = true
        and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and profile.is_active = true
        and role.name in ('admin', 'super_admin')
    )
  );

create or replace function public.replace_discount_gift_products(
  p_discount_id uuid,
  p_product_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and profile.is_active = true
      and role.name in ('admin', 'super_admin')
  ) then
    raise exception 'Admin access is required.';
  end if;

  if not exists (
    select 1 from public.discounts
    where id = p_discount_id and discount_type = 'free_gift'
  ) then
    raise exception 'A free-gift discount is required.';
  end if;

  if coalesce(cardinality(p_product_ids), 0) <> coalesce(
    (select count(distinct product_id) from unnest(p_product_ids) product_id), 0
  ) then
    raise exception 'Duplicate gift products are not allowed.';
  end if;

  delete from public.discount_gift_products where discount_id = p_discount_id;
  insert into public.discount_gift_products(discount_id, product_id, sort_order, is_active)
  select p_discount_id, selected.product_id, selected.ordinality - 1, true
  from unnest(coalesce(p_product_ids, array[]::uuid[]))
    with ordinality as selected(product_id, ordinality);
end;
$$;

revoke all on function public.replace_discount_gift_products(uuid, uuid[]) from public, anon;
grant execute on function public.replace_discount_gift_products(uuid, uuid[]) to authenticated;

alter table public.cart_items
  add column if not exists is_free_gift boolean not null default false,
  add column if not exists applied_discount_id uuid null references public.discounts(id) on delete set null;

drop index if exists public.cart_items_cart_product_variant_uidx;
create unique index cart_items_paid_product_variant_uidx
  on public.cart_items(cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_free_gift = false;
create unique index cart_items_gift_discount_product_uidx
  on public.cart_items(cart_id, applied_discount_id, product_id)
  where is_free_gift = true;

create or replace function public.replace_cart_free_gifts(
  p_cart_id uuid,
  p_discount_id uuid,
  p_product_ids uuid[]
) returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gift_quantity integer;
  v_ids uuid[];
begin
  if not exists (
    select 1 from public.carts cart
    where cart.id = p_cart_id and cart.user_id = auth.uid()
  ) then
    raise exception 'You do not have access to this cart.';
  end if;
  select gift_quantity into v_gift_quantity from public.discounts
  where id = p_discount_id and discount_type = 'free_gift' and is_active = true;
  if not found then raise exception 'The free-gift promotion is unavailable.'; end if;
  if coalesce(cardinality(p_product_ids), 0) > v_gift_quantity
    or coalesce(cardinality(p_product_ids), 0) <> coalesce(
      (select count(distinct product_id) from unnest(p_product_ids) product_id), 0
    )
  then
    raise exception 'The free-gift selection is invalid.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_product_ids, array[]::uuid[])) product_id
    left join public.discount_gift_products relation
      on relation.discount_id = p_discount_id and relation.product_id = product_id
    left join public.products product on product.id = product_id
    where relation.id is null or relation.is_active is distinct from true
      or product.is_active is distinct from true or coalesce(product.stock, 0) < 1
  ) then
    raise exception 'This gift is no longer available. Please choose another free gift.';
  end if;

  delete from public.cart_items
  where cart_id = p_cart_id and is_free_gift = true and applied_discount_id = p_discount_id;
  with inserted as (
    insert into public.cart_items(cart_id, product_id, quantity, is_free_gift, applied_discount_id)
    select p_cart_id, product_id, 1, true, p_discount_id
    from unnest(coalesce(p_product_ids, array[]::uuid[])) product_id
    returning id
  ) select coalesce(array_agg(id), array[]::uuid[]) into v_ids from inserted;
  return v_ids;
end;
$$;

revoke all on function public.replace_cart_free_gifts(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.replace_cart_free_gifts(uuid, uuid, uuid[]) to authenticated;

alter table public.order_items
  add column if not exists is_free_gift boolean not null default false,
  add column if not exists applied_discount_id uuid null references public.discounts(id) on delete set null,
  add column if not exists original_unit_price numeric(10,2) null;

alter table public.order_items
  drop constraint if exists order_items_original_unit_price_check;
alter table public.order_items
  add constraint order_items_original_unit_price_check
  check (original_unit_price is null or original_unit_price >= 0);

alter table public.orders
  add column if not exists free_gift_processed boolean not null default false;

create function public.place_customer_order(
  p_cart_id uuid,
  p_shipping_method_id uuid,
  p_payment_method_id uuid,
  p_shipping_address jsonb,
  p_items jsonb,
  p_customer_notes text,
  p_discount_id uuid,
  p_discount_code text,
  p_expected_subtotal numeric,
  p_checkout_token uuid,
  p_redeem_product_ids uuid[],
  p_redeem_variant_ids uuid[],
  p_free_gift_product_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_discount public.discounts%rowtype;
  v_result jsonb;
  v_order_id uuid;
  v_order_number text;
  v_paid_subtotal numeric(10,2);
  v_customer_usage integer;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_previous_stock integer;
begin
  if coalesce(cardinality(p_free_gift_product_ids), 0) = 0 then
    return public.place_customer_order(
      p_cart_id, p_shipping_method_id, p_payment_method_id, p_shipping_address,
      p_items, p_customer_notes, p_discount_id, p_discount_code,
      p_expected_subtotal, p_checkout_token, p_redeem_product_ids, p_redeem_variant_ids
    );
  end if;

  if p_discount_id is null or nullif(btrim(p_discount_code), '') is null then
    raise exception 'Apply the free-gift promo code before selecting a gift.';
  end if;

  select * into v_discount from public.discounts where id = p_discount_id for update;
  if not found or v_discount.discount_type <> 'free_gift' then
    raise exception 'The selected free-gift promotion is invalid.';
  end if;
  if upper(btrim(v_discount.code)) <> upper(btrim(p_discount_code)) then
    raise exception 'The applied free-gift promo code is invalid.';
  end if;
  if v_discount.is_active is distinct from true
    or (v_discount.start_date is not null and now() < v_discount.start_date)
    or (v_discount.end_date is not null and now() > v_discount.end_date)
  then
    raise exception 'The free-gift promotion is no longer available.';
  end if;
  if v_discount.usage_limit is not null
    and coalesce(v_discount.usage_count, 0) >= v_discount.usage_limit
  then
    raise exception 'The free-gift promotion has reached its usage limit.';
  end if;
  if cardinality(p_free_gift_product_ids) > v_discount.gift_quantity
    or cardinality(p_free_gift_product_ids) <> (
      select count(distinct gift_id) from unnest(p_free_gift_product_ids) gift_id
    )
  then
    raise exception 'Too many or duplicate free gifts were selected.';
  end if;
  if v_user_id is not null and v_discount.usage_per_customer is not null then
    select count(*) into v_customer_usage from public.orders
    where user_id = v_user_id and discount_id = v_discount.id;
    if v_customer_usage >= v_discount.usage_per_customer then
      raise exception 'You have already used this promo code the maximum number of times.';
    end if;
  end if;
  if p_redeem_product_ids <> array[]::uuid[] or p_redeem_variant_ids <> array[]::uuid[] then
    raise exception 'Loyalty redemption cannot be combined with a free gift.';
  end if;

  if p_cart_id is not null then
    if not exists (
      select 1 from public.carts cart where cart.id = p_cart_id
        and cart.user_id = v_user_id
    ) then
      raise exception 'You do not have access to this cart.';
    end if;
    if (select count(*) from public.cart_items item
        where item.cart_id = p_cart_id and item.is_free_gift = false)
      <> jsonb_array_length(p_items)
      or exists (
        select 1 from public.cart_items cart_item
        where cart_item.cart_id = p_cart_id and cart_item.is_free_gift = false
          and not exists (
            select 1 from jsonb_array_elements(p_items) submitted
            where (submitted ->> 'product_id')::uuid = cart_item.product_id
              and nullif(submitted ->> 'variant_id', '')::uuid is not distinct from cart_item.variant_id
              and (submitted ->> 'quantity')::integer = cart_item.quantity
          )
      )
    then
      raise exception 'Submitted paid items do not match the current cart.';
    end if;
    if (select count(*) from public.cart_items item
        where item.cart_id = p_cart_id and item.is_free_gift = true
          and item.applied_discount_id = p_discount_id)
      <> cardinality(p_free_gift_product_ids)
    then
      raise exception 'The selected gift does not match the current cart.';
    end if;
    if exists (
      select 1 from public.cart_items item
      where item.cart_id = p_cart_id and item.is_free_gift = true
        and (item.applied_discount_id <> p_discount_id
          or item.product_id <> all(p_free_gift_product_ids))
    ) then
      raise exception 'The selected gift does not match the current cart.';
    end if;
  end if;

  if exists (
    select 1 from unnest(p_free_gift_product_ids) gift_id
    left join public.discount_gift_products relation
      on relation.discount_id = p_discount_id and relation.product_id = gift_id
    left join public.products product on product.id = gift_id
    where relation.id is null or relation.is_active is distinct from true
      or product.id is null or product.is_active is distinct from true
      or coalesce(product.stock, 0) < 1
  ) then
    raise exception 'This gift is no longer available. Please choose another free gift.';
  end if;

  v_result := public.place_customer_order(
    null, p_shipping_method_id, p_payment_method_id, p_shipping_address,
    p_items, p_customer_notes, null, null, p_expected_subtotal,
    p_checkout_token, p_redeem_product_ids, p_redeem_variant_ids
  );
  v_order_id := (v_result ->> 'order_id')::uuid;
  v_paid_subtotal := (v_result ->> 'subtotal')::numeric;
  v_order_number := v_result ->> 'order_number';

  if v_paid_subtotal < coalesce(v_discount.minimum_order_amount, 0) then
    raise exception 'The order no longer meets the free-gift minimum amount.';
  end if;

  if not (select free_gift_processed from public.orders where id = v_order_id for update) then
    foreach v_product_id in array p_free_gift_product_ids loop
      select * into v_product from public.products where id = v_product_id for update;
      if not found or v_product.is_active is distinct from true or coalesce(v_product.stock, 0) < 1 then
        raise exception 'This gift is no longer available. Please choose another free gift.';
      end if;
      v_previous_stock := coalesce(v_product.stock, 0);
      insert into public.order_items(
        order_id, product_id, quantity, price, total, original_unit_price,
        is_free_gift, applied_discount_id, loyalty_points_earned
      ) values (
        v_order_id, v_product.id, 1, 0, 0,
        case when v_product.sale_price is not null and v_product.sale_price > 0
          and v_product.sale_price < v_product.price then v_product.sale_price else v_product.price end,
        true, v_discount.id, 0
      );
      update public.products set stock = v_previous_stock - 1,
        sold_count = coalesce(sold_count, 0) + 1 where id = v_product.id;
      insert into public.inventory_logs(product_id, previous_stock, new_stock, change_type, note)
      values (v_product.id, v_previous_stock, v_previous_stock - 1,
        'adjustment', 'Free gift for customer order ' || v_order_number);
    end loop;

    update public.orders set cart_id = p_cart_id, discount_id = v_discount.id,
      discount_code = v_discount.code, discount_amount = 0, free_gift_processed = true
    where id = v_order_id;
    update public.discounts set usage_count = coalesce(usage_count, 0) + 1,
      updated_at = now() where id = v_discount.id;
    if p_cart_id is not null then delete from public.cart_items where cart_id = p_cart_id; end if;
  end if;

  return v_result || jsonb_build_object(
    'discount_id', v_discount.id,
    'discount_code', v_discount.code,
    'discount_amount', 0
  );
end;
$$;

revoke all on function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[], uuid[]
) from public;
grant execute on function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[], uuid[]
) to anon, authenticated;

notify pgrst, 'reload schema';
