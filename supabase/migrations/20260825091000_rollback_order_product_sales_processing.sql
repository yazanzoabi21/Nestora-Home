begin;

drop trigger if exists process_order_product_sales_status_change
on public.orders;

drop function if exists public.process_order_product_sales_status_change();

drop trigger if exists protect_product_sold_count
on public.products;

drop function if exists public.protect_product_sold_count();

alter table public.orders
drop column if exists sales_processed;

commit;

notify pgrst, 'reload schema';
