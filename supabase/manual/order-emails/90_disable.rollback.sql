-- PROPOSAL ONLY. First set ORDER_EMAIL_ENABLED=false in Edge secrets.
-- Preserve delivery tombstones and uncertain states. Do not reset/replay jobs.
begin;
set local lock_timeout='5s';
update nestora_order_email.settings set enabled=false,send_enabled=false where singleton;
update nestora_order_email.sandbox_orders set send_until=null;
drop trigger if exists trg_order_email_signal on public.orders;
do $$ declare job bigint; begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into job from cron.job where jobname='nestora-order-email-recovery';
    if job is not null then perform cron.unschedule(job); end if;
  end if;
end $$;
revoke execute on function public.order_email_consume_wake(uuid,text),public.order_email_sandbox_authorize(uuid,boolean),public.order_email_prepare(uuid),public.order_email_claim(boolean),
  public.order_email_start(uuid,uuid),public.order_email_finish(uuid,uuid,text,text,text,text) from service_role;
commit;
-- Revoke the webhook credential after workers drain. Remove ONLY order-email-worker if approved.
-- Do not remove the SMTP probe, notification trigger, checkout RPCs, extensions or ledger history.
