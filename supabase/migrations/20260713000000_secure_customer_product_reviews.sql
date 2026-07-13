alter table public.reviews enable row level security;

create unique index if not exists reviews_product_user_unique
on public.reviews(product_id, user_id)
where user_id is not null;

drop policy if exists "Public can read published reviews" on public.reviews;
create policy "Public can read published reviews"
on public.reviews for select
using (status = 'published');

drop policy if exists "Customers can read own reviews" on public.reviews;
create policy "Customers can read own reviews"
on public.reviews for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can manage reviews" on public.reviews;
create policy "Admins can manage reviews"
on public.reviews for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.name in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.name in ('admin', 'super_admin')
  )
);

create or replace function public.submit_product_review(
  p_product_id uuid,
  p_rating integer,
  p_comment text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_review_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5' using errcode = '22023'; end if;
  if length(trim(coalesce(p_comment, ''))) not between 1 and 1000 then raise exception 'Comment length is invalid' using errcode = '22023'; end if;

  insert into public.reviews (product_id, user_id, rating, comment, status)
  values (p_product_id, v_user_id, p_rating, trim(p_comment), 'published')
  returning id into v_review_id;
  return v_review_id;
end;
$$;

create or replace function public.edit_own_product_review(
  p_review_id uuid,
  p_rating integer,
  p_comment text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5' using errcode = '22023'; end if;
  if length(trim(coalesce(p_comment, ''))) not between 1 and 1000 then raise exception 'Comment length is invalid' using errcode = '22023'; end if;

  update public.reviews
  set rating = p_rating,
    comment = trim(p_comment),
    status = 'published'
  where id = p_review_id and user_id = auth.uid();
  if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.submit_product_review(uuid, integer, text) from public;
revoke all on function public.edit_own_product_review(uuid, integer, text) from public;
grant execute on function public.submit_product_review(uuid, integer, text) to authenticated;
grant execute on function public.edit_own_product_review(uuid, integer, text) to authenticated;
