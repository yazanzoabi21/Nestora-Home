-- READ ONLY: platform policy-management configuration was not in the export.
-- No role/extension/settings changes; no application data or secret values.
select current_user as execution_role,
       current_setting('server_version') as server_version,
       (select rolbypassrls from pg_roles where rolname=current_user) as bypass_rls,
       (select pg_get_userbyid(relowner) from pg_class where oid='storage.objects'::regclass) as storage_objects_owner,
       current_setting('supautils.version',true) as supautils_version,
       current_setting('supautils.policy_grants',true) as policy_management_grants,
       current_setting('supautils.privileged_role',true) as platform_privileged_role;
