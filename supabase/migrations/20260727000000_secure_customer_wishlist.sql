-- Harden the existing public.wishlist table and make customer/product pairs idempotent.
delete from public.wishlist older
using public.wishlist newer
where older.user_id = newer.user_id
  and older.product_id = newer.product_id
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

alter table public.wishlist
  alter column user_id set not null,
  alter column product_id set not null;

create unique index if not exists wishlist_user_product_uidx
  on public.wishlist (user_id, product_id);

create index if not exists wishlist_user_created_idx
  on public.wishlist (user_id, created_at desc);

alter table public.wishlist enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'wishlist'
  loop
    execute format('drop policy %I on public.wishlist', existing_policy.policyname);
  end loop;
end
$$;

create policy "Customers can read their wishlist"
  on public.wishlist for select
  to authenticated
  using (user_id = auth.uid());

create policy "Customers can add to their wishlist"
  on public.wishlist for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Customers can remove from their wishlist"
  on public.wishlist for delete
  to authenticated
  using (user_id = auth.uid());
