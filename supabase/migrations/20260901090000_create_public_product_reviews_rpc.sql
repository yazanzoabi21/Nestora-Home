-- Recreate the exact PostgREST signature in case an earlier deployment used
-- different argument names for the same PostgreSQL argument types.
drop function if exists public.get_public_product_reviews(uuid, integer);

create function public.get_public_product_reviews(
  p_product_id uuid default null,
  p_limit integer default null
)
returns table (
  id uuid,
  product_id uuid,
  user_id uuid,
  rating integer,
  comment text,
  status text,
  admin_reply text,
  admin_reply_at timestamp with time zone,
  admin_reply_by uuid,
  is_liked_by_admin boolean,
  is_featured boolean,
  helpful_count integer,
  created_at timestamp with time zone,
  profiles jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    review.id,
    review.product_id,
    review.user_id,
    review.rating,
    review.comment,
    review.status::text,
    review.admin_reply,
    review.admin_reply_at,
    review.admin_reply_by,
    review.is_liked_by_admin,
    review.is_featured,
    review.helpful_count,
    review.created_at,
    case
      when profile.id is null then null
      else jsonb_build_object(
        'id', profile.id,
        'full_name', profile.full_name,
        'avatar_url', profile.avatar_url
      )
    end as profiles
  from public.reviews review
  left join public.profiles profile on profile.id = review.user_id
  where review.status = 'published'
    and review.comment is not null
    and (p_product_id is null or review.product_id = p_product_id)
  order by
    case when p_product_id is null then review.is_featured end desc,
    review.created_at desc
  limit case when p_limit is null then null else greatest(p_limit, 0) end;
$$;

revoke all on function public.get_public_product_reviews(uuid, integer) from public;
grant execute on function public.get_public_product_reviews(uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';
