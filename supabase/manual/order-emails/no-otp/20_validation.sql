-- Append inside the installation transaction, replacing its COMMIT with this file.
-- All fixture rows, stock changes, claims and pg_net work ROLL BACK. Never sends SMTP.
do $$
declare base public.orders%rowtype; target uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
  target2 uuid:=gen_random_uuid(); job jsonb; admin_job jsonb; customer_job jsonb; j uuid;
  original_cutoff timestamptz; before_count integer;
begin
  if current_user<>'postgres' then raise exception 'Owner required'; end if;
  select * into base from public.orders where id='91aa4822-0c0d-4f42-9575-f3d0cbfa294e';
  if not found or not exists(select 1 from public.order_shipping_addresses where order_id=base.id and lower(email)='info@nestorahomelb.com')
    then raise exception 'Owned retained activation fixture required'; end if;
  if exists(select 1 from nestora_order_email.deliveries where state in('pending','retry','processing','submitting'))
    then raise exception 'Wait for existing production work; do not consume unrelated jobs'; end if;
  select activation_cutoff into original_cutoff from nestora_order_email.settings;
  update nestora_order_email.settings set automatic_confirmations_enabled=true,
    automatic_confirmations_from=clock_timestamp()-interval '1 second';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.path','/rpc/place_customer_order',true);
  perform set_config('request.method','POST',true);
  perform set_config('request.headers','{"cf-connecting-ip":"198.51.100.12"}',true);
  insert into public.orders select (jsonb_populate_record(null::public.orders,to_jsonb(base)||jsonb_build_object(
    'id',target,'order_number','NOOTP-'||left(target::text,12),'user_id',null,
    'checkout_token',token,'created_at',clock_timestamp()))).*;
  insert into public.order_shipping_addresses select (jsonb_populate_record(null::public.order_shipping_addresses,
    to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'order_id',target))) .* from public.order_shipping_addresses a where order_id=base.id;
  insert into public.order_items select (jsonb_populate_record(null::public.order_items,
    to_jsonb(i)||jsonb_build_object('id',gen_random_uuid(),'order_id',target))) .* from public.order_items i where order_id=base.id;
  if not nestora_order_email.automatic_recipient_authorized(target,'info@nestorahomelb.com')
    or nestora_order_email.recipient_verified(target,'info@nestorahomelb.com')
    or nestora_order_email.automatic_recipient_authorized(base.id,'info@nestorahomelb.com')
    or nestora_order_email.recipient_authorized(target,'other@example.invalid') then
    raise exception 'Automatic release/privacy/forward-only recipient scope failed';
  end if;
  if not (nestora_order_email.snapshot(target)->>'automaticConfirmation')::boolean
    or (nestora_order_email.snapshot(target)->>'recipientVerified')::boolean then
    raise exception 'Automatic permission was incorrectly treated as verification';
  end if;
  if public.order_email_prepare(target)<>2 or public.order_email_prepare(target)<>0 then
    raise exception 'Two-job queue/replay deduplication failed'; end if;
  if public.order_email_verification_request(target,token,repeat('a',64),repeat('b',64))->>'verified'<>'true'
    or exists(select 1 from nestora_order_email.verification_reservations where order_id=target) then
    raise exception 'Legacy frontend compatibility sent a code or required OTP'; end if;
  if public.order_email_verification_request(target,gen_random_uuid(),repeat('a',64),repeat('b',64)) is not null then
    raise exception 'Legacy endpoint accepted a forged checkout capability'; end if;
  for before_count in 1..2 loop
    job:=public.order_email_claim(true);
    if job is null or job->>'orderId'<>target::text then raise exception 'Automatic job not claimed'; end if;
    if job->>'kind'='admin' then admin_job:=job; else customer_job:=job; end if;
    if public.order_email_start((job->>'id')::uuid,gen_random_uuid()) then raise exception 'Forged claim accepted'; end if;
    if not public.order_email_start((job->>'id')::uuid,(job->>'claimToken')::uuid) then raise exception 'Atomic start rejected'; end if;
    if not public.order_email_finish((job->>'id')::uuid,(job->>'claimToken')::uuid,
      case when job->>'kind'='admin' then 'accepted' else 'uncertain' end,
      case when job->>'kind'='admin' then 'SMTP_ACCEPTED' else 'SMTP_ACCEPTANCE_UNKNOWN' end) then
      raise exception 'Finish rejected'; end if;
  end loop;
  if admin_job is null or customer_job is null or public.order_email_claim(true) is not null
    or (select count(*) from nestora_order_email.deliveries where order_id=target)<>2 then
    raise exception 'Accepted/uncertain replay or recipient independence failed'; end if;
  perform nestora_order_email.recover();
  if (select count(*) from nestora_order_email.deliveries where order_id=target)<>2 then raise exception 'Recovery duplicated jobs'; end if;
  j:=(customer_job->>'id')::uuid;
  insert into nestora_order_email.reservations(job_id,attempt,recipient_hash,email_kind)
    values(j,2,md5('info@nestorahomelb.com'),'customer'),(j,3,md5('info@nestorahomelb.com'),'customer');
  if nestora_order_email.context_quota_available(target) then raise exception 'IP throttle bypass'; end if;
  if not nestora_order_email.context_quota_available(target,'admin') then raise exception 'Customer throttling suppressed independent admin quota'; end if;
  insert into nestora_order_email.reservations(job_id,attempt,recipient_hash,email_kind)
    values((admin_job->>'id')::uuid,2,md5('info@nestorahomelb.com'),'admin'),
      ((admin_job->>'id')::uuid,3,md5('info@nestorahomelb.com'),'admin');
  if nestora_order_email.context_quota_available(target,'admin') then raise exception 'Admin abuse throttle bypass'; end if;
  -- Account limit remains effective even across multiple IP buckets.
  update nestora_order_email.checkout_contexts set user_id=gen_random_uuid() where order_id=target;
  insert into nestora_order_email.checkout_contexts(order_id,user_id,checkout_fingerprint,ip_hash)
    select target2,user_id,repeat('a',32),repeat('b',64) from nestora_order_email.checkout_contexts where order_id=target;
  if nestora_order_email.context_quota_available(target2) then raise exception 'Account throttle bypass'; end if;
  update nestora_order_email.settings set max_hour=1;
  if nestora_order_email.quota_available() then raise exception 'Global hourly budget bypass'; end if;
  update nestora_order_email.settings set max_hour=10,max_day=1;
  if nestora_order_email.quota_available() then raise exception 'Global rolling daily budget bypass'; end if;
  update nestora_order_email.settings set max_day=60,automatic_confirmations_enabled=false;
  if nestora_order_email.automatic_recipient_authorized(target,'info@nestorahomelb.com') then raise exception 'Automatic kill switch failed'; end if;
  if (select activation_cutoff from nestora_order_email.settings) is distinct from original_cutoff then raise exception 'Activation cutoff changed'; end if;
  if has_function_privilege('anon','public.order_email_claim(boolean)','execute')
    or has_function_privilege('authenticated','public.order_email_prepare(uuid)','execute')
    or has_function_privilege('service_role','nestora_order_email.automatic_recipient_authorized(uuid,text)','execute')
    or has_table_privilege('anon','nestora_order_email.checkout_contexts','select') then raise exception 'Private ACL weakened'; end if;
end $$;
select 'PASS: no-OTP release, private minimal-receipt flag, legacy UI compatibility, exact recipient/capability binding, two unique jobs, claim fencing, accepted/uncertain replay prevention, bounded recovery, IP/account/global quotas, kill switch, original cutoff and ACLs; ROLLED BACK' as result;
rollback;
