alter table public.orders alter column user_id drop not null;

alter table public.orders
  add column if not exists cart_id uuid null references public.carts(id) on delete set null,
  add column if not exists shipping_method_id uuid null references public.shipping_methods(id) on delete set null,
  add column if not exists payment_method_id uuid null references public.payment_methods(id) on delete set null,
  add column if not exists payment_fee numeric(10,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0;

drop function if exists public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text);

create function public.place_customer_order(
  p_cart_id uuid,
  p_shipping_method_id uuid,
  p_payment_method_id uuid,
  p_shipping_address jsonb,
  p_items jsonb,
  p_customer_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_order_user_id uuid;
  v_cart_user_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_status text := 'processing';
  v_payment_status text := 'unpaid';
  v_subtotal numeric(10,2) := 0;
  v_shipping_cost numeric(10,2) := 0;
  v_payment_fee numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_shipping public.shipping_methods%rowtype;
  v_payment public.payment_methods%rowtype;
  v_line record;
  v_item jsonb;
  v_product_id_text text;
  v_quantity_text text;
  v_unit_price numeric(10,2);
  v_new_stock integer;
  v_submitted_count integer;
  v_cart_item_count integer;
  v_product_count integer;
  v_customer_name text;
  v_customer_email text;
  v_payment_transaction_code text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order items must be a non-empty JSON array.';
  end if;

  if jsonb_typeof(p_shipping_address) is distinct from 'object' then
    raise exception 'Shipping information is required.';
  end if;

  if nullif(btrim(p_shipping_address ->> 'first_name'), '') is null
    or nullif(btrim(p_shipping_address ->> 'last_name'), '') is null
    or nullif(btrim(p_shipping_address ->> 'email'), '') is null
    or nullif(btrim(p_shipping_address ->> 'street_address'), '') is null
    or nullif(btrim(p_shipping_address ->> 'city'), '') is null
    or nullif(btrim(p_shipping_address ->> 'state_province'), '') is null
    or nullif(btrim(p_shipping_address ->> 'postal_code'), '') is null
    or nullif(btrim(p_shipping_address ->> 'country'), '') is null
  then
    raise exception 'Complete shipping information is required.';
  end if;

  create temporary table checkout_submitted_items (
    product_id uuid primary key,
    quantity integer not null check (quantity > 0)
  ) on commit drop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Every order item must be a JSON object.';
    end if;

    v_product_id_text := v_item ->> 'product_id';
    v_quantity_text := v_item ->> 'quantity';

    if v_product_id_text is null
      or v_product_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'Every order item must contain a valid product ID.';
    end if;

    if v_quantity_text is null or v_quantity_text !~ '^[1-9][0-9]*$' then
      raise exception 'Every order quantity must be a positive integer.';
    end if;

    begin
      insert into checkout_submitted_items (product_id, quantity)
      values (v_product_id_text::uuid, v_quantity_text::integer);
    exception
      when unique_violation then
        raise exception 'Duplicate product IDs are not allowed.';
      when numeric_value_out_of_range then
        raise exception 'Order quantity is too large.';
    end;
  end loop;

  select count(*) into v_submitted_count from checkout_submitted_items;

  if p_cart_id is not null then
    select user_id
    into v_cart_user_id
    from public.carts
    where id = p_cart_id
    for update;

    if not found then
      raise exception 'The requested cart does not exist.';
    end if;

    if v_cart_user_id is not null
      and (v_auth_user_id is null or v_cart_user_id <> v_auth_user_id)
    then
      raise exception 'You do not have access to this cart.';
    end if;

    select count(*)
    into v_cart_item_count
    from public.cart_items
    where cart_id = p_cart_id;

    if v_cart_item_count <> v_submitted_count or exists (
      select 1
      from checkout_submitted_items submitted
      full join (
        select product_id, quantity
        from public.cart_items
        where cart_id = p_cart_id
      ) cart_item on cart_item.product_id = submitted.product_id
      where submitted.product_id is null
         or cart_item.product_id is null
         or submitted.quantity <> cart_item.quantity
    ) then
      raise exception 'Submitted items do not match the current cart.';
    end if;
  end if;

  select id
  into v_order_user_id
  from public.profiles
  where id = v_auth_user_id
  limit 1;

  select *
  into v_shipping
  from public.shipping_methods
  where id = p_shipping_method_id
    and is_active = true
  limit 1;

  if v_shipping.id is null then
    raise exception 'Selected shipping method is not available.';
  end if;

  select *
  into v_payment
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

  select count(*)
  into v_product_count
  from public.products product
  join checkout_submitted_items submitted on submitted.product_id = product.id;

  if v_product_count <> v_submitted_count then
    raise exception 'One or more products no longer exist.';
  end if;

  for v_line in
    select
      product.id,
      product.name,
      product.price,
      product.sale_price,
      coalesce(product.stock, 0) as stock,
      coalesce(product.sold_count, 0) as sold_count,
      product.is_active is true as is_active,
      submitted.quantity
    from checkout_submitted_items submitted
    join public.products product on product.id = submitted.product_id
    order by product.id
    for update of product
  loop
    if not v_line.is_active then
      raise exception '% is no longer available.', v_line.name;
    end if;

    if v_line.price is null or v_line.price <= 0 then
      raise exception '% has an invalid price.', v_line.name;
    end if;

    if v_line.sale_price is not null and v_line.sale_price < 0 then
      raise exception '% has an invalid sale price.', v_line.name;
    end if;

    if v_line.stock < v_line.quantity then
      raise exception 'Only % units of % are available.', v_line.stock, v_line.name;
    end if;

    v_unit_price := case
      when v_line.sale_price is not null
        and v_line.sale_price > 0
        and v_line.sale_price < v_line.price
      then v_line.sale_price
      else v_line.price
    end;

    v_subtotal := v_subtotal + round(v_unit_price * v_line.quantity, 2);
  end loop;

  v_shipping_cost := coalesce(v_shipping.base_cost, 0);
  if v_shipping.free_shipping_min_amount is not null
    and v_subtotal >= v_shipping.free_shipping_min_amount
  then
    v_shipping_cost := 0;
  end if;

  if v_shipping_cost < 0 then
    raise exception 'Selected shipping method has an invalid cost.';
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

  v_subtotal := round(v_subtotal, 2);
  v_shipping_cost := round(v_shipping_cost, 2);
  v_total := round(v_subtotal + v_shipping_cost + v_payment_fee - v_discount_amount, 2);
  v_order_number := 'ORD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-'
    || upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6));

  insert into public.orders (
    user_id,
    cart_id,
    shipping_method_id,
    payment_method_id,
    order_number,
    status,
    payment_status,
    subtotal,
    shipping,
    payment_fee,
    discount_amount,
    total,
    address,
    city,
    country,
    phone,
    notes
  )
  values (
    v_order_user_id,
    p_cart_id,
    v_shipping.id,
    v_payment.id,
    v_order_number,
    v_status,
    v_payment_status,
    v_subtotal,
    v_shipping_cost,
    v_payment_fee,
    v_discount_amount,
    v_total,
    btrim(p_shipping_address ->> 'street_address'),
    btrim(p_shipping_address ->> 'city'),
    btrim(p_shipping_address ->> 'country'),
    nullif(btrim(p_shipping_address ->> 'phone'), ''),
    nullif(btrim(p_customer_notes), '')
  )
  returning id into v_order_id;

  insert into public.order_shipping_addresses (
    order_id,
    first_name,
    last_name,
    email,
    phone,
    street_address,
    address_line_2,
    city,
    state_province,
    postal_code,
    country,
    delivery_instructions
  )
  values (
    v_order_id,
    btrim(p_shipping_address ->> 'first_name'),
    btrim(p_shipping_address ->> 'last_name'),
    btrim(p_shipping_address ->> 'email'),
    nullif(btrim(p_shipping_address ->> 'phone'), ''),
    btrim(p_shipping_address ->> 'street_address'),
    nullif(btrim(p_shipping_address ->> 'address_line_2'), ''),
    btrim(p_shipping_address ->> 'city'),
    btrim(p_shipping_address ->> 'state_province'),
    btrim(p_shipping_address ->> 'postal_code'),
    btrim(p_shipping_address ->> 'country'),
    nullif(btrim(p_shipping_address ->> 'delivery_instructions'), '')
  );

  for v_line in
    select
      product.id,
      product.name,
      product.price,
      product.sale_price,
      coalesce(product.stock, 0) as stock,
      coalesce(product.sold_count, 0) as sold_count,
      submitted.quantity
    from checkout_submitted_items submitted
    join public.products product on product.id = submitted.product_id
    order by product.id
    for update of product
  loop
    v_unit_price := case
      when v_line.sale_price is not null
        and v_line.sale_price > 0
        and v_line.sale_price < v_line.price
      then v_line.sale_price
      else v_line.price
    end;
    v_new_stock := v_line.stock - v_line.quantity;

    insert into public.order_items (order_id, product_id, quantity, price, total)
    values (
      v_order_id,
      v_line.id,
      v_line.quantity,
      v_unit_price,
      round(v_unit_price * v_line.quantity, 2)
    );

    update public.products
    set stock = v_new_stock,
        sold_count = v_line.sold_count + v_line.quantity
    where id = v_line.id;

    insert into public.inventory_logs (
      product_id,
      previous_stock,
      new_stock,
      change_type,
      note
    )
    values (
      v_line.id,
      v_line.stock,
      v_new_stock,
      'adjustment',
      'Customer order ' || v_order_number
    );
  end loop;

  v_customer_name := btrim(
    (p_shipping_address ->> 'first_name') || ' ' || (p_shipping_address ->> 'last_name')
  );
  v_customer_email := btrim(p_shipping_address ->> 'email');
  v_payment_transaction_code := 'PAY-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-'
    || upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6));

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
    notes,
    config
  )
  values (
    v_order_id,
    v_payment.id,
    v_payment_transaction_code,
    v_order_number,
    v_customer_name,
    v_customer_email,
    v_payment.code,
    v_payment.name,
    v_payment.provider,
    v_total,
    v_payment_fee,
    'USD',
    'pending',
    v_payment.instructions_en,
    jsonb_build_object('shipping_method_id', v_shipping.id)
  );

  if p_cart_id is not null then
    delete from public.cart_items where cart_id = p_cart_id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', v_status,
    'payment_status', v_payment_status,
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost,
    'payment_fee', v_payment_fee,
    'discount_amount', v_discount_amount,
    'total', v_total
  );
end;
$$;

revoke all on function public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text) from public;
grant execute on function public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text) to anon;
grant execute on function public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
