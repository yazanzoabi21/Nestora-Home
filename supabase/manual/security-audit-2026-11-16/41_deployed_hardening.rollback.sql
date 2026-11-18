-- METADATA-BACKED LOCAL DRAFT. NOT EXECUTED. Do not deploy automatically.
-- Source capture: 2026-11-16T20:40:00.871329; export MD5 6372743879c1d24f0dec261a9330b64d.
-- Supersedes 10/11/20 proposals; NEVER combine the two packages.
-- Rerunnable target state. Re-export/review drift and rehearse on staging first.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$ begin
  if current_user <> 'postgres' then raise exception 'Run as reviewed postgres owner'; end if;
  if not (select rolbypassrls from pg_roles where rolname=current_user) then raise exception 'Reviewed trusted BYPASSRLS owner required'; end if;
  if current_setting('nestora.security_rollback_approved',true) is distinct from 'yes' then
    raise exception 'Local draft: separate explicit execution approval required';
  end if;
end $guard$;
drop policy if exists "security_20261116_active_actor" on "public"."carts";
drop policy if exists "security_20261116_active_actor" on "public"."cart_items";
drop policy if exists "security_20261116_active_actor" on "public"."customer_addresses";
drop policy if exists "security_20261116_active_actor" on "public"."customer_notification_preferences";
drop policy if exists "security_20261116_active_actor" on "public"."customer_product_history";
drop policy if exists "security_20261116_active_actor" on "public"."customer_loyalty_points_balances";
drop policy if exists "security_20261116_active_actor" on "public"."customer_loyalty_points_ledger";
drop policy if exists "security_20261116_active_actor" on "public"."customers";
drop policy if exists "security_20261116_active_actor" on "public"."notifications";
drop policy if exists "security_20261116_active_actor" on "public"."orders";
drop policy if exists "security_20261116_active_actor" on "public"."order_items";
drop policy if exists "security_20261116_active_actor" on "public"."order_shipping_addresses";
drop policy if exists "security_20261116_active_actor" on "public"."payment_transactions";
drop policy if exists "security_20261116_active_profile_edit" on "public"."profiles";
drop policy if exists "Admins can manage customer contact messages" on "public"."customer_contact_messages";
create policy "Admins can manage customer contact messages" on "public"."customer_contact_messages" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))) with check ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[]))))));
drop policy if exists "Admins can manage customer content" on "public"."customer_content_pages";
create policy "Admins can manage customer content" on "public"."customer_content_pages" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))) with check ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[]))))));
drop policy if exists "Admins can manage customer FAQs" on "public"."customer_faqs";
create policy "Admins can manage customer FAQs" on "public"."customer_faqs" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))) with check ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[]))))));
drop policy if exists "admins can update loyalty settings" on "public"."loyalty_program_settings";
create policy "admins can update loyalty settings" on "public"."loyalty_program_settings" as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))) with check ((id = true));
drop policy if exists "Admins can manage product variants" on "public"."product_variants";
create policy "Admins can manage product variants" on "public"."product_variants" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))) with check ((EXISTS ( SELECT 1
   FROM (profiles profile
     JOIN roles role ON ((role.id = profile.role_id)))
  WHERE ((profile.id = auth.uid()) AND ((role.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[]))))));
drop policy if exists "Authenticated users can delete product videos" on "public"."product_videos";
create policy "Authenticated users can delete product videos" on "public"."product_videos" as PERMISSIVE for DELETE to "authenticated" using (true);
drop policy if exists "Authenticated users can insert product videos" on "public"."product_videos";
create policy "Authenticated users can insert product videos" on "public"."product_videos" as PERMISSIVE for INSERT to "authenticated" with check (true);
drop policy if exists "Authenticated users can update product videos" on "public"."product_videos";
create policy "Authenticated users can update product videos" on "public"."product_videos" as PERMISSIVE for UPDATE to "authenticated" using (true) with check (true);
drop policy if exists "Admins can manage reviews" on "public"."reviews";
create policy "Admins can manage reviews" on "public"."reviews" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))) with check ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN roles r ON ((r.id = p.role_id)))
  WHERE ((p.id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[]))))));
drop policy if exists "Authenticated users can delete product images" on "storage"."objects";
create policy "Authenticated users can delete product images" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using ((bucket_id = 'product-images'::text));
drop policy if exists "Authenticated users can delete product videos" on "storage"."objects";
create policy "Authenticated users can delete product videos" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using ((bucket_id = 'product-videos'::text));
drop policy if exists "Authenticated users can update product images" on "storage"."objects";
create policy "Authenticated users can update product images" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using ((bucket_id = 'product-images'::text)) with check ((bucket_id = 'product-images'::text));
drop policy if exists "Authenticated users can upload product images" on "storage"."objects";
create policy "Authenticated users can upload product images" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check ((bucket_id = 'product-images'::text));
drop policy if exists "Authenticated users can upload product videos" on "storage"."objects";
create policy "Authenticated users can upload product videos" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check ((bucket_id = 'product-videos'::text));
drop policy if exists "media_library_delete" on "storage"."objects";
create policy "media_library_delete" on "storage"."objects" as PERMISSIVE for DELETE to "anon", "authenticated" using ((bucket_id = 'media-library'::text));
drop policy if exists "media_library_update" on "storage"."objects";
create policy "media_library_update" on "storage"."objects" as PERMISSIVE for UPDATE to "anon", "authenticated" using ((bucket_id = 'media-library'::text)) with check ((bucket_id = 'media-library'::text));
drop policy if exists "media_library_upload" on "storage"."objects";
create policy "media_library_upload" on "storage"."objects" as PERMISSIVE for INSERT to "anon", "authenticated" with check ((bucket_id = 'media-library'::text));
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.roles r
      on r.id = p.role_id
    where p.id = auth.uid()
      and lower(r.name::text) in (
        'admin',
        'super_admin'
      )
      and coalesce(p.is_active, true) = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.can_manage_customer_offers()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.roles r
      on r.id = p.role_id
    where p.id = auth.uid()
      and coalesce(p.is_active, true)
      and lower(
        replace(
          replace(
            trim(
              coalesce(
                to_jsonb(r) ->> 'code',
                to_jsonb(r) ->> 'name',
                to_jsonb(r) ->> 'role_name',
                to_jsonb(r) ->> 'role',
                ''
              )
            ),
            ' ',
            '_'
          ),
          '-',
          '_'
        )
      ) in ('admin', 'super_admin')
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles p
    inner join public.roles r
      on r.id = p.role_id
    where p.id = (select auth.uid())
      and lower(replace(r.name, ' ', '_')) in ('admin', 'super_admin')
      and coalesce(p.is_active, true) = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.prevent_customer_profile_privilege_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_role_name text;
