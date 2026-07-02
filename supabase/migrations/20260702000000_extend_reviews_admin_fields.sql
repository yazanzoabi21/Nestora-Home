alter table public.reviews
add column if not exists status varchar(20) not null default 'published',
add column if not exists admin_reply text null,
add column if not exists admin_reply_at timestamp with time zone null,
add column if not exists admin_reply_by uuid null references public.profiles(id) on delete set null,
add column if not exists is_liked_by_admin boolean not null default false,
add column if not exists is_featured boolean not null default false,
add column if not exists helpful_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_status_check'
  ) then
    alter table public.reviews
    add constraint reviews_status_check
    check (status in ('pending', 'published', 'hidden'));
  end if;
end $$;

create index if not exists reviews_product_id_idx on public.reviews(product_id);
create index if not exists reviews_user_id_idx on public.reviews(user_id);
create index if not exists reviews_status_idx on public.reviews(status);
create index if not exists reviews_rating_idx on public.reviews(rating);
create index if not exists reviews_created_at_idx on public.reviews(created_at desc);
