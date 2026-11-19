-- Read-only catalog inventory. No customer rows, secrets or claim/send functions.
select jsonb_build_object(
  'server_version',current_setting('server_version'),
  'notification_definition_unchanged',md5(pg_get_functiondef('public.notify_admin_new_order_from_address()'::regprocedure))='df3a0db3ce2c4d0d08279a19dd4b592c',
  'checkout_definition_unchanged',md5(pg_get_functiondef('public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text,uuid,text,numeric,uuid,uuid[],uuid[],uuid[])'::regprocedure))='c73b3999991c0b6bcf823f0d4db1a37c',
  'notification_trigger',(select pg_get_triggerdef(oid) from pg_trigger where tgname='trg_notify_admin_new_order_from_address' and tgrelid='public.order_shipping_addresses'::regclass),
  'legacy_checkout_permissions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'place_customer_order%'),
  'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion)) from pg_extension where extname in ('pg_net','pg_cron','supabase_vault')),
  'new_schema_absent',to_regnamespace('nestora_order_email') is null,
  'api_role_bypass',(select jsonb_agg(jsonb_build_object('role',rolname,'bypass',rolbypassrls)) from pg_roles where rolname in ('anon','authenticated','service_role')),
  'order_indexes',(select jsonb_agg(indexdef) from pg_indexes where schemaname='public' and tablename in ('orders','order_items','order_shipping_addresses','payment_transactions'))
) as preflight;
