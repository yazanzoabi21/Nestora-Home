alter table public.carts enable row level security;

create unique index if not exists carts_one_per_user_idx
on public.carts(user_id) where user_id is not null;

create table if not exists public.cart_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_cart_product_unique unique (cart_id, product_id)
);

create index if not exists cart_items_cart_id_idx on public.cart_items(cart_id);
create index if not exists cart_items_product_id_idx on public.cart_items(product_id);
create unique index if not exists cart_items_cart_product_unique_idx
on public.cart_items(cart_id, product_id);
alter table public.cart_items enable row level security;

drop policy if exists "Customers manage own cart" on public.carts;
create policy "Customers manage own cart" on public.carts for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Customers read own cart items" on public.cart_items;
create policy "Customers read own cart items" on public.cart_items for select to authenticated
using (exists (select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()));

drop policy if exists "Customers insert own cart items" on public.cart_items;
create policy "Customers insert own cart items" on public.cart_items for insert to authenticated
with check (exists (select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()));

drop policy if exists "Customers update own cart items" on public.cart_items;
create policy "Customers update own cart items" on public.cart_items for update to authenticated
using (exists (select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()))
with check (exists (select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()));

drop policy if exists "Customers delete own cart items" on public.cart_items;
create policy "Customers delete own cart items" on public.cart_items for delete to authenticated
using (exists (select 1 from public.carts where carts.id = cart_items.cart_id and carts.user_id = auth.uid()));