begin
  select name into old_role_name from public.roles where id = old.role_id;

  if old_role_name = 'customer' and auth.role() <> 'service_role' then
    new.role_id := old.role_id;
    new.is_active := old.is_active;
    new.email := old.email;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_product_review(p_product_id uuid, p_rating integer, p_comment text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.edit_own_product_review(p_review_id uuid, p_rating integer, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.record_product_view(target_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'No authenticated Supabase user was provided';
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
    view_count = public.customer_product_history.view_count + 1;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.replace_cart_free_gifts(p_cart_id uuid, p_discount_id uuid, p_product_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_gift_quantity integer;
  v_ids uuid[];
begin
  if not exists (
    select 1
    from public.carts as cart
    where cart.id = p_cart_id
      and cart.user_id = auth.uid()
  ) then
    raise exception 'You do not have access to this cart.';
  end if;

  select discount.gift_quantity
  into v_gift_quantity
  from public.discounts as discount
  where discount.id = p_discount_id
    and discount.discount_type = 'free_gift'
    and discount.is_active = true;

  if not found then
    raise exception 'The free-gift promotion is unavailable.';
  end if;

  if coalesce(cardinality(p_product_ids), 0) > v_gift_quantity
    or coalesce(cardinality(p_product_ids), 0) <> coalesce(
      (
        select count(distinct selected.product_id)
        from unnest(coalesce(p_product_ids, array[]::uuid[]))
          as selected(product_id)
      ),
      0
    )
  then
    raise exception 'The free-gift selection is invalid.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_product_ids, array[]::uuid[]))
      as selected(product_id)

    left join public.discount_gift_products as dgp
      on dgp.discount_id = p_discount_id
      and dgp.product_id = selected.product_id

    left join public.products as product
      on product.id = selected.product_id

    where dgp.id is null
      or dgp.is_active is distinct from true
      or product.id is null
      or product.is_active is distinct from true
      or coalesce(product.stock, 0) < 1
  ) then
    raise exception
      'This gift is no longer available. Please choose another free gift.';
  end if;

  delete from public.cart_items as cart_item
  where cart_item.cart_id = p_cart_id
    and cart_item.is_free_gift = true
    and cart_item.applied_discount_id = p_discount_id;

  with inserted as (
    insert into public.cart_items (
      cart_id,
      product_id,
      quantity,
      is_free_gift,
      applied_discount_id
    )
    select
      p_cart_id,
      selected.product_id,
      1,
      true,
      p_discount_id
    from unnest(coalesce(p_product_ids, array[]::uuid[]))
      as selected(product_id)
    returning id
  )
  select coalesce(
    array_agg(inserted.id),
    array[]::uuid[]
  )
  into v_ids
  from inserted;

  return v_ids;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_inventory_stock(p_product_id uuid, p_new_stock integer, p_change_type text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_previous_stock integer;
begin
  if p_new_stock is null or p_new_stock < 0 then
    raise exception 'Stock must be a non-negative integer.';
  end if;

  if p_change_type not in ('restock', 'adjustment', 'damage', 'return', 'correction') then
    raise exception 'Invalid inventory change type.';
  end if;

  select coalesce(stock, 0)
  into v_previous_stock
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  update public.products
  set stock = p_new_stock
  where id = p_product_id;

  insert into public.inventory_logs (
    product_id,
    previous_stock,
    new_stock,
    change_type,
    note
  )
  values (
    p_product_id,
    v_previous_stock,
    p_new_stock,
    p_change_type,
    nullif(btrim(p_note), '')
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.replace_product_variants(p_product_id uuid, p_variants jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin

  -- Remove old variants for this product
  delete from public.product_variants
  where product_id = p_product_id;


  -- Insert the new variants
  insert into public.product_variants (
    product_id,
    name,
    option_name,
    option_value,
    sku,
    price,
    sale_price,
    stock,
    sort_order,
    is_active,
    image_url,
    media_id,
    attributes
  )
  select
    p_product_id,

    nullif(v.variant ->> 'name', ''),

    nullif(v.variant ->> 'option_name', ''),

    nullif(v.variant ->> 'option_value', ''),

    nullif(v.variant ->> 'sku', ''),

    coalesce(
      nullif(v.variant ->> 'price', '')::numeric,
      0
    ),

    nullif(v.variant ->> 'sale_price', '')::numeric,

    coalesce(
      nullif(v.variant ->> 'stock', '')::integer,
      0
    ),

    coalesce(
      nullif(v.variant ->> 'sort_order', '')::integer,
      (v.ordinality - 1)::integer
    ),

    coalesce(
      (v.variant ->> 'is_active')::boolean,
      true
    ),

    nullif(v.variant ->> 'image_url', ''),

    nullif(v.variant ->> 'media_id', '')::uuid,

    coalesce(
      v.variant -> 'attributes',
      '{}'::jsonb
    )

  from jsonb_array_elements(
    coalesce(p_variants, '[]'::jsonb)
  )
  with ordinality as v(variant, ordinality);

end;
$function$
;
CREATE OR REPLACE FUNCTION public.replace_promotion_products(p_promotion_id uuid, p_product_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  delete from public.promotion_products
  where promotion_id = p_promotion_id;

  insert into public.promotion_products (
    promotion_id,
    product_id,
    sort_order,
    promotional_price
  )
  select
    p_promotion_id,
    selected_product.product_id,
    min(selected_product.position)::integer - 1,
    null
  from unnest(
    coalesce(p_product_ids, array[]::uuid[])
  ) with ordinality as selected_product(product_id, position)
  where selected_product.product_id is not null
  group by selected_product.product_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_analytics(p_period_key text)
 RETURNS analytics
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_end date := current_date;
  v_start date;
  v_label text;

  v_prev_start date;
  v_prev_end date;

  v_total_revenue numeric := 0;
  v_prev_revenue numeric := 0;
  v_order_count integer := 0;
  v_avg_order numeric := 0;
  v_revenue_growth numeric := 0;

  v_visits integer := 0;
  v_product_views integer := 0;
  v_add_to_cart integer := 0;
  v_checkout integer := 0;
  v_purchases integer := 0;
  v_conversion numeric := 0;

  v_new_customers integer := 0;
  v_prev_new_customers integer := 0;
  v_new_customers_growth numeric := 0;
  v_repeat_rate numeric := 0;
  v_cart_abandonment numeric := 0;
  v_avg_rating_pct numeric := 0;

  v_kpis jsonb;
  v_revenue_chart jsonb;
  v_customer_chart jsonb;
  v_category_split jsonb;
  v_funnel jsonb;
  v_weekly jsonb;
  v_performance jsonb;

  v_row public.analytics;
begin
  case upper(p_period_key)
    when '7D' then
      v_start := v_end - 6;
      v_label := 'Last 7 days';
    when '30D' then
      v_start := v_end - 29;
      v_label := 'Last 30 days';
    when '3M' then
      v_start := (v_end - interval '3 months')::date;
      v_label := 'Last 3 months';
    else
      v_start := (v_end - interval '12 months')::date;
      v_label := 'Last 12 months';
  end case;

  v_prev_end := v_start - 1;
  v_prev_start := v_prev_end - (v_end - v_start);

  select
    coalesce(sum(total), 0),
    count(*)
  into v_total_revenue, v_order_count
  from public.orders
  where created_at >= v_start::timestamptz
    and created_at < (v_end + 1)::timestamptz
    and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'refunded');

  select coalesce(sum(total), 0)
  into v_prev_revenue
  from public.orders
  where created_at >= v_prev_start::timestamptz
    and created_at < (v_prev_end + 1)::timestamptz
    and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'refunded');

  v_avg_order := case when v_order_count > 0 then v_total_revenue / v_order_count else 0 end;

  v_revenue_growth := case
    when v_prev_revenue = 0 and v_total_revenue > 0 then 100
    when v_prev_revenue = 0 then 0
    else ((v_total_revenue - v_prev_revenue) / v_prev_revenue) * 100
  end;

  select count(*)
  into v_new_customers
  from public.customers
  where created_at >= v_start::timestamptz
    and created_at < (v_end + 1)::timestamptz;

  select count(*)
  into v_prev_new_customers
  from public.customers
  where created_at >= v_prev_start::timestamptz
    and created_at < (v_prev_end + 1)::timestamptz;

  v_new_customers_growth := case
    when v_prev_new_customers = 0 and v_new_customers > 0 then 100
    when v_prev_new_customers = 0 then 0
    else ((v_new_customers - v_prev_new_customers)::numeric / v_prev_new_customers) * 100
  end;

  select count(*)
  into v_visits
  from public.activity_logs
  where created_at >= v_start::timestamptz
    and created_at < (v_end + 1)::timestamptz
    and lower(coalesce(action, '')) in ('visit', 'page_view', 'view');

  select count(*)
  into v_product_views
  from public.activity_logs
  where created_at >= v_start::timestamptz
    and created_at < (v_end + 1)::timestamptz
    and lower(coalesce(action, '')) in ('product_view', 'view_product');

  select count(*)
  into v_add_to_cart
  from public.cart_items
  where created_at >= v_start::timestamptz
    and created_at < (v_end + 1)::timestamptz;

  select count(*)
  into v_checkout
  from public.activity_logs
  where created_at >= v_start::timestamptz
    and created_at < (v_end + 1)::timestamptz
    and lower(coalesce(action, '')) in ('checkout', 'start_checkout');

  v_purchases := v_order_count;

  v_conversion := case
    when v_visits > 0 then (v_purchases::numeric / v_visits) * 100
    else 0
  end;

  select case
    when count(*) = 0 then 0
    else (count(*) filter (where coalesce(total_orders, 0) > 1)::numeric / count(*)) * 100
  end
  into v_repeat_rate
  from public.customers;

  select coalesce(avg(rating), 0) * 20
  into v_avg_rating_pct
  from public.products
  where rating is not null;

  with cart_users as (
    select distinct c.user_id
    from public.carts c
    join public.cart_items ci on ci.cart_id = c.id
    where ci.created_at >= v_start::timestamptz
      and ci.created_at < (v_end + 1)::timestamptz
  ),
  order_users as (
    select distinct user_id
    from public.orders
    where created_at >= v_start::timestamptz
      and created_at < (v_end + 1)::timestamptz
  )
  select case
    when count(*) = 0 then 0
    else (
      count(*) filter (where ou.user_id is null)::numeric / count(*)
    ) * 100
  end
  into v_cart_abandonment
  from cart_users cu
  left join order_users ou on ou.user_id = cu.user_id;

  if upper(p_period_key) in ('7D', '30D') then
    with buckets as (
      select generate_series(v_start, v_end, interval '1 day')::date as bucket
    ),
    revenue as (
      select
        created_at::date as bucket,
        sum(total) as amount
      from public.orders
      where created_at >= v_start::timestamptz
        and created_at < (v_end + 1)::timestamptz
        and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'refunded')
      group by created_at::date
    )
    select jsonb_build_object(
      'labels', jsonb_agg(to_char(b.bucket, 'DD Mon') order by b.bucket),
      'revenue', jsonb_agg(coalesce(r.amount, 0) order by b.bucket),
      'target', '[]'::jsonb
    )
    into v_revenue_chart
    from buckets b
    left join revenue r on r.bucket = b.bucket;

    with buckets as (
      select generate_series(v_start, v_end, interval '1 day')::date as bucket
    ),
    customers_by_day as (
      select
        created_at::date as bucket,
        count(*) as total
      from public.customers
      where created_at >= v_start::timestamptz
        and created_at < (v_end + 1)::timestamptz
      group by created_at::date
    )
    select jsonb_build_object(
      'labels', jsonb_agg(to_char(b.bucket, 'DD Mon') order by b.bucket),
      'newCustomers', jsonb_agg(coalesce(c.total, 0) order by b.bucket),
      'returningCustomers', '[]'::jsonb
    )
    into v_customer_chart
    from buckets b
    left join customers_by_day c on c.bucket = b.bucket;
  else
    with buckets as (
      select generate_series(
        date_trunc('month', v_start::timestamp),
        date_trunc('month', v_end::timestamp),
        interval '1 month'
      )::date as bucket
    ),
    revenue as (
      select
        date_trunc('month', created_at)::date as bucket,
        sum(total) as amount
      from public.orders
      where created_at >= v_start::timestamptz
        and created_at < (v_end + 1)::timestamptz
        and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'refunded')
      group by date_trunc('month', created_at)::date
    )
    select jsonb_build_object(
      'labels', jsonb_agg(to_char(b.bucket, 'Mon') order by b.bucket),
      'revenue', jsonb_agg(coalesce(r.amount, 0) order by b.bucket),
      'target', '[]'::jsonb
    )
    into v_revenue_chart
    from buckets b
    left join revenue r on r.bucket = b.bucket;

    with buckets as (
      select generate_series(
        date_trunc('month', v_start::timestamp),
        date_trunc('month', v_end::timestamp),
        interval '1 month'
      )::date as bucket
    ),
    customers_by_month as (
      select
        date_trunc('month', created_at)::date as bucket,
        count(*) as total
      from public.customers
      where created_at >= v_start::timestamptz
        and created_at < (v_end + 1)::timestamptz
      group by date_trunc('month', created_at)::date
    )
    select jsonb_build_object(
      'labels', jsonb_agg(to_char(b.bucket, 'Mon') order by b.bucket),
      'newCustomers', jsonb_agg(coalesce(c.total, 0) order by b.bucket),
      'returningCustomers', '[]'::jsonb
    )
    into v_customer_chart
    from buckets b
    left join customers_by_month c on c.bucket = b.bucket;
  end if;

  with category_revenue as (
    select
      coalesce(cat.name, 'Uncategorized') as label,
      sum(oi.total) as amount
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.categories cat on cat.id = p.category_id
    where o.created_at >= v_start::timestamptz
      and o.created_at < (v_end + 1)::timestamptz
      and lower(coalesce(o.status, '')) not in ('cancelled', 'canceled', 'refunded')
    group by coalesce(cat.name, 'Uncategorized')
  ),
  total_category as (
    select coalesce(sum(amount), 0) as total_amount
    from category_revenue
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'label', cr.label,
        'value', case when tc.total_amount > 0 then round((cr.amount / tc.total_amount) * 100, 2) else 0 end
      )
      order by cr.amount desc
    ),
    '[]'::jsonb
  )
  into v_category_split
  from category_revenue cr
  cross join total_category tc;

  v_funnel := jsonb_build_array(
    jsonb_build_object(
      'step', 1,
      'label', 'Visits',
      'value', v_visits,
      'percentage', case when v_visits > 0 then 100 else 0 end,
      'dropOff', null
    ),
    jsonb_build_object(
      'step', 2,
      'label', 'Product Views',
      'value', v_product_views,
      'percentage', case when v_visits > 0 then round((v_product_views::numeric / v_visits) * 100, 2) else 0 end,
      'dropOff', greatest(v_visits - v_product_views, 0)
    ),
    jsonb_build_object(
      'step', 3,
      'label', 'Add to Cart',
      'value', v_add_to_cart,
      'percentage', case when v_visits > 0 then round((v_add_to_cart::numeric / v_visits) * 100, 2) else 0 end,
      'dropOff', greatest(v_product_views - v_add_to_cart, 0)
    ),
    jsonb_build_object(
      'step', 4,
      'label', 'Checkout',
      'value', v_checkout,
      'percentage', case when v_visits > 0 then round((v_checkout::numeric / v_visits) * 100, 2) else 0 end,
      'dropOff', greatest(v_add_to_cart - v_checkout, 0)
    ),
    jsonb_build_object(
      'step', 5,
      'label', 'Purchase',
      'value', v_purchases,
      'percentage', case when v_visits > 0 then round((v_purchases::numeric / v_visits) * 100, 2) else 0 end,
      'dropOff', greatest(v_checkout - v_purchases, 0)
    )
  );

  with days(dow, label) as (
    values
      (1, 'Mon'),
      (2, 'Tue'),
      (3, 'Wed'),
      (4, 'Thu'),
      (5, 'Fri'),
      (6, 'Sat'),
      (7, 'Sun')
  ),
  sales as (
    select
      extract(isodow from created_at)::int as dow,
      sum(total) as amount
    from public.orders
    where created_at >= v_start::timestamptz
      and created_at < (v_end + 1)::timestamptz
      and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'refunded')
    group by extract(isodow from created_at)::int
  )
  select jsonb_build_object(
    'labels', jsonb_agg(d.label order by d.dow),
    'revenue', jsonb_agg(coalesce(s.amount, 0) order by d.dow)
  )
  into v_weekly
  from days d
  left join sales s on s.dow = d.dow;

  v_kpis := jsonb_build_array(
    jsonb_build_object(
      'icon', 'pi pi-dollar',
      'tone', case when v_revenue_growth < 0 then 'negative' else 'positive' end,
      'title', 'Total Revenue',
      'value', '$' || trim(to_char(v_total_revenue, 'FM999G999G999G990D00')),
      'change', case when v_revenue_growth >= 0 then '+' else '' end || round(v_revenue_growth, 1)::text || '%',
      'changeLabel', 'vs previous period'
    ),
    jsonb_build_object(
      'icon', 'pi pi-chart-line',
      'tone', case when v_revenue_growth < 0 then 'negative' else 'positive' end,
      'title', 'Revenue Growth',
      'value', round(v_revenue_growth, 1)::text || '%',
      'change', case when v_revenue_growth >= 0 then '+' else '' end || round(v_revenue_growth, 1)::text || '%',
      'changeLabel', 'vs previous period'
    ),
    jsonb_build_object(
      'icon', 'pi pi-percentage',
      'tone', case when v_conversion < 0 then 'negative' else 'positive' end,
      'title', 'Conversion Rate',
      'value', round(v_conversion, 2)::text || '%',
      'change', '+0%',
      'changeLabel', 'from tracked events'
    ),
    jsonb_build_object(
      'icon', 'pi pi-shopping-cart',
      'tone', 'positive',
      'title', 'Avg Order Value',
      'value', '$' || trim(to_char(v_avg_order, 'FM999G999G999G990D00')),
      'change', '+0%',
      'changeLabel', 'current period'
    )
  );

  v_performance := jsonb_build_array(
    jsonb_build_object(
      'tone', case when v_revenue_growth < 0 then 'negative' else 'positive' end,
      'label', 'Revenue Growth',
      'value', round(abs(v_revenue_growth), 1),
      'displayValue', round(v_revenue_growth, 1)::text || '%'
    ),
    jsonb_build_object(
      'tone', case when v_new_customers_growth < 0 then 'negative' else 'positive' end,
      'label', 'New Customers Growth',
      'value', round(abs(v_new_customers_growth), 1),
      'displayValue', round(v_new_customers_growth, 1)::text || '%'
    ),
    jsonb_build_object(
      'tone', 'positive',
      'label', 'Repeat Purchase Rate',
      'value', round(v_repeat_rate, 1),
      'displayValue', round(v_repeat_rate, 1)::text || '%'
    ),
    jsonb_build_object(
      'tone', case when v_cart_abandonment > 50 then 'negative' else 'positive' end,
      'label', 'Cart Abandonment Rate',
      'value', round(v_cart_abandonment, 1),
      'displayValue', round(v_cart_abandonment, 1)::text || '%'
    ),
    jsonb_build_object(
      'tone', 'positive',
      'label', 'Avg Review Score',
      'value', round(v_avg_rating_pct, 1),
      'displayValue', round(v_avg_rating_pct, 1)::text || '%'
    )
  );

  insert into public.analytics (
    period_key,
    period_label,
    start_date,
    end_date,
    kpi_cards,
    revenue_growth_chart,
    customer_growth_chart,
    category_revenue_split,
    conversion_funnel,
    weekly_sales_pattern,
    performance_breakdown,
    updated_at
  )
  values (
    upper(p_period_key),
    v_label,
    v_start,
    v_end,
    v_kpis,
    v_revenue_chart,
    v_customer_chart,
    v_category_split,
    v_funnel,
    v_weekly,
    v_performance,
    now()
  )
  on conflict (period_key, start_date, end_date)
  do update set
    period_label = excluded.period_label,
    kpi_cards = excluded.kpi_cards,
    revenue_growth_chart = excluded.revenue_growth_chart,
    customer_growth_chart = excluded.customer_growth_chart,
    category_revenue_split = excluded.category_revenue_split,
    conversion_funnel = excluded.conversion_funnel,
    weekly_sales_pattern = excluded.weekly_sales_pattern,
    performance_breakdown = excluded.performance_breakdown,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_dashboard_statistics(p_period_key text DEFAULT '30D'::text)
 RETURNS dashboard_statistics
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_start_date date;
  v_end_date date := current_date;
  v_step interval;
  v_label_format text;

  v_result public.dashboard_statistics;

  v_total_revenue numeric := 0;
  v_total_orders bigint := 0;
  v_total_customers bigint := 0;
  v_active_products bigint := 0;

  v_avg_order_value numeric := 0;
  v_return_rate numeric := 0;
