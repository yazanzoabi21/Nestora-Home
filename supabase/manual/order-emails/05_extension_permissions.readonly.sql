-- Catalog/ACL reads only. Run after separately approved extension setup, before installation.
-- Never selects queue headers, Vault values or cron commands.
select jsonb_build_object(
  'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion))
    from pg_extension where extname in ('pg_net','pg_cron','supabase_vault')),
  'http_signatures',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'argument_names',p.proargnames)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='net' and p.proname='http_post'),
  'sensitive_relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
    'anon_any_read',has_any_column_privilege('anon',c.oid,'SELECT'),
    'authenticated_any_read',has_any_column_privilege('authenticated',c.oid,'SELECT')))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where
      (n.nspname='net' and c.relname='http_request_queue') or
      (n.nspname='vault' and c.relname='decrypted_secrets')),
  'cron_owner',(select jsonb_agg(jsonb_build_object('relation',c.relname,'owner',pg_get_userbyid(c.relowner)))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cron' and c.relname='job')
) as extension_security;
