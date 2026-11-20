begin;
set local lock_timeout='5s';
update nestora_order_email.settings set automatic_confirmations_enabled=false;
drop trigger if exists trg_order_email_checkout_context on public.orders;
CREATE OR REPLACE FUNCTION public.order_email_claim(p_allow_send boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare s nestora_order_email.settings%rowtype; j nestora_order_email.deliveries%rowtype; h text;
begin
  select * into s from nestora_order_email.settings where singleton for update;
  if not found or not s.enabled then return null; end if;
  if s.mode='sandbox' then return nestora_order_email.sandbox_claim(p_allow_send); end if;
  if not p_allow_send or not s.send_enabled or not nestora_order_email.quota_available() then return null; end if;
  if (select count(*) from nestora_order_email.deliveries where state in ('processing','submitting') and lease_until>now())>=s.max_inflight
    then return null; end if;
  select * into j from nestora_order_email.deliveries where state in ('pending','retry') and attempts<5 and next_attempt_at<=now()
    and created_at>=s.activation_cutoff order by next_attempt_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  if not nestora_order_email.production_job_authorized(j.id) then
    update nestora_order_email.deliveries set state='blocked',last_code='ORDER_UNAVAILABLE',updated_at=now() where id=j.id;
    return null;
  end if;
  h:=md5(j.recipient);
  if j.email_kind='customer' and (
    (select count(*) from nestora_order_email.reservations where recipient_hash=h and email_kind='customer' and created_at>now()-interval '1 hour')>=s.customer_hour or
    (select count(*) from nestora_order_email.reservations where recipient_hash=h and email_kind='customer' and created_at>now()-interval '1 day')>=s.customer_day) then
    update nestora_order_email.deliveries set next_attempt_at=now()+interval '15 minutes' where id=j.id;
    return null;
  end if;
  update nestora_order_email.deliveries set state='processing',attempts=attempts+1,claim_mode='send',claim_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now() where id=j.id returning * into j;
  insert into nestora_order_email.reservations(job_id,attempt,recipient_hash,email_kind) values(j.id,j.attempts,h,j.email_kind);
  return jsonb_build_object('id',j.id,'orderId',j.order_id,'kind',j.email_kind,'recipient',j.recipient,'snapshot',j.snapshot,
    'claimToken',j.claim_token,'attempt',j.attempts,'sandbox',false,'deliveryMode','send');
end $function$
;
CREATE OR REPLACE FUNCTION nestora_order_email.recipient_authorized(p_order_id uuid, p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select nestora_order_email.valid_mailbox(p_email) and exists(
    select 1 from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
    where o.id=p_order_id and lower(btrim(a.email))=p_email and (
      exists(select 1 from auth.users u where u.id=o.user_id and lower(btrim(u.email))=p_email and u.email_confirmed_at is not null)
      or exists(select 1 from nestora_order_email.verifications v where v.order_id=o.id
        and v.recipient=p_email and v.verified_at is not null)));
$function$
;
CREATE OR REPLACE FUNCTION nestora_order_email.snapshot(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select data || jsonb_build_object('email',lower(btrim(data->>'email')),
    'recipientVerified',nestora_order_email.recipient_authorized(p_order_id,lower(btrim(data->>'email'))))
  from (select nestora_order_email.snapshot_v5(p_order_id) as data) s where data is not null;
$function$
;
CREATE OR REPLACE FUNCTION nestora_order_email.production_job_authorized(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select exists(select 1 from nestora_order_email.deliveries j cross join nestora_order_email.settings s
    where j.id=p_id and s.mode='production' and s.enabled and s.send_enabled and j.created_at>=s.activation_cutoff
      and nestora_order_email.eligible(j.order_id) and j.snapshot->>'currency'='USD'
      and (j.snapshot-'recipientVerified')=(nestora_order_email.snapshot(j.order_id)-'recipientVerified')
      and ((j.email_kind='admin' and j.recipient='info@nestorahomelb.com') or
        (j.email_kind='customer' and j.recipient=j.snapshot->>'email'
          and nestora_order_email.recipient_authorized(j.order_id,j.recipient))));
$function$
;
CREATE OR REPLACE FUNCTION nestora_order_email.on_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if exists(select 1 from nestora_order_email.settings where enabled and new.created_at>=activation_cutoff) then
    insert into nestora_order_email.signals(order_id) values(new.id) on conflict do nothing;
    perform nestora_order_email.wake(new.id);
  end if;
  return new;
exception when others then
  raise log 'ORDER_EMAIL_SIGNAL_FAILED';
  return new;
end $function$
;
update nestora_order_email.deliveries set snapshot=snapshot-'automaticConfirmation'
  where state in('pending','retry','processing','submitting')
    and (email_kind='admin' or coalesce((snapshot->>'recipientVerified')::boolean,false));
update nestora_order_email.deliveries set state='blocked',last_code='AUTOMATIC_ROLLED_BACK',updated_at=now()
  where email_kind='customer' and state='pending' and attempts=0
    and coalesce((snapshot->>'automaticConfirmation')::boolean,false)
    and not coalesce((snapshot->>'recipientVerified')::boolean,false);
-- Retain the private context table and new columns for audit/redeployment. No accepted/uncertain rows reset.
notify pgrst,'reload schema';
commit;
