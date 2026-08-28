begin;

create or replace function public.get_customer_image_search_index_count()
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
  from public.product_image_embeddings image_embedding
  join public.products product on product.id = image_embedding.product_id
  where product.is_active is true
    and product.image_url is not null
    and image_embedding.image_url = product.image_url
    and image_embedding.model = 'onnx-community/dinov2-small-ONNX'
    and image_embedding.embedding_version = 1;
$$;

revoke all on function public.get_customer_image_search_index_count() from public;
grant execute on function public.get_customer_image_search_index_count() to anon, authenticated;

commit;
