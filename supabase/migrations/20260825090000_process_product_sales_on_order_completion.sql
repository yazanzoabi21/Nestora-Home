-- products.sold_count is derived from fulfilled order-item quantities. Existing
-- checkout functions still reserve stock at order creation, but direct changes to
-- sold_count are ignored so a pending order is not counted as a completed sale.
alter table public.orders
  add column if not exists sales_processed boolean not null default false;

-- Checkouts created before this migration already changed sold_count at creation.
-- Mark them as processed to prevent a later delivered/completed save from counting
-- them a second time. The separate historical backfill can normalize both values.
update public.orders order_record
set sales_processed = true
where exists (
  select 1
  from public.order_items item
  where item.order_id = order_record.id
);

create or replace function public.protect_product_sold_count()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.sold_count := 0;
  elsif pg_trigger_depth() = 1 then
    new.sold_count := old.sold_count;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_product_sold_count on public.products;
create trigger protect_product_sold_count
before insert or update of sold_count on public.products
for each row execute function public.protect_product_sold_count();

create or replace function public.process_order_product_sales_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_successful boolean := lower(coalesce(new.status, '')) in ('delivered', 'completed');
  v_is_reversed boolean := lower(coalesce(new.status, '')) in (
    'cancelled', 'canceled', 'refunded', 'returned'
  ) or lower(coalesce(new.payment_status, '')) = 'refunded';
begin
  if v_is_reversed and new.sales_processed then
    update public.products product
    set sold_count = greatest(0, coalesce(product.sold_count, 0) - sold.quantity)
    from (
      select item.product_id, sum(greatest(coalesce(item.quantity, 0), 0))::integer as quantity
      from public.order_items item
      where item.order_id = new.id
      group by item.product_id
    ) sold
    where product.id = sold.product_id;

    update public.orders
    set sales_processed = false
    where id = new.id;
  elsif v_is_successful and not new.sales_processed then
    update public.products product
    set sold_count = coalesce(product.sold_count, 0) + sold.quantity
    from (
      select item.product_id, sum(greatest(coalesce(item.quantity, 0), 0))::integer as quantity
      from public.order_items item
      where item.order_id = new.id
      group by item.product_id
    ) sold
    where product.id = sold.product_id;

    update public.orders
    set sales_processed = true
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists process_order_product_sales_status_change on public.orders;
create trigger process_order_product_sales_status_change
after update of status, payment_status on public.orders
for each row execute function public.process_order_product_sales_status_change();

notify pgrst, 'reload schema';
