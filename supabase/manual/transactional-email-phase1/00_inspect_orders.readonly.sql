-- READ ONLY: catalog metadata, no customer rows or secret-store values.
-- Run as an authorized DBA in SQL Editor. No schema, policy, grant or business changes.
-- Function/trigger definitions CAN contain pre-existing embedded credentials.
-- Review/redact credential literals locally before sharing the export; do not commit it.
with target_tables as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity,
    c.relacl, pg_get_userbyid(c.relowner) as owner
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (
    'orders', 'order_items', 'order_shipping_addresses', 'payment_transactions',
    'payment_methods', 'profiles', 'notifications', 'customer_notification_preferences'
  ) and c.relkind in ('r', 'p')
), target_triggers as (
  select t.* from pg_catalog.pg_trigger t
  where not t.tgisinternal and t.tgrelid in (select oid from target_tables)
), target_functions as (
  select p.*, n.nspname from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f' and ((n.nspname = 'public' and (
    p.proname like 'place_customer_order%' or p.proname like 'notify_admin_new_order%'
  )) or p.oid in (select tgfoid from target_triggers))
)
select jsonb_build_object(
  'captured_at', now(), 'current_user', current_user, 'database', current_database(),
  'tables', (select jsonb_agg(to_jsonb(t)) from target_tables t),
  'columns', (select jsonb_agg(to_jsonb(c)) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in (select relname from target_tables)),
  'constraints', (select jsonb_agg(jsonb_build_object('table', c.conrelid::regclass::text,
    'name', c.conname, 'definition', pg_get_constraintdef(c.oid)))
    from pg_catalog.pg_constraint c where c.conrelid in (select oid from target_tables)),
  'indexes', (select jsonb_agg(to_jsonb(i)) from pg_catalog.pg_indexes i
    where i.schemaname = 'public' and i.tablename in (select relname from target_tables)),
  'triggers', (select jsonb_agg(jsonb_build_object('table', t.tgrelid::regclass::text,
    'name', t.tgname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid))) from target_triggers t),
  'functions', (select jsonb_agg(jsonb_build_object('name', p.nspname || '.' || p.proname,
    'signature', pg_get_function_identity_arguments(p.oid), 'owner', pg_get_userbyid(p.proowner),
    'security_definer', p.prosecdef, 'settings', p.proconfig, 'acl', p.proacl,
    'definition', pg_get_functiondef(p.oid)))
    from target_functions p),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename in (select relname from target_tables)),
  'table_privileges', (select jsonb_agg(jsonb_build_object('role', r.rolname, 'table', t.relname,
    'select', has_table_privilege(r.oid, t.oid, 'SELECT'),
    'insert', has_table_privilege(r.oid, t.oid, 'INSERT'),
    'update', has_table_privilege(r.oid, t.oid, 'UPDATE'),
    'delete', has_table_privilege(r.oid, t.oid, 'DELETE'),
    'bypassrls', r.rolbypassrls)) from target_tables t cross join pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')),
  'function_privileges', (select jsonb_agg(jsonb_build_object('role', r.rolname,
    'function', p.oid::regprocedure::text, 'execute', has_function_privilege(r.oid, p.oid, 'EXECUTE')))
    from target_functions p cross join pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')),
  'column_grants', (select jsonb_agg(to_jsonb(g)) from information_schema.column_privileges g
    where g.table_schema = 'public' and g.table_name in (select relname from target_tables)),
  'role_memberships', (select jsonb_agg(jsonb_build_object('member', m.rolname, 'role', r.rolname))
    from pg_catalog.pg_auth_members a join pg_catalog.pg_roles m on m.oid = a.member
    join pg_catalog.pg_roles r on r.oid = a.roleid
    where m.rolname in ('anon', 'authenticated', 'service_role', 'authenticator')),
  'extensions', (select jsonb_agg(jsonb_build_object('name', e.extname, 'version', e.extversion))
    from pg_catalog.pg_extension e where e.extname in ('pg_net', 'pg_cron', 'supabase_vault'))
) as order_email_metadata;
