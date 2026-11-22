-- Read-only checks for the current cart comparison. Expected: every check true.
with fixture (scenario, self_rows, submitted_rows, expected_mismatch) as (
  values
    ('simple only', '[["duster",null,1]]'::jsonb, '[["duster",null,1]]'::jsonb, false),
    ('variant only', '[["tray","34cm",1]]', '[["tray","34cm",1]]', false),
    ('mixed', '[["duster",null,1],["tray","34cm",1]]', '[["duster",null,1],["tray","34cm",1]]', false),
    ('updated quantity', '[["duster",null,2],["tray","34cm",1]]', '[["duster",null,2],["tray","34cm",1]]', false),
    ('stale quantity', '[["duster",null,2],["tray","34cm",1]]', '[["duster",null,1],["tray","34cm",1]]', true),
    ('wrong variant', '[["tray","34cm",1]]', '[["tray","28cm",1]]', true),
    ('missing variant ID', '[["tray","34cm",1]]', '[["tray",null,1]]', true),
    ('missing line', '[["duster",null,1],["tray","34cm",1]]', '[["duster",null,1]]', true),
    ('extra line', '[["duster",null,1]]', '[["duster",null,1],["tray","34cm",1]]', true)
),
cart_items as (
  select fixture.scenario, 'current' as cart_id,
         item->>0 as product_id, item->>1 as variant_id, (item->>2)::integer as quantity
  from fixture
  cross join lateral jsonb_array_elements(fixture.self_rows) as items(item)
  union all
  select scenario, 'other', 'tray', '34cm', 7 from fixture
)
select fixture.scenario, (
  exists (
    select 1
    from (
      select item->>0 as product_id, item->>1 as variant_id, (item->>2)::integer as quantity
      from jsonb_array_elements(fixture.submitted_rows) as items(item)
    ) submitted
    full join (
      select product_id, variant_id, quantity
      from cart_items
      where cart_id = 'current' and scenario = fixture.scenario
    ) cart_item
      on cart_item.product_id = submitted.product_id
     and cart_item.variant_id is not distinct from submitted.variant_id
    where submitted.product_id is null or cart_item.product_id is null
       or submitted.quantity <> cart_item.quantity
  ) = fixture.expected_mismatch
) as comparison_passed
from fixture;

select pg_get_functiondef('public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure)
       ~ 'full join \(\s*select product_id, variant_id, quantity\s+from public\.cart_items\s+where cart_id = p_cart_id\s*\)' as installed_function_scopes_cart;
