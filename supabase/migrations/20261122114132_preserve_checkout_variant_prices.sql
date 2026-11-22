-- Keep prices already calculated from server-side variant records. This
-- wrapper still refreshes base product prices and validates the full subtotal.
do $migration$
declare
  target constant regprocedure :=
    'public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text,uuid,text,numeric)'::regprocedure;
  definition text := pg_get_functiondef(target);
  price_update_pattern constant text :=
    $pattern$(update public\.order_items item\s+set price = case[^;]*\s+from public\.products product\s+where item\.order_id = v_order_id\s+and product\.id = item\.product_id)(\s+and item\.variant_id is null)?;$pattern$;
  price_update text[];
begin
  if regexp_count(definition, price_update_pattern) <> 1 then
    raise exception 'Expected exactly one base-product price update in %', target;
  end if;

  price_update := regexp_match(definition, price_update_pattern);
  if price_update[2] is not null then
    return;
  end if;

  execute replace(
    definition,
    price_update[1] || ';',
    price_update[1] || E'\n    and item.variant_id is null;'
  );
end;
$migration$;
