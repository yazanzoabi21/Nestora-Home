-- Deploy alongside the Angular payload change. Historical order addresses keep
-- their existing values. Legacy clients can still send the old JSON field.
begin;

do $migration$
declare
  target regprocedure;
  definition text;
  updated_definition text;
  postal_value constant text := 'btrim(p_shipping_address ->> ''postal_code'')';
  postal_requirement constant text := 'or nullif(btrim(p_shipping_address ->> ''postal_code''), '''') is null';
  prepare_address constant regprocedure := 'public.prepare_customer_address()'::regprocedure;
begin
  foreach target in array array[
    'public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure,
    'public.place_customer_order_legacy_products_only(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure
  ]
  loop
    definition := pg_get_functiondef(target);
    updated_definition := replace(definition, postal_requirement, '');
    updated_definition := replace(updated_definition, postal_value, 'null::text');

    if updated_definition ~* 'p_shipping_address[^;]*->>?[[:space:]]*''postal_code''' then
      raise exception 'Unexpected postal-code extraction in %', target;
    end if;
    if updated_definition <> definition then
      execute updated_definition;
    end if;
  end loop;

  definition := pg_get_functiondef(prepare_address);
  updated_definition := regexp_replace(
    definition,
    $pattern$[[:blank:]]*new\.postal_code := nullif\(btrim\(new\.postal_code\), ''\);[\r\n]+$pattern$,
    '',
    'i'
  );
  if updated_definition ~* '(new|old)\s*\.\s*postal_code' then
    raise exception 'Unexpected postal-code access in %', prepare_address;
  end if;
  if updated_definition <> definition then
    execute updated_definition;
  end if;
end;
$migration$;

-- PostgreSQL removes the column's own CHECK constraint. RESTRICT protects
-- dependent database objects such as views from being dropped implicitly.
alter table public.customer_addresses
  drop column if exists postal_code restrict;

notify pgrst, 'reload schema';

commit;
