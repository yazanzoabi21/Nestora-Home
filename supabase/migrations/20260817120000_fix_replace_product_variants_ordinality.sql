create or replace function public.replace_product_variants(
  p_product_id uuid,
  p_variants jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(coalesce(p_variants, '[]'::jsonb)) <> 'array' then
    raise exception 'Product variants must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) item
    join public.products product
      on lower(btrim(product.sku)) = lower(btrim(item ->> 'sku'))
    where nullif(btrim(item ->> 'sku'), '') is not null
  ) then
    raise exception 'A variant SKU is already used by a product.';
  end if;

  delete from public.product_variants where product_id = p_product_id;

  insert into public.product_variants (
    product_id, option_name, option_value, name, sku, price, sale_price, stock,
    attributes, media_id, image_url, is_active, sort_order
  )
  select
    p_product_id,
    btrim(item.option_name),
    btrim(item.option_value),
    nullif(btrim(item.name), ''),
    nullif(btrim(item.sku), ''),
    item.price,
    item.sale_price,
    item.stock,
    coalesce(item.attributes, '{}'::jsonb),
    item.media_id,
    nullif(btrim(item.image_url), ''),
    coalesce(item.is_active, true),
    coalesce(item.sort_order, item.ordinality - 1)
  from rows from (
    jsonb_to_recordset(coalesce(p_variants, '[]'::jsonb)) as (
      option_name text,
      option_value text,
      name text,
      sku text,
      price numeric,
      sale_price numeric,
      stock integer,
      attributes jsonb,
      media_id uuid,
      image_url text,
      is_active boolean,
      sort_order integer
    )
  ) with ordinality as item;
end;
$$;

revoke all on function public.replace_product_variants(uuid, jsonb) from public, anon;
grant execute on function public.replace_product_variants(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
