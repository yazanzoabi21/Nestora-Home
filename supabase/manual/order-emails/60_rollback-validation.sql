-- OWNER-ONLY controlled rehearsal. Private-table writes are rolled back.
-- Requires paused DB/Edge gates and one explicitly approved, already captured order.
-- Never calls wake/net/SMTP or changes a business table. Do not remove ROLLBACK.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare target uuid:=nullif(current_setting('nestora.order_email_test_order_id',true),'')::uuid;
  job uuid; claim jsonb; nonce uuid:=gen_random_uuid(); count_before bigint; rejected boolean;
begin
  if current_user<>'postgres' or target is null then raise exception 'Owner and approved test ID required'; end if;
  if exists(select 1 from nestora_order_email.settings where enabled or send_enabled) then
    raise exception 'Pause before transactional validation'; end if;
  if not exists(select 1 from nestora_order_email.sandbox_orders where order_id=target)
    or (select count(*) from nestora_order_email.deliveries where order_id=target)<>2
    or exists(select 1 from nestora_order_email.deliveries where order_id<>target) then
    raise exception 'Expected isolated two-job rehearsal required'; end if;
  if public.order_email_prepare(target)<>0 or public.order_email_claim(true) is not null then
    raise exception 'Disabled gates permitted work'; end if;

  -- Replay and body-hash binding are tested using a nonce that is never committed.
  insert into nestora_order_email.wake_nonces(nonce,body_hash,expires_at)
    values(nonce,repeat('a',64),clock_timestamp()+interval '5 minutes');
  if public.order_email_consume_wake(nonce,repeat('b',64))
    or not public.order_email_consume_wake(nonce,repeat('a',64))
    or public.order_email_consume_wake(nonce,repeat('a',64)) then
    raise exception 'Nonce binding/replay guard failed'; end if;

  -- This enabled value is transaction-local MVCC state; no other session sees it.
  update nestora_order_email.settings set enabled=true,send_enabled=false;
  count_before:=(select count(*) from nestora_order_email.deliveries);
  update nestora_order_email.signals set resolved_at=null where order_id=target;
  perform public.order_email_prepare(target);
  update nestora_order_email.signals set resolved_at=null where order_id=target;
  perform public.order_email_prepare(target);
  if (select count(*) from nestora_order_email.deliveries)<>count_before
    or public.order_email_claim(true) is not null then
    raise exception 'Accepted jobs replayed or duplicated'; end if;

  rejected:=false;
  begin perform public.order_email_sandbox_authorize(target,true);
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Attempted jobs were reauthorized'; end if;
  rejected:=false;
  begin perform public.order_email_sandbox_authorize(gen_random_uuid(),false);
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Nonexistent order enrolled'; end if;
  rejected:=false;
  begin update nestora_order_email.settings set allowed_recipients=array['forbidden@example.invalid'];
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Allowlist constraint failed'; end if;
  rejected:=false;
  begin update nestora_order_email.deliveries set recipient='forbidden@example.invalid' where order_id=target;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Delivery recipient constraint failed'; end if;

  select id into strict job from nestora_order_email.deliveries where order_id=target and email_kind='customer';
  update nestora_order_email.deliveries set state='pending',captured_at=null,captures=0,
    attempts=0,next_attempt_at=now(),claim_token=null,lease_until=null where id=job;
  claim:=public.order_email_claim(false);
  if claim is null or claim->>'deliveryMode'<>'capture' or (claim->>'id')::uuid<>job then
    raise exception 'Capture claim failed'; end if;
  if public.order_email_finish(job,gen_random_uuid(),'captured','STALE_CLAIM') then
    raise exception 'Stale claim accepted'; end if;
  if public.order_email_start(job,(claim->>'claimToken')::uuid) then
    raise exception 'Sending started with send gate disabled'; end if;
  if not public.order_email_finish(job,(claim->>'claimToken')::uuid,'captured','ROLLBACK_CAPTURE')
    or (select attempts from nestora_order_email.deliveries where id=job)<>0 then
    raise exception 'Capture consumed a send attempt'; end if;

  -- Known unsubmitted crashed processing retries; crashed submission stays uncertain.
  update nestora_order_email.deliveries set state='processing',claim_mode='send',attempts=1,
    lease_until=now()-interval '1 second' where id=job;
  perform public.order_email_prepare(null);
  if (select state from nestora_order_email.deliveries where id=job)<>'retry' then
    raise exception 'Unsubmitted recovery failed'; end if;
  update nestora_order_email.deliveries set state='submitting',lease_until=now()-interval '1 second' where id=job;
  perform public.order_email_prepare(null);
  if (select state from nestora_order_email.deliveries where id=job)<>'uncertain'
    or public.order_email_claim(true) is not null then
    raise exception 'Ambiguous acceptance could replay'; end if;
  update nestora_order_email.deliveries set state='processing',attempts=5,lease_until=now()-interval '1 second' where id=job;
  perform public.order_email_prepare(null);
  if (select state from nestora_order_email.deliveries where id=job)<>'failed' then
    raise exception 'Recovery attempt bound failed'; end if;
end $$;
rollback;
select 'PASS: paused gates, nonce/hash/replay, duplicate preparation, accepted tombstones, enrollment/recipient guards, capture, fencing and bounded recovery; all private writes rolled back' as result;
