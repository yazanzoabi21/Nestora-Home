-- Owner-only diagnostics. No email addresses, order payloads, secrets or message contents.
select jsonb_build_object(
  'gates',(select jsonb_build_object('enabled',enabled,'send_enabled',send_enabled,'mode',mode)
    from nestora_order_email.settings),
  'enrolled_orders',(select count(*) from nestora_order_email.sandbox_orders),
  'live_order_permits',(select count(*) from nestora_order_email.sandbox_orders where send_until>now()),
  'jobs_by_state',(select jsonb_object_agg(state,n) from (
    select state,count(*) n from nestora_order_email.deliveries group by state) x),
  'oldest_unresolved_signal',(select min(created_at) from nestora_order_email.signals where resolved_at is null),
  'oldest_due_delivery',(select min(next_attempt_at) from nestora_order_email.deliveries where state in ('pending','retry')),
  'uncertain_jobs',(select count(*) from nestora_order_email.deliveries where state='uncertain'),
  'quota_reservations_hour',(select count(*) from nestora_order_email.reservations where created_at>now()-interval '1 hour'),
  'recent_failure_codes',(select jsonb_object_agg(last_code,n) from (
    select last_code,count(*) n from nestora_order_email.deliveries where updated_at>now()-interval '1 day'
      and last_code is not null and state<>'accepted' group by last_code) x)
) as operations;
