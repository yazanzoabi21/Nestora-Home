begin;

create extension if not exists vector with schema extensions;

create table if not exists public.product_image_embeddings (
  product_id uuid primary key references public.products(id) on delete cascade,
  image_url text not null check (btrim(image_url) <> ''),
  embedding extensions.vector(384) not null,
  model text not null,
  embedding_version integer not null check (embedding_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_image_embeddings enable row level security;

drop policy if exists "Admins can read product image embeddings"
  on public.product_image_embeddings;
create policy "Admins can read product image embeddings"
  on public.product_image_embeddings for select to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and profile.is_active = true
        and role.name in ('admin', 'super_admin')
    )
  );

drop policy if exists "Admins can maintain product image embeddings"
  on public.product_image_embeddings;
create policy "Admins can maintain product image embeddings"
  on public.product_image_embeddings for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and profile.is_active = true
        and role.name in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      join public.roles role on role.id = profile.role_id
      where profile.id = auth.uid()
        and profile.is_active = true
        and role.name in ('admin', 'super_admin')
    )
  );

create or replace function public.set_product_image_embedding_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_product_image_embedding_updated_at() from public, anon, authenticated;

drop trigger if exists set_product_image_embedding_updated_at
  on public.product_image_embeddings;
create trigger set_product_image_embedding_updated_at
before update on public.product_image_embeddings
for each row execute function public.set_product_image_embedding_updated_at();

create or replace function public.search_products_by_image(
  query_embedding extensions.vector(384),
  match_count integer default 10,
  minimum_similarity double precision default 0.45
)
returns table (
  product_id uuid,
  similarity double precision
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    image_embedding.product_id,
    (1 - (image_embedding.embedding operator(extensions.<=>) query_embedding))::double precision
      as similarity
  from public.product_image_embeddings image_embedding
  join public.products product on product.id = image_embedding.product_id
  where product.is_active = true
    and image_embedding.model = 'onnx-community/dinov2-small-ONNX'
    and image_embedding.embedding_version = 1
    and image_embedding.image_url = product.image_url
    and (1 - (image_embedding.embedding operator(extensions.<=>) query_embedding))
      >= greatest(least(coalesce(minimum_similarity, 0.45), 1.0), -1.0)
  order by image_embedding.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(coalesce(match_count, 10), 1), 12);
$$;

revoke all on function public.search_products_by_image(
  extensions.vector, integer, double precision
) from public;
grant execute on function public.search_products_by_image(
  extensions.vector, integer, double precision
) to anon, authenticated;

create or replace function public.get_product_image_embedding_status()
returns table (
  product_id uuid,
  image_url text,
  indexed_image_url text,
  index_state text
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and profile.is_active = true
      and role.name in ('admin', 'super_admin')
  ) then
    raise exception 'Admin access is required.';
  end if;

  return query
  select
    product.id,
    product.image_url,
    image_embedding.image_url,
    case
      when nullif(btrim(product.image_url), '') is null then 'no-image'
      when image_embedding.product_id is null then 'missing'
      when image_embedding.model <> 'onnx-community/dinov2-small-ONNX'
        or image_embedding.embedding_version <> 1
        or image_embedding.image_url <> product.image_url then 'stale'
      else 'indexed'
    end
  from public.products product
  left join public.product_image_embeddings image_embedding
    on image_embedding.product_id = product.id
  order by product.created_at desc nulls last, product.id;
end;
$$;

revoke all on function public.get_product_image_embedding_status() from public, anon;
grant execute on function public.get_product_image_embedding_status() to authenticated;

create or replace function public.upsert_product_image_embedding(
  p_product_id uuid,
  p_image_url text,
  p_embedding extensions.vector(384),
  p_model text,
  p_embedding_version integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and profile.is_active = true
      and role.name in ('admin', 'super_admin')
  ) then
    raise exception 'Admin access is required.';
  end if;

  if p_model <> 'onnx-community/dinov2-small-ONNX' or p_embedding_version <> 1 then
    raise exception 'Unsupported image embedding configuration.';
  end if;

  if not exists (
    select 1 from public.products product
    where product.id = p_product_id and product.image_url = p_image_url
  ) then
    raise exception 'The product image changed before indexing completed.';
  end if;

  insert into public.product_image_embeddings (
    product_id, image_url, embedding, model, embedding_version
  ) values (
    p_product_id, p_image_url, p_embedding, p_model, p_embedding_version
  )
  on conflict (product_id) do update set
    image_url = excluded.image_url,
    embedding = excluded.embedding,
    model = excluded.model,
    embedding_version = excluded.embedding_version,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_product_image_embedding(
  uuid, text, extensions.vector, text, integer
) from public, anon;
grant execute on function public.upsert_product_image_embedding(
  uuid, text, extensions.vector, text, integer
) to authenticated;

create or replace function public.delete_product_image_embedding(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    where profile.id = auth.uid()
      and profile.is_active = true
      and role.name in ('admin', 'super_admin')
  ) then
    raise exception 'Admin access is required.';
  end if;

  delete from public.product_image_embeddings where product_id = p_product_id;
end;
$$;

revoke all on function public.delete_product_image_embedding(uuid) from public, anon;
grant execute on function public.delete_product_image_embedding(uuid) to authenticated;

commit;

