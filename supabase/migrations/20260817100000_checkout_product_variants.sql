alter table public.inventory_logs
  add column if not exists variant_id uuid null references public.product_variants(id) on delete set null;

alter function public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text)
  rename to place_customer_order_legacy_products_only;
revoke all on function public.place_customer_order_legacy_products_only(
  uuid, uuid, uuid, jsonb, jsonb, text
) from public, anon, authenticated;

create function public.place_customer_order(
  p_cart_id uuid,
  p_shipping_method_id uuid,
  p_payment_method_id uuid,
  p_shipping_address jsonb,
  p_items jsonb,
  p_customer_notes text default null
) returns jsonb
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
  v_total numeric(10,2) := 0;
  v_shipping public.shipping_methods%rowtype;
  v_payment public.payment_methods%rowtype;
  v_line record;
  v_unit_price numeric(10,2);
  v_regular_price numeric(10,2);
  v_sale_price numeric(10,2);
  v_previous_stock integer;
  v_new_stock integer;
  v_submitted_count integer;
  v_cart_item_count integer;
  v_customer_name text;
  v_customer_email text;
  v_payment_transaction_code text;
begin
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
    where nullif(item ->> 'variant_id', '') is not null
  ) then
    return public.place_customer_order_legacy_products_only(
      p_cart_id, p_shipping_method_id, p_payment_method_id,
      p_shipping_address, p_items, p_customer_notes
    );
  end if;

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

  create temporary table checkout_variant_items (
    product_id uuid not null,
    variant_id uuid null,
    quantity integer not null check (quantity > 0)
  ) on commit drop;
  create unique index on checkout_variant_items (
    product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

  begin
    insert into checkout_variant_items(product_id, variant_id, quantity)
    select
      (item ->> 'product_id')::uuid,
      nullif(item ->> 'variant_id', '')::uuid,
      (item ->> 'quantity')::integer
    from jsonb_array_elements(p_items) item;
  exception
    when invalid_text_representation then
      raise exception 'Every order item must contain valid product and variant IDs.';
    when unique_violation then
      raise exception 'Duplicate product variants are not allowed.';
    when check_violation then
      raise exception 'Every order quantity must be a positive integer.';
  end;

  select count(*) into v_submitted_count from checkout_variant_items;

  if p_cart_id is not null then
    select user_id into v_cart_user_id from public.carts where id = p_cart_id for update;
    if not found then raise exception 'The requested cart does not exist.'; end if;
    if v_cart_user_id is not null and (v_auth_user_id is null or v_cart_user_id <> v_auth_user_id) then
      raise exception 'You do not have access to this cart.';
    end if;

    select count(*) into v_cart_item_count from public.cart_items where cart_id = p_cart_id;
    if v_cart_item_count <> v_submitted_count or exists (
      select 1
      from checkout_variant_items submitted
      full join public.cart_items cart_item
        on cart_item.cart_id = p_cart_id
       and cart_item.product_id = submitted.product_id
       and cart_item.variant_id is not distinct from submitted.variant_id
      where submitted.product_id is null or cart_item.product_id is null
         or submitted.quantity <> cart_item.quantity
    ) then
      raise exception 'Submitted items do not match the current cart.';
    end if;
  end if;

  if exists (
    select 1 from checkout_variant_items submitted
    left join public.products product on product.id = submitted.product_id
    left join public.product_variants variant
      on variant.id = submitted.variant_id and variant.product_id = submitted.product_id
    where product.id is null
      or product.is_active is distinct from true
      or (submitted.variant_id is not null and (
        variant.id is null or variant.is_active is distinct from true
      ))
  ) then
    raise exception 'One of your product selections is no longer available.';
  end if;

  perform product.id
  from public.products product
  join checkout_variant_items submitted on submitted.product_id = product.id
  order by product.id for update of product;
  perform variant.id
  from public.product_variants variant
  join checkout_variant_items submitted on submitted.variant_id = variant.id
  order by variant.id for update of variant;

  if exists (
    select 1
    from checkout_variant_items submitted
    join public.product_variants variant on variant.id = submitted.variant_id
    where variant.stock is not null and variant.stock < submitted.quantity
  ) then
    raise exception 'Insufficient stock for one of the selected variants.';
  end if;
  if exists (
    select 1
    from (
      select submitted.product_id, sum(submitted.quantity)::integer quantity
      from checkout_variant_items submitted
      left join public.product_variants variant on variant.id = submitted.variant_id
      where submitted.variant_id is null or variant.stock is null
      group by submitted.product_id
    ) fallback
    join public.products product on product.id = fallback.product_id
    where coalesce(product.stock, 0) < fallback.quantity
  ) then
    raise exception 'Insufficient stock for one of the selected products.';
  end if;

  for v_line in
    select submitted.*, product.name,
      coalesce(variant.price, product.price) regular_price,
      coalesce(variant.sale_price, product.sale_price) sale_price
    from checkout_variant_items submitted
    join public.products product on product.id = submitted.product_id
    left join public.product_variants variant on variant.id = submitted.variant_id
  loop
    v_regular_price := v_line.regular_price;
    v_sale_price := v_line.sale_price;
    if v_regular_price is null or v_regular_price <= 0 then
      raise exception '% has an invalid price.', v_line.name;
    end if;
    v_unit_price := case
      when v_sale_price is not null and v_sale_price > 0 and v_sale_price < v_regular_price
      then v_sale_price else v_regular_price end;
    v_subtotal := v_subtotal + round(v_unit_price * v_line.quantity, 2);
  end loop;
  v_subtotal := round(v_subtotal, 2);

  select * into v_shipping from public.shipping_methods
  where id = p_shipping_method_id and is_active = true;
  if not found then raise exception 'Selected shipping method is not available.'; end if;
  select * into v_payment from public.payment_methods
  where id = p_payment_method_id and is_active = true;
  if not found then raise exception 'Selected payment method is not available.'; end if;
  if coalesce((v_payment.config ->> 'requires_online_payment')::boolean, false) then
    raise exception 'Selected payment method requires a payment provider integration.';
  end if;

  v_shipping_cost := coalesce(v_shipping.base_cost, 0);
  if v_shipping.free_shipping_min_amount is not null and v_subtotal >= v_shipping.free_shipping_min_amount then
    v_shipping_cost := 0;
  end if;
  v_shipping_cost := round(v_shipping_cost, 2);
  if v_payment.min_amount is not null and v_subtotal + v_shipping_cost < v_payment.min_amount then
    raise exception 'Selected payment method minimum amount is not met.';
  end if;
  if v_payment.max_amount is not null and v_subtotal + v_shipping_cost > v_payment.max_amount then
    raise exception 'Selected payment method maximum amount is exceeded.';
  end if;
  v_payment_fee := round(coalesce(v_payment.fee_fixed, 0)
    + ((v_subtotal + v_shipping_cost) * coalesce(v_payment.fee_percentage, 0) / 100), 2);
  v_total := round(v_subtotal + v_shipping_cost + v_payment_fee, 2);

  select id into v_order_user_id from public.profiles where id = v_auth_user_id limit 1;
  v_order_number := 'ORD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-'
    || upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6));

  insert into public.orders (
    user_id, cart_id, shipping_method_id, payment_method_id, order_number,
    status, payment_status, subtotal, shipping, payment_fee, discount_amount,
    total, address, city, country, phone, notes
  ) values (
    v_order_user_id, p_cart_id, v_shipping.id, v_payment.id, v_order_number,
    v_status, v_payment_status, v_subtotal, v_shipping_cost, v_payment_fee, 0,
    v_total, btrim(p_shipping_address ->> 'street_address'),
    btrim(p_shipping_address ->> 'city'), btrim(p_shipping_address ->> 'country'),
    nullif(btrim(p_shipping_address ->> 'phone'), ''), nullif(btrim(p_customer_notes), '')
  ) returning id into v_order_id;

  insert into public.order_shipping_addresses (
    order_id, first_name, last_name, email, phone, street_address, address_line_2,
    city, state_province, postal_code, country, delivery_instructions
  ) values (
    v_order_id, btrim(p_shipping_address ->> 'first_name'),
    btrim(p_shipping_address ->> 'last_name'), btrim(p_shipping_address ->> 'email'),
    nullif(btrim(p_shipping_address ->> 'phone'), ''),
    btrim(p_shipping_address ->> 'street_address'),
    nullif(btrim(p_shipping_address ->> 'address_line_2'), ''),
    btrim(p_shipping_address ->> 'city'), btrim(p_shipping_address ->> 'state_province'),
    btrim(p_shipping_address ->> 'postal_code'), btrim(p_shipping_address ->> 'country'),
    nullif(btrim(p_shipping_address ->> 'delivery_instructions'), '')
  );

  for v_line in
    select submitted.*, product.name, coalesce(product.stock, 0) product_stock,
      coalesce(product.sold_count, 0) sold_count,
      coalesce(variant.price, product.price) regular_price,
      coalesce(variant.sale_price, product.sale_price) sale_price,
      variant.stock variant_stock, variant.option_name, variant.option_value,
      variant.name variant_name, variant.sku variant_sku,
      coalesce(variant.attributes, '{}'::jsonb) variant_attributes,
      variant.image_url variant_image_url
    from checkout_variant_items submitted
    join public.products product on product.id = submitted.product_id
    left join public.product_variants variant on variant.id = submitted.variant_id
    order by submitted.product_id, submitted.variant_id nulls first
  loop
    v_unit_price := case when v_line.sale_price is not null and v_line.sale_price > 0
      and v_line.sale_price < v_line.regular_price then v_line.sale_price else v_line.regular_price end;

    insert into public.order_items (
      order_id, product_id, variant_id, variant_name, variant_sku,
      variant_attributes, variant_image_url, quantity, price, total
    ) values (
      v_order_id, v_line.product_id, v_line.variant_id,
      case when v_line.variant_id is null then null
        else coalesce(v_line.variant_name, v_line.option_name || ': ' || v_line.option_value) end,
      v_line.variant_sku, v_line.variant_attributes, v_line.variant_image_url,
      v_line.quantity, v_unit_price, round(v_unit_price * v_line.quantity, 2)
    );

    if v_line.variant_id is not null and v_line.variant_stock is not null then
      v_previous_stock := v_line.variant_stock;
      v_new_stock := v_previous_stock - v_line.quantity;
      update public.product_variants set stock = v_new_stock, updated_at = now()
      where id = v_line.variant_id;
    else
      select coalesce(stock, 0) into v_previous_stock
      from public.products where id = v_line.product_id for update;
      v_new_stock := v_previous_stock - v_line.quantity;
      update public.products set stock = v_new_stock where id = v_line.product_id;
    end if;
    update public.products set sold_count = coalesce(sold_count, 0) + v_line.quantity
    where id = v_line.product_id;
    insert into public.inventory_logs(product_id, variant_id, previous_stock, new_stock, change_type, note)
    values (v_line.product_id, v_line.variant_id, v_previous_stock, v_new_stock,
      'adjustment', 'Customer order ' || v_order_number);
  end loop;

  v_customer_name := btrim((p_shipping_address ->> 'first_name') || ' ' || (p_shipping_address ->> 'last_name'));
  v_customer_email := btrim(p_shipping_address ->> 'email');
  v_payment_transaction_code := 'PAY-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-'
    || upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6));
  insert into public.payment_transactions (
    order_id, payment_method_id, transaction_code, order_number, customer_name,
    customer_email, method_code, method_name, provider, amount, fee_amount,
    currency, status, notes, config
  ) values (
    v_order_id, v_payment.id, v_payment_transaction_code, v_order_number,
    v_customer_name, v_customer_email, v_payment.code, v_payment.name,
    v_payment.provider, v_total, v_payment_fee, 'USD', 'pending',
    v_payment.instructions_en, jsonb_build_object('shipping_method_id', v_shipping.id)
  );
  if p_cart_id is not null then delete from public.cart_items where cart_id = p_cart_id; end if;

  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'status', v_status,
    'payment_status', v_payment_status, 'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost, 'payment_fee', v_payment_fee,
    'discount_amount', 0, 'total', v_total
  );
end;
$$;

revoke all on function public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text) from public;
grant execute on function public.place_customer_order(uuid, uuid, uuid, jsonb, jsonb, text) to anon, authenticated;

create or replace function public.enforce_variant_order_item_price()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_regular numeric;
  v_sale numeric;
begin
  if new.variant_id is null then return new; end if;
  select coalesce(variant.price, product.price), coalesce(variant.sale_price, product.sale_price)
  into v_regular, v_sale
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where variant.id = new.variant_id and variant.product_id = new.product_id;
  if not found then raise exception 'The selected product variant no longer exists.'; end if;
  new.price := case when v_sale is not null and v_sale > 0 and v_sale < v_regular then v_sale else v_regular end;
  new.total := round(new.price * new.quantity, 2);
  return new;
end;
$$;

create trigger enforce_variant_order_item_price
before update of price on public.order_items
for each row when (new.variant_id is not null)
execute function public.enforce_variant_order_item_price();

notify pgrst, 'reload schema';
