-- Shipping is now free only for a configured zero-cost method or an applied
-- free_shipping discount. Legacy order-subtotal thresholds are retired.
update public.shipping_methods
set free_shipping_min_amount = null
where free_shipping_min_amount is not null;

update public.shipping_method_zones
set free_shipping_min_amount_override = null
where free_shipping_min_amount_override is not null;

alter table public.shipping_methods
  drop constraint if exists shipping_methods_no_automatic_free_shipping;
alter table public.shipping_methods
  add constraint shipping_methods_no_automatic_free_shipping
  check (free_shipping_min_amount is null);

alter table public.shipping_method_zones
  drop constraint if exists shipping_method_zones_no_automatic_free_shipping;
alter table public.shipping_method_zones
  add constraint shipping_method_zones_no_automatic_free_shipping
  check (free_shipping_min_amount_override is null);

alter table public.orders
  add column if not exists free_shipping_discount_processed boolean not null default false;

alter function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[], uuid[]
) rename to place_customer_order_legacy_shipping_threshold;

revoke all on function public.place_customer_order_legacy_shipping_threshold(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[], uuid[]
) from public, anon, authenticated;

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
  v_order public.orders%rowtype;
  v_shipping public.shipping_methods%rowtype;
  v_payment public.payment_methods%rowtype;
  v_eligible_subtotal numeric(10,2) := 0;
  v_shipping_cost numeric(10,2);
  v_payment_fee numeric(10,2);
  v_total numeric(10,2);
  v_customer_usage integer := 0;
begin
  if (p_discount_id is null) <> (nullif(btrim(p_discount_code), '') is null) then
    raise exception 'The applied promo information is incomplete. Remove it or apply it again.';
  end if;

  if p_discount_id is not null then
    select * into v_discount
    from public.discounts
    where id = p_discount_id
    for update;
    if not found then raise exception 'The applied promo code no longer exists.'; end if;
  end if;

  if p_discount_id is not null and v_discount.discount_type = 'free_shipping' then
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
    if coalesce(cardinality(p_free_gift_product_ids), 0) > 0 then
      raise exception 'A free-shipping promotion cannot include free-gift products.';
    end if;
    if coalesce(cardinality(p_redeem_product_ids), 0) > 0
      or coalesce(cardinality(p_redeem_variant_ids), 0) > 0
    then
      raise exception 'Loyalty redemption cannot be combined with a promo code.';
    end if;

    -- The existing checkout remains responsible for cart matching, pricing,
    -- stock, idempotency, order creation, and ordinary loyalty earning.
    v_result := public.place_customer_order_legacy_shipping_threshold(
      p_cart_id, p_shipping_method_id, p_payment_method_id, p_shipping_address,
      p_items, p_customer_notes, null, null, p_expected_subtotal,
      p_checkout_token, p_redeem_product_ids, p_redeem_variant_ids,
      array[]::uuid[]
    );
  else
    v_result := public.place_customer_order_legacy_shipping_threshold(
      p_cart_id, p_shipping_method_id, p_payment_method_id, p_shipping_address,
      p_items, p_customer_notes, p_discount_id, p_discount_code,
      p_expected_subtotal, p_checkout_token, p_redeem_product_ids,
      p_redeem_variant_ids, p_free_gift_product_ids
    );
  end if;

  select * into v_order
  from public.orders
  where id = (v_result ->> 'order_id')::uuid
  for update;
  if not found then raise exception 'The placed order could not be loaded.'; end if;

  select * into v_shipping
  from public.shipping_methods
  where id = p_shipping_method_id and is_active = true;
  if not found then raise exception 'Selected shipping method is not available.'; end if;

  select * into v_payment
  from public.payment_methods
  where id = p_payment_method_id and is_active = true;
  if not found then raise exception 'Selected payment method is not available.'; end if;

  if p_discount_id is not null and v_discount.discount_type = 'free_shipping' then
    if v_order.subtotal < coalesce(v_discount.minimum_order_amount, 0) then
      raise exception 'The order no longer meets the promo code minimum amount.';
    end if;

    if v_discount.applies_to = 'all' then
      v_eligible_subtotal := v_order.subtotal;
    elsif v_discount.applies_to = 'product' then
      select coalesce(sum(item.total), 0) into v_eligible_subtotal
      from public.order_items item
      where item.order_id = v_order.id
        and item.is_free_gift = false
        and item.product_id = v_discount.product_id;
    elsif v_discount.applies_to = 'category' then
      select coalesce(sum(item.total), 0) into v_eligible_subtotal
      from public.order_items item
      join public.products product on product.id = item.product_id
      where item.order_id = v_order.id
        and item.is_free_gift = false
        and product.category_id = v_discount.category_id;
    else
      raise exception 'The applied promo code has an unsupported eligibility rule.';
    end if;
    if v_eligible_subtotal <= 0 then
      raise exception 'The applied promo code is not valid for the products in this order.';
    end if;

    if v_user_id is not null and v_discount.usage_per_customer is not null then
      select count(*) into v_customer_usage
      from public.orders
      where user_id = v_user_id and discount_id = v_discount.id;
      if v_customer_usage >= v_discount.usage_per_customer then
        raise exception 'You have already used this promo code the maximum number of times.';
      end if;
    end if;

    if not v_order.free_shipping_discount_processed then
      update public.discounts
      set usage_count = coalesce(usage_count, 0) + 1, updated_at = now()
      where id = v_discount.id;
      update public.orders
      set discount_id = v_discount.id,
          discount_code = v_discount.code,
          discount_amount = 0,
          free_shipping_discount_processed = true
      where id = v_order.id;
      v_order.discount_id := v_discount.id;
      v_order.discount_code := v_discount.code;
      v_order.discount_amount := 0;
    end if;
    v_shipping_cost := 0;
  else
    -- A configured zero base cost (for example pickup) remains free. No name or
    -- code convention is needed to identify that method.
    v_shipping_cost := round(coalesce(v_shipping.base_cost, 0), 2);
  end if;

  if v_payment.min_amount is not null
    and v_order.subtotal + v_shipping_cost < v_payment.min_amount
  then
    raise exception 'Selected payment method minimum amount is not met.';
  end if;
  if v_payment.max_amount is not null
    and v_order.subtotal + v_shipping_cost > v_payment.max_amount
  then
    raise exception 'Selected payment method maximum amount is exceeded.';
  end if;

  v_payment_fee := round(
    coalesce(v_payment.fee_fixed, 0)
      + ((v_order.subtotal + v_shipping_cost) * coalesce(v_payment.fee_percentage, 0) / 100),
    2
  );
  v_total := greatest(0, round(
    v_order.subtotal + v_shipping_cost + v_payment_fee - coalesce(v_order.discount_amount, 0),
    2
  ));

  update public.orders
  set shipping = v_shipping_cost,
      payment_fee = v_payment_fee,
      total = v_total
  where id = v_order.id;

  update public.payment_transactions
  set amount = v_total, fee_amount = v_payment_fee
  where order_id = v_order.id;

  return v_result || jsonb_build_object(
    'discount_id', v_order.discount_id,
    'discount_code', v_order.discount_code,
    'discount_amount', coalesce(v_order.discount_amount, 0),
    'shipping_cost', v_shipping_cost,
    'payment_fee', v_payment_fee,
    'total', v_total
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
