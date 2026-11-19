-- Authorized infrastructure installation only. No jobs, webhooks, requests or email.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' then raise exception 'Trusted postgres role required'; end if;
  if to_regnamespace('extensions') is null then raise exception 'Supabase extensions schema missing'; end if;
  if exists(select 1 from pg_extension where extname in ('pg_net','pg_cron')) then
    raise exception 'Inspect existing extensions instead of replacing'; end if;
  if position('pg_cron' in current_setting('shared_preload_libraries',true))=0 then
    raise exception 'Required cron preload absent; no restart is authorized'; end if;
end $$;
create extension pg_net with schema extensions;
create extension pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
commit;
