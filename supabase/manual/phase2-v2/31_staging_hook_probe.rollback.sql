-- STAGING ONLY, not executed. Remove before rolling back deactivation controls.
begin;
do $$ begin
 if current_setting('nestora.phase2.staging_probe_approved',true) is distinct from 'yes' then raise exception 'Staging-only probe approval required'; end if;
end $$;
drop function public.phase2_request_context_probe();
notify pgrst,'reload schema'; commit;
