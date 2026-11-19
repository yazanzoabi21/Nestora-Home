-- PROPOSAL ONLY: Stage 1 private-state pause/revoke; never locks/orders or removes business triggers.
-- First disable both Edge flags; remove ONLY order-email-worker separately if approved.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare scheduled boolean:=false; begin
  if current_user<>'postgres' then raise exception 'Trusted owner required'; end if;
  if exists(select 1 from pg_trigger where tgname='trg_order_email_signal') then
    raise exception 'Stage 2 trigger exists; use separately reviewed Stage 2 rollback'; end if;
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname=''nestora-order-email-recovery'')' into scheduled;
  end if;
  if scheduled then raise exception 'Recovery job exists; Stage 1 rollback scope no longer applies'; end if;
end $$;
update nestora_order_email.settings set enabled=false,send_enabled=false where singleton;
update nestora_order_email.sandbox_orders set send_until=null;
revoke execute on function public.order_email_consume_wake(uuid,text),public.order_email_sandbox_authorize(uuid,boolean),public.order_email_prepare(uuid),
  public.order_email_claim(boolean),public.order_email_start(uuid,uuid),public.order_email_finish(uuid,uuid,text,text,text,text)
  from service_role;
commit;
-- Retain all ledger data and shared extensions. No schema drop/reset or restoration.
