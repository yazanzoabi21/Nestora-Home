-- Catalog-only pre-installation review. No customer rows, cron commands or secrets.
select jsonb_build_object(
  'checked_at',clock_timestamp(),'current_role',current_user,
  'available_extensions',(select jsonb_agg(jsonb_build_object('name',name,'default_version',default_version,
    'installed_version',installed_version)) from pg_available_extensions where name in ('pg_net','pg_cron','supabase_vault')),
  'cron_preload_present',position('pg_cron' in current_setting('shared_preload_libraries',true))>0,
  'schemas',(select jsonb_agg(nspname) from pg_namespace where nspname in ('nestora_order_email','net','cron','vault')),
  'public_rpc_name_conflicts',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('order_email_consume_wake','order_email_sandbox_authorize','order_email_prepare',
      'order_email_claim','order_email_start','order_email_finish')),
  'sandbox_trigger_conflicts',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,
    'name',tgname,'enabled',tgenabled)) from pg_trigger where tgname='trg_order_email_signal'),
  'cron_job_relation_present',to_regclass('cron.job') is not null,
  'notification_trigger_enabled',(select tgenabled<>'D' from pg_trigger where
    tgname='trg_notify_admin_new_order_from_address' and tgrelid='public.order_shipping_addresses'::regclass),
  'protected_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
    'force_rls',c.relforcerowsecurity,'acl',c.relacl::text)) from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
      and c.relname in ('orders','order_items','order_shipping_addresses','payment_transactions')),
  'protected_policy_fingerprint',(select md5(coalesce(string_agg(concat_ws('|',tablename,policyname,
    roles::text,cmd,qual,with_check),E'\n' order by tablename,policyname),'')) from pg_policies
    where schemaname='public' and tablename in ('orders','order_items','order_shipping_addresses','payment_transactions')),
  'protected_routine_fingerprints',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'definition_md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and (p.proname like 'place_customer_order%' or p.proname in
        ('notify_admin_new_order_from_address','current_user_is_admin','is_nestora_admin'))),
  'api_schema_create',(select jsonb_agg(jsonb_build_object('role',r.name,
    'can_create_public',has_schema_privilege(r.name,'public','CREATE')))
    from (values('anon'),('authenticated'),('service_role')) r(name)),
  'postgres_default_acls',(select jsonb_agg(jsonb_build_object('schema',n.nspname,
    'object_type',d.defaclobjtype,'acl',d.defaclacl::text)) from pg_default_acl d
    left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole='postgres'::regrole
      and (d.defaclnamespace=0 or n.nspname='public')),
  'order_foreign_keys',(select jsonb_agg(jsonb_build_object('name',conname,'table',conrelid::regclass::text))
    from pg_constraint where contype='f' and confrelid='public.orders'::regclass)
) as installation_review;
