-- Scoped, backend-first installation. Does NOT enable automatic confirmations.
-- Original activation cutoff, checkout RPCs, dashboard trigger and send gates are untouched.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' then raise exception 'Trusted owner required'; end if;
  if exists(select 1 from nestora_order_email.settings where mode<>'production' or max_day<>60 or max_hour<>10)
    or md5(pg_get_functiondef('public.order_email_claim(boolean)'::regprocedure))<>'79fc559c36e086c7401e9f260d1412aa'
    or md5(pg_get_functiondef('nestora_order_email.on_order_insert()'::regprocedure))<>'b36353bdc043c2fca733769a3185eef7'
    or md5(pg_get_functiondef('nestora_order_email.recipient_authorized(uuid,text)'::regprocedure))<>'a808d63a7d270239f6ea3161d678c66a'
    or md5(pg_get_functiondef('nestora_order_email.snapshot(uuid)'::regprocedure))<>'5a15cbd725ff894b130b3c37d9739a34'
    or md5(pg_get_functiondef('nestora_order_email.production_job_authorized(uuid)'::regprocedure))<>'bfe62e9cf9add12bae386d49a3f55335'
  then raise exception 'Baseline drift; do not apply'; end if;
end $$;

alter table nestora_order_email.settings
  add column automatic_confirmations_enabled boolean not null default false,
  add column automatic_confirmations_from timestamptz,
  add column automatic_ip_salt text not null default encode(extensions.gen_random_bytes(32),'hex');
