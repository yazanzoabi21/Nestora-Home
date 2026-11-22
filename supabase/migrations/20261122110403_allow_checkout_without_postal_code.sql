-- Checkout does not collect postal codes. Preserve the deployed function bodies,
-- ownership and grants while removing the obsolete requirement where it exists.
do $migration$
declare
  target regprocedure;
  definition text;
  updated_definition text;
  postal_requirement constant text := '    or nullif(btrim(p_shipping_address ->> ''postal_code''), '''') is null';
  postal_expression constant text := 'btrim(p_shipping_address ->> ''postal_code'')';
begin
  foreach target in array array[
    'public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure,
    'public.place_customer_order_legacy_products_only(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
  ]
  loop
    definition := pg_get_functiondef(target);
    updated_definition := replace(definition, postal_requirement, '');

    -- The deployed simple-product routine already treats this field as optional.
    if updated_definition <> definition then
      updated_definition := replace(
        updated_definition,
        postal_expression || ',',
        'nullif(' || postal_expression || ', ''''),'
      );
      execute updated_definition;
    end if;
  end loop;
end;
$migration$;