begin
  if p_period_key = '7D' then
    v_start_date := current_date - interval '6 days';
    v_step := interval '1 day';
    v_label_format := 'DD Mon';
  elsif p_period_key = '30D' then
    v_start_date := current_date - interval '29 days';
    v_step := interval '1 day';
    v_label_format := 'DD Mon';
  elsif p_period_key = '3M' then
    v_start_date := date_trunc('month', current_date - interval '2 months')::date;
    v_step := interval '1 month';
    v_label_format := 'Mon';
  elsif p_period_key = '12M' then
    v_start_date := date_trunc('month', current_date - interval '11 months')::date;
    v_step := interval '1 month';
    v_label_format := 'Mon';
  elsif p_period_key = 'ALL' then
    select coalesce(
      date_trunc('month', min(o.created_at))::date,
      date_trunc('month', current_date)::date
    ) into v_start_date
    from public.orders o;
    v_step := interval '1 month';
    v_label_format := 'Mon YYYY';
  else
    p_period_key := '30D';
    v_start_date := current_date - interval '29 days';
    v_step := interval '1 day';
    v_label_format := 'DD Mon';
  end if;

  select coalesce(sum(o.total), 0)
  into v_total_revenue
  from public.orders o
  where o.created_at::date between v_start_date and v_end_date
    and lower(coalesce(o.status, '')) not in ('cancelled', 'canceled', 'refunded', 'returned');

  select count(*)
  into v_total_orders
  from public.orders o
  where o.created_at::date between v_start_date and v_end_date;

  select count(*)
  into v_total_customers
  from public.customers c;

  select count(*)
  into v_active_products
  from public.products p
  where coalesce(p.is_active, true) = true;

  if v_total_orders > 0 then
    v_avg_order_value := v_total_revenue / v_total_orders;
  end if;

  select
    case
      when count(*) = 0 then 0
      else round(
        count(*) filter (
          where lower(coalesce(o.status, '')) in ('returned', 'refunded')
             or lower(coalesce(o.payment_status, '')) = 'refunded'
        )::numeric / count(*)::numeric * 100,
        2
      )
    end
  into v_return_rate
  from public.orders o
  where o.created_at::date between v_start_date and v_end_date;

  insert into public.dashboard_statistics (
    period_key,
    period_label,
    start_date,
    end_date,
    kpi_cards,
    revenue_overview_chart,
    sales_orders_chart,
    sales_category_chart,
    sales_performance_card,
    recent_orders_card,
    best_selling_products_card,
    missing_notes,
    generated_at
  )
  values (
    p_period_key,
    p_period_key,
    v_start_date,
    v_end_date,

    jsonb_build_array(
      jsonb_build_object(
        'title', 'Total Revenue',
        'titleKey', 'DASHBOARD.TOTAL_REVENUE',
        'value', concat('$', round(v_total_revenue, 2)),
        'icon', 'pi pi-dollar',
        'iconColor', '#5f6f43',
        'iconBg', '#eef4e8',
        'trend', '+0%',
        'trendType', 'up',
        'trendColor', '#5f6f43',
        'chartColor', '#5f6f43',
        'chartData', jsonb_build_array()
      ),
      jsonb_build_object(
        'title', 'Total Orders',
        'titleKey', 'DASHBOARD.TOTAL_ORDERS',
        'value', v_total_orders::text,
        'icon', 'pi pi-shopping-cart',
        'iconColor', '#3b82f6',
        'iconBg', '#eaf2ff',
        'trend', '+0%',
        'trendType', 'up',
        'trendColor', '#3b82f6',
        'chartColor', '#3b82f6',
        'chartData', jsonb_build_array()
      ),
      jsonb_build_object(
        'title', 'Total Customers',
        'titleKey', 'DASHBOARD.TOTAL_CUSTOMERS',
        'value', v_total_customers::text,
        'icon', 'pi pi-users',
        'iconColor', '#a855f7',
        'iconBg', '#f3e8ff',
        'trend', '+0%',
        'trendType', 'up',
        'trendColor', '#a855f7',
        'chartColor', '#a855f7',
        'chartData', jsonb_build_array()
      ),
      jsonb_build_object(
        'title', 'Active Products',
        'titleKey', 'DASHBOARD.ACTIVE_PRODUCTS',
        'value', v_active_products::text,
        'icon', 'pi pi-box',
        'iconColor', '#d97706',
        'iconBg', '#fff4df',
        'trend', '+0%',
        'trendType', 'up',
        'trendColor', '#d97706',
        'chartColor', '#d97706',
        'chartData', jsonb_build_array()
      )
    ),

    (
      select jsonb_build_object(
        'categories',
        coalesce(jsonb_agg(label order by bucket_start), '[]'::jsonb),
        'revenue',
        coalesce(jsonb_agg(revenue order by bucket_start), '[]'::jsonb),
        'target',
        coalesce(jsonb_agg(target order by bucket_start), '[]'::jsonb)
      )
      from (
        select
          b.bucket_start::date as bucket_start,
          to_char(b.bucket_start, v_label_format) as label,
          round(coalesce(sum(o.total), 0), 2) as revenue,
          0 as target
        from generate_series(v_start_date::timestamp, v_end_date::timestamp, v_step) as b(bucket_start)
        left join public.orders o
          on o.created_at >= b.bucket_start
         and o.created_at < b.bucket_start + v_step
         and lower(coalesce(o.status, '')) not in ('cancelled', 'canceled', 'refunded', 'returned')
        group by b.bucket_start
      ) revenue_buckets
    ),

    (
      select jsonb_build_object(
        'categories',
        coalesce(jsonb_agg(label order by bucket_start), '[]'::jsonb),
        'revenue',
        coalesce(jsonb_agg(revenue order by bucket_start), '[]'::jsonb),
        'orders',
        coalesce(jsonb_agg(order_count order by bucket_start), '[]'::jsonb)
      )
      from (
        select
          b.bucket_start::date as bucket_start,
          to_char(b.bucket_start, v_label_format) as label,
          round(coalesce(sum(o.total), 0), 2) as revenue,
          count(o.id) as order_count
        from generate_series(v_start_date::timestamp, v_end_date::timestamp, v_step) as b(bucket_start)
        left join public.orders o
          on o.created_at >= b.bucket_start
         and o.created_at < b.bucket_start + v_step
        group by b.bucket_start
      ) sales_orders_buckets
    ),

    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', category_name,
            'nameKey', null,
            'value', percentage,
            'color', color
          )
          order by percentage desc
        ),
        '[]'::jsonb
      )
      from (
        select
          category_name,
          percentage,
          case row_number() over (order by category_revenue desc)
            when 1 then '#5f6f43'
            when 2 then '#d9cab8'
            when 3 then '#3b82f6'
            when 4 then '#d97706'
            else '#a855f7'
          end as color
        from (
          select
            coalesce(c.name, 'Uncategorized') as category_name,
            sum(coalesce(oi.total, oi.quantity * oi.price, 0)) as category_revenue,
            round(
              sum(coalesce(oi.total, oi.quantity * oi.price, 0))::numeric
              / nullif(sum(sum(coalesce(oi.total, oi.quantity * oi.price, 0))) over (), 0)::numeric
              * 100,
              2
            ) as percentage
          from public.order_items oi
          join public.orders o on o.id = oi.order_id
          left join public.products p on p.id = oi.product_id
          left join public.categories c on c.id = p.category_id
          where o.created_at::date between v_start_date and v_end_date
          group by c.name
          order by category_revenue desc
          limit 5
        ) category_totals
      ) category_sales
    ),

    jsonb_build_array(
      jsonb_build_object(
        'label', 'Avg. Order Value',
        'labelKey', 'DASHBOARD.AVG_ORDER_VALUE',
        'value', concat('$', round(v_avg_order_value, 2)),
        'change', '+0%',
        'tone', 'positive'
      ),
      jsonb_build_object(
        'label', 'Conversion Rate',
        'labelKey', 'DASHBOARD.CONVERSION_RATE',
        'value', '0%',
        'change', '+0%',
        'tone', 'positive',
        'note', 'Missing visitor/session table, so conversion rate is not calculated yet.'
      ),
      jsonb_build_object(
        'label', 'Return Rate',
        'labelKey', 'DASHBOARD.RETURN_RATE',
        'value', concat(v_return_rate, '%'),
        'change', '+0%',
        'tone', 'positive'
      ),
      jsonb_build_object(
        'label', 'Cart Abandon',
        'labelKey', 'DASHBOARD.CART_ABANDON',
        'value', '0%',
        'change', '+0%',
        'tone', 'negative',
        'note', 'Needs cart activity or checkout session tracking.'
      )
    ),

    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', coalesce(o.order_number, concat('ORD-', substring(o.id::text, 1, 6))),
            'customer', coalesce(c.full_name, 'Guest Customer'),
            'email', coalesce(c.email, ''),
            'date', to_char(o.created_at, 'DD Mon YYYY'),
            'total', concat('$', round(o.total, 2)),
            'payment', coalesce(o.payment_status, 'Pending'),
            'delivery', coalesce(o.status, 'Processing')
          )
          order by o.created_at desc
        ),
        '[]'::jsonb
      )
      from (
        select *
        from public.orders
        where created_at::date between v_start_date and v_end_date
        order by created_at desc
        limit 6
      ) o
      left join lateral (
        select c.*
        from public.customers c
        where c.profile_id = o.user_id
           or c.id = o.user_id
        limit 1
      ) c on true
    ),

    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', rank_number,
            'name', product_name,
            'trend', '+0%',
            'trendType', 'up',
            'sold', concat(total_sold, ' sold'),
            'progress', progress
          )
          order by rank_number
        ),
        '[]'::jsonb
      )
      from (
        select
          row_number() over (order by total_sold desc) as rank_number,
          product_name,
          total_sold,
          least(
            100,
            greatest(
              5,
              round(total_sold::numeric / nullif(max(total_sold) over (), 0)::numeric * 100)
            )
          ) as progress
        from (
          select
            coalesce(p.name, oi.product_name, 'Unknown Product') as product_name,
            sum(coalesce(oi.quantity, 0)) as total_sold
          from public.order_items oi
          join public.orders o on o.id = oi.order_id
          left join public.products p on p.id = oi.product_id
          where o.created_at::date between v_start_date and v_end_date
          group by coalesce(p.name, oi.product_name, 'Unknown Product')
          order by total_sold desc
          limit 5
        ) product_sales
      ) best_products
    ),

    jsonb_build_array(
      'Conversion Rate needs visitor/session table.',
      'Cart Abandon needs cart activity or checkout session table.',
      'Revenue target needs target/budget table.',
      'Trend percentages need previous period comparison.'
    ),

    now()
  )
  on conflict (period_key, start_date, end_date)
  do update set
    period_label = excluded.period_label,
    kpi_cards = excluded.kpi_cards,
    revenue_overview_chart = excluded.revenue_overview_chart,
    sales_orders_chart = excluded.sales_orders_chart,
    sales_category_chart = excluded.sales_category_chart,
    sales_performance_card = excluded.sales_performance_card,
    recent_orders_card = excluded.recent_orders_card,
    best_selling_products_card = excluded.best_selling_products_card,
    missing_notes = excluded.missing_notes,
    generated_at = now()
  returning * into v_result;

  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.can_current_customer_use_discount(p_discount_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_usage_per_customer integer;
  v_customer_usage integer := 0;
begin
  select usage_per_customer
  into v_usage_per_customer
  from public.discounts
  where id = p_discount_id;

  if not found then
    return false;
  end if;

  if v_usage_per_customer is null then
    return true;
  end if;

  if v_user_id is null then
    return false;
  end if;

  select count(*)
  into v_customer_usage
  from public.orders
  where user_id = v_user_id
    and discount_id = p_discount_id;

  return v_customer_usage < v_usage_per_customer;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_loyalty_balance()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select sum(points_delta)::integer
      from public.customer_loyalty_points_ledger
      where user_id = auth.uid()),
    0
  );
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_loyalty_points_history(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, transaction_type text, points_delta integer, note text, created_at timestamp with time zone, order_id uuid, order_item_id uuid, order_number text, order_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    ledger.id,
    ledger.transaction_type,
    ledger.points_delta,
    ledger.note,
    ledger.created_at,
    ledger.order_id,
    ledger.order_item_id,
    orders.order_number,
    orders.status
  from public.customer_loyalty_points_ledger ledger
  left join public.orders on orders.id = ledger.order_id
  where auth.uid() is not null
    and ledger.user_id = auth.uid()
  order by ledger.created_at desc, ledger.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_redeemable_loyalty_products(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(product_id uuid, name text, slug text, image_url text, effective_price numeric, points_cost integer, stock integer, category_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with loyalty_context as (
    select
      settings.point_value_usd,
      settings.minimum_redemption_points,
      settings.is_enabled,
      public.get_my_loyalty_balance() as balance
    from public.loyalty_program_settings settings
    where settings.id = true
  ), priced_products as (
    select
      product.id,
      product.name,
      product.slug,
      product.image_url,
      case
        when product.sale_price is not null
          and product.sale_price > 0
          and product.sale_price < product.price
        then product.sale_price
        else product.price
      end as effective_price,
      product.stock,
      category.name as category_name,
      context.point_value_usd,
      context.minimum_redemption_points,
      context.balance,
      context.is_enabled
    from public.products product
    left join public.categories category on category.id = product.category_id
    cross join loyalty_context context
    where auth.uid() is not null
      and product.is_active = true
      and product.is_loyalty_eligible = true
      and coalesce(product.stock, 0) > 0
  )
  select
    priced.id,
    priced.name,
    priced.slug,
    priced.image_url,
    priced.effective_price,
    ceil(priced.effective_price / priced.point_value_usd)::integer,
    priced.stock,
    priced.category_name
  from priced_products priced
  where priced.is_enabled
    and ceil(priced.effective_price / priced.point_value_usd) >= priced.minimum_redemption_points
    and ceil(priced.effective_price / priced.point_value_usd) <= priced.balance
  order by ceil(priced.effective_price / priced.point_value_usd), priced.name
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$
;
CREATE OR REPLACE FUNCTION public.place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[], p_free_gift_product_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_discount public.discounts%rowtype;
  v_result jsonb;
  v_order_id uuid;
  v_order_number text;
  v_paid_subtotal numeric(10,2);
  v_customer_usage integer;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_previous_stock integer;
begin
  if coalesce(cardinality(p_free_gift_product_ids), 0) = 0 then
    return public.place_customer_order(
      p_cart_id, p_shipping_method_id, p_payment_method_id, p_shipping_address,
      p_items, p_customer_notes, p_discount_id, p_discount_code,
      p_expected_subtotal, p_checkout_token, p_redeem_product_ids, p_redeem_variant_ids
    );
  end if;

  if p_discount_id is null or nullif(btrim(p_discount_code), '') is null then
    raise exception 'Apply the free-gift promo code before selecting a gift.';
  end if;

  select * into v_discount from public.discounts where id = p_discount_id for update;
  if not found or v_discount.discount_type <> 'free_gift' then
    raise exception 'The selected free-gift promotion is invalid.';
  end if;
  if upper(btrim(v_discount.code)) <> upper(btrim(p_discount_code)) then
    raise exception 'The applied free-gift promo code is invalid.';
  end if;
  if v_discount.is_active is distinct from true
    or (v_discount.start_date is not null and now() < v_discount.start_date)
    or (v_discount.end_date is not null and now() > v_discount.end_date)
  then
    raise exception 'The free-gift promotion is no longer available.';
  end if;
  if v_discount.usage_limit is not null
    and coalesce(v_discount.usage_count, 0) >= v_discount.usage_limit
  then
    raise exception 'The free-gift promotion has reached its usage limit.';
  end if;
  if cardinality(p_free_gift_product_ids) > v_discount.gift_quantity
    or cardinality(p_free_gift_product_ids) <> (
      select count(distinct gift_id) from unnest(p_free_gift_product_ids) gift_id
    )
  then
    raise exception 'Too many or duplicate free gifts were selected.';
  end if;
  if v_user_id is not null and v_discount.usage_per_customer is not null then
    select count(*) into v_customer_usage from public.orders
    where user_id = v_user_id and discount_id = v_discount.id;
    if v_customer_usage >= v_discount.usage_per_customer then
      raise exception 'You have already used this promo code the maximum number of times.';
    end if;
  end if;
  if p_redeem_product_ids <> array[]::uuid[] or p_redeem_variant_ids <> array[]::uuid[] then
    raise exception 'Loyalty redemption cannot be combined with a free gift.';
  end if;

  if p_cart_id is not null then
    if not exists (
      select 1 from public.carts cart where cart.id = p_cart_id
        and cart.user_id = v_user_id
    ) then
      raise exception 'You do not have access to this cart.';
    end if;
    if (select count(*) from public.cart_items item
        where item.cart_id = p_cart_id and item.is_free_gift = false)
      <> jsonb_array_length(p_items)
      or exists (
        select 1 from public.cart_items cart_item
        where cart_item.cart_id = p_cart_id and cart_item.is_free_gift = false
          and not exists (
            select 1 from jsonb_array_elements(p_items) submitted
            where (submitted ->> 'product_id')::uuid = cart_item.product_id
              and nullif(submitted ->> 'variant_id', '')::uuid is not distinct from cart_item.variant_id
              and (submitted ->> 'quantity')::integer = cart_item.quantity
          )
      )
    then
      raise exception 'Submitted paid items do not match the current cart.';
    end if;
    if (select count(*) from public.cart_items item
        where item.cart_id = p_cart_id and item.is_free_gift = true
          and item.applied_discount_id = p_discount_id)
      <> cardinality(p_free_gift_product_ids)
    then
      raise exception 'The selected gift does not match the current cart.';
    end if;
    if exists (
      select 1 from public.cart_items item
      where item.cart_id = p_cart_id and item.is_free_gift = true
        and (item.applied_discount_id <> p_discount_id
          or item.product_id <> all(p_free_gift_product_ids))
    ) then
      raise exception 'The selected gift does not match the current cart.';
    end if;
  end if;

  if exists (
    select 1 from unnest(p_free_gift_product_ids) gift_id
    left join public.discount_gift_products relation
      on relation.discount_id = p_discount_id and relation.product_id = gift_id
    left join public.products product on product.id = gift_id
    where relation.id is null or relation.is_active is distinct from true
      or product.id is null or product.is_active is distinct from true
      or coalesce(product.stock, 0) < 1
  ) then
    raise exception 'This gift is no longer available. Please choose another free gift.';
  end if;

  v_result := public.place_customer_order(
    null, p_shipping_method_id, p_payment_method_id, p_shipping_address,
    p_items, p_customer_notes, null, null, p_expected_subtotal,
    p_checkout_token, p_redeem_product_ids, p_redeem_variant_ids
  );
  v_order_id := (v_result ->> 'order_id')::uuid;
  v_paid_subtotal := (v_result ->> 'subtotal')::numeric;
  v_order_number := v_result ->> 'order_number';

  if v_paid_subtotal < coalesce(v_discount.minimum_order_amount, 0) then
    raise exception 'The order no longer meets the free-gift minimum amount.';
  end if;

  if not (select free_gift_processed from public.orders where id = v_order_id for update) then
    foreach v_product_id in array p_free_gift_product_ids loop
      select * into v_product from public.products where id = v_product_id for update;
      if not found or v_product.is_active is distinct from true or coalesce(v_product.stock, 0) < 1 then
        raise exception 'This gift is no longer available. Please choose another free gift.';
      end if;
      v_previous_stock := coalesce(v_product.stock, 0);
      insert into public.order_items(
        order_id, product_id, quantity, price, total, original_unit_price,
        is_free_gift, applied_discount_id, loyalty_points_earned
      ) values (
        v_order_id, v_product.id, 1, 0, 0,
        case when v_product.sale_price is not null and v_product.sale_price > 0
          and v_product.sale_price < v_product.price then v_product.sale_price else v_product.price end,
        true, v_discount.id, 0
      );
      update public.products set stock = v_previous_stock - 1,
        sold_count = coalesce(sold_count, 0) + 1 where id = v_product.id;
      insert into public.inventory_logs(product_id, previous_stock, new_stock, change_type, note)
      values (v_product.id, v_previous_stock, v_previous_stock - 1,
        'adjustment', 'Free gift for customer order ' || v_order_number);
    end loop;

    update public.orders set cart_id = p_cart_id, discount_id = v_discount.id,
      discount_code = v_discount.code, discount_amount = 0, free_gift_processed = true
    where id = v_order_id;
    update public.discounts set usage_count = coalesce(usage_count, 0) + 1,
      updated_at = now() where id = v_discount.id;
    if p_cart_id is not null then delete from public.cart_items where cart_id = p_cart_id; end if;
  end if;

  return v_result || jsonb_build_object(
    'discount_id', v_discount.id,
    'discount_code', v_discount.code,
    'discount_amount', 0
  );
end;
$function$
;
revoke update(full_name,email,phone,birthday,avatar_url,avatar_media_id) on public.profiles from authenticated;
revoke all on public.profiles from PUBLIC,anon,authenticated;
grant DELETE on public.profiles to "anon";
grant MAINTAIN on public.profiles to "anon";
grant SELECT on public.profiles to "anon";
grant UPDATE on public.profiles to "anon";
grant DELETE on public.profiles to "authenticated";
grant MAINTAIN on public.profiles to "authenticated";
grant SELECT on public.profiles to "authenticated";
grant UPDATE on public.profiles to "authenticated";
revoke all on public.roles from PUBLIC,anon,authenticated;
grant DELETE on public.roles to "anon";
grant INSERT on public.roles to "anon";
grant MAINTAIN on public.roles to "anon";
grant SELECT on public.roles to "anon";
grant UPDATE on public.roles to "anon";
grant DELETE on public.roles to "authenticated";
grant INSERT on public.roles to "authenticated";
grant MAINTAIN on public.roles to "authenticated";
grant SELECT on public.roles to "authenticated";
grant UPDATE on public.roles to "authenticated";
revoke execute on function "public"."append_customer_loyalty_ledger_entry"(p_user_id uuid, p_order_id uuid, p_order_item_id uuid, p_transaction_type text, p_points_delta integer, p_note text) from PUBLIC,anon,authenticated;

revoke execute on function "public"."attach_customer_to_order"(p_order_id uuid) from PUBLIC,anon,authenticated;

revoke execute on function "public"."enforce_variant_order_item_price"() from PUBLIC,anon,authenticated;
grant execute on function "public"."enforce_variant_order_item_price"() to PUBLIC;
grant execute on function "public"."enforce_variant_order_item_price"() to "anon";
grant execute on function "public"."enforce_variant_order_item_price"() to "authenticated";
revoke execute on function "public"."handle_new_user"() from PUBLIC,anon,authenticated;
grant execute on function "public"."handle_new_user"() to PUBLIC;
grant execute on function "public"."handle_new_user"() to "anon";
grant execute on function "public"."handle_new_user"() to "authenticated";
revoke execute on function "public"."handle_public_customer_signup"() from PUBLIC,anon,authenticated;

revoke execute on function "public"."notify_admin_new_order"() from PUBLIC,anon,authenticated;
grant execute on function "public"."notify_admin_new_order"() to PUBLIC;
grant execute on function "public"."notify_admin_new_order"() to "anon";
grant execute on function "public"."notify_admin_new_order"() to "authenticated";
revoke execute on function "public"."notify_admin_new_order_from_address"() from PUBLIC,anon,authenticated;
grant execute on function "public"."notify_admin_new_order_from_address"() to PUBLIC;
grant execute on function "public"."notify_admin_new_order_from_address"() to "anon";
grant execute on function "public"."notify_admin_new_order_from_address"() to "authenticated";
revoke execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) from PUBLIC,anon,authenticated;
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) to "anon";
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) to "authenticated";
revoke execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric) from PUBLIC,anon,authenticated;
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric) to "anon";
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric) to "authenticated";
revoke execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid) from PUBLIC,anon,authenticated;
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid) to "anon";
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid) to "authenticated";
revoke execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[]) from PUBLIC,anon,authenticated;
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[]) to "anon";
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[]) to "authenticated";
revoke execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[]) from PUBLIC,anon,authenticated;
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[]) to "anon";
grant execute on function "public"."place_customer_order"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[]) to "authenticated";
revoke execute on function "public"."place_customer_order_legacy_discount"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text) from PUBLIC,anon,authenticated;

