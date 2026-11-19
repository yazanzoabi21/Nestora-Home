-- AFTER approved installation. Catalog/status reads only; never claims or sends.
select jsonb_build_object(
  'rpc_acl',(select jsonb_agg(jsonb_build_object('function',p.oid::regprocedure::text,
    'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'settings',p.proconfig,
    'anon_denied',not has_function_privilege('anon',p.oid,'EXECUTE'),
    'customer_denied',not has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_allowed',has_function_privilege('service_role',p.oid,'EXECUTE')))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('order_email_consume_wake','order_email_sandbox_authorize','order_email_prepare','order_email_claim','order_email_start','order_email_finish')),
  'tables',(select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,
    'anon_select_denied',not has_table_privilege('anon',c.oid,'SELECT'),
    'customer_select_denied',not has_table_privilege('authenticated',c.oid,'SELECT'),
    'service_select_denied',not has_table_privilege('service_role',c.oid,'SELECT')))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nestora_order_email' and c.relkind='r'),
  'public_schema_access_denied',not has_schema_privilege('anon','nestora_order_email','USAGE')
    and not has_schema_privilege('authenticated','nestora_order_email','USAGE'),
  'sandbox_constraints',(select jsonb_agg(pg_get_constraintdef(oid)) from pg_constraint
    where connamespace='nestora_order_email'::regnamespace and contype='c'),
  'notification_unchanged',md5(pg_get_functiondef('public.notify_admin_new_order_from_address()'::regprocedure))='df3a0db3ce2c4d0d08279a19dd4b592c',
  'checkout_unchanged',md5(pg_get_functiondef('public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text,uuid,text,numeric,uuid,uuid[],uuid[],uuid[])'::regprocedure))='c73b3999991c0b6bcf823f0d4db1a37c',
  'settings',(select jsonb_build_object('enabled',enabled,'send_enabled',send_enabled,'mode',mode,'cutoff',activation_cutoff,
    'fixed_allowlist',allowed_recipients=array['info@nestorahomelb.com']::text[],
    'currency',currency,'allow_unverified_customer_email',allow_unverified_customer_email,
    'max_hour',max_hour,'max_day',max_day,'max_inflight',max_inflight) from nestora_order_email.settings)
) as postchecks;
