alter table public.order_items
  add column if not exists inventory_restored_at timestamptz null;

create or replace function public.restore_admin_order_item_inventory(
  p_order_item_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.order_items%rowtype;
  v_previous_stock integer;
  v_new_stock integer;
  v_variant_stock_found boolean := false;
begin
  select *
  into v_item
  from public.order_items
  where id = p_order_item_id
  for update;

  if not found then
    return false;
  end if;

  if v_item.inventory_restored_at is not null then
    return false;
  end if;

  if v_item.variant_id is not null then
    select stock
    into v_previous_stock
    from public.product_variants
    where id = v_item.variant_id
    for update;

    v_variant_stock_found := found and v_previous_stock is not null;
  end if;

  if v_variant_stock_found then
    v_new_stock := v_previous_stock + greatest(coalesce(v_item.quantity, 0), 0);

    update public.product_variants
    set stock = v_new_stock,
        updated_at = now()
    where id = v_item.variant_id;
  else
    select coalesce(stock, 0)
    into v_previous_stock
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'The order item product no longer exists.';
    end if;

    v_new_stock := v_previous_stock + greatest(coalesce(v_item.quantity, 0), 0);

    update public.products
    set stock = v_new_stock
    where id = v_item.product_id;
  end if;

  if v_item.is_free_gift is distinct from true then
    update public.products
    set sold_count = greatest(
      0,
      coalesce(sold_count, 0) - greatest(coalesce(v_item.quantity, 0), 0)
    )
    where id = v_item.product_id;
  end if;

  insert into public.inventory_logs (
    product_id,
    variant_id,
    previous_stock,
    new_stock,
    change_type,
    note
  ) values (
    v_item.product_id,
    v_item.variant_id,
    v_previous_stock,
    v_new_stock,
    'return',
    nullif(btrim(p_note), '')
  );

  update public.order_items
  set inventory_restored_at = now()
  where id = v_item.id;

  return true;
end;
$$;

revoke all on function public.restore_admin_order_item_inventory(uuid, text)
  from public, anon, authenticated;

create or replace function public.recalculate_admin_order_after_item_change(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_discount public.discounts%rowtype;
  v_item_id uuid;
  v_item_count integer := 0;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_payment_fee numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_eligible_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_loyalty_points_redeemed integer := 0;
  v_loyalty_points_earned integer := 0;
  v_points_rate numeric(10,2) := 1;
  v_clear_discount boolean := false;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  select count(*)::integer, round(coalesce(sum(item.total), 0), 2)
  into v_item_count, v_subtotal
  from public.order_items item
  where item.order_id = p_order_id;

  if v_item_count > 0 and v_order.discount_id is not null then
    select *
    into v_discount
    from public.discounts
    where id = v_order.discount_id
    for update;

    if not found or v_subtotal < coalesce(v_discount.minimum_order_amount, 0) then
      v_clear_discount := true;
    elsif v_discount.discount_type in ('percentage', 'fixed_amount') then
      if v_discount.applies_to = 'all' then
        select round(coalesce(sum(item.total), 0), 2)
        into v_eligible_subtotal
        from public.order_items item
        where item.order_id = p_order_id;
      elsif v_discount.applies_to = 'product' then
        select round(coalesce(sum(item.total), 0), 2)
        into v_eligible_subtotal
        from public.order_items item
        where item.order_id = p_order_id
          and item.product_id = v_discount.product_id;
      elsif v_discount.applies_to = 'category' then
        select round(coalesce(sum(item.total), 0), 2)
        into v_eligible_subtotal
        from public.order_items item
        join public.products product on product.id = item.product_id
        where item.order_id = p_order_id
          and product.category_id = v_discount.category_id;
      else
        v_clear_discount := true;
      end if;

      if not v_clear_discount and v_eligible_subtotal <= 0 then
        v_clear_discount := true;
      elsif not v_clear_discount and v_discount.discount_type = 'percentage' then
        v_discount_amount := round(
          v_eligible_subtotal * coalesce(v_discount.discount_value, 0) / 100,
          2
        );
      elsif not v_clear_discount then
        v_discount_amount := round(coalesce(v_discount.discount_value, 0), 2);
      end if;

      v_discount_amount := least(
        v_eligible_subtotal,
        greatest(0, v_discount_amount)
      );
    elsif v_discount.discount_type not in ('free_shipping', 'free_gift') then
      v_clear_discount := true;
    end if;
  elsif v_order.discount_id is not null then
    v_clear_discount := true;
  end if;

  if v_clear_discount and v_order.discount_id is not null then
    if v_discount.discount_type = 'free_gift' then
      for v_item_id in
        select item.id
        from public.order_items item
        where item.order_id = p_order_id
          and item.is_free_gift = true
        order by item.id
        for update
      loop
        perform public.restore_admin_order_item_inventory(
          v_item_id,
          'Free gift removed after admin order update ' || coalesce(v_order.order_number, v_order.id::text)
        );

        delete from public.order_items where id = v_item_id;
      end loop;

      select count(*)::integer, round(coalesce(sum(item.total), 0), 2)
      into v_item_count, v_subtotal
      from public.order_items item
      where item.order_id = p_order_id;
    end if;

    update public.discounts
    set usage_count = greatest(0, coalesce(usage_count, 0) - 1),
        updated_at = now()
    where id = v_order.discount_id;

    v_discount_amount := 0;
  end if;

  if v_item_count > 0 then
    select round(coalesce(base_cost, v_order.shipping, 0), 2)
    into v_shipping
    from public.shipping_methods
    where id = v_order.shipping_method_id;

    if not found then
      v_shipping := round(coalesce(v_order.shipping, 0), 2);
    end if;

    if not v_clear_discount and v_discount.discount_type = 'free_shipping' then
      v_shipping := 0;
    end if;

    select round(
      coalesce(fee_fixed, 0)
        + ((v_subtotal + v_shipping) * coalesce(fee_percentage, 0) / 100),
      2
    )
    into v_payment_fee
    from public.payment_methods
    where id = v_order.payment_method_id;

    if not found then
      v_payment_fee := round(coalesce(v_order.payment_fee, 0), 2);
    end if;

    v_total := greatest(
      0,
      round(v_subtotal + v_shipping + v_payment_fee - v_discount_amount, 2)
    );
  end if;

  select coalesce(sum(item.loyalty_points_cost), 0)::integer
  into v_loyalty_points_redeemed
  from public.order_items item
  where item.order_id = p_order_id;

  v_points_rate := coalesce(v_order.loyalty_points_earned_per_usd, 1);

  v_loyalty_points_earned := floor(v_subtotal * v_points_rate)::integer;

  update public.order_items item
  set loyalty_points_earned = case
    when item.loyalty_redeemed then 0
    else floor(item.total * v_points_rate)::integer
  end
  where item.order_id = p_order_id;

  update public.orders
  set subtotal = v_subtotal,
      shipping = v_shipping,
      payment_fee = v_payment_fee,
      discount_id = case when v_clear_discount then null else discount_id end,
      discount_code = case when v_clear_discount then null else discount_code end,
      discount_amount = v_discount_amount,
      total = v_total,
      loyalty_points_redeemed = v_loyalty_points_redeemed,
      loyalty_points_earned = v_loyalty_points_earned,
      free_gift_processed = case when v_clear_discount then false else free_gift_processed end,
      free_shipping_discount_processed = case
        when v_clear_discount then false
        else free_shipping_discount_processed
      end,
      status = case when v_item_count = 0 then 'cancelled' else status end
  where id = p_order_id;

  update public.payment_transactions
  set amount = v_total,
      fee_amount = v_payment_fee
  where order_id = p_order_id;
end;
$$;

revoke all on function public.recalculate_admin_order_after_item_change(uuid)
  from public, anon, authenticated;

create or replace function public.remove_admin_order_item(
  p_order_id uuid,
  p_order_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_updated_order public.orders%rowtype;
  v_previous_loyalty_points_earned integer;
  v_loyalty_delta integer;
begin
  if not exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and role.name in ('admin', 'super_admin')
      and profile.is_active = true
  ) then
    raise exception 'Admin access is required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  select *
  into v_item
  from public.order_items
  where id = p_order_item_id
    and order_id = p_order_id
  for update;

  if not found then
    raise exception 'Order item not found or was already removed.';
  end if;

  v_previous_loyalty_points_earned := coalesce(v_order.loyalty_points_earned, 0);

  perform public.restore_admin_order_item_inventory(
    v_item.id,
    'Admin removed item from order ' || coalesce(v_order.order_number, v_order.id::text)
  );

  delete from public.order_items where id = v_item.id;

  perform public.recalculate_admin_order_after_item_change(p_order_id);

  select *
  into v_updated_order
  from public.orders
  where id = p_order_id;

  if v_order.user_id is not null and coalesce(v_item.loyalty_points_cost, 0) > 0 then
    perform public.append_customer_loyalty_ledger_entry(
      v_order.user_id,
      v_order.id,
      null,
      'adjustment',
      v_item.loyalty_points_cost,
      'Redeemed points restored for removed order item in '
        || coalesce(v_order.order_number, v_order.id::text)
    );
  end if;

  if lower(coalesce(v_updated_order.status, '')) in ('delivered', 'completed')
    and v_order.user_id is not null
    and exists (
      select 1
      from public.customer_loyalty_points_ledger
      where user_id = v_order.user_id
        and order_id = v_order.id
        and transaction_type = 'earn'
    )
  then
    v_loyalty_delta := coalesce(v_updated_order.loyalty_points_earned, 0)
      - v_previous_loyalty_points_earned;

    if v_loyalty_delta <> 0 then
      perform public.append_customer_loyalty_ledger_entry(
        v_order.user_id,
        v_order.id,
        null,
        'adjustment',
        v_loyalty_delta,
        'Loyalty points adjusted after removing an item from order '
          || coalesce(v_order.order_number, v_order.id::text)
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id', v_updated_order.id,
    'status', v_updated_order.status,
    'subtotal', v_updated_order.subtotal,
    'discount_amount', v_updated_order.discount_amount,
    'shipping', v_updated_order.shipping,
    'payment_fee', v_updated_order.payment_fee,
    'total', v_updated_order.total
  );
end;
$$;

revoke all on function public.remove_admin_order_item(uuid, uuid) from public, anon;
grant execute on function public.remove_admin_order_item(uuid, uuid) to authenticated;

create or replace function public.update_admin_order_status(
  p_order_id uuid,
  p_status text,
  p_payment_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item_id uuid;
begin
  if not exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and role.name in ('admin', 'super_admin')
      and profile.is_active = true
  ) then
    raise exception 'Admin access is required.';
  end if;

  if lower(p_status) not in (
    'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'canceled', 'returned'
  ) then
    raise exception 'Unsupported order status.';
  end if;

  if lower(p_payment_status) not in ('pending', 'unpaid', 'paid', 'failed', 'refunded') then
    raise exception 'Unsupported payment status.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if lower(p_status) in ('cancelled', 'canceled') then
    for v_item_id in
      select item.id
      from public.order_items item
      where item.order_id = p_order_id
        and item.inventory_restored_at is null
      order by item.id
      for update
    loop
      perform public.restore_admin_order_item_inventory(
        v_item_id,
        'Admin cancelled order ' || coalesce(v_order.order_number, v_order.id::text)
      );
    end loop;
  end if;

  update public.orders
  set status = lower(p_status),
      payment_status = lower(p_payment_status)
  where id = p_order_id;
end;
$$;

revoke all on function public.update_admin_order_status(uuid, text, text) from public, anon;
grant execute on function public.update_admin_order_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
