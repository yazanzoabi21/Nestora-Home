-- Keep the customer catalog synchronized when products, variants, or category labels change.
do $$
declare
  catalog_table text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach catalog_table in array array['products', 'product_variants', 'categories']
  loop
    if to_regclass(format('public.%I', catalog_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = catalog_table
      )
    then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        catalog_table
      );
    end if;
  end loop;
end;
$$;
