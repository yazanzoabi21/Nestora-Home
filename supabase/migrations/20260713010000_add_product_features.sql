alter table public.products
add column if not exists features jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_features_is_array'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_features_is_array
    check (jsonb_typeof(features) = 'array');
  end if;
end $$;
