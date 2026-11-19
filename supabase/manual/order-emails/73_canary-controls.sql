-- Business-mailbox-only production rehearsal control, removed only by final activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or exists(select 1 from nestora_order_email.settings where enabled or send_enabled)
    then raise exception 'Owner and disabled gates required'; end if;
end $$;
alter table nestora_order_email.settings add column production_canary_order_id uuid;
alter function nestora_order_email.eligible(uuid) rename to eligible_v5;
create function nestora_order_email.eligible(p_order_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select nestora_order_email.eligible_v5(p_order_id) and exists(
    select 1 from nestora_order_email.settings s where s.mode<>'production' or s.production_canary_order_id is null
    or (s.production_canary_order_id=p_order_id and exists(select 1 from public.order_shipping_addresses a
      where a.order_id=p_order_id and lower(btrim(a.email))='info@nestorahomelb.com')));
$$;
revoke all on function nestora_order_email.eligible(uuid),nestora_order_email.eligible_v5(uuid) from public,anon,authenticated,service_role;
update nestora_order_email.settings set quota_verified_at=now(),
  quota_evidence='Hostinger mail_orders_plan: Starter Business Email Free Trial; rate_limit_outbound=100/86400. Owner confirmed hPanel. App budget 60/day reserves 40 for other mailbox use; 10/hour is an app throttle.',
  max_hour=10,max_day=60,customer_hour=3,customer_day=10;
commit;
