create extension if not exists pg_trgm with schema extensions;

insert into public.customer_content_pages (
  slug, page_type, title_en, title_ar, subtitle_en, subtitle_ar,
  content_en, content_ar, meta_title_en, meta_title_ar,
  meta_description_en, meta_description_ar, sort_order
)
values
  (
    'contact-us', 'route', 'Contact Us', 'تواصل معنا',
    'Send us a message or connect through an official Nestora Home social channel.',
    'أرسلوا لنا رسالة أو تواصلوا معنا عبر إحدى قنوات Nestora Home الرسمية.',
    '[]'::jsonb, '[]'::jsonb,
    'Contact Us | Nestora Home', 'تواصل معنا | Nestora Home',
    'Contact Nestora Home for customer support and order questions.',
    'تواصلوا مع Nestora Home للحصول على دعم العملاء والمساعدة بشأن الطلبات.', 50
  ),
  (
    'faq', 'route', 'Frequently Asked Questions', 'الأسئلة الشائعة',
    'Find answers about orders, delivery, returns, and customer support.',
    'اعثروا على إجابات حول الطلبات والتوصيل والإرجاع ودعم العملاء.',
    '[]'::jsonb, '[]'::jsonb,
    'Frequently Asked Questions | Nestora Home', 'الأسئلة الشائعة | Nestora Home',
    'Find answers to common questions about shopping with Nestora Home.',
    'إجابات عن الأسئلة الشائعة حول التسوق مع Nestora Home.', 60
  )
on conflict (slug) do nothing;

create index if not exists products_search_name_trgm_idx
  on public.products using gin (lower(coalesce(name, '')) extensions.gin_trgm_ops)
  where is_active = true;
create index if not exists products_search_sku_idx
  on public.products (lower(btrim(sku)))
  where is_active = true and nullif(btrim(sku), '') is not null;
create index if not exists categories_search_name_trgm_idx
  on public.categories using gin (lower(coalesce(name, '')) extensions.gin_trgm_ops)
  where is_active = true;
create index if not exists customer_content_pages_title_en_trgm_idx
  on public.customer_content_pages using gin (lower(title_en) extensions.gin_trgm_ops)
  where is_active = true and is_published = true;
create index if not exists customer_content_pages_title_ar_trgm_idx
  on public.customer_content_pages using gin (lower(title_ar) extensions.gin_trgm_ops)
  where is_active = true and is_published = true;
create index if not exists customer_faqs_question_en_trgm_idx
  on public.customer_faqs using gin (lower(question_en) extensions.gin_trgm_ops)
  where is_active = true;
create index if not exists customer_faqs_question_ar_trgm_idx
  on public.customer_faqs using gin (lower(question_ar) extensions.gin_trgm_ops)
  where is_active = true;

create or replace function public.search_customer_site(
  p_query text,
  p_language text default 'en',
  p_limit integer default 15
)
returns table (
  id uuid,
  result_type text,
  title text,
  description text,
  image_url text,
  route text,
  score double precision,
  metadata jsonb
)
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_query text := regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g');
  v_query_lower text;
  v_language text := case when lower(coalesce(p_language, 'en')) = 'ar' then 'ar' else 'en' end;
  v_limit integer := greatest(1, least(coalesce(p_limit, 15), 20));
