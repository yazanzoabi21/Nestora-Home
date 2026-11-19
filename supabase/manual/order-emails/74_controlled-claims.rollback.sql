-- No SMTP. Only email-private state is changed, and every change is rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare target uuid:='26e79cb5-6f12-4bb1-ae35-08d095c73e97'; capability uuid; admin_job jsonb; customer_job jsonb; permit jsonb;
begin
  if exists(select 1 from nestora_order_email.settings where enabled or send_enabled)
    or not exists(select 1 from public.order_shipping_addresses where order_id=target and email='info@nestorahomelb.com')
    then raise exception 'Disabled gates and approved controlled order required'; end if;
  select checkout_token into capability from public.orders where id=target;
  update nestora_order_email.settings set enabled=true,send_enabled=true,mode='production',production_canary_order_id=target,
    activation_cutoff=(select created_at-interval '1 second' from public.orders where id=target),currency='USD';
  insert into nestora_order_email.signals(order_id) values(target) on conflict do nothing;
  if public.order_email_prepare(target)<>2 or public.order_email_prepare(target)<>0 then raise exception 'Prepare deduplication failed'; end if;
  if (select state<>'blocked' or last_code<>'RECIPIENT_UNVERIFIED' from nestora_order_email.deliveries where order_id=target and email_kind='customer')
    then raise exception 'Unverified guest confirmation released'; end if;
  admin_job:=public.order_email_claim(true);
  if admin_job->>'kind'<>'admin' or (admin_job->>'sandbox')::boolean or public.order_email_claim(true) is not null
    then raise exception 'Claim fencing or unverified recipient guard failed'; end if;
  if public.order_email_start((admin_job->>'id')::uuid,gen_random_uuid()) then raise exception 'Forged claim accepted'; end if;
  if not public.order_email_start((admin_job->>'id')::uuid,(admin_job->>'claimToken')::uuid) then raise exception 'Admin start rejected'; end if;
  if not public.order_email_finish((admin_job->>'id')::uuid,(admin_job->>'claimToken')::uuid,'accepted','SMTP_ACCEPTED',
    '<nestora-order-test@nestorahomelb.com>',null) then raise exception 'Admin acceptance rejected'; end if;
  permit:=public.order_email_verification_request(target,capability,repeat('a',64),repeat('b',64));
  if permit is null then raise exception 'Verification reservation failed'; end if;
  if not public.order_email_verification_confirm(target,capability,repeat('a',64)) then raise exception 'Guest verification failed'; end if;
  customer_job:=public.order_email_claim(true);
  if customer_job->>'kind'<>'customer' or not (customer_job->'snapshot'->>'recipientVerified')::boolean
    then raise exception 'Verified guest was not automatically released'; end if;
  if not public.order_email_start((customer_job->>'id')::uuid,(customer_job->>'claimToken')::uuid) then raise exception 'Customer start rejected'; end if;
  if not public.order_email_finish((customer_job->>'id')::uuid,(customer_job->>'claimToken')::uuid,'uncertain','SMTP_ACCEPTANCE_UNKNOWN')
    then raise exception 'Uncertain state rejected'; end if;
  perform public.order_email_prepare(target);
  if public.order_email_claim(true) is not null or (select count(*) from nestora_order_email.deliveries where order_id=target)<>2
    then raise exception 'Accepted or uncertain delivery replayed'; end if;
  update nestora_order_email.settings set enabled=false,send_enabled=false;
  if public.order_email_start((customer_job->>'id')::uuid,(customer_job->>'claimToken')::uuid) then raise exception 'Disable failed'; end if;
end $$;
select 'PASS: two unique jobs, verified-recipient release, atomic claims, claim fencing, accepted/uncertain replay protection, immediate disable; rolled back' as result;
rollback;
