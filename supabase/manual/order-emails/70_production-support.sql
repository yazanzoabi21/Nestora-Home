-- Forward-only extension of the installed v5 ledger. Does not activate sending.
-- No checkout, dashboard, order data, historical scan, or existing RLS changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or exists(select 1 from nestora_order_email.settings where enabled or send_enabled)
    then raise exception 'Trusted owner and disabled gates required'; end if;
end $$;

alter table nestora_order_email.settings drop constraint settings_mode_check;
alter table nestora_order_email.settings add constraint settings_mode_check check(mode in ('sandbox','production'));
alter table nestora_order_email.settings add column quota_verified_at timestamptz;
alter table nestora_order_email.settings add column quota_evidence text;
-- Existing allow_unverified_customer_email=false constraint is deliberately retained.
create function nestora_order_email.valid_mailbox(value text) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select coalesce(length(value)<=254 and length(split_part(value,'@',1)) between 1 and 64
    and value ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~.-]+@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$'
    and value !~ '(^\.|\.\.|\.@|@-|\.-|-\.|@\.)',false);
$$;
alter table nestora_order_email.deliveries drop constraint deliveries_recipient_check;
alter table nestora_order_email.deliveries add constraint deliveries_recipient_check
  check(recipient is null or nestora_order_email.valid_mailbox(recipient));

