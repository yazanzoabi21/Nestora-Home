-- Final production activation. Execute once with both Edge send gates disabled.
-- Fresh cutoff excludes every existing order, including all controlled rehearsals.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' then raise exception 'Trusted owner required'; end if;
  if not exists(select 1 from nestora_order_email.settings where singleton
    and mode='production' and production_canary_order_id='26e79cb5-6f12-4bb1-ae35-08d095c73e97'
    and quota_verified_at is not null and max_day=60 and max_hour=10
    and not allow_unverified_customer_email)
    then raise exception 'Verified canary configuration required'; end if;
  if (select count(*) from nestora_order_email.deliveries
      where order_id='26e79cb5-6f12-4bb1-ae35-08d095c73e97' and state='accepted')<>2
    then raise exception 'Both canary messages must be accepted'; end if;
end $$;
update nestora_order_email.settings set enabled=true,send_enabled=true,
  production_canary_order_id=null,activation_cutoff=clock_timestamp(),
  max_day=60,max_hour=10,customer_day=10,customer_hour=3,max_inflight=2;
-- The retained sandbox allowlist applies only in sandbox mode. Production uses
-- order-scoped recipient authorization, independently rechecked before SMTP.
select cron.alter_job(jobid,command=>'select nestora_order_email.recover();',active=>true)
  from cron.job where jobname='nestora-order-email-recovery';
commit;