create table nestora_order_email.checkout_contexts (
  order_id uuid primary key,
  user_id uuid,
  checkout_fingerprint text not null check(checkout_fingerprint ~ '^[a-f0-9]{32}$'),
  ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index checkout_contexts_ip on nestora_order_email.checkout_contexts(ip_hash,created_at);
create index checkout_contexts_user on nestora_order_email.checkout_contexts(user_id,created_at) where user_id is not null;
alter table nestora_order_email.checkout_contexts enable row level security;
revoke all on nestora_order_email.checkout_contexts from public,anon,authenticated,service_role;

-- Verification remains a PRIVACY fact, separate from permission to send a minimal receipt.
create function nestora_order_email.recipient_verified(p_order_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select nestora_order_email.valid_mailbox(p_email) and exists(
    select 1 from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
    where o.id=p_order_id and lower(btrim(a.email))=p_email and (
      exists(select 1 from auth.users u where u.id=o.user_id and lower(btrim(u.email))=p_email and u.email_confirmed_at is not null)
      or exists(select 1 from nestora_order_email.verifications v where v.order_id=o.id
        and v.recipient=p_email and v.verified_at is not null)));
$$;
create function nestora_order_email.automatic_recipient_authorized(p_order_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select nestora_order_email.valid_mailbox(p_email) and exists(
    select 1 from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
      join nestora_order_email.checkout_contexts c on c.order_id=o.id
      cross join nestora_order_email.settings s
    where o.id=p_order_id and s.mode='production' and s.automatic_confirmations_enabled
      and o.created_at>=s.activation_cutoff and o.created_at>=s.automatic_confirmations_from
      and c.created_at>=s.automatic_confirmations_from
      and c.user_id is not distinct from o.user_id
      and c.checkout_fingerprint=md5(o.checkout_token::text)
      and lower(btrim(a.email))=p_email and nestora_order_email.eligible(o.id));
$$;
create or replace function nestora_order_email.recipient_authorized(p_order_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select nestora_order_email.recipient_verified(p_order_id,p_email)
    or nestora_order_email.automatic_recipient_authorized(p_order_id,p_email);
$$;
create or replace function nestora_order_email.snapshot(p_order_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select data || jsonb_build_object('email',lower(btrim(data->>'email')),
    'recipientVerified',nestora_order_email.recipient_verified(p_order_id,lower(btrim(data->>'email'))),
    'automaticConfirmation',nestora_order_email.automatic_recipient_authorized(p_order_id,lower(btrim(data->>'email'))))
  from (select nestora_order_email.snapshot_v5(p_order_id) data) s where data is not null;
$$;
create or replace function nestora_order_email.production_job_authorized(p_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from nestora_order_email.deliveries j cross join nestora_order_email.settings s
    where j.id=p_id and s.mode='production' and s.enabled and s.send_enabled and j.created_at>=s.activation_cutoff
      and nestora_order_email.eligible(j.order_id) and j.snapshot->>'currency'='USD'
      and (j.snapshot-'recipientVerified'-'automaticConfirmation')=
        (nestora_order_email.snapshot(j.order_id)-'recipientVerified'-'automaticConfirmation')
      and ((j.email_kind='admin' and j.recipient='info@nestorahomelb.com') or
        (j.email_kind='customer' and j.recipient=j.snapshot->>'email'
          and nestora_order_email.recipient_authorized(j.order_id,j.recipient))));
$$;

create function nestora_order_email.capture_checkout_context() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare h jsonb; ip inet; salt text;
begin
  -- Capture only actual, successful checkout transactions. This row rolls back with checkout.
  -- Cloudflare's ingress header was verified against forged headers before installation.
  -- Never trust X-Forwarded-For: the live spoof test demonstrated it is client-controlled.
  begin
    if new.checkout_token is not null and new.user_id is not distinct from auth.uid()
      and current_setting('request.path',true)='/rpc/place_customer_order'
      and current_setting('request.method',true)='POST'
      and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' in ('anon','authenticated') then
      select automatic_ip_salt into salt from nestora_order_email.settings
        where automatic_confirmations_enabled and new.created_at>=automatic_confirmations_from;
      if found then
        h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
        ip:=nullif(btrim(h->>'cf-connecting-ip'),'')::inet;
        if ip is not null then
          insert into nestora_order_email.checkout_contexts(order_id,user_id,checkout_fingerprint,ip_hash)
            values(new.id,new.user_id,md5(new.checkout_token::text),
              encode(extensions.hmac(host(ip),salt,'sha256'),'hex')) on conflict do nothing;
        end if;
      end if;
    end if;
  exception when others then
    -- Fail closed for automatic customer release, while preserving checkout and admin email.
    raise log 'ORDER_EMAIL_CONTEXT_FAILED';
  end;
  return new;
exception when others then
  raise log 'ORDER_EMAIL_CONTEXT_FAILED';
  return new;
end $$;
-- The existing checkout inserts the order first, then sets checkout_token in its
-- idempotency wrapper. Capture that UPDATE too; do not rewrite the checkout RPC.
create trigger trg_order_email_checkout_context
  after insert or update of checkout_token on public.orders
  for each row when(new.checkout_token is not null)
  execute function nestora_order_email.capture_checkout_context();

-- Shared settings-row lock in claim serializes all budgets. Count attempts, not successes.
-- Per-recipient limits remain 3/hour and 10/day. Add independent IP and account limits.
create function nestora_order_email.context_quota_available(p_order_id uuid,p_kind text default 'customer') returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select p_kind in ('admin','customer') and not exists(select 1 from nestora_order_email.checkout_contexts c where c.order_id=p_order_id and (
    (select count(*) from nestora_order_email.reservations r
      join nestora_order_email.deliveries d on d.id=r.job_id
      join nestora_order_email.checkout_contexts x on x.order_id=d.order_id
      where r.email_kind=p_kind and x.ip_hash=c.ip_hash and r.created_at>now()-interval '1 hour')>=3
    or (select count(*) from nestora_order_email.reservations r
      join nestora_order_email.deliveries d on d.id=r.job_id
      join nestora_order_email.checkout_contexts x on x.order_id=d.order_id
      where r.email_kind=p_kind and x.ip_hash=c.ip_hash and r.created_at>now()-interval '1 day')>=10
    or (c.user_id is not null and (
      (select count(*) from nestora_order_email.reservations r
        join nestora_order_email.deliveries d on d.id=r.job_id
        join nestora_order_email.checkout_contexts x on x.order_id=d.order_id
        where r.email_kind=p_kind and x.user_id=c.user_id and r.created_at>now()-interval '1 hour')>=3
      or (select count(*) from nestora_order_email.reservations r
        join nestora_order_email.deliveries d on d.id=r.job_id
        join nestora_order_email.checkout_contexts x on x.order_id=d.order_id
        where r.email_kind=p_kind and x.user_id=c.user_id and r.created_at>now()-interval '1 day')>=10))));
$$;
create or replace function public.order_email_claim(p_allow_send boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
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
  if (j.email_kind='customer' and (
    (select count(*) from nestora_order_email.reservations where recipient_hash=h and email_kind='customer' and created_at>now()-interval '1 hour')>=s.customer_hour or
    (select count(*) from nestora_order_email.reservations where recipient_hash=h and email_kind='customer' and created_at>now()-interval '1 day')>=s.customer_day))
    or not nestora_order_email.context_quota_available(j.order_id,j.email_kind) then
    update nestora_order_email.deliveries set next_attempt_at=now()+interval '15 minutes' where id=j.id;
    return null;
  end if;
  update nestora_order_email.deliveries set state='processing',attempts=attempts+1,claim_mode='send',claim_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now() where id=j.id returning * into j;
  insert into nestora_order_email.reservations(job_id,attempt,recipient_hash,email_kind) values(j.id,j.attempts,h,j.email_kind);
  return jsonb_build_object('id',j.id,'orderId',j.order_id,'kind',j.email_kind,'recipient',j.recipient,'snapshot',j.snapshot,
    'claimToken',j.claim_token,'attempt',j.attempts,'sandbox',false,'deliveryMode','send');
end $$;
revoke all on function nestora_order_email.recipient_verified(uuid,text),
  nestora_order_email.automatic_recipient_authorized(uuid,text),
  nestora_order_email.context_quota_available(uuid,text),
  nestora_order_email.capture_checkout_context() from public,anon,authenticated,service_role;
-- No API exposure, RLS weakening, historical requeue, cutoff change or send-gate change.
commit;
