-- LOCAL PROPOSAL ONLY. Do not run without approval of these NEW probe-only objects.
-- No changes to order tables, checkout RPCs, notification triggers, or existing policies.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Require the reviewed trusted owner; do not create a SECURITY DEFINER function
-- under an arbitrary account. Existing object collisions deliberately fail.
do $$
begin
  if current_user <> 'postgres' or not exists (
    select 1 from pg_catalog.pg_roles where rolname = current_user and rolbypassrls
  ) then
    raise exception 'Run only as the reviewed postgres owner in SQL Editor';
  end if;
end;
$$;
create schema nestora_email_probe;
revoke all on schema nestora_email_probe from public, anon, authenticated, service_role;
create table nestora_email_probe.consumed_runs (
  run_id uuid primary key,
  consumed_at timestamptz not null default now()
);
alter table nestora_email_probe.consumed_runs enable row level security;
revoke all on nestora_email_probe.consumed_runs from public, anon, authenticated, service_role;

create function public.claim_nestora_smtp_probe(p_run_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog
as $$
declare inserted integer;
begin
  if p_run_id is null then raise exception 'Run required'; end if;
  insert into nestora_email_probe.consumed_runs(run_id) values (p_run_id)
  on conflict (run_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end;
$$;
revoke all on function public.claim_nestora_smtp_probe(uuid) from public, anon, authenticated;
grant execute on function public.claim_nestora_smtp_probe(uuid) to service_role;
commit;