revoke execute on function "public"."place_customer_order_legacy_products_only"(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) from PUBLIC,anon,authenticated;

revoke execute on function "public"."prepare_customer_address"() from PUBLIC,anon,authenticated;

revoke execute on function "public"."prevent_customer_profile_privilege_changes"() from PUBLIC,anon,authenticated;

revoke execute on function "public"."prevent_loyalty_ledger_mutation"() from PUBLIC,anon,authenticated;
grant execute on function "public"."prevent_loyalty_ledger_mutation"() to PUBLIC;
grant execute on function "public"."prevent_loyalty_ledger_mutation"() to "anon";
grant execute on function "public"."prevent_loyalty_ledger_mutation"() to "authenticated";
revoke execute on function "public"."process_order_loyalty_status_change"() from PUBLIC,anon,authenticated;
grant execute on function "public"."process_order_loyalty_status_change"() to PUBLIC;
grant execute on function "public"."process_order_loyalty_status_change"() to "anon";
grant execute on function "public"."process_order_loyalty_status_change"() to "authenticated";
revoke execute on function "public"."promote_customer_address_after_delete"() from PUBLIC,anon,authenticated;

revoke execute on function "public"."recalculate_admin_order_after_item_change"(p_order_id uuid) from PUBLIC,anon,authenticated;

