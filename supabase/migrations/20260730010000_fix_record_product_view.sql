do $$
begin
  if not exists (
    select 1
    from pg_index as index_definition
    where index_definition.indrelid = 'public.customer_product_history'::regclass
      and index_definition.indisunique
      and (
        select array_agg(attribute_definition.attname::text order by attribute_definition.attname)
        from unnest(index_definition.indkey) as indexed_column(attnum)
        join pg_attribute as attribute_definition
          on attribute_definition.attrelid = index_definition.indrelid
         and attribute_definition.attnum = indexed_column.attnum
        where indexed_column.attnum > 0
      ) = array['product_id', 'user_id']
  ) then
    alter table public.customer_product_history
      add constraint customer_product_history_user_id_product_id_key
      unique (user_id, product_id);
  end if;
end
$$;

create or replace function public.record_product_view(target_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authenticated customer session is required';
  end if;

  insert into public.customer_product_history (
    user_id,
    product_id,
    viewed_at,
    view_count
  )
  values (
    current_user_id,
    target_product_id,
    now(),
    1
  )
  on conflict (user_id, product_id)
  do update set
    viewed_at = excluded.viewed_at,
    view_count = customer_product_history.view_count + 1;
end;
$$;

revoke execute on function public.record_product_view(uuid) from public;
revoke execute on function public.record_product_view(uuid) from anon;
grant execute on function public.record_product_view(uuid) to authenticated;

alter table public.customer_product_history enable row level security;

drop policy if exists "Customers can read their own product history"
  on public.customer_product_history;
drop policy if exists "Customers can read own product history"
  on public.customer_product_history;

create policy "Customers can read own product history"
  on public.customer_product_history
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
