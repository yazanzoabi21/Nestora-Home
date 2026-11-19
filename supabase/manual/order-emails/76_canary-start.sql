-- Controlled production rehearsal: only this approved business-mailbox order is eligible.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' or exists(select 1 from nestora_order_email.settings where enabled or send_enabled)
    or not exists(select 1 from public.order_shipping_addresses where order_id='26e79cb5-6f12-4bb1-ae35-08d095c73e97' and email='info@nestorahomelb.com')
    then raise exception 'Disabled gates and approved business order required'; end if;
  if (select count(*) from cron.job where jobname='nestora-order-email-recovery')<>1 then raise exception 'Expected recovery job missing'; end if;
end $$;
update nestora_order_email.settings set mode='production',enabled=true,send_enabled=true,currency='USD',
  production_canary_order_id='26e79cb5-6f12-4bb1-ae35-08d095c73e97',
  activation_cutoff=(select created_at-interval '1 second' from public.orders where id='26e79cb5-6f12-4bb1-ae35-08d095c73e97');
insert into nestora_order_email.signals(order_id) values('26e79cb5-6f12-4bb1-ae35-08d095c73e97') on conflict do nothing;
select public.order_email_prepare('26e79cb5-6f12-4bb1-ae35-08d095c73e97') as prepared;
select cron.alter_job(jobid,command=>'select nestora_order_email.recover();',active=>true)
  from cron.job where jobname='nestora-order-email-recovery';
commit;
