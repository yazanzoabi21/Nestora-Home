-- PROPOSAL ONLY: start CAPTURE, not SMTP. Requires explicit installation/capture approval.
begin;
do $$ begin
  if current_user<>'postgres' or current_setting('nestora.order_email_activation_approved',true) is distinct from 'yes'
    then raise exception 'Explicit capture approval required'; end if;
  if not exists(select 1 from nestora_order_email.settings where singleton and not enabled and not send_enabled)
    then raise exception 'Both database gates must be disabled'; end if;
  if exists(select 1 from nestora_order_email.deliveries where state in ('processing','submitting'))
    then raise exception 'Reconcile existing leases first'; end if;
end $$;
update nestora_order_email.settings set enabled=true,send_enabled=false,
  activation_cutoff=clock_timestamp(),mode='sandbox',
  allowed_recipients=array['info@nestorahomelb.com'],currency='USD',
  allow_unverified_customer_email=false,max_hour=2,max_day=2,max_inflight=2,
  worker_url='https://ojismppptyrivnxnkcux.supabase.co/functions/v1/order-email-worker'
where singleton and not enabled;
update nestora_order_email.sandbox_orders set send_until=null;
commit;
-- USD was verified from the deployed checkout/defaults. Record this NEW cutoff.
-- ORDER_EMAIL_SEND_ENABLED stays false; no public order is automatically enrolled.
