alter table public.orders
  add column if not exists checkout_token uuid;

create unique index if not exists orders_checkout_token_key
  on public.orders (checkout_token)
  where checkout_token is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_stock_nonnegative'
  ) then
    if exists (select 1 from public.products where stock < 0) then
      alter table public.products
        add constraint products_stock_nonnegative
        check (stock >= 0) not valid;
    else
      alter table public.products
        add constraint products_stock_nonnegative
        check (stock >= 0);
    end if;
  end if;
end;
$$;

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
  p_checkout_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_existing_result jsonb;
begin
  if p_checkout_token is null then
    raise exception 'A checkout idempotency token is required.';
  end if;

  if nullif(btrim(p_shipping_address ->> 'email'), '') is null then
    raise exception 'A shipping email is required.';
  end if;

  select jsonb_build_object(
    'order_id', orders.id,
    'order_number', orders.order_number,
    'status', orders.status,
    'payment_status', orders.payment_status,
    'subtotal', orders.subtotal,
    'shipping_cost', orders.shipping,
    'payment_fee', orders.payment_fee,
    'discount_id', orders.discount_id,
    'discount_code', orders.discount_code,
    'discount_amount', orders.discount_amount,
    'total', orders.total
  )
  into v_existing_result
  from public.orders
  join public.order_shipping_addresses address on address.order_id = orders.id
  where orders.checkout_token = p_checkout_token
    and (
      (auth.uid() is not null and orders.user_id = auth.uid())
      or (
        auth.uid() is null
        and orders.user_id is null
        and lower(address.email) = lower(btrim(p_shipping_address ->> 'email'))
      )
    );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  begin
    v_result := public.place_customer_order(
      p_cart_id,
      p_shipping_method_id,
      p_payment_method_id,
      p_shipping_address,
      p_items,
      p_customer_notes,
      p_discount_id,
      p_discount_code,
      p_expected_subtotal
    );

    update public.orders
    set checkout_token = p_checkout_token
    where id = (v_result ->> 'order_id')::uuid;

    if not found then
      raise exception 'The created order could not be assigned its checkout token.';
    end if;

    return v_result;
  exception
    when unique_violation then
      select jsonb_build_object(
        'order_id', orders.id,
        'order_number', orders.order_number,
        'status', orders.status,
        'payment_status', orders.payment_status,
        'subtotal', orders.subtotal,
        'shipping_cost', orders.shipping,
        'payment_fee', orders.payment_fee,
        'discount_id', orders.discount_id,
        'discount_code', orders.discount_code,
        'discount_amount', orders.discount_amount,
        'total', orders.total
      )
      into v_existing_result
      from public.orders
      join public.order_shipping_addresses address on address.order_id = orders.id
      where orders.checkout_token = p_checkout_token
        and (
          (auth.uid() is not null and orders.user_id = auth.uid())
          or (
            auth.uid() is null
            and orders.user_id is null
            and lower(address.email) = lower(btrim(p_shipping_address ->> 'email'))
          )
        );

      if v_existing_result is null then
        raise;
      end if;

      return v_existing_result;
  end;
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
  numeric,
  uuid
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
  numeric,
  uuid
) to anon, authenticated;

create function public.update_inventory_stock(
  p_product_id uuid,
  p_new_stock integer,
  p_change_type text,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_previous_stock integer;
begin
  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'Stock must be a non-negative integer.';
  end if;

  if p_change_type not in ('restock', 'adjustment', 'damage', 'return', 'correction') then
    raise exception 'Invalid inventory change type.';
  end if;

  select coalesce(stock, 0)
  into v_previous_stock
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  update public.products
  set stock = p_new_stock
  where id = p_product_id;

  insert into public.inventory_logs (
    product_id,
    previous_stock,
    new_stock,
    change_type,
    note
  )
  values (
    p_product_id,
    v_previous_stock,
    p_new_stock,
    p_change_type,
    nullif(btrim(p_note), '')
  );
end;
$$;

revoke all on function public.update_inventory_stock(uuid, integer, text, text) from public;
grant execute on function public.update_inventory_stock(uuid, integer, text, text) to authenticated;

notify pgrst, 'reload schema';
