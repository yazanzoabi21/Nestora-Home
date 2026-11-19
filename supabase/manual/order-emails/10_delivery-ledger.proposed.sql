-- PROPOSAL ONLY. Locked same-project sandbox; explicit installation approval required.
-- No existing checkout function, notification trigger, policy or grant is replaced.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if current_user <> 'postgres' then raise exception 'Trusted postgres owner required'; end if;
  if md5(pg_get_functiondef('public.notify_admin_new_order_from_address()'::regprocedure))
    <> 'df3a0db3ce2c4d0d08279a19dd4b592c' then raise exception 'Notification definition drift'; end if;
  if md5(pg_get_functiondef('public.place_customer_order(uuid,uuid,uuid,jsonb,jsonb,text,uuid,text,numeric,uuid,uuid[],uuid[],uuid[])'::regprocedure))
    <> 'c73b3999991c0b6bcf823f0d4db1a37c' then raise exception 'Checkout definition drift'; end if;
end $$;

create schema nestora_order_email;
revoke all on schema nestora_order_email from public, anon, authenticated, service_role;
create table nestora_order_email.settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  activation_cutoff timestamptz,
  mode text not null default 'sandbox' check (mode = 'sandbox'),
  send_enabled boolean not null default false,
  allowed_recipients text[] not null default array['info@nestorahomelb.com']
    check (allowed_recipients = array['info@nestorahomelb.com']::text[]),
  -- No currency is invented for the deployed products-only path lacking a payment snapshot.
  currency text check (currency ~ '^[A-Z]{3}$'),
  allow_unverified_customer_email boolean not null default false check (not allow_unverified_customer_email),
  max_hour integer not null default 40 check (max_hour between 1 and 1000),
  max_day integer not null default 200 check (max_day between 1 and 10000),
  customer_hour integer not null default 3 check (customer_hour between 1 and 100),
  customer_day integer not null default 10 check (customer_day between 1 and 1000),
  max_inflight integer not null default 2 check (max_inflight between 1 and 10),
  worker_url text,
  check (not enabled or (activation_cutoff is not null and currency is not null)),
  check (not send_enabled or enabled),
  check (worker_url is null or worker_url = 'https://ojismppptyrivnxnkcux.supabase.co/functions/v1/order-email-worker')
);
insert into nestora_order_email.settings(singleton) values (true);

