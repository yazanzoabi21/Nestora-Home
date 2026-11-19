-- STAGE 2 ONLY. Separate explicit approval required; NEVER part of Stage 1 installation.
-- Installs an active orders trigger and recovery schedule. Both email gates still remain false.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or current_setting('nestora.order_email_hooks_approved',true) is distinct from 'yes'
    then raise exception 'Separate Stage 2 hook/schedule approval required'; end if;
  if not exists(select 1 from nestora_order_email.settings where singleton and not enabled and not send_enabled)
    then raise exception 'Both database gates must be disabled'; end if;
  if exists(select 1 from pg_trigger where tgname='trg_order_email_signal') or
    exists(select 1 from cron.job where jobname='nestora-order-email-recovery') then
    raise exception 'Hook/schedule conflict; inspect instead of replacing'; end if;
end $$;
create trigger trg_order_email_signal after insert on public.orders
  for each row execute function nestora_order_email.on_order_insert();
select cron.schedule('nestora-order-email-recovery','*/5 * * * *','select nestora_order_email.wake(null);');
commit;
