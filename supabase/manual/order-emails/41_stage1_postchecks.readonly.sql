-- AFTER Stage 1 installation only. No function invocation, HTTP or scheduling.
select jsonb_build_object(
  'both_database_gates_disabled',(select not enabled and not send_enabled from nestora_order_email.settings where singleton),
  'no_capture_cutoff',(select activation_cutoff is null from nestora_order_email.settings where singleton),
  'no_email_trigger',not exists(select 1 from pg_trigger where tgname='trg_order_email_signal'),
  'no_recovery_job',not exists(select 1 from cron.job where jobname='nestora-order-email-recovery'),
  'no_business_foreign_keys',not exists(select 1 from pg_constraint c
    join pg_namespace n on n.oid=c.connamespace where n.nspname='nestora_order_email'
      and c.contype='f' and c.confrelid='public.orders'::regclass),
  'no_deliveries',not exists(select 1 from nestora_order_email.deliveries),
  'no_signals',not exists(select 1 from nestora_order_email.signals),
  'no_order_permits',not exists(select 1 from nestora_order_email.sandbox_orders),
  'no_smtp_attempts',not exists(select 1 from nestora_order_email.reservations)
) as stage1_safety;