-- One-use signed wake authorization. The managed pg_net queue never contains a bearer secret.
create table nestora_order_email.wake_nonces (
  nonce uuid primary key,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table nestora_order_email.wake_nonces enable row level security;

create function public.order_email_consume_wake(p_nonce uuid,p_body_hash text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
  update nestora_order_email.wake_nonces set used_at=clock_timestamp()
    where nonce=p_nonce and body_hash=p_body_hash and used_at is null and expires_at>clock_timestamp();
  return found;
end $$;

-- Only a trusted service/owner can enroll a specific, NEW committed order.
-- Enrollment permits capture; a separate expiring authorization permits SMTP.
create table nestora_order_email.sandbox_orders (
  -- No FK to public.orders: Stage 1 must not add RI triggers/locks to business tables.
  -- Service-only enrollment validates the committed order; claims recheck eligibility.
  order_id uuid primary key,
  activation_cutoff timestamptz not null,
  fingerprint text not null,
  enrolled_at timestamptz not null default now(),
  send_until timestamptz
);

-- Durable order identifiers only. An INSERT event's amounts/token are not final.
create table nestora_order_email.signals (
  -- Explicitly deferred business-table FK; no application-table trigger is installed.
  order_id uuid primary key,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  reason text
);
create index order_email_unresolved_signals on nestora_order_email.signals(created_at,order_id)
  where resolved_at is null;
create table nestora_order_email.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  email_kind text not null check (email_kind in ('admin','customer')),
  recipient text,
  check (recipient is null or recipient = 'info@nestorahomelb.com'),
  snapshot jsonb,
  state text not null default 'pending'
    check (state in ('pending','captured','processing','submitting','retry','accepted','failed','uncertain','blocked')),
  captures integer not null default 0 check (captures between 0 and 5),
  captured_at timestamptz,
  capture_fingerprint text,
  claim_mode text check (claim_mode in ('capture','send')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  last_code text,
  message_id text,
  smtp_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,email_kind)
);
create index order_email_ready on nestora_order_email.deliveries(next_attempt_at,created_at)
  where state in ('pending','retry');
create index order_email_leases on nestora_order_email.deliveries(lease_until)
  where state in ('processing','submitting');
create table nestora_order_email.reservations (
  job_id uuid not null references nestora_order_email.deliveries(id),
  attempt integer not null,
  recipient_hash text not null,
  email_kind text not null,
  created_at timestamptz not null default now(),
  primary key(job_id,attempt)
);
create index order_email_reservation_time on nestora_order_email.reservations(created_at);
create index order_email_recipient_time on nestora_order_email.reservations(recipient_hash,created_at);

alter table nestora_order_email.settings enable row level security;
alter table nestora_order_email.sandbox_orders enable row level security;
alter table nestora_order_email.signals enable row level security;
alter table nestora_order_email.deliveries enable row level security;
alter table nestora_order_email.reservations enable row level security;
revoke all on all tables in schema nestora_order_email from public, anon, authenticated, service_role;

-- A single committed SQL snapshot, using only saved order prices/totals.
create function nestora_order_email.eligible(p_order_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from public.orders o cross join nestora_order_email.settings s
    where o.id=p_order_id and s.enabled and o.created_at>=s.activation_cutoff
      and o.checkout_token is not null and o.loyalty_checkout_processed and o.variant_loyalty_processed
      and lower(coalesce(o.status,'')) not in ('cancelled','canceled','refunded')
      and (o.user_id is null or exists(select 1 from public.profiles p where p.id=o.user_id and p.is_active is true))
      and exists(select 1 from public.order_shipping_addresses a where a.order_id=o.id)
      and exists(select 1 from public.order_items i where i.order_id=o.id)
      and (not exists(select 1 from public.order_items i where i.order_id=o.id and i.is_free_gift)
        or o.free_gift_processed));
$$;

create function nestora_order_email.snapshot(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id',o.id,'orderNumber',o.order_number,'createdAt',o.created_at,'userId',o.user_id,
    'customerName',concat_ws(' ',a.first_name,a.last_name),'email',a.email,'phone',a.phone,
    'address',concat_ws(', ',nullif(a.street_address,''),nullif(a.address_line_2,''),
      nullif(a.city,''),nullif(a.state_province,''),nullif(a.postal_code,''),nullif(a.country,'')),
    'instructions',a.delivery_instructions,'subtotal',o.subtotal,'shipping',o.shipping,
    'paymentFee',o.payment_fee,'discount',o.discount_amount,'discountCode',o.discount_code,
    'total',o.total,'currency',coalesce(nullif(t.currency,''),s.currency),
    'paymentMethod',coalesce(nullif(t.method_name,''),pm.name),
    'paymentStatus',o.payment_status,'status',o.status,
    'recipientVerified',exists(select 1 from auth.users u where u.id=o.user_id
      and lower(u.email)=lower(btrim(a.email)) and u.email_confirmed_at is not null),
    'items',(select jsonb_agg(jsonb_build_object(
      'name',coalesce(nullif(btrim(i.product_name),''),nullif(btrim(p.name),'')),
      'variant',i.variant_name,'sku',i.variant_sku,'attributes',i.variant_attributes,
      'quantity',i.quantity,'unitPrice',case when i.loyalty_redeemed then 0 else i.price end,
      'total',i.total,'gift',coalesce(i.is_free_gift,false),'loyalty',coalesce(i.loyalty_redeemed,false)
    ) order by i.id) from public.order_items i left join public.products p on p.id=i.product_id where i.order_id=o.id)
  ) from public.orders o join public.order_shipping_addresses a on a.order_id=o.id
  cross join nestora_order_email.settings s
  left join public.payment_methods pm on pm.id=o.payment_method_id
  left join lateral (select pt.* from public.payment_transactions pt where pt.order_id=o.id
    order by pt.created_at,pt.id limit 1) t on true
  where o.id=p_order_id and nestora_order_email.eligible(o.id);
$$;

create function nestora_order_email.sandbox_approved(p_order_id uuid,p_send boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from nestora_order_email.sandbox_orders a
    cross join nestora_order_email.settings s where a.order_id=p_order_id
    and s.enabled and s.mode='sandbox' and a.activation_cutoff=s.activation_cutoff
    and a.fingerprint=md5(nestora_order_email.snapshot(p_order_id)::text)
    and (not p_send or (s.send_enabled and a.send_until>now())));
$$;

create function public.order_email_sandbox_authorize(p_order_id uuid,p_allow_send boolean default false) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype; data jsonb; a nestora_order_email.sandbox_orders%rowtype;
begin
  select * into s from nestora_order_email.settings where singleton for update;
  if not s.enabled or s.mode<>'sandbox' then raise exception 'Sandbox capture must be enabled'; end if;
  data:=nestora_order_email.snapshot(p_order_id);
  if data is null then raise exception 'New finalized order after cutoff required'; end if;
  select * into a from nestora_order_email.sandbox_orders where order_id=p_order_id for update;
  if p_allow_send then
    if a.order_id is null or a.activation_cutoff<>s.activation_cutoff or a.fingerprint<>md5(data::text)
      or (select count(*) from nestora_order_email.deliveries where order_id=p_order_id and state='captured'
        and attempts=0 and captured_at is not null and capture_fingerprint=a.fingerprint)<>2
      then raise exception 'Two unchanged successfully captured jobs required'; end if;
    update nestora_order_email.sandbox_orders set send_until=now()+interval '30 minutes' where order_id=p_order_id;
    update nestora_order_email.deliveries set state='pending',next_attempt_at=now(),updated_at=now()
      where order_id=p_order_id and state='captured';
  else
    if a.order_id is not null then return false; end if;
    insert into nestora_order_email.sandbox_orders(order_id,activation_cutoff,fingerprint)
      values(p_order_id,s.activation_cutoff,md5(data::text));
    -- A webhook may already have discarded the unapproved ID; only explicit enrollment reopens it.
    insert into nestora_order_email.signals(order_id) values(p_order_id)
      on conflict(order_id) do update set resolved_at=null,reason=null;
  end if;
  return true;
end $$;

create function nestora_order_email.cleanup() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
  delete from nestora_order_email.wake_nonces where nonce in (
    select nonce from nestora_order_email.wake_nonces where expires_at<now()-interval '1 hour' limit 1000);
  update nestora_order_email.deliveries set state='blocked',last_code='DELIVERY_EXPIRED',updated_at=now()
    where id in (select id from nestora_order_email.deliveries where state in ('pending','captured','retry')
      and created_at<now()-interval '7 days' limit 100);
  update nestora_order_email.deliveries set snapshot=null,recipient=null where id in (
    select id from nestora_order_email.deliveries where state in ('accepted','failed','blocked','uncertain')
      and updated_at<now()-interval '30 days' and snapshot is not null limit 100);
  delete from nestora_order_email.reservations where (job_id,attempt) in (
    select job_id,attempt from nestora_order_email.reservations where created_at<now()-interval '2 days' limit 1000);
  delete from nestora_order_email.signals where order_id in (
    select order_id from nestora_order_email.signals where created_at<now()-interval '1 day'
      and not exists(select 1 from nestora_order_email.sandbox_orders a where a.order_id=signals.order_id) limit 1000);
end $$;

create function public.order_email_prepare(p_order_id uuid default null) returns integer
language plpgsql security definer set search_path = pg_catalog as $$
declare s nestora_order_email.settings%rowtype; e record; data jsonb; kind text;
  target text; blocked text; count_jobs integer:=0;
begin
  select * into s from nestora_order_email.settings where singleton for update;
  if not found or not s.enabled then return 0; end if;
  -- Recover worker crashes. Never auto-replay a job that could have reached SMTP.
  update nestora_order_email.deliveries set state=case when state='submitting' then 'uncertain'
      when attempts>=5 or captures>=5 then 'failed' else 'retry' end,
    last_code='LEASE_EXPIRED',next_attempt_at=now(),updated_at=now()
  where id in (select id from nestora_order_email.deliveries
    where state in ('processing','submitting') and lease_until<now() limit 100);
  for e in select order_id from nestora_order_email.signals where resolved_at is null
    and (p_order_id is null or order_id=p_order_id) order by created_at,order_id limit 50 for update skip locked
  loop
    data:=null;
    if nestora_order_email.sandbox_approved(e.order_id) then
      data:=nestora_order_email.snapshot(e.order_id);
    end if;
    if data is not null then
      foreach kind in array array['admin','customer'] loop
        target:='info@nestorahomelb.com';
        blocked:=null;
        if target is null or target !~ '^[^[:space:]<>@,;"\\]+@[^[:space:]<>@,;"\\]+\.[^[:space:]<>@,;"\\]+$'
          then blocked:='INVALID_RECIPIENT';
        elsif s.mode='sandbox' and not (lower(target)=any(s.allowed_recipients)) then blocked:='SANDBOX_RECIPIENT';
        end if;
        insert into nestora_order_email.deliveries(order_id,email_kind,recipient,snapshot,state,last_code)
          values(e.order_id,kind,target,data,case when blocked is null then 'pending' else 'blocked' end,blocked)
          on conflict(order_id,email_kind) do nothing;
        if found then count_jobs:=count_jobs+1; end if;
      end loop;
    end if;
    update nestora_order_email.signals set resolved_at=now(),reason=case when data is null
      then 'INELIGIBLE_ORDER' else 'PREPARED' end where order_id=e.order_id;
  end loop;
  perform nestora_order_email.cleanup();
  return count_jobs;
end $$;

create function public.order_email_claim(p_allow_send boolean default false) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare s nestora_order_email.settings%rowtype; j nestora_order_email.deliveries%rowtype; h text; sending boolean;
begin
  -- Serialize reservation decisions across all worker isolates.
  select * into s from nestora_order_email.settings where singleton for update;
  if not found or not s.enabled then return null; end if;
  if (select count(*) from nestora_order_email.deliveries where state in ('processing','submitting')
    and lease_until>now())>=s.max_inflight then return null; end if;
  select * into j from nestora_order_email.deliveries where state in ('pending','retry') and attempts<5
    and ((captured_at is null and captures<5) or (p_allow_send and nestora_order_email.sandbox_approved(order_id,true)))
    and next_attempt_at<=now() order by next_attempt_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  if not nestora_order_email.sandbox_approved(j.order_id)
    or (s.mode='sandbox' and not (lower(j.recipient)=any(s.allowed_recipients)))
    or j.recipient<>'info@nestorahomelb.com' then
    update nestora_order_email.deliveries set state='blocked',last_code='ORDER_UNAVAILABLE',updated_at=now() where id=j.id;
    return null;
  end if;
  sending:=j.captured_at is not null;
  if sending and (j.capture_fingerprint<>md5(j.snapshot::text)
    or (select count(*) from nestora_order_email.reservations where created_at>now()-interval '1 hour')>=s.max_hour
    or (select count(*) from nestora_order_email.reservations where created_at>now()-interval '1 day')>=s.max_day)
    then return null; end if;
  h:=md5(lower(j.recipient));
  if sending and j.email_kind='customer' and (
    (select count(*) from nestora_order_email.reservations where recipient_hash=h and email_kind='customer'
      and created_at>now()-interval '1 hour')>=s.customer_hour or
    (select count(*) from nestora_order_email.reservations where recipient_hash=h and email_kind='customer'
      and created_at>now()-interval '1 day')>=s.customer_day) then
    update nestora_order_email.deliveries set next_attempt_at=now()+interval '15 minutes' where id=j.id;
    return null;
  end if;
  update nestora_order_email.deliveries set state='processing',attempts=attempts+case when sending then 1 else 0 end,
    captures=captures+case when sending then 0 else 1 end,
    claim_mode=case when sending then 'send' else 'capture' end,
    claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
    where id=j.id returning * into j;
  if sending then
    insert into nestora_order_email.reservations(job_id,attempt,recipient_hash,email_kind)
      values(j.id,j.attempts,h,j.email_kind);
  end if;
  return jsonb_build_object('id',j.id,'orderId',j.order_id,'kind',j.email_kind,
    'recipient',j.recipient,'snapshot',j.snapshot,'claimToken',j.claim_token,'attempt',greatest(1,j.attempts),
    'sandbox',true,'deliveryMode',j.claim_mode);
end $$;

create function public.order_email_start(p_id uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
declare s nestora_order_email.settings%rowtype;
begin
  select * into s from nestora_order_email.settings where singleton for share;
  if not found or not s.enabled or not s.send_enabled then return false; end if;
  update nestora_order_email.deliveries j set state='submitting',lease_until=now()+interval '2 minutes',updated_at=now()
  where j.id=p_id and j.claim_token=p_claim and j.state='processing' and j.lease_until>now()
    and j.claim_mode='send' and j.recipient='info@nestorahomelb.com'
    and j.captured_at is not null and j.capture_fingerprint=md5(j.snapshot::text)
    and (s.mode<>'sandbox' or lower(j.recipient)=any(s.allowed_recipients))
    and nestora_order_email.sandbox_approved(j.order_id,true);
  return found;
end $$;

create function public.order_email_finish(p_id uuid,p_claim uuid,p_state text,p_code text,
  p_message_id text default null,p_reference text default null) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_state is null or p_code is null or p_state not in ('captured','accepted','retry','failed','uncertain') or p_code !~ '^[A-Z0-9_]{1,40}$'
    or length(coalesce(p_message_id,''))>255 or length(coalesce(p_reference,''))>120
    then raise exception 'Invalid delivery outcome'; end if;
  update nestora_order_email.deliveries set
    state=case when p_state='retry' and attempts>=5 then 'failed' else p_state end,
    captured_at=case when p_state='captured' then now() else captured_at end,
    capture_fingerprint=case when p_state='captured' then md5(snapshot::text) else capture_fingerprint end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,greatest(0,attempts-1)))::integer),
    last_code=p_code,message_id=p_message_id,smtp_reference=p_reference,updated_at=now()
  where id=p_id and claim_token=p_claim and (
    (state='processing' and p_state in ('retry','failed')) or
    (state='processing' and claim_mode='capture' and p_state='captured'
      and lease_until>now() and nestora_order_email.sandbox_approved(order_id)) or
    (state in ('submitting','uncertain') and p_state in ('accepted','retry','failed','uncertain')));
  return found;
end $$;

-- Default grants can expose newly-created SECURITY DEFINER functions: close in the same transaction.
revoke all on all functions in schema nestora_order_email from public, anon, authenticated, service_role;
revoke all on function public.order_email_consume_wake(uuid,text),public.order_email_sandbox_authorize(uuid,boolean),public.order_email_prepare(uuid),public.order_email_claim(boolean),
  public.order_email_start(uuid,uuid),public.order_email_finish(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.order_email_consume_wake(uuid,text),public.order_email_sandbox_authorize(uuid,boolean),public.order_email_prepare(uuid),public.order_email_claim(boolean),
  public.order_email_start(uuid,uuid),public.order_email_finish(uuid,uuid,text,text,text,text) to service_role;
commit;
