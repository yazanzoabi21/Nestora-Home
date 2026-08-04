-- Award loyalty points only from trusted order totals when fulfillment is complete.
-- New checkouts retain their immutable loyalty snapshot so settings changes cannot
-- retroactively alter pending rewards. Legacy orders fall back to product spend.
create or replace function public.process_order_loyalty_status_change()
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
  v_earned_points integer := 0;
  v_awarded_points integer := 0;
begin
  if new.user_id is null then
    return new;
  end if;

  if v_is_completed and not v_was_completed then
    v_earned_points := case
      when new.loyalty_checkout_processed then new.loyalty_points_earned
      else floor(greatest(0, coalesce(new.subtotal, 0) - coalesce(new.discount_amount, 0)))::integer
    end;

    if v_earned_points > 0 and not exists (
      select 1
      from public.customer_loyalty_points_ledger
      where user_id = new.user_id
        and order_id = new.id
        and transaction_type = 'earn'
    ) then
      perform public.append_customer_loyalty_ledger_entry(
        new.user_id,
        new.id,
        null,
        'earn',
        v_earned_points,
        'Points earned for completed order ' || coalesce(new.order_number, new.id::text)
      );
    end if;
  end if;

  if v_is_refunded and not v_was_refunded then
    if new.loyalty_points_redeemed > 0 and not exists (
      select 1
      from public.customer_loyalty_points_ledger
      where user_id = new.user_id
        and order_id = new.id
        and transaction_type = 'redemption_refund'
    ) then
      perform public.append_customer_loyalty_ledger_entry(
        new.user_id,
        new.id,
        null,
        'redemption_refund',
        new.loyalty_points_redeemed,
        'Redeemed points restored for cancelled or refunded order ' || coalesce(new.order_number, new.id::text)
      );
    end if;

    select coalesce(sum(points_delta), 0)::integer
    into v_awarded_points
    from public.customer_loyalty_points_ledger
    where user_id = new.user_id
      and order_id = new.id
      and transaction_type = 'earn';

    if v_awarded_points > 0 and not exists (
      select 1
      from public.customer_loyalty_points_ledger
      where user_id = new.user_id
        and order_id = new.id
        and transaction_type = 'earn_reversal'
    ) then
      perform public.append_customer_loyalty_ledger_entry(
        new.user_id,
        new.id,
        null,
        'earn_reversal',
        -v_awarded_points,
        'Earned points reversed for cancelled or refunded order ' || coalesce(new.order_number, new.id::text)
      );
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
