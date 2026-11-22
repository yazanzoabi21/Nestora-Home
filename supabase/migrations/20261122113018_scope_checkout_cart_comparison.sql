-- Compare against rows owned by the selected cart before performing the outer join.
-- Replacing the existing definition preserves the function identity and privileges.
do $migration$
declare
  target constant regprocedure := 'public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure;
  definition text := pg_get_functiondef(target);
  updated_definition text;
  unscoped_join constant text := $pattern$full join public\.cart_items cart_item\s+on cart_item\.cart_id = p_cart_id\s+and cart_item\.product_id = submitted\.product_id$pattern$;
  scoped_join constant text := $join$full join (
        select product_id, variant_id, quantity
        from public.cart_items
        where cart_id = p_cart_id
      ) cart_item
        on cart_item.product_id = submitted.product_id$join$;
begin
  updated_definition := regexp_replace(definition, unscoped_join, scoped_join);
  if updated_definition = definition then
    if position(scoped_join in definition) > 0 then
      return;
    end if;
    raise exception 'Expected unscoped cart comparison was not found in %', target;
  end if;

  execute updated_definition;
end;
$migration$;
