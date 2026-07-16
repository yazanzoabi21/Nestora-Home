alter table public.orders
  add column if not exists discount_id uuid null
    references public.discounts(id) on delete set null,
  add column if not exists discount_code varchar(100) null;

create index if not exists idx_orders_discount_id
  on public.orders(discount_id);

drop function if exists public.place_customer_order(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text
);

create function public.place_customer_order(
  p_cart_id uuid,
  p_shipping_method_id uuid,
  p_payment_method_id uuid,
  p_shipping_address jsonb,
  p_items jsonb,
  p_customer_notes text,
  p_discount_id uuid,
  p_discount_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_discount public.discounts%rowtype;
  v_result jsonb;
  v_order_id uuid;
  v_subtotal numeric(10,2);
  v_shipping_cost numeric(10,2);
  v_payment_fee numeric(10,2);
  v_eligible_subtotal numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_total numeric(10,2);
  v_customer_usage integer := 0;
begin
  if (p_discount_id is null) <> (nullif(btrim(p_discount_code), '') is null) then
    raise exception 'The applied promo information is incomplete. Remove it or apply it again.';
  end if;

  if p_discount_id is not null then
    select *
    into v_discount
    from public.discounts
    where id = p_discount_id
    for update;

    if not found then
      raise exception 'The applied promo code no longer exists.';
    end if;

    if upper(btrim(v_discount.code)) <> upper(btrim(p_discount_code)) then
      raise exception 'The applied promo code is invalid. Remove it or apply it again.';
    end if;

    if v_discount.is_active is distinct from true then
      raise exception 'The applied promo code is no longer active.';
    end if;

    if v_discount.start_date is not null and now() < v_discount.start_date then
      raise exception 'The applied promo code is not active yet.';
    end if;

    if v_discount.end_date is not null and now() > v_discount.end_date then
      raise exception 'The applied promo code has expired.';
    end if;

    if v_discount.usage_limit is not null
      and coalesce(v_discount.usage_count, 0) >= v_discount.usage_limit
    then
      raise exception 'The applied promo code has reached its usage limit.';
    end if;

    if v_discount.discount_type is null
      or v_discount.discount_type not in ('percentage', 'fixed_amount')
    then
      raise exception 'The applied promo code cannot be used as an order discount.';
    end if;

    if v_discount.applies_to is null
      or v_discount.applies_to not in ('all', 'product', 'category')
    then
      raise exception 'The applied promo code has an unsupported eligibility rule.';
    end if;

    if v_discount.discount_value is null or v_discount.discount_value <= 0 then
      raise exception 'The applied promo code has an invalid discount value.';
    end if;

    if v_discount.discount_type = 'percentage' and v_discount.discount_value > 100 then
      raise exception 'The applied promo code has an invalid percentage.';
    end if;
  end if;

  v_result := public.place_customer_order(
    p_cart_id,
    p_shipping_method_id,
    p_payment_method_id,
    p_shipping_address,
    p_items,
    p_customer_notes
  );

  v_order_id := (v_result ->> 'order_id')::uuid;
  v_subtotal := (v_result ->> 'subtotal')::numeric;
  v_shipping_cost := (v_result ->> 'shipping_cost')::numeric;
  v_payment_fee := (v_result ->> 'payment_fee')::numeric;

  if p_discount_id is not null then
    if v_subtotal < coalesce(v_discount.minimum_order_amount, 0) then
      raise exception 'The order no longer meets the promo code minimum amount.';
    end if;

    if v_auth_user_id is not null and v_discount.usage_per_customer is not null then
      select count(*)
      into v_customer_usage
      from public.orders
      where user_id = v_auth_user_id
        and discount_id = v_discount.id;

      if v_customer_usage >= v_discount.usage_per_customer then
        raise exception 'You have already used this promo code the maximum number of times.';
      end if;
    end if;

    if v_discount.applies_to = 'all' then
      select coalesce(sum(item.total), 0)
      into v_eligible_subtotal
      from public.order_items item
      where item.order_id = v_order_id;
    elsif v_discount.applies_to = 'product' then
      if v_discount.product_id is null then
        raise exception 'The applied promo code has no eligible product.';
      end if;

      select coalesce(sum(item.total), 0)
      into v_eligible_subtotal
      from public.order_items item
      where item.order_id = v_order_id
        and item.product_id = v_discount.product_id;
    else
      if v_discount.category_id is null then
        raise exception 'The applied promo code has no eligible category.';
      end if;

      select coalesce(sum(item.total), 0)
      into v_eligible_subtotal
      from public.order_items item
      join public.products product on product.id = item.product_id
      where item.order_id = v_order_id
        and product.category_id = v_discount.category_id;
    end if;

    v_eligible_subtotal := round(v_eligible_subtotal, 2);
    if v_eligible_subtotal <= 0 then
      raise exception 'The applied promo code is not valid for the products in this order.';
    end if;

    if v_discount.discount_type = 'percentage' then
      v_discount_amount := round(
        v_eligible_subtotal * v_discount.discount_value / 100,
        2
      );
    else
      v_discount_amount := round(v_discount.discount_value, 2);
    end if;

    v_discount_amount := least(v_eligible_subtotal, greatest(0, v_discount_amount));
  end if;

  v_total := greatest(
    0,
    round(v_subtotal + v_shipping_cost + v_payment_fee - v_discount_amount, 2)
  );

  update public.orders
  set discount_id = case when p_discount_id is null then null else v_discount.id end,
      discount_code = case when p_discount_id is null then null else v_discount.code end,
      discount_amount = v_discount_amount,
      total = v_total
  where id = v_order_id;

  update public.payment_transactions
  set amount = v_total
  where order_id = v_order_id;

  if p_discount_id is not null then
    update public.discounts
    set usage_count = coalesce(usage_count, 0) + 1,
        updated_at = now()
    where id = v_discount.id;
  end if;

  return v_result || jsonb_build_object(
    'discount_id', case when p_discount_id is null then null else v_discount.id end,
    'discount_code', case when p_discount_id is null then null else v_discount.code end,
    'discount_amount', v_discount_amount,
    'total', v_total
  );
end;
$$;

revoke all on function public.place_customer_order(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text
) from public;

grant execute on function public.place_customer_order(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text
) to anon;

grant execute on function public.place_customer_order(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text
) to authenticated;

notify pgrst, 'reload schema';
