create table if not exists public.loyalty_program_settings (
  id boolean primary key default true check (id = true),
  is_enabled boolean not null default true,
  point_value_usd numeric(10,4) not null default 0.0200 check (point_value_usd > 0),
  points_earned_per_usd numeric(10,2) not null default 1.00 check (points_earned_per_usd >= 0),
  minimum_redemption_points integer not null default 400 check (minimum_redemption_points >= 0),
  updated_at timestamptz not null default now()
);

insert into public.loyalty_program_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.orders
  add column if not exists loyalty_points_redeemed integer not null default 0,
  add column if not exists loyalty_points_earned integer not null default 0,
  add column if not exists loyalty_point_value_usd numeric(10,4),
  add column if not exists loyalty_points_earned_per_usd numeric(10,2),
  add column if not exists loyalty_checkout_processed boolean not null default false;

alter table public.order_items
  add column if not exists loyalty_redeemed boolean not null default false,
  add column if not exists loyalty_points_cost integer not null default 0,
  add column if not exists loyalty_points_earned integer not null default 0,
  add column if not exists loyalty_effective_unit_price numeric(10,2);

create table if not exists public.customer_loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  order_item_id uuid references public.order_items(id) on delete restrict,
  transaction_type text not null check (
    transaction_type in ('earn', 'redeem', 'earn_reversal', 'redemption_refund', 'adjustment')
  ),
  points_delta integer not null check (points_delta <> 0),
  balance_after integer not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_loyalty_points_balances (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists customer_loyalty_ledger_user_created_idx
  on public.customer_loyalty_points_ledger (user_id, created_at desc);

create index if not exists customer_loyalty_ledger_order_idx
  on public.customer_loyalty_points_ledger (order_id)
  where order_id is not null;

create index if not exists customer_loyalty_ledger_created_idx
  on public.customer_loyalty_points_ledger (created_at desc);

create unique index if not exists customer_loyalty_ledger_order_transaction_key
  on public.customer_loyalty_points_ledger (user_id, order_id, transaction_type)
  where order_id is not null and order_item_id is null and transaction_type <> 'adjustment';

create unique index if not exists customer_loyalty_ledger_item_transaction_key
  on public.customer_loyalty_points_ledger (user_id, order_item_id, transaction_type)
  where order_item_id is not null and transaction_type <> 'adjustment';

create function public.prevent_loyalty_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Loyalty ledger entries are immutable.';
end;
$$;

drop trigger if exists prevent_loyalty_ledger_mutation on public.customer_loyalty_points_ledger;
create trigger prevent_loyalty_ledger_mutation
before update or delete on public.customer_loyalty_points_ledger
for each row execute function public.prevent_loyalty_ledger_mutation();

create function public.append_customer_loyalty_ledger_entry(
  p_user_id uuid,
  p_order_id uuid,
  p_order_item_id uuid,
  p_transaction_type text,
  p_points_delta integer,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_new_balance integer;
begin
  if p_transaction_type not in ('earn', 'redeem', 'earn_reversal', 'redemption_refund', 'adjustment') then
    raise exception 'Invalid loyalty ledger entry type.';
  end if;

  if p_points_delta is null or p_points_delta = 0 then
    raise exception 'Loyalty points change must be non-zero.';
  end if;

  insert into public.customer_loyalty_points_balances (user_id, balance)
  values (
    p_user_id,
    coalesce((select sum(points_delta)::integer
      from public.customer_loyalty_points_ledger where user_id = p_user_id), 0)
  )
  on conflict (user_id) do nothing;

  select balance
  into v_balance
  from public.customer_loyalty_points_balances
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Customer profile not found.';
  end if;

  v_new_balance := v_balance + p_points_delta;
  if p_transaction_type = 'redeem' and v_new_balance < 0 then
    raise exception 'Insufficient loyalty points.';
  end if;

  insert into public.customer_loyalty_points_ledger (
    user_id, order_id, order_item_id, transaction_type, points_delta, balance_after, note
  ) values (
    p_user_id, p_order_id, p_order_item_id, p_transaction_type,
    p_points_delta, v_new_balance, nullif(btrim(p_note), '')
  );

  update public.customer_loyalty_points_balances
  set balance = v_new_balance,
      updated_at = now()
  where user_id = p_user_id;

  return v_new_balance;
end;
$$;

revoke all on function public.append_customer_loyalty_ledger_entry(uuid, uuid, uuid, text, integer, text)
  from public, anon, authenticated;

create function public.process_order_loyalty_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_was_completed boolean := lower(coalesce(old.status, '')) in ('delivered', 'completed');
  v_is_completed boolean := lower(coalesce(new.status, '')) in ('delivered', 'completed');
  v_was_refunded boolean := lower(coalesce(old.status, '')) in ('cancelled', 'canceled', 'refunded', 'returned')
    or lower(coalesce(old.payment_status, '')) = 'refunded';
  v_is_refunded boolean := lower(coalesce(new.status, '')) in ('cancelled', 'canceled', 'refunded', 'returned')
    or lower(coalesce(new.payment_status, '')) = 'refunded';
begin
  if new.user_id is null then
    return new;
  end if;

  if v_is_completed and not v_was_completed and new.loyalty_points_earned > 0
    and not exists (
      select 1 from public.customer_loyalty_points_ledger
      where user_id = new.user_id and order_id = new.id and transaction_type = 'earn'
    )
  then
    perform public.append_customer_loyalty_ledger_entry(
      new.user_id, new.id, null, 'earn', new.loyalty_points_earned,
      'Points earned for completed order ' || coalesce(new.order_number, new.id::text)
    );
  end if;

  if v_is_refunded and not v_was_refunded then
    if new.loyalty_points_redeemed > 0 and not exists (
      select 1 from public.customer_loyalty_points_ledger
      where user_id = new.user_id and order_id = new.id and transaction_type = 'redemption_refund'
    ) then
      perform public.append_customer_loyalty_ledger_entry(
        new.user_id, new.id, null, 'redemption_refund', new.loyalty_points_redeemed,
        'Redeemed points restored for cancelled or refunded order ' || coalesce(new.order_number, new.id::text)
      );
    end if;

    if exists (
      select 1 from public.customer_loyalty_points_ledger
      where user_id = new.user_id and order_id = new.id and transaction_type = 'earn'
    ) and not exists (
      select 1 from public.customer_loyalty_points_ledger
      where user_id = new.user_id and order_id = new.id and transaction_type = 'earn_reversal'
    ) then
      perform public.append_customer_loyalty_ledger_entry(
        new.user_id, new.id, null, 'earn_reversal', -new.loyalty_points_earned,
        'Earned points reversed for cancelled or refunded order ' || coalesce(new.order_number, new.id::text)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists process_order_loyalty_status_change on public.orders;
create trigger process_order_loyalty_status_change
after update of status, payment_status on public.orders
for each row execute function public.process_order_loyalty_status_change();

alter table public.loyalty_program_settings enable row level security;
alter table public.customer_loyalty_points_ledger enable row level security;
alter table public.customer_loyalty_points_balances enable row level security;

create policy "loyalty settings are readable"
on public.loyalty_program_settings for select
to anon, authenticated
using (true);

create policy "admins can update loyalty settings"
on public.loyalty_program_settings for update
to authenticated
using (exists (
  select 1 from public.profiles profile
  join public.roles role on role.id = profile.role_id
  where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
))
with check (id = true);

create policy "customers can read their loyalty ledger"
on public.customer_loyalty_points_ledger for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid() and role.name in ('admin', 'super_admin')
  )
);

create function public.get_my_loyalty_balance()
returns integer
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select sum(points_delta)::integer
      from public.customer_loyalty_points_ledger
      where user_id = auth.uid()),
    0
  );
