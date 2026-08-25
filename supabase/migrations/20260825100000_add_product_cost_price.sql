alter table public.products
  add column if not exists cost_price numeric(10, 2) null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_cost_price_nonnegative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_cost_price_nonnegative
      check (cost_price is null or cost_price >= 0);
  end if;
end
$$;

notify pgrst, 'reload schema';
