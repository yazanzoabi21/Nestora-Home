-- SUPERSEDED: 41_deployed_hardening.rollback.sql is the metadata-backed pair.
-- PROPOSAL ONLY. Removes only this proposal's policies/helpers.
-- This is intentionally NOT a complete rollback: reviewed original ACL restoration
-- must be appended from the deployment snapshot before approval/execution.
-- No blanket GRANT ALL: that can reopen escalation or grant rights never held before.
begin;
do $$
declare pol record;
begin
  if current_setting('nestora.security_rollback_approved',true) is distinct from 'yes' then
    raise exception 'Approve reviewed rollback including exact saved ACL restoration first';
  end if;
  -- Prevent use as a deceptively complete rollback without the missing ACL artifact.
  if current_setting('nestora.security_original_acl_restore_prepared',true) is distinct from 'yes' then
    raise exception 'Original ACL restoration must be prepared and included in this transaction';
  end if;
  for pol in select schemaname,tablename,policyname from pg_policies
      where schemaname='public' and policyname like 'security\_20261116\_%' escape '\' loop
    execute format('drop policy %I on %I.%I',pol.policyname,pol.schemaname,pol.tablename);
  end loop;
end $$;
drop function nestora_security_20261116.active_actor();
drop function nestora_security_20261116.active_admin();
drop schema nestora_security_20261116; -- RESTRICT, not CASCADE.
-- Insert exact original table/column ACL restoration here after metadata review.
-- Deliberate rollback while still a proposal. Final reviewed rollback must use COMMIT.
rollback;