$$;

revoke all on function public.get_my_loyalty_balance() from public;
grant execute on function public.get_my_loyalty_balance() to authenticated;

create function public.get_my_loyalty_points_history(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  transaction_type text,
  points_delta integer,
  note text,
  created_at timestamptz,
  order_id uuid,
  order_item_id uuid,
  order_number text,
  order_status text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    ledger.id,
    ledger.transaction_type,
    ledger.points_delta,
    ledger.note,
    ledger.created_at,
    ledger.order_id,
    ledger.order_item_id,
    orders.order_number,
    orders.status
  from public.customer_loyalty_points_ledger ledger
  left join public.orders on orders.id = ledger.order_id
  where auth.uid() is not null
    and ledger.user_id = auth.uid()
  order by ledger.created_at desc, ledger.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_my_loyalty_points_history(integer, integer) from public;
grant execute on function public.get_my_loyalty_points_history(integer, integer) to authenticated;

create function public.get_my_redeemable_loyalty_products(
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  name text,
  slug text,
  image_url text,
  effective_price numeric,
  points_cost integer,
  stock integer,
  category_name text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with loyalty_context as (
    select
      settings.point_value_usd,
      settings.minimum_redemption_points,
      settings.is_enabled,
      public.get_my_loyalty_balance() as balance
    from public.loyalty_program_settings settings
    where settings.id = true
  ), priced_products as (
    select
      product.id,
      product.name,
      product.slug,
      product.image_url,
      case
        when product.sale_price is not null
          and product.sale_price > 0
          and product.sale_price < product.price
        then product.sale_price
        else product.price
      end as effective_price,
      product.stock,
      category.name as category_name,
      context.point_value_usd,
      context.minimum_redemption_points,
      context.balance,
      context.is_enabled
    from public.products product
    left join public.categories category on category.id = product.category_id
    cross join loyalty_context context
    where auth.uid() is not null
      and product.is_active = true
      and product.is_loyalty_eligible = true
      and coalesce(product.stock, 0) > 0
  )
  select
    priced.id,
    priced.name,
    priced.slug,
    priced.image_url,
    priced.effective_price,
    ceil(priced.effective_price / priced.point_value_usd)::integer,
    priced.stock,
    priced.category_name
  from priced_products priced
  where priced.is_enabled
    and ceil(priced.effective_price / priced.point_value_usd) >= priced.minimum_redemption_points
    and ceil(priced.effective_price / priced.point_value_usd) <= priced.balance
  order by ceil(priced.effective_price / priced.point_value_usd), priced.name
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_my_redeemable_loyalty_products(integer, integer) from public;
grant execute on function public.get_my_redeemable_loyalty_products(integer, integer) to authenticated;

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
  p_redeem_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.loyalty_program_settings%rowtype;
  v_result jsonb;
  v_order_id uuid;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_quantity integer;
  v_points_cost integer;
  v_total_points_cost integer := 0;
  v_subtotal numeric(10,2);
  v_discount_amount numeric(10,2);
  v_shipping public.shipping_methods%rowtype;
  v_payment public.payment_methods%rowtype;
  v_shipping_cost numeric(10,2);
  v_payment_fee numeric(10,2);
  v_total numeric(10,2);
  v_points_earned integer := 0;
  v_already_processed boolean;
  v_customer_balance integer;
begin
  if coalesce(cardinality(p_redeem_product_ids), 0) <> coalesce(
    (select count(distinct requested_id) from unnest(p_redeem_product_ids) requested_id),
    0
  ) then
    raise exception 'Duplicate loyalty redemption products are not allowed.';
  end if;

  select * into v_settings
  from public.loyalty_program_settings
  where id = true;

  if not found then
    raise exception 'Loyalty settings are unavailable.';
  end if;

  if coalesce(cardinality(p_redeem_product_ids), 0) > 0 then
    if v_user_id is null then
      raise exception 'Sign in to redeem loyalty points.';
    end if;
    if not v_settings.is_enabled then
      raise exception 'The loyalty program is currently disabled.';
    end if;
    if p_discount_id is not null then
      raise exception 'Loyalty redemption cannot be combined with a promo code.';
    end if;

    perform 1 from public.profiles where id = v_user_id;
    if not found then
      raise exception 'Customer profile not found.';
    end if;

    insert into public.customer_loyalty_points_balances (user_id, balance)
    values (
      v_user_id,
      coalesce((select sum(points_delta)::integer
        from public.customer_loyalty_points_ledger where user_id = v_user_id), 0)
    )
    on conflict (user_id) do nothing;

    select balance into v_customer_balance
    from public.customer_loyalty_points_balances
    where user_id = v_user_id
    for update;

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
      'total', orders.total,
      'loyalty_points_redeemed', orders.loyalty_points_redeemed,
      'loyalty_points_earned', orders.loyalty_points_earned
    )
    into v_result
    from public.orders
    where orders.checkout_token = p_checkout_token
      and orders.user_id = v_user_id
      and orders.loyalty_checkout_processed = true;

    if v_result is not null then
      return v_result;
    end if;

    foreach v_product_id in array p_redeem_product_ids loop
      select * into v_product from public.products where id = v_product_id for update;
      if not found or v_product.is_active is distinct from true then
        raise exception 'A loyalty redemption product is unavailable.';
      end if;
      if not v_product.is_loyalty_eligible then
        raise exception 'A selected product is not eligible for loyalty redemption.';
      end if;

      select (item ->> 'quantity')::integer into v_quantity
      from jsonb_array_elements(p_items) item
      where (item ->> 'product_id')::uuid = v_product_id
      limit 1;

      if v_quantity is null or v_quantity < 1 then
        raise exception 'A loyalty redemption product is not present in the order.';
      end if;

      v_points_cost := ceil(
        ((case when v_product.sale_price is not null and v_product.sale_price > 0
          and v_product.sale_price < v_product.price then v_product.sale_price else v_product.price end)
          * v_quantity) / v_settings.point_value_usd
      );
      v_total_points_cost := v_total_points_cost + v_points_cost;
    end loop;

    if v_total_points_cost < v_settings.minimum_redemption_points then
      raise exception 'The redemption does not meet the minimum loyalty points requirement.';
    end if;
    if v_customer_balance < v_total_points_cost then
      raise exception 'Insufficient loyalty points.';
    end if;
  end if;

  v_result := public.place_customer_order(
    p_cart_id, p_shipping_method_id, p_payment_method_id, p_shipping_address,
    p_items, p_customer_notes, p_discount_id, p_discount_code,
    p_expected_subtotal, p_checkout_token
  );
  v_order_id := (v_result ->> 'order_id')::uuid;

  select loyalty_checkout_processed into v_already_processed
  from public.orders where id = v_order_id for update;
  if v_already_processed then
    return v_result || (
      select jsonb_build_object(
        'loyalty_points_redeemed', loyalty_points_redeemed,
        'loyalty_points_earned', loyalty_points_earned
      ) from public.orders where id = v_order_id
    );
  end if;

  update public.order_items item
  set loyalty_effective_unit_price = item.price,
      loyalty_redeemed = item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[])),
      loyalty_points_cost = case
        when item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[]))
        then ceil((item.price * item.quantity) / v_settings.point_value_usd)
        else 0
      end,
      total = case
        when item.product_id = any(coalesce(p_redeem_product_ids, array[]::uuid[])) then 0
        else item.total
      end
  where item.order_id = v_order_id;

  select round(coalesce(sum(total), 0), 2) into v_subtotal
  from public.order_items where order_id = v_order_id;
  v_discount_amount := case when v_total_points_cost > 0 then 0
    else coalesce((v_result ->> 'discount_amount')::numeric, 0) end;

  select * into v_shipping from public.shipping_methods where id = p_shipping_method_id and is_active = true;
  v_shipping_cost := coalesce(v_shipping.base_cost, 0);
  if v_shipping.free_shipping_min_amount is not null and v_subtotal >= v_shipping.free_shipping_min_amount then
    v_shipping_cost := 0;
  end if;
  v_shipping_cost := round(v_shipping_cost, 2);

  select * into v_payment from public.payment_methods where id = p_payment_method_id and is_active = true;
  v_payment_fee := round(
    coalesce(v_payment.fee_fixed, 0)
    + ((v_subtotal + v_shipping_cost) * coalesce(v_payment.fee_percentage, 0) / 100), 2
  );
  v_total := greatest(0, round(v_subtotal + v_shipping_cost + v_payment_fee - v_discount_amount, 2));

  if v_user_id is not null and v_settings.is_enabled then
    v_points_earned := floor(greatest(0, v_subtotal - v_discount_amount) * v_settings.points_earned_per_usd);
  end if;

  update public.order_items item
  set loyalty_points_earned = case when item.loyalty_redeemed then 0 else
    floor(item.total * case when v_subtotal > 0 then greatest(0, v_subtotal - v_discount_amount) / v_subtotal else 0 end
      * v_settings.points_earned_per_usd) end
  where item.order_id = v_order_id;

  update public.orders
  set subtotal = v_subtotal,
      shipping = v_shipping_cost,
      payment_fee = v_payment_fee,
      discount_amount = v_discount_amount,
      total = v_total,
      loyalty_points_redeemed = v_total_points_cost,
      loyalty_points_earned = v_points_earned,
      loyalty_point_value_usd = v_settings.point_value_usd,
      loyalty_points_earned_per_usd = v_settings.points_earned_per_usd,
      loyalty_checkout_processed = true
  where id = v_order_id;

  update public.payment_transactions
  set amount = v_total, fee_amount = v_payment_fee
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
    'discount_amount', v_discount_amount,
    'total', v_total,
    'loyalty_points_redeemed', v_total_points_cost,
    'loyalty_points_earned', v_points_earned
  );
end;
$$;

revoke all on function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[]
) from public;
grant execute on function public.place_customer_order(
  uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[]
) to anon, authenticated;

create function public.adjust_customer_loyalty_points(
  p_user_id uuid,
  p_points_delta integer,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if nullif(btrim(p_note), '') is null then
    raise exception 'A note is required for a loyalty points adjustment.';
  end if;

  return public.append_customer_loyalty_ledger_entry(
    p_user_id, null, null, 'adjustment', p_points_delta, p_note
  );
end;
$$;

revoke all on function public.adjust_customer_loyalty_points(uuid, integer, text) from public, anon;
grant execute on function public.adjust_customer_loyalty_points(uuid, integer, text) to authenticated;

create function public.update_admin_order_status(
  p_order_id uuid,
  p_status text,
  p_payment_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  update public.orders
  set status = lower(p_status),
      payment_status = lower(p_payment_status)
  where id = p_order_id;

  if not found then
    raise exception 'Order not found.';
  end if;
end;
$$;

revoke all on function public.update_admin_order_status(uuid, text, text) from public, anon;
grant execute on function public.update_admin_order_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
