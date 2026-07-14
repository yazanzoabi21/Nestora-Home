alter table public.orders alter column user_id drop not null;

create or replace function public.place_customer_order(
  p_shipping jsonb,
  p_delivery_method_id uuid,
  p_payment_method_id uuid,
  p_shipping_method_zone_id uuid default null,
  p_payment_reference text default null,
  p_expected_total numeric default null,
  p_items jsonb default '[]'::jsonb
)
returns table (
  order_id uuid,
  order_number text,
  payment_status text,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric := 0;
  v_delivery numeric := 0;
  v_payment_fee numeric := 0;
  v_total numeric := 0;
  v_payment public.payment_methods%rowtype;
  v_method public.shipping_methods%rowtype;
  v_method_zone public.shipping_method_zones%rowtype;
  v_zone_extra numeric := 0;
  v_free_over numeric := null;
  v_customer_name text;
  v_customer_email text;
  v_payment_transaction_code text;
  v_line record;
  v_unit_price numeric;
  v_new_stock integer;
begin
  create temp table if not exists checkout_order_items (
    product_id uuid primary key,
    quantity integer not null
  ) on commit drop;

  truncate table checkout_order_items;

  if v_user_id is not null then
    select id into v_cart_id
    from public.carts
    where user_id = v_user_id
    limit 1;
  end if;

  if v_cart_id is not null and exists (select 1 from public.cart_items where cart_id = v_cart_id) then
    insert into checkout_order_items (product_id, quantity)
    select product_id, sum(quantity)::integer
    from public.cart_items
    where cart_id = v_cart_id
    group by product_id;
  else
    insert into checkout_order_items (product_id, quantity)
    select
      (item ->> 'product_id')::uuid,
      sum(greatest(1, coalesce((item ->> 'quantity')::integer, 1)))::integer
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
    where item ? 'product_id'
    group by (item ->> 'product_id')::uuid;
  end if;

  if not exists (select 1 from checkout_order_items) then
    raise exception 'Your cart is empty.';
  end if;

  select * into v_payment
  from public.payment_methods
  where id = p_payment_method_id
    and is_active = true
  limit 1;

  if v_payment.id is null then
    raise exception 'Selected payment method is not available.';
  end if;

  if coalesce((v_payment.config ->> 'requires_online_payment')::boolean, false) then
    raise exception 'Selected payment method requires a payment provider integration.';
  end if;

  select * into v_method
  from public.shipping_methods
  where id = p_delivery_method_id
    and is_active = true
  limit 1;

  if v_method.id is null then
    raise exception 'Selected delivery method is not available.';
  end if;

  if p_shipping_method_zone_id is not null then
    select * into v_method_zone
    from public.shipping_method_zones
    where id = p_shipping_method_zone_id
      and shipping_method_id = p_delivery_method_id
      and is_active = true
    limit 1;

    if v_method_zone.id is null then
      raise exception 'Selected delivery zone is not available.';
    end if;

    select coalesce(extra_cost, 0) into v_zone_extra
    from public.delivery_zones
    where id = v_method_zone.delivery_zone_id
      and is_active = true;

    v_delivery := coalesce(v_method_zone.cost_override, v_method.base_cost, 0) + coalesce(v_zone_extra, 0);
    v_free_over := coalesce(v_method_zone.free_shipping_min_amount_override, v_method.free_shipping_min_amount);
  else
    v_delivery := coalesce(v_method.base_cost, 0);
    v_free_over := v_method.free_shipping_min_amount;
  end if;

  for v_line in
    select
      ci.product_id,
      ci.quantity,
      p.name,
      p.price,
      p.sale_price,
      coalesce(p.stock, 0) as stock,
      coalesce(p.sold_count, 0) as sold_count,
      coalesce(p.is_active, true) as is_active
    from checkout_order_items ci
    join public.products p on p.id = ci.product_id
    for update of p
  loop
    if v_line.quantity < 1 then
      raise exception 'Invalid quantity for %.', v_line.name;
    end if;

    if not v_line.is_active then
      raise exception '% is no longer available.', v_line.name;
    end if;

    if v_line.stock < v_line.quantity then
      raise exception 'Only % units of % are available.', v_line.stock, v_line.name;
    end if;

    v_unit_price := case
      when v_line.sale_price is not null and v_line.sale_price > 0 and v_line.sale_price < v_line.price
        then v_line.sale_price
      else v_line.price
    end;

    v_subtotal := v_subtotal + (v_unit_price * v_line.quantity);
  end loop;

  if v_free_over is not null and v_subtotal >= v_free_over then
    v_delivery := 0;
  end if;

  if v_payment.min_amount is not null and (v_subtotal + v_delivery) < v_payment.min_amount then
    raise exception 'Selected payment method minimum amount is not met.';
  end if;

  if v_payment.max_amount is not null and (v_subtotal + v_delivery) > v_payment.max_amount then
    raise exception 'Selected payment method maximum amount is exceeded.';
  end if;

  v_payment_fee := coalesce(v_payment.fee_fixed, 0) + ((v_subtotal + v_delivery) * coalesce(v_payment.fee_percentage, 0) / 100);
  v_total := round(v_subtotal + v_delivery + v_payment_fee, 2);

  if p_expected_total is not null and abs(v_total - round(p_expected_total, 2)) > 0.01 then
    raise exception 'Order total changed. Please review your checkout summary.';
  end if;

  v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6));
  v_customer_name := trim(coalesce(p_shipping ->> 'firstName', '') || ' ' || coalesce(p_shipping ->> 'lastName', ''));
  v_customer_email := nullif(p_shipping ->> 'email', '');

  insert into public.orders (
    user_id,
    order_number,
    status,
    payment_status,
    subtotal,
    shipping,
    total,
    address,
    city,
    country,
    phone,
    notes
  )
  values (
    v_user_id,
    v_order_number,
    'processing',
    'unpaid',
    round(v_subtotal, 2),
    round(v_delivery, 2),
    v_total,
    nullif(p_shipping ->> 'address', ''),
    nullif(p_shipping ->> 'city', ''),
    nullif(p_shipping ->> 'country', ''),
    nullif(p_shipping ->> 'phone', ''),
    concat_ws(
      E'\n',
      'State/Province: ' || nullif(p_shipping ->> 'state', ''),
      'Postal Code: ' || nullif(p_shipping ->> 'postalCode', ''),
      'Payment fee: ' || round(v_payment_fee, 2)::text,
      'Payment reference: ' || nullif(p_payment_reference, '')
    )
  )
  returning id into v_order_id;

  for v_line in
    select
      ci.product_id,
      ci.quantity,
      p.name,
      p.price,
      p.sale_price,
      coalesce(p.stock, 0) as stock,
      coalesce(p.sold_count, 0) as sold_count
    from checkout_order_items ci
    join public.products p on p.id = ci.product_id
    for update of p
  loop
    v_unit_price := case
      when v_line.sale_price is not null and v_line.sale_price > 0 and v_line.sale_price < v_line.price
        then v_line.sale_price
      else v_line.price
    end;
    v_new_stock := v_line.stock - v_line.quantity;

    insert into public.order_items (order_id, product_id, quantity, price, total)
    values (v_order_id, v_line.product_id, v_line.quantity, v_unit_price, round(v_unit_price * v_line.quantity, 2));

    update public.products
    set stock = v_new_stock,
        sold_count = v_line.sold_count + v_line.quantity
    where id = v_line.product_id;

    if to_regclass('public.inventory_changes') is not null then
      insert into public.inventory_changes (product_id, previous_stock, new_stock, change_type, note)
      values (v_line.product_id, v_line.stock, v_new_stock, 'adjustment', 'Customer order ' || v_order_number);
    end if;
  end loop;

  v_payment_transaction_code := 'PAY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6));

  insert into public.payment_transactions (
    order_id,
    payment_method_id,
    transaction_code,
    order_number,
    customer_name,
    customer_email,
    method_code,
    method_name,
    provider,
    amount,
    fee_amount,
    currency,
    status,
    reference,
    notes,
    config
  )
  values (
    v_order_id,
    v_payment.id,
    v_payment_transaction_code,
    v_order_number,
    nullif(v_customer_name, ''),
    v_customer_email,
    v_payment.code,
    v_payment.name,
    v_payment.provider,
    v_total,
    round(v_payment_fee, 2),
    'USD',
    'pending',
    nullif(p_payment_reference, ''),
    v_payment.instructions_en,
    jsonb_build_object('shipping_method_id', p_delivery_method_id, 'shipping_method_zone_id', p_shipping_method_zone_id)
  );

  if v_cart_id is not null then
    delete from public.cart_items where cart_id = v_cart_id;
  end if;

  order_id := v_order_id;
  order_number := v_order_number;
  payment_status := 'unpaid';
  total := v_total;
  return next;
end;
$$;

revoke all on function public.place_customer_order(jsonb, uuid, uuid, uuid, text, numeric, jsonb) from public;
grant execute on function public.place_customer_order(jsonb, uuid, uuid, uuid, text, numeric, jsonb) to anon;
grant execute on function public.place_customer_order(jsonb, uuid, uuid, uuid, text, numeric, jsonb) to authenticated;

notify pgrst, 'reload schema';
