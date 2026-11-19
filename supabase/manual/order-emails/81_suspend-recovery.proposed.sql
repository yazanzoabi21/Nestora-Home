-- Pause ONLY this feature's recovery schedule after disabling both Edge gates.
-- Retains the ledger, nonce tombstones, business data and existing notifications.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $$ declare job bigint; begin
  if current_user<>'postgres' then raise exception 'Trusted owner required'; end if;
  if exists(select 1 from nestora_order_email.settings where enabled or send_enabled) then
    raise exception 'Disable database gates first'; end if;
  select jobid into job from cron.job where jobname='nestora-order-email-recovery';
  if job is not null then perform cron.alter_job(job,active:=false); end if;
end $$;
commit;