create table nestora_order_email.verifications (
  order_id uuid primary key,
  recipient text not null check(nestora_order_email.valid_mailbox(recipient)),
  code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  failures integer not null default 0 check(failures between 0 and 5),
  verified_at timestamptz,
  requested_at timestamptz not null default now()
);
create table nestora_order_email.verification_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  recipient_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index verification_reservations_time on nestora_order_email.verification_reservations(created_at);
create index verification_reservations_order on nestora_order_email.verification_reservations(order_id,created_at);
create index verification_reservations_recipient on nestora_order_email.verification_reservations(recipient_hash,created_at);
create index verification_reservations_ip on nestora_order_email.verification_reservations(ip_hash,created_at);
alter table nestora_order_email.verifications enable row level security;
alter table nestora_order_email.verification_reservations enable row level security;
revoke all on nestora_order_email.verifications,nestora_order_email.verification_reservations from public,anon,authenticated,service_role;
create table nestora_order_email.verification_api_limits (
  ip_hash text primary key check(ip_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null default now(),
  requests integer not null default 0
);
alter table nestora_order_email.verification_api_limits enable row level security;
revoke all on nestora_order_email.verification_api_limits from public,anon,authenticated,service_role;
create function public.order_email_verification_guard(p_ip_hash text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare count_requests integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into nestora_order_email.verification_api_limits(ip_hash,requests) values(p_ip_hash,1)
  on conflict(ip_hash) do update set
    requests=case when verification_api_limits.window_start<now()-interval '1 hour' then 1 else verification_api_limits.requests+1 end,
    window_start=case when verification_api_limits.window_start<now()-interval '1 hour' then now() else verification_api_limits.window_start end
  returning requests into count_requests;
  return count_requests<=60;
end $$;

create function nestora_order_email.recipient_authorized(p_order_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select nestora_order_email.valid_mailbox(p_email) and exists(
    select 1 from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
    where o.id=p_order_id and lower(btrim(a.email))=p_email and (
      exists(select 1 from auth.users u where u.id=o.user_id and lower(btrim(u.email))=p_email and u.email_confirmed_at is not null)
      or exists(select 1 from nestora_order_email.verifications v where v.order_id=o.id
        and v.recipient=p_email and v.verified_at is not null)));
$$;
alter function nestora_order_email.snapshot(uuid) rename to snapshot_v5;
create function nestora_order_email.snapshot(p_order_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select data || jsonb_build_object('email',lower(btrim(data->>'email')),
    'recipientVerified',nestora_order_email.recipient_authorized(p_order_id,lower(btrim(data->>'email'))))
  from (select nestora_order_email.snapshot_v5(p_order_id) as data) s where data is not null;
$$;

-- Global reservations serialize on the same settings row for both workers.
-- Every SMTP attempt counts, including failed/ambiguous attempts and verification codes.
create function nestora_order_email.quota_available() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select s.quota_verified_at is not null and s.quota_evidence is not null
    and ((select count(*) from nestora_order_email.reservations where created_at>now()-interval '1 hour')+
      (select count(*) from nestora_order_email.verification_reservations where created_at>now()-interval '1 hour'))<s.max_hour
    and ((select count(*) from nestora_order_email.reservations where created_at>now()-interval '1 day')+
      (select count(*) from nestora_order_email.verification_reservations where created_at>now()-interval '1 day'))<s.max_day
  from nestora_order_email.settings s where singleton;
$$;

create function public.order_email_verification_request(p_order_id uuid,p_checkout_token uuid,p_code_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype; target text; h text;
begin
  select * into s from nestora_order_email.settings where singleton for update;
  if not s.enabled or not s.send_enabled or s.mode<>'production' or p_code_hash is null or p_ip_hash is null
    or p_code_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  select lower(btrim(a.email)) into target from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
    where o.id=p_order_id and o.checkout_token=p_checkout_token and o.created_at>=s.activation_cutoff
      and o.created_at>now()-interval '1 day' and nestora_order_email.eligible(o.id);
  if target is null or not nestora_order_email.valid_mailbox(target) then return null; end if;
  if nestora_order_email.recipient_authorized(p_order_id,target) then return jsonb_build_object('verified',true); end if;
  h:=md5(target);
  if not nestora_order_email.quota_available()
    or exists(select 1 from nestora_order_email.verifications where order_id=p_order_id and requested_at>now()-interval '60 seconds')
    or (select count(*) from nestora_order_email.verification_reservations where order_id=p_order_id and created_at>now()-interval '1 day')>=3
    or (select count(*) from nestora_order_email.verification_reservations where recipient_hash=h and created_at>now()-interval '1 hour')>=3
    or (select count(*) from nestora_order_email.verification_reservations where recipient_hash=h and created_at>now()-interval '1 day')>=5
    or (select count(*) from nestora_order_email.verification_reservations where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=10
    or (select count(*) from nestora_order_email.verification_reservations where ip_hash=p_ip_hash and created_at>now()-interval '1 day')>=30
    then return null; end if;
  insert into nestora_order_email.verifications(order_id,recipient,code_hash,expires_at)
    values(p_order_id,target,p_code_hash,now()+interval '10 minutes')
    on conflict(order_id) do update set recipient=excluded.recipient,code_hash=excluded.code_hash,
      expires_at=excluded.expires_at,requested_at=now(),failures=0,verified_at=null;
  insert into nestora_order_email.verification_reservations(order_id,recipient_hash,ip_hash) values(p_order_id,h,p_ip_hash);
  return jsonb_build_object('recipient',target,'verified',false);
end $$;

create function public.order_email_verification_confirm(p_order_id uuid,p_checkout_token uuid,p_code_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype; v nestora_order_email.verifications%rowtype;
begin
  select * into s from nestora_order_email.settings where singleton for update;
  if not s.enabled or not s.send_enabled or s.mode<>'production' then return false; end if;
  if not exists(select 1 from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
    where o.id=p_order_id and o.checkout_token=p_checkout_token and o.created_at>=s.activation_cutoff
      and o.created_at>now()-interval '1 day' and nestora_order_email.eligible(o.id)) then return false; end if;
  select * into v from nestora_order_email.verifications where order_id=p_order_id for update;
  if not found or v.verified_at is not null or v.expires_at<=now() or v.failures>=5 then return false; end if;
  if not exists(select 1 from public.order_shipping_addresses where order_id=p_order_id and lower(btrim(email))=v.recipient)
    then return false; end if;
  if p_code_hash is null or v.code_hash<>p_code_hash then
    update nestora_order_email.verifications set failures=failures+1 where order_id=p_order_id;
    return false;
  end if;
  update nestora_order_email.verifications set verified_at=now() where order_id=p_order_id;
  update nestora_order_email.deliveries set state='pending',last_code=null,next_attempt_at=now(),
    snapshot=nestora_order_email.snapshot(p_order_id),updated_at=now()
    where order_id=p_order_id and email_kind='customer' and state='blocked' and last_code='RECIPIENT_UNVERIFIED' and attempts=0;
  -- In case the original signal has not yet been consumed, recovery prepares it normally.
  perform nestora_order_email.wake(p_order_id);
  return true;
end $$;

alter function public.order_email_prepare(uuid) set schema nestora_order_email;
alter function nestora_order_email.order_email_prepare(uuid) rename to sandbox_prepare;
create function public.order_email_prepare(p_order_id uuid default null) returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype; e record; data jsonb; kind text; target text; code text; jobs integer:=0;
begin
  select * into s from nestora_order_email.settings where singleton for update;
  if not found or not s.enabled then return 0; end if;
  if s.mode='sandbox' then return nestora_order_email.sandbox_prepare(p_order_id); end if;
  update nestora_order_email.deliveries set state=case when state='submitting' then 'uncertain'
    when attempts>=5 then 'failed' else 'retry' end,last_code='LEASE_EXPIRED',next_attempt_at=now(),updated_at=now()
    where id in(select id from nestora_order_email.deliveries where state in ('processing','submitting') and lease_until<now() limit 100);
  for e in select order_id from nestora_order_email.signals where resolved_at is null
    and (p_order_id is null or order_id=p_order_id) order by created_at,order_id limit 50 for update skip locked loop
    data:=nestora_order_email.snapshot(e.order_id);
    if data is not null then
      foreach kind in array array['admin','customer'] loop
        target:=case when kind='admin' then 'info@nestorahomelb.com' else data->>'email' end;
        code:=case when not nestora_order_email.valid_mailbox(target) then 'INVALID_RECIPIENT'
          when kind='customer' and not nestora_order_email.recipient_authorized(e.order_id,target) then 'RECIPIENT_UNVERIFIED' end;
        insert into nestora_order_email.deliveries(order_id,email_kind,recipient,snapshot,state,last_code)
          values(e.order_id,kind,case when nestora_order_email.valid_mailbox(target) then target end,data,
            case when code is null then 'pending' else 'blocked' end,code) on conflict(order_id,email_kind) do nothing;
        if found then jobs:=jobs+1; end if;
      end loop;
    end if;
    update nestora_order_email.signals set resolved_at=now(),reason=case when data is null then 'INELIGIBLE_ORDER' else 'PREPARED' end
      where order_id=e.order_id;
  end loop;
  perform nestora_order_email.cleanup();
  return jobs;
end $$;

create function nestora_order_email.production_job_authorized(p_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from nestora_order_email.deliveries j cross join nestora_order_email.settings s
    where j.id=p_id and s.mode='production' and s.enabled and s.send_enabled and j.created_at>=s.activation_cutoff
      and nestora_order_email.eligible(j.order_id) and j.snapshot->>'currency'='USD'
      and (j.snapshot-'recipientVerified')=(nestora_order_email.snapshot(j.order_id)-'recipientVerified')
      and ((j.email_kind='admin' and j.recipient='info@nestorahomelb.com') or
        (j.email_kind='customer' and j.recipient=j.snapshot->>'email'
          and nestora_order_email.recipient_authorized(j.order_id,j.recipient))));
$$;
alter function public.order_email_claim(boolean) set schema nestora_order_email;
alter function nestora_order_email.order_email_claim(boolean) rename to sandbox_claim;
create function public.order_email_claim(p_allow_send boolean default false) returns jsonb
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
end $$;

alter function public.order_email_start(uuid,uuid) set schema nestora_order_email;
alter function nestora_order_email.order_email_start(uuid,uuid) rename to sandbox_start;
create function public.order_email_start(p_id uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype;
begin
  select * into s from nestora_order_email.settings where singleton for share;
  if not s.enabled or not s.send_enabled then return false; end if;
  if s.mode='sandbox' then return nestora_order_email.sandbox_start(p_id,p_claim); end if;
  update nestora_order_email.deliveries set state='submitting',lease_until=now()+interval '2 minutes',updated_at=now()
    where id=p_id and claim_token=p_claim and state='processing' and lease_until>now() and claim_mode='send'
      and nestora_order_email.production_job_authorized(p_id);
  return found;
end $$;

-- Keep checkout independent of failures in the email-specific queue/HTTP hook.
create or replace function nestora_order_email.on_order_insert() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from nestora_order_email.settings where enabled and new.created_at>=activation_cutoff) then
    insert into nestora_order_email.signals(order_id) values(new.id) on conflict do nothing;
    perform nestora_order_email.wake(new.id);
  end if;
  return new;
exception when others then
  raise log 'ORDER_EMAIL_SIGNAL_FAILED';
  return new;
end $$;
-- Recovery remains bounded to durable signals; never scans historical orders.
revoke all on all functions in schema nestora_order_email from public,anon,authenticated,service_role;
revoke all on function public.order_email_prepare(uuid),public.order_email_claim(boolean),public.order_email_start(uuid,uuid),
  public.order_email_verification_request(uuid,uuid,text,text),public.order_email_verification_confirm(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.order_email_prepare(uuid),public.order_email_claim(boolean),public.order_email_start(uuid,uuid),
  public.order_email_verification_request(uuid,uuid,text,text),public.order_email_verification_confirm(uuid,uuid,text) to service_role;
revoke all on function public.order_email_verification_guard(text) from public,anon,authenticated;
grant execute on function public.order_email_verification_guard(text) to service_role;
alter function nestora_order_email.cleanup() rename to cleanup_v5;
create function nestora_order_email.cleanup() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform nestora_order_email.cleanup_v5();
  delete from nestora_order_email.verification_reservations where id in(
    select id from nestora_order_email.verification_reservations where created_at<now()-interval '2 days' limit 1000);
  delete from nestora_order_email.verification_api_limits where ip_hash in(
    select ip_hash from nestora_order_email.verification_api_limits where window_start<now()-interval '2 days' limit 1000);
  -- Keep successful authorization for pending confirmations, then expire private verification state.
  delete from nestora_order_email.verifications where order_id in(
    select order_id from nestora_order_email.verifications where requested_at<now()-interval '30 days' limit 100);
end $$;
revoke all on function nestora_order_email.cleanup() from public,anon,authenticated,service_role;
commit;
