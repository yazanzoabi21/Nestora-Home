-- Execute only after compatible worker source read-back, rollback and security tests.
-- A separate forward-only boundary prevents releasing ANY already-existing order.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or not exists(select 1 from nestora_order_email.settings
    where enabled and send_enabled and mode='production' and max_hour=10 and max_day=60
      and not automatic_confirmations_enabled and automatic_confirmations_from is null
      and activation_cutoff='2026-11-19T20:31:14.206817Z'::timestamptz)
    or not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
      and tgname='trg_order_email_checkout_context' and tgenabled='O') then
    raise exception 'Reviewed installation and unchanged original cutoff required';
  end if;
end $$;
update nestora_order_email.settings set automatic_confirmations_enabled=true,
  automatic_confirmations_from=clock_timestamp();
select jsonb_build_object('automatic_enabled',automatic_confirmations_enabled,
  'automatic_from',automatic_confirmations_from,'original_cutoff',activation_cutoff,
  'admin_enabled',enabled and send_enabled,'hour',max_hour,'day',max_day) as activation
  from nestora_order_email.settings;
commit;
