do $$
begin
  if exists (
    select 1
    from public.cart_items
    group by cart_id, product_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate cart_items rows exist. Merge duplicates before applying the unique constraint.';
  end if;
end $$;

create unique index if not exists cart_items_cart_product_unique_idx
on public.cart_items(cart_id, product_id);
