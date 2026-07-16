alter function public.place_customer_order(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text
) rename to place_customer_order_legacy_discount;

revoke all on function public.place_customer_order_legacy_discount(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text
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
  p_expected_subtotal numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_order_id uuid;
  v_shipping public.shipping_methods%rowtype;
  v_payment public.payment_methods%rowtype;
  v_discount public.discounts%rowtype;
  v_subtotal numeric(10,2) := 0;
  v_shipping_cost numeric(10,2) := 0;
  v_payment_fee numeric(10,2) := 0;
  v_eligible_subtotal numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
begin
  v_result := public.place_customer_order_legacy_discount(
    p_cart_id,
    p_shipping_method_id,
    p_payment_method_id,
    p_shipping_address,
    p_items,
    p_customer_notes,
    p_discount_id,
    p_discount_code
  );

  v_order_id := (v_result ->> 'order_id')::uuid;

  update public.order_items item
  set price = case
        when product.sale_price is not null
          and product.sale_price > 0
          and product.sale_price < product.price
        then product.sale_price
        else product.price
      end,
      total = round(
        (case
          when product.sale_price is not null
            and product.sale_price > 0
            and product.sale_price < product.price
          then product.sale_price
          else product.price
        end) * item.quantity,
        2
      )
  from public.products product
  where item.order_id = v_order_id
    and product.id = item.product_id;

  select coalesce(sum(item.total), 0)
  into v_subtotal
  from public.order_items item
  where item.order_id = v_order_id;

  v_subtotal := round(v_subtotal, 2);
  if v_subtotal <= 0 then
    raise exception 'The order has no valid priced items.';
  end if;

  if p_expected_subtotal is null or p_expected_subtotal < 0 then
    raise exception 'The expected order subtotal is invalid.';
  end if;

  if abs(v_subtotal - round(p_expected_subtotal, 2)) > 0.01 then
    raise exception 'Order pricing changed. Please review your cart before placing the order.';
  end if;

  select *
  into v_shipping
  from public.shipping_methods
  where id = p_shipping_method_id
    and is_active = true;

  if not found then
    raise exception 'Selected shipping method is not available.';
  end if;

  v_shipping_cost := coalesce(v_shipping.base_cost, 0);
  if v_shipping.free_shipping_min_amount is not null
    and v_subtotal >= v_shipping.free_shipping_min_amount
  then
    v_shipping_cost := 0;
  end if;
  v_shipping_cost := round(v_shipping_cost, 2);

  if v_shipping_cost < 0 then
    raise exception 'Selected shipping method has an invalid cost.';
  end if;

  select *
  into v_payment
  from public.payment_methods
  where id = p_payment_method_id
    and is_active = true;

  if not found then
    raise exception 'Selected payment method is not available.';
  end if;

  if v_payment.min_amount is not null
    and (v_subtotal + v_shipping_cost) < v_payment.min_amount
  then
    raise exception 'Selected payment method minimum amount is not met.';
  end if;

  if v_payment.max_amount is not null
    and (v_subtotal + v_shipping_cost) > v_payment.max_amount
  then
    raise exception 'Selected payment method maximum amount is exceeded.';
  end if;

  v_payment_fee := round(
    coalesce(v_payment.fee_fixed, 0)
      + ((v_subtotal + v_shipping_cost) * coalesce(v_payment.fee_percentage, 0) / 100),
    2
  );

  if v_payment_fee < 0 then
    raise exception 'Selected payment method has an invalid fee.';
  end if;

  if p_discount_id is not null then
    select *
    into v_discount
    from public.discounts
    where id = p_discount_id;

    if not found then
      raise exception 'The applied promo code no longer exists.';
    end if;

    if v_subtotal < coalesce(v_discount.minimum_order_amount, 0) then
      raise exception 'The order no longer meets the promo code minimum amount.';
    end if;

    if v_discount.applies_to = 'all' then
      select coalesce(sum(item.total), 0)
      into v_eligible_subtotal
      from public.order_items item
      where item.order_id = v_order_id;
    elsif v_discount.applies_to = 'product' then
      select coalesce(sum(item.total), 0)
      into v_eligible_subtotal
      from public.order_items item
      where item.order_id = v_order_id
        and item.product_id = v_discount.product_id;
    elsif v_discount.applies_to = 'category' then
      select coalesce(sum(item.total), 0)
      into v_eligible_subtotal
      from public.order_items item
      join public.products product on product.id = item.product_id
      where item.order_id = v_order_id
        and product.category_id = v_discount.category_id;
    else
      raise exception 'The applied promo code has an unsupported eligibility rule.';
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
    elsif v_discount.discount_type = 'fixed_amount' then
      v_discount_amount := round(v_discount.discount_value, 2);
    else
      raise exception 'The applied promo code cannot be used as an order discount.';
    end if;

    v_discount_amount := least(
      v_eligible_subtotal,
      greatest(0, v_discount_amount)
    );
  end if;

  v_total := greatest(
    0,
    round(v_subtotal + v_shipping_cost + v_payment_fee - v_discount_amount, 2)
  );

  update public.orders
  set subtotal = v_subtotal,
      shipping = v_shipping_cost,
      payment_fee = v_payment_fee,
      discount_amount = v_discount_amount,
      total = v_total
  where id = v_order_id;

  update public.payment_transactions
  set amount = v_total,
      fee_amount = v_payment_fee
  where order_id = v_order_id;

  return v_result || jsonb_build_object(
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost,
    'payment_fee', v_payment_fee,
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
  text,
  numeric
) from public;

grant execute on function public.place_customer_order(
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  text,
  numeric
) to anon, authenticated;

notify pgrst, 'reload schema';
