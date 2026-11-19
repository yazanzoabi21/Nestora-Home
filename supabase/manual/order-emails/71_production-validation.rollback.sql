-- Owner-only: private email changes are rolled back; no SMTP or committed HTTP work.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare target uuid:='39bd4663-80ef-4486-9c03-055b3726bfed'; capability uuid;
  result jsonb; h text:=repeat('a',64); ip text:=repeat('b',64); i integer;
begin
  if current_user<>'postgres' or exists(select 1 from nestora_order_email.settings where enabled or send_enabled)
    then raise exception 'Owner and disabled gates required'; end if;
  if not exists(select 1 from public.order_shipping_addresses where order_id=target and lower(email)='info@nestorahomelb.com')
    then raise exception 'Approved business-mailbox rehearsal order required'; end if;
  select checkout_token into capability from public.orders where id=target;
  if capability is null then raise exception 'Checkout capability required'; end if;
  if public.order_email_verification_request(target,capability,h,ip) is not null
    or public.order_email_verification_confirm(target,capability,h)
    or public.order_email_claim(true) is not null then raise exception 'Disabled gate bypass'; end if;

  update nestora_order_email.settings set mode='production',enabled=true,send_enabled=true,
    activation_cutoff=(select created_at-interval '1 second' from public.orders where id=target),
    currency='USD',max_hour=20,max_day=40,quota_verified_at=now(),quota_evidence='ROLLBACK TEST ONLY';
  if public.order_email_verification_request(target,gen_random_uuid(),h,ip) is not null
    or public.order_email_verification_request(gen_random_uuid(),capability,h,ip) is not null
    then raise exception 'Order ownership bypass'; end if;
  result:=public.order_email_verification_request(target,capability,h,ip);
  if result->>'recipient'<>'info@nestorahomelb.com' then raise exception 'Verification permit missing'; end if;
  if public.order_email_verification_request(target,capability,h,ip) is not null then raise exception 'Resend cooldown bypass'; end if;
  for i in 1..5 loop
    if public.order_email_verification_confirm(target,capability,repeat('c',64)) then raise exception 'Wrong code accepted'; end if;
  end loop;
  if public.order_email_verification_confirm(target,capability,h) then raise exception 'Attempt limit bypass'; end if;
  update nestora_order_email.verifications set requested_at=now()-interval '61 seconds' where order_id=target;
  result:=public.order_email_verification_request(target,capability,h,ip);
  if result is null then raise exception 'Bounded resend rejected'; end if;
  update nestora_order_email.verifications set expires_at=now()-interval '1 second' where order_id=target;
  if public.order_email_verification_confirm(target,capability,h) then raise exception 'Expired code accepted'; end if;
  update nestora_order_email.verifications set expires_at=now()+interval '1 minute' where order_id=target;
  if not public.order_email_verification_confirm(target,capability,h) then raise exception 'Verification confirm failed'; end if;
  if not nestora_order_email.recipient_authorized(target,'info@nestorahomelb.com') then raise exception 'Verification did not authorize order'; end if;
  if public.order_email_verification_confirm(target,capability,h) then raise exception 'Verification replay accepted'; end if;
  if nestora_order_email.recipient_authorized(gen_random_uuid(),'info@nestorahomelb.com')
    or nestora_order_email.recipient_authorized(target,'other@example.invalid') then raise exception 'Authorization scope bypass'; end if;

  update nestora_order_email.settings set max_hour=2;
  if nestora_order_email.quota_available() then raise exception 'Verification attempts not included in quota'; end if;
  for i in 1..60 loop
    if not public.order_email_verification_guard(repeat('d',64)) then raise exception 'API throttle early'; end if;
  end loop;
  if public.order_email_verification_guard(repeat('d',64)) then raise exception 'API throttle bypass'; end if;
  update nestora_order_email.settings set activation_cutoff=now();
  if nestora_order_email.eligible(target) or public.order_email_verification_request(target,capability,h,ip) is not null
    then raise exception 'Historical cutoff bypass'; end if;
end $$;
select 'PASS: gates, order ownership, recipient binding, resend cooldown, attempt limit, expiry, one-use verification, shared quota, API throttle, historical cutoff; all changes rolled back' as result;
rollback;
