-- FUNCTIONS ONLY. No trigger attachment, cron schedule, HTTP request or function invocation.
-- Install only after explicit approval; both settings gates must remain disabled.
-- Prerequisites: reviewed pg_net + pg_cron extensions enabled by the project owner.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' then raise exception 'Trusted owner required'; end if;
  if not exists(select 1 from pg_extension where extname='pg_net') or
    not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'Approve/configure pg_net and pg_cron first'; end if;
  if exists(select 1 from nestora_order_email.settings where enabled or send_enabled) then
    raise exception 'Install hooks only while disabled'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('anon'),('authenticated')) r(role_name)
    where (n.nspname='vault' and c.relname='decrypted_secrets')
      and has_any_column_privilege(r.role_name,c.oid,'SELECT')) then
    raise exception 'Unsafe API-role access to Vault; stop and review'; end if;
  -- pg_net has managed PUBLIC queue grants. Store ONLY signed, expiring one-use
  -- requests there; never the signing key, service key, SMTP secret or customer data.
end $$;

create function nestora_order_email.wake(p_order_id uuid default null) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare s nestora_order_email.settings%rowtype; credential text; payload jsonb; payload_text text;
  nonce uuid; timestamp_text text; signature text;
begin
  -- Bounded retention runs even when sending is disabled; it never invokes SMTP.
  perform nestora_order_email.cleanup();
  select * into s from nestora_order_email.settings where singleton;
  if not s.enabled or s.worker_url is null then return; end if;
  select decrypted_secret into credential from vault.decrypted_secrets
    where name='ORDER_EMAIL_WEBHOOK_TOKEN' limit 1;
  if credential is null or credential !~ '^[a-f0-9]{64}$' then raise log 'ORDER_EMAIL_WAKE_NOT_CONFIGURED'; return; end if;
  payload:=case when p_order_id is null then jsonb_build_object('mode','recover') else
    jsonb_build_object('type','INSERT','schema','public','table','orders','record',jsonb_build_object('id',p_order_id)) end;
  payload_text:=payload::text;
  nonce:=gen_random_uuid();
  timestamp_text:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature:=encode(extensions.hmac(convert_to('nestora-order-email-v1'||chr(10)||timestamp_text||chr(10)||nonce::text||chr(10)||payload_text,'UTF8'),
    convert_to(credential,'UTF8'),'sha256'),'hex');
  insert into nestora_order_email.wake_nonces(nonce,body_hash,expires_at)
    values(nonce,encode(extensions.digest(convert_to(payload_text,'UTF8'),'sha256'),'hex'),clock_timestamp()+interval '5 minutes');
  perform net.http_post(url=>s.worker_url,
    headers=>jsonb_build_object('Content-Type','application/json','x-order-email-signature',signature,
      'x-order-email-timestamp',timestamp_text,'x-order-email-nonce',nonce::text),
    body=>payload,
    timeout_milliseconds=>120000);
exception when others then
  -- HTTP queue failures cannot roll back checkout. Durable signals are recovered by cron.
  -- Never log SQLERRM, headers, Vault values, addresses or customer data.
  raise log 'ORDER_EMAIL_WAKE_FAILED';
end $$;

create function nestora_order_email.on_order_insert() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from nestora_order_email.settings s where s.enabled and new.created_at>=s.activation_cutoff) then
    -- Transaction-local identifier only; rolled-back orders also roll back this signal.
    -- No token/total/completion filtering here: wrappers set those later.
    insert into nestora_order_email.signals(order_id) values(new.id) on conflict do nothing;
    perform nestora_order_email.wake(new.id);
  end if;
  return new;
end $$;
revoke all on all functions in schema nestora_order_email from public,anon,authenticated,service_role;
commit;
