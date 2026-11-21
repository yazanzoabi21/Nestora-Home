create function public.replace_product_media_image(
  p_media_id uuid,
  p_previous_url text,
  p_storage_path text,
  p_original_name text,
  p_file_size integer,
  p_embedding extensions.vector(384) default null
)
returns public.media_assets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  asset public.media_assets;
  product_id uuid;
  storage_prefix constant text := '/storage/v1/object/public/media-library/';
  new_url text;
begin
  if auth.uid() is null or public.current_user_is_admin() is distinct from true then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;

  select * into asset from public.media_assets where id = p_media_id for update;
  if not found
     or asset.file_url is distinct from p_previous_url
     or asset.is_deleted is true
     or asset.category is distinct from 'product'
     or asset.file_type is distinct from 'image'
     or asset.mime_type is distinct from 'image/png'
     or asset.bucket_name is distinct from 'media-library'
     or asset.width is distinct from 1254
     or asset.height is distinct from 1254
     or position(storage_prefix in asset.file_url) = 0 then
    raise exception 'Reopen the original 1254 × 1254 product PNG and try again.';
  end if;

  if p_storage_path is null
     or p_storage_path !~ ('^product/replacements/' || p_media_id::text || '/[0-9a-f-]{36}\.webp$')
     or p_file_size is null or p_file_size not between 1 and 499999
     or p_original_name is null or p_original_name !~* '\.webp$'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = asset.bucket_name and o.name = p_storage_path
         and o.owner_id = auth.uid()::text
         and o.metadata->>'mimetype' = 'image/webp'
         and o.metadata->>'size' = p_file_size::text
     ) then
    raise exception 'The staged WebP could not be verified.';
  end if;

  if exists (select 1 from public.categories where media_id = p_media_id or image_url = p_previous_url)
     or exists (select 1 from public.promotions where media_id = p_media_id or image_url = p_previous_url)
     or exists (select 1 from public.profiles where avatar_media_id = p_media_id or avatar_url = p_previous_url)
     or exists (select 1 from public.product_videos where poster_url = p_previous_url)
     or exists (
       select 1 from public.products
       where (media_id = p_media_id and image_url is distinct from p_previous_url)
          or (image_url = p_previous_url and media_id is not null and media_id <> p_media_id)
     )
     or exists (
       select 1 from public.product_variants
       where (media_id = p_media_id and image_url is distinct from p_previous_url)
          or (image_url = p_previous_url and media_id is not null and media_id <> p_media_id)
     ) then
    raise exception 'The original has an inconsistent or unsupported live reference. No images were changed.';
  end if;

  new_url := split_part(asset.file_url, storage_prefix, 1) || storage_prefix || p_storage_path;

  if exists (select 1 from public.products where image_url = p_previous_url) and p_embedding is null then
    raise exception 'Prepare the visual-search embedding before replacing a product cover.';
  end if;

  for product_id in
    update public.products
    set image_url = new_url
    where image_url = p_previous_url
    returning id
  loop
    perform public.upsert_product_image_embedding(
      product_id, new_url, p_embedding, 'onnx-community/dinov2-small-ONNX', 1
    );
  end loop;

  update public.product_variants
  set image_url = new_url
  where image_url = p_previous_url;

  update public.products p
  set gallery = (
    select jsonb_agg(
      case
        when item = to_jsonb(p_previous_url) then to_jsonb(new_url)
        when item->>'url' = p_previous_url then jsonb_set(item, '{url}', to_jsonb(new_url))
        else item
      end order by ordinal
    )
    from jsonb_array_elements(p.gallery) with ordinality as items(item, ordinal)
  )
  where jsonb_typeof(p.gallery) = 'array'
    and (p.gallery @> jsonb_build_array(p_previous_url)
      or p.gallery @> jsonb_build_array(jsonb_build_object('url', p_previous_url)));

  update public.media_assets
  set file_name = split_part(p_storage_path, '/', 4),
      original_name = p_original_name,
      storage_path = p_storage_path,
      file_url = new_url,
      mime_type = 'image/webp',
      file_size = p_file_size,
      updated_at = now()
  where id = p_media_id
  returning * into asset;

  if not found then
    raise exception 'The media record could not be updated.';
  end if;
  return asset;
end;
$$;

revoke all on function public.replace_product_media_image(uuid, text, text, text, integer, extensions.vector)
  from public, anon;
grant execute on function public.replace_product_media_image(uuid, text, text, text, integer, extensions.vector)
  to authenticated;
