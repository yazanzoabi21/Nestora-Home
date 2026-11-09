-- STAGING ONLY; never install in production. Not executed.
begin;
do $$ begin
 if current_setting('nestora.phase2.staging_probe_approved',true) is distinct from 'yes' then raise exception 'Staging-only probe approval required'; end if;
 if to_regprocedure('public.phase2_request_context_probe()') is not null then raise exception 'Probe name collision'; end if;
end $$;
create function public.phase2_request_context_probe()
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
begin
 if nestora_phase2.active_actor_role() is distinct from 'super_admin' then raise exception 'Active Super Admin required' using errcode='42501'; end if;
 return jsonb_build_object('hook_marker',current_setting('nestora.phase2.hook_ran',true),
 'path',current_setting('request.path',true),'method',current_setting('request.method',true));
end $$;
revoke all on function public.phase2_request_context_probe() from public,anon,service_role;
grant execute on function public.phase2_request_context_probe() to authenticated;
notify pgrst,'reload schema'; commit;
