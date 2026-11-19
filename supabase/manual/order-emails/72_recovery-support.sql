-- Forward-only recovery hardening. Sending stays disabled until the activation checks pass.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or exists(select 1 from nestora_order_email.settings where enabled or send_enabled)
    then raise exception 'Owner and disabled gates required'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.order_email_finish(p_id uuid, p_claim uuid, p_state text, p_code text, p_message_id text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_state is null or p_code is null or p_state not in ('captured','accepted','retry','failed','uncertain') or p_code !~ '^[A-Z0-9_]{1,40}$'
    or length(coalesce(p_message_id,''))>255 or length(coalesce(p_reference,''))>120
    then raise exception 'Invalid delivery outcome'; end if;
  update nestora_order_email.deliveries set
    state=case when p_state='retry' and attempts>=5 then 'failed' else p_state end,
    captured_at=case when p_state='captured' then now() else captured_at end,
    capture_fingerprint=case when p_state='captured' then md5(snapshot::text) else capture_fingerprint end,
    next_attempt_at=case when p_code='SMTP_QUOTA_REJECTED' then now()+interval '24 hours' else now()+make_interval(secs=>least(3600,60*power(2,greatest(0,attempts-1)))::integer) end,
    last_code=p_code,message_id=p_message_id,smtp_reference=p_reference,updated_at=now()
  where id=p_id and claim_token=p_claim and (
    (state='processing' and p_state in ('retry','failed')) or
    (state='processing' and claim_mode='capture' and p_state='captured'
      and lease_until>now() and nestora_order_email.sandbox_approved(order_id)) or
    (state in ('submitting','uncertain') and p_state in ('accepted','retry','failed','uncertain')));
  return found;
end $function$
;

create index orders_email_recovery_created_idx on public.orders(created_at,id) where checkout_token is not null;
create function nestora_order_email.recover() returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype;
begin
  select * into s from nestora_order_email.settings where singleton;
  if s.enabled and s.mode='production' then
    -- Recover a failed transaction-local queue insert without scanning pre-activation orders.
    -- Index-supported, at most 50 inserts per run; delivery tombstones remain authoritative.
    insert into nestora_order_email.signals(order_id)
      select o.id from public.orders o where o.created_at>=s.activation_cutoff
        and o.created_at>now()-interval '7 days' and o.checkout_token is not null
        and not exists(select 1 from nestora_order_email.signals q where q.order_id=o.id)
        and not exists(select 1 from nestora_order_email.deliveries j where j.order_id=o.id)
      order by o.created_at,o.id limit 50 on conflict do nothing;
  end if;
  perform nestora_order_email.wake(null);
end $$;
revoke all on function nestora_order_email.recover() from public,anon,authenticated,service_role;
revoke all on function public.order_email_finish(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.order_email_finish(uuid,uuid,text,text,text,text) to service_role;
commit;

