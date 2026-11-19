-- PROPOSAL ONLY. Explicit approval of this exact NEW committed test order is required.
-- In the SAME SQL Editor session, set nestora.order_email_test_order_id to its UUID
-- and nestora.order_email_enroll_approved='yes'. Never enroll a historical/public customer order.
begin;
do $$ declare test_id uuid; begin
  if current_user<>'postgres' or current_setting('nestora.order_email_enroll_approved',true) is distinct from 'yes'
    then raise exception 'Explicit per-order capture approval required'; end if;
  test_id:=nullif(current_setting('nestora.order_email_test_order_id',true),'')::uuid;
  if test_id is null then raise exception 'Exact approved new order UUID required'; end if;
  if exists(select 1 from nestora_order_email.settings where send_enabled) then
    raise exception 'Enroll only while database SMTP gate is disabled'; end if;
  perform public.order_email_sandbox_authorize(test_id,false);
  perform nestora_order_email.wake(test_id);
end $$;
commit;
