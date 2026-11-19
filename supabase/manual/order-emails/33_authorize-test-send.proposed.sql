-- PROPOSAL ONLY. Separate send approval AFTER both captures and review of actual values.
-- Same session: exact nestora.order_email_test_order_id and nestora.order_email_send_approved='yes'.
-- Edge ORDER_EMAIL_SEND_ENABLED remains false until the final separately approved step.
begin;
do $$ declare test_id uuid; begin
  if current_user<>'postgres' or current_setting('nestora.order_email_send_approved',true) is distinct from 'yes'
    then raise exception 'Explicit two-message approval required'; end if;
  test_id:=nullif(current_setting('nestora.order_email_test_order_id',true),'')::uuid;
  if test_id is null then raise exception 'Exact approved new order UUID required'; end if;
  perform public.order_email_sandbox_authorize(test_id,true);
  update nestora_order_email.settings set send_enabled=true where singleton and enabled and mode='sandbox';
  if not found then raise exception 'Sandbox unavailable'; end if;
  perform nestora_order_email.wake(test_id);
end $$;
commit;
-- Authorization expires in 30 minutes. Duplicate authorization cannot reset attempted/accepted jobs.