revoke execute on function "public"."restore_admin_order_item_inventory"(p_order_item_id uuid, p_note text) from PUBLIC,anon,authenticated;

revoke execute on function "public"."set_customer_help_updated_at"() from PUBLIC,anon,authenticated;

revoke execute on function "public"."set_customer_offers_updated_at"() from PUBLIC,anon,authenticated;
grant execute on function "public"."set_customer_offers_updated_at"() to PUBLIC;
grant execute on function "public"."set_customer_offers_updated_at"() to "anon";
grant execute on function "public"."set_customer_offers_updated_at"() to "authenticated";
revoke execute on function "public"."set_customers_updated_at"() from PUBLIC,anon,authenticated;
grant execute on function "public"."set_customers_updated_at"() to PUBLIC;
grant execute on function "public"."set_customers_updated_at"() to "anon";
grant execute on function "public"."set_customers_updated_at"() to "authenticated";
revoke execute on function "public"."set_order_shipping_addresses_updated_at"() from PUBLIC,anon,authenticated;
grant execute on function "public"."set_order_shipping_addresses_updated_at"() to PUBLIC;
grant execute on function "public"."set_order_shipping_addresses_updated_at"() to "anon";
grant execute on function "public"."set_order_shipping_addresses_updated_at"() to "authenticated";
revoke execute on function "public"."set_payment_methods_updated_at"() from PUBLIC,anon,authenticated;
grant execute on function "public"."set_payment_methods_updated_at"() to PUBLIC;
grant execute on function "public"."set_payment_methods_updated_at"() to "anon";
grant execute on function "public"."set_payment_methods_updated_at"() to "authenticated";
revoke execute on function "public"."set_payment_transactions_updated_at"() from PUBLIC,anon,authenticated;
grant execute on function "public"."set_payment_transactions_updated_at"() to PUBLIC;
grant execute on function "public"."set_payment_transactions_updated_at"() to "anon";
grant execute on function "public"."set_payment_transactions_updated_at"() to "authenticated";
revoke execute on function "public"."set_product_image_embedding_updated_at"() from PUBLIC,anon,authenticated;

revoke execute on function "public"."set_updated_at"() from PUBLIC,anon,authenticated;
grant execute on function "public"."set_updated_at"() to PUBLIC;
grant execute on function "public"."set_updated_at"() to "anon";
grant execute on function "public"."set_updated_at"() to "authenticated";
revoke execute on function "public"."sync_customer_from_profile"() from PUBLIC,anon,authenticated;
grant execute on function "public"."sync_customer_from_profile"() to PUBLIC;
grant execute on function "public"."sync_customer_from_profile"() to "anon";
grant execute on function "public"."sync_customer_from_profile"() to "authenticated";
drop function if exists private.nestora_active_actor_20261116(); -- RESTRICT, no CASCADE.
commit;
