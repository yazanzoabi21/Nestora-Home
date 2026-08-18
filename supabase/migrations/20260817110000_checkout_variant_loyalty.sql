alter table public.orders
  add column if not exists variant_loyalty_processed boolean not null default false;

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
  p_redeem_variant_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.loyalty_program_settings%rowtype;
  v_result jsonb;
  v_order_id uuid;
  v_subtotal numeric(10,2);
  v_shipping public.shipping_methods%rowtype;
  v_payment public.payment_methods%rowtype;
  v_shipping_cost numeric(10,2);
  v_payment_fee numeric(10,2);
  v_total numeric(10,2);
  v_total_points_cost integer := 0;
  v_points_earned integer := 0;
  v_customer_balance integer;
  v_has_redemptions boolean;
  v_already_processed boolean;
begin
  if coalesce(cardinality(p_redeem_product_ids), 0) <> coalesce(
    (select count(distinct requested_id) from unnest(p_redeem_product_ids) requested_id), 0
  ) or coalesce(cardinality(p_redeem_variant_ids), 0) <> coalesce(
    (select count(distinct requested_id) from unnest(p_redeem_variant_ids) requested_id), 0
  ) then
    raise exception 'Duplicate loyalty redemption selections are not allowed.';
  end if;

  v_has_redemptions := coalesce(cardinality(p_redeem_product_ids), 0) > 0
    or coalesce(cardinality(p_redeem_variant_ids), 0) > 0;

  if v_has_redemptions and p_discount_id is not null then
    raise exception 'Loyalty redemption cannot be combined with a promo code.';
  end if;

  -- The existing loyalty checkout remains the source of order creation, idempotency,
  -- variant-aware server pricing, stock reservation, and ordinary points earning.
  -- Redemptions are applied below by exact order-item variant identity.
  v_result := public.place_customer_order(
    p_cart_id, p_shipping_method_id, p_payment_method_id, p_shipping_address,
    p_items, p_customer_notes, p_discount_id, p_discount_code,
    p_expected_subtotal, p_checkout_token, array[]::uuid[]
  );
  v_order_id := (v_result ->> 'order_id')::uuid;

  select variant_loyalty_processed into v_already_processed
  from public.orders where id = v_order_id for update;
  if v_already_processed then
    return v_result || (
      select jsonb_build_object(
        'subtotal', subtotal,
        'shipping_cost', shipping,
        'payment_fee', payment_fee,
        'discount_amount', discount_amount,
        'total', total,
        'loyalty_points_redeemed', loyalty_points_redeemed,
        'loyalty_points_earned', loyalty_points_earned
      ) from public.orders where id = v_order_id
    );
  end if;

  select * into v_settings from public.loyalty_program_settings where id = true;
  if not found then raise exception 'Loyalty settings are unavailable.'; end if;

  if v_has_redemptions then
    if v_user_id is null then raise exception 'Sign in to redeem loyalty points.'; end if;
    if not v_settings.is_enabled then raise exception 'The loyalty program is currently disabled.'; end if;

    if exists (
      select 1
      from public.order_items item
      join public.products product on product.id = item.product_id
      where item.order_id = v_order_id
        and (
          (item.variant_id is null and item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[])))
          or item.variant_id = any(coalesce(p_redeem_variant_ids, array[]::uuid[]))
        )
        and product.is_loyalty_eligible is distinct from true
    ) then
      raise exception 'A selected product is not eligible for loyalty redemption.';
    end if;

    if (
      select count(*)
      from public.order_items item
      where item.order_id = v_order_id and (
        (item.variant_id is null and item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[])))
        or item.variant_id = any(coalesce(p_redeem_variant_ids, array[]::uuid[]))
      )
    ) <> coalesce(cardinality(p_redeem_product_ids), 0)
       + coalesce(cardinality(p_redeem_variant_ids), 0)
    then
      raise exception 'A loyalty redemption selection is not present in the order.';
    end if;

    select coalesce(sum(ceil((item.price * item.quantity) / v_settings.point_value_usd)), 0)::integer
    into v_total_points_cost
    from public.order_items item
    where item.order_id = v_order_id and (
      (item.variant_id is null and item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[])))
      or item.variant_id = any(coalesce(p_redeem_variant_ids, array[]::uuid[]))
    );

    if v_total_points_cost < v_settings.minimum_redemption_points then
      raise exception 'The redemption does not meet the minimum loyalty points requirement.';
    end if;

    insert into public.customer_loyalty_points_balances (user_id, balance)
    values (
      v_user_id,
      coalesce((select sum(points_delta)::integer from public.customer_loyalty_points_ledger
        where user_id = v_user_id), 0)
    ) on conflict (user_id) do nothing;
    select balance into v_customer_balance
    from public.customer_loyalty_points_balances where user_id = v_user_id for update;
    if v_customer_balance < v_total_points_cost then raise exception 'Insufficient loyalty points.'; end if;

    update public.order_items item
    set loyalty_effective_unit_price = item.price,
        loyalty_redeemed = true,
        loyalty_points_cost = ceil((item.price * item.quantity) / v_settings.point_value_usd),
        loyalty_points_earned = 0,
        total = 0
    where item.order_id = v_order_id and (
      (item.variant_id is null and item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[])))
      or item.variant_id = any(coalesce(p_redeem_variant_ids, array[]::uuid[]))
    );
  end if;

  select round(coalesce(sum(total), 0), 2) into v_subtotal
  from public.order_items where order_id = v_order_id;
  select * into v_shipping from public.shipping_methods
  where id = p_shipping_method_id and is_active = true;
  v_shipping_cost := coalesce(v_shipping.base_cost, 0);
  if v_shipping.free_shipping_min_amount is not null and v_subtotal >= v_shipping.free_shipping_min_amount then
    v_shipping_cost := 0;
  end if;
  v_shipping_cost := round(v_shipping_cost, 2);
  select * into v_payment from public.payment_methods
  where id = p_payment_method_id and is_active = true;
  v_payment_fee := round(coalesce(v_payment.fee_fixed, 0)
    + ((v_subtotal + v_shipping_cost) * coalesce(v_payment.fee_percentage, 0) / 100), 2);
  v_total := greatest(0, round(v_subtotal + v_shipping_cost + v_payment_fee
    - case when v_has_redemptions then 0 else coalesce((v_result ->> 'discount_amount')::numeric, 0) end, 2));

  if v_user_id is not null and v_settings.is_enabled then
    v_points_earned := floor(v_subtotal * v_settings.points_earned_per_usd);
  end if;
  update public.order_items item
  set loyalty_points_earned = case when item.loyalty_redeemed then 0
    else floor(item.total * v_settings.points_earned_per_usd) end
  where item.order_id = v_order_id;

  update public.orders set
    subtotal = v_subtotal,
    shipping = v_shipping_cost,
    payment_fee = v_payment_fee,
    discount_amount = case when v_has_redemptions then 0 else discount_amount end,
    total = v_total,
    loyalty_points_redeemed = v_total_points_cost,
    loyalty_points_earned = v_points_earned,
    loyalty_point_value_usd = v_settings.point_value_usd,
    loyalty_points_earned_per_usd = v_settings.points_earned_per_usd,
    variant_loyalty_processed = true
  where id = v_order_id;
  update public.payment_transactions set amount = v_total, fee_amount = v_payment_fee
  where order_id = v_order_id;

  if v_total_points_cost > 0 then
    perform public.append_customer_loyalty_ledger_entry(
      v_user_id, v_order_id, null, 'redeem', -v_total_points_cost,
      'Points redeemed for order ' || coalesce(v_result ->> 'order_number', v_order_id::text)
    );
  end if;

  return v_result || jsonb_build_object(
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost,
    'payment_fee', v_payment_fee,
    'discount_amount', case when v_has_redemptions then 0 else coalesce((v_result ->> 'discount_amount')::numeric, 0) end,
    'total', v_total,
    'loyalty_points_redeemed', v_total_points_cost,
    'loyalty_points_earned', v_points_earned
  );
end;
$$;

revoke all on function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[]
) from public;
grant execute on function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[]
) to anon, authenticated;

notify pgrst, 'reload schema';
