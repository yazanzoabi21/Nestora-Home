-- Keep authenticated customer balance and enabled-state signals synchronized
-- when loyalty entries or settings change outside the current browser flow.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_loyalty_points_ledger'
  ) then
    alter publication supabase_realtime add table public.customer_loyalty_points_ledger;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'loyalty_program_settings'
  ) then
    alter publication supabase_realtime add table public.loyalty_program_settings;
  end if;
end;
$$;