begin
  if char_length(v_query) < 2 then
    return;
  end if;

  v_query_lower := lower(v_query);

  return query
  with product_matches as (
    select
      product.id,
      'product'::text as result_type,
      product.name::text as title,
      left(coalesce(product.short_description, product.description, category.name, ''), 180)::text as description,
      coalesce(active_variant.image_url, product.image_url)::text as image_url,
      ('/shop/products/' || coalesce(nullif(product.slug, ''), product.id::text))::text as route,
      (
        case
          when lower(btrim(coalesce(product.sku, ''))) = v_query_lower then 1000
          when exists (
            select 1 from public.product_variants exact_variant
            where exact_variant.product_id = product.id
              and exact_variant.is_active = true
              and lower(btrim(coalesce(exact_variant.sku, ''))) = v_query_lower
          ) then 980
          when lower(product.name) = v_query_lower then 900
          when lower(product.name) like v_query_lower || '%' then 820
          when lower(product.name) like '%' || v_query_lower || '%' then 740
          when lower(coalesce(category.name, '')) = v_query_lower then 650
          when lower(coalesce(category.name, '')) like '%' || v_query_lower || '%' then 580
          when lower(coalesce(product.short_description, '')) like '%' || v_query_lower || '%' then 430
          when lower(coalesce(product.description, '')) like '%' || v_query_lower || '%' then 350
          when lower(coalesce(product.features::text, '')) like '%' || v_query_lower || '%' then 320
          else 180
        end
        + greatest(
            similarity(lower(product.name), v_query_lower) * 100,
            similarity(lower(coalesce(category.name, '')), v_query_lower) * 70
          )
      )::double precision as score,
      jsonb_build_object(
        'sku', coalesce(active_variant.sku, product.sku),
        'category', category.name,
        'category_slug', category.slug,
        'price', coalesce(active_variant.price, product.price),
        'sale_price', case
          when coalesce(active_variant.sale_price, product.sale_price) is not null
            and coalesce(active_variant.sale_price, product.sale_price) < coalesce(active_variant.price, product.price)
          then coalesce(active_variant.sale_price, product.sale_price)
          else null
        end
      ) as metadata
    from public.products product
    left join public.categories category
      on category.id = product.category_id and category.is_active = true
    left join lateral (
      select variant.sku, variant.price, variant.sale_price, variant.image_url
      from public.product_variants variant
      where variant.product_id = product.id and variant.is_active = true
      order by
        case when lower(btrim(coalesce(variant.sku, ''))) = v_query_lower then 0 else 1 end,
        variant.sort_order,
        variant.id
      limit 1
    ) active_variant on true
    where product.is_active = true
      and (
        lower(product.name) like '%' || v_query_lower || '%'
        or lower(coalesce(product.sku, '')) like '%' || v_query_lower || '%'
        or lower(coalesce(product.short_description, '')) like '%' || v_query_lower || '%'
        or lower(coalesce(product.description, '')) like '%' || v_query_lower || '%'
        or lower(coalesce(product.features::text, '')) like '%' || v_query_lower || '%'
        or lower(coalesce(category.name, '')) like '%' || v_query_lower || '%'
        or similarity(lower(product.name), v_query_lower) >= 0.30
        or exists (
          select 1
          from public.product_variants search_variant
          where search_variant.product_id = product.id
            and search_variant.is_active = true
            and (
              lower(coalesce(search_variant.sku, '')) like '%' || v_query_lower || '%'
              or lower(coalesce(search_variant.name, '')) like '%' || v_query_lower || '%'
              or lower(coalesce(search_variant.option_value, '')) like '%' || v_query_lower || '%'
            )
        )
      )
  ),
  category_matches as (
    select
      category.id,
      'category'::text as result_type,
      category.name::text as title,
      left(coalesce(category.description, ''), 180)::text as description,
      category.image_url::text as image_url,
      ('/shop/products?category=' || category.slug || '&source=search')::text as route,
      (
        case
          when lower(category.name) = v_query_lower then 850
          when lower(category.name) like v_query_lower || '%' then 760
          when lower(category.name) like '%' || v_query_lower || '%' then 680
          when lower(category.slug) = v_query_lower then 640
          when lower(coalesce(category.description, '')) like '%' || v_query_lower || '%' then 360
          else 170
        end
        + similarity(lower(category.name), v_query_lower) * 90
      )::double precision as score,
      jsonb_build_object('slug', category.slug, 'icon', category.icon) as metadata
    from public.categories category
    where category.is_active = true
      and (
        lower(category.name) like '%' || v_query_lower || '%'
        or lower(category.slug) like '%' || v_query_lower || '%'
        or lower(coalesce(category.description, '')) like '%' || v_query_lower || '%'
        or similarity(lower(category.name), v_query_lower) >= 0.30
      )
  ),
  page_source as (
    select
      page.id,
      page.slug,
      case when v_language = 'ar' then page.title_ar else page.title_en end as localized_title,
      case when v_language = 'ar' then page.subtitle_ar else page.subtitle_en end as localized_subtitle,
      case when v_language = 'ar' then page.content_ar else page.content_en end as localized_content
    from public.customer_content_pages page
    where page.is_active = true and page.is_published = true
  ),
  page_matches as (
    select
      page.id,
      'page'::text as result_type,
      page.localized_title::text as title,
      left(coalesce(page.localized_subtitle, ''), 180)::text as description,
      null::text as image_url,
      ('/' || page.slug)::text as route,
      (
        case
          when lower(page.localized_title) = v_query_lower then 820
          when lower(page.localized_title) like v_query_lower || '%' then 750
          when lower(page.localized_title) like '%' || v_query_lower || '%' then 680
          when lower(page.slug) like '%' || v_query_lower || '%' then 620
          when lower(coalesce(page.localized_subtitle, '')) like '%' || v_query_lower || '%' then 450
          when lower(page.localized_content::text) like '%' || v_query_lower || '%' then 300
          else 170
        end
        + similarity(lower(page.localized_title), v_query_lower) * 80
      )::double precision as score,
      jsonb_build_object('slug', page.slug) as metadata
    from page_source page
    where
      lower(page.localized_title) like '%' || v_query_lower || '%'
      or lower(page.slug) like '%' || v_query_lower || '%'
      or lower(coalesce(page.localized_subtitle, '')) like '%' || v_query_lower || '%'
      or lower(page.localized_content::text) like '%' || v_query_lower || '%'
      or similarity(lower(page.localized_title), v_query_lower) >= 0.30
  ),
  faq_source as (
    select
      faq.id,
      case when v_language = 'ar' then faq.question_ar else faq.question_en end as localized_question,
      case when v_language = 'ar' then faq.answer_ar else faq.answer_en end as localized_answer,
      faq.category
    from public.customer_faqs faq
    where faq.is_active = true
  ),
  faq_matches as (
    select
      faq.id,
      'faq'::text as result_type,
      faq.localized_question::text as title,
      left(faq.localized_answer, 140)::text as description,
      null::text as image_url,
      ('/faq?faq=' || faq.id::text)::text as route,
      (
        case
          when lower(faq.localized_question) = v_query_lower then 790
          when lower(faq.localized_question) like v_query_lower || '%' then 720
          when lower(faq.localized_question) like '%' || v_query_lower || '%' then 650
          when lower(coalesce(faq.category, '')) like '%' || v_query_lower || '%' then 420
          when lower(faq.localized_answer) like '%' || v_query_lower || '%' then 340
          else 160
        end
        + similarity(lower(faq.localized_question), v_query_lower) * 80
      )::double precision as score,
      jsonb_build_object('category', faq.category) as metadata
    from faq_source faq
    where
      lower(faq.localized_question) like '%' || v_query_lower || '%'
      or lower(faq.localized_answer) like '%' || v_query_lower || '%'
      or lower(coalesce(faq.category, '')) like '%' || v_query_lower || '%'
      or similarity(lower(faq.localized_question), v_query_lower) >= 0.30
  ),
  combined as (
    select * from product_matches
    union all
    select * from category_matches
    union all
    select * from page_matches
    union all
    select * from faq_matches
  ),
  ranked as (
    select
      combined.*,
      row_number() over (
        partition by combined.result_type
        order by combined.score desc, combined.title
      ) as type_rank
    from combined
  )
  select
    ranked.id,
    ranked.result_type,
    ranked.title,
    nullif(ranked.description, ''),
    ranked.image_url,
    ranked.route,
    ranked.score,
    ranked.metadata
  from ranked
  where
    (ranked.result_type = 'product' and ranked.type_rank <= 4)
    or (ranked.result_type = 'category' and ranked.type_rank <= 3)
    or (ranked.result_type = 'page' and ranked.type_rank <= 3)
    or (ranked.result_type = 'faq' and ranked.type_rank <= 4)
  order by ranked.score desc, ranked.title
  limit v_limit;
end;
$$;

revoke all on function public.search_customer_site(text, text, integer) from public;
grant execute on function public.search_customer_site(text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
