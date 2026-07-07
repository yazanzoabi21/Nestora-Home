create or replace function public.refresh_analytics(p_period_key text)
returns public.analytics
language plpgsql
set search_path = public
as $$
declare
  v_period_key text := upper(coalesce(p_period_key, '12M'));
  v_start_date date;
  v_end_date date := current_date;
  v_previous_start_date date;
  v_previous_end_date date;
  v_period_label text;
  v_bucket_interval interval;
  v_bucket_format text;
  v_period_days integer;
  v_current_revenue numeric := 0;
  v_previous_revenue numeric := 0;
  v_current_orders integer := 0;
  v_previous_customers integer := 0;
  v_current_customers integer := 0;
  v_repeat_customers integer := 0;
  v_carts_with_items integer := 0;
  v_converted_carts integer := 0;
  v_visit_count integer := 0;
  v_product_view_count integer := 0;
  v_add_to_cart_count integer := 0;
  v_purchase_count integer := 0;
  v_avg_review_score numeric := 0;
  v_revenue_growth numeric := 0;
  v_new_customers_growth numeric := 0;
  v_repeat_purchase_rate numeric := 0;
  v_cart_abandonment_rate numeric := 0;
  v_conversion_rate numeric := 0;
  v_kpi_cards jsonb;
  v_revenue_growth_chart jsonb;
  v_customer_growth_chart jsonb;
  v_category_revenue_split jsonb;
  v_conversion_funnel jsonb;
  v_weekly_sales_pattern jsonb;
  v_performance_breakdown jsonb;
  v_result public.analytics;
begin
  case v_period_key
    when '7D' then
      v_start_date := v_end_date - interval '6 days';
      v_period_label := 'Last 7 days';
      v_bucket_interval := interval '1 day';
      v_bucket_format := 'Dy';
    when '30D' then
      v_start_date := v_end_date - interval '29 days';
      v_period_label := 'Last 30 days';
      v_bucket_interval := interval '1 day';
      v_bucket_format := 'DD Mon';
    when '3M' then
      v_start_date := (v_end_date - interval '3 months' + interval '1 day')::date;
      v_period_label := 'Last 3 months';
      v_bucket_interval := interval '1 month';
      v_bucket_format := 'Mon';
    when '12M' then
      v_start_date := (v_end_date - interval '12 months' + interval '1 day')::date;
      v_period_label := 'Last 12 months';
      v_bucket_interval := interval '1 month';
      v_bucket_format := 'Mon';
    else
      raise exception 'Unsupported analytics period key: %. Expected 7D, 30D, 3M, or 12M.', p_period_key;
  end case;

  v_period_days := (v_end_date - v_start_date + 1);
  v_previous_end_date := v_start_date - interval '1 day';
  v_previous_start_date := v_previous_end_date - (v_period_days - 1);

  select coalesce(sum(o.total), 0), count(*)
  into v_current_revenue, v_current_orders
  from public.orders o
  where o.created_at::date between v_start_date and v_end_date;

  select coalesce(sum(o.total), 0)
  into v_previous_revenue
  from public.orders o
  where o.created_at::date between v_previous_start_date and v_previous_end_date;

  select count(*)
  into v_current_customers
  from public.customers c
  where c.created_at::date between v_start_date and v_end_date;

  select count(*)
  into v_previous_customers
  from public.customers c
  where c.created_at::date between v_previous_start_date and v_previous_end_date;

  select count(*)
  into v_repeat_customers
  from public.customers c
  where c.created_at::date between v_start_date and v_end_date
    and coalesce(c.total_orders, 0) > 1;

  select count(distinct ci.cart_id)
  into v_carts_with_items
  from public.cart_items ci
  join public.carts c on c.id = ci.cart_id
  where ci.created_at::date between v_start_date and v_end_date;

  select count(distinct c.id)
  into v_converted_carts
  from public.carts c
  join public.cart_items ci on ci.cart_id = c.id
  join public.orders o on o.user_id = c.user_id and o.created_at >= c.created_at
  where ci.created_at::date between v_start_date and v_end_date;

  select count(*)
  into v_visit_count
  from public.activity_logs al
  where al.created_at::date between v_start_date and v_end_date
    and (al.action ilike '%visit%' or al.action ilike '%view_store%' or al.module ilike '%visit%');

  select count(*)
  into v_product_view_count
  from public.activity_logs al
  where al.created_at::date between v_start_date and v_end_date
    and (
      al.action ilike '%product%view%'
      or al.action ilike '%view_product%'
      or (al.action ilike '%view%' and al.module ilike '%product%')
    );

  select count(*)
  into v_add_to_cart_count
  from public.cart_items ci
  where ci.created_at::date between v_start_date and v_end_date;

  select count(*)
  into v_purchase_count
  from public.orders o
  where o.created_at::date between v_start_date and v_end_date;

  select coalesce(avg(p.rating), 0)
  into v_avg_review_score
  from public.products p
  where p.rating is not null;

  v_revenue_growth := case
    when v_previous_revenue > 0 then ((v_current_revenue - v_previous_revenue) / v_previous_revenue) * 100
    when v_current_revenue > 0 then 100
    else 0
  end;

  v_new_customers_growth := case
    when v_previous_customers > 0 then ((v_current_customers - v_previous_customers)::numeric / v_previous_customers) * 100
    when v_current_customers > 0 then 100
    else 0
  end;

  v_repeat_purchase_rate := case
    when v_current_customers > 0 then (v_repeat_customers::numeric / v_current_customers) * 100
    else 0
  end;

  v_cart_abandonment_rate := case
    when v_carts_with_items > 0 then greatest(0, ((v_carts_with_items - v_converted_carts)::numeric / v_carts_with_items) * 100)
    else 0
  end;

  v_conversion_rate := case
    when v_visit_count > 0 then (v_purchase_count::numeric / v_visit_count) * 100
    when v_carts_with_items > 0 then (v_purchase_count::numeric / v_carts_with_items) * 100
    else 0
  end;

  v_kpi_cards := jsonb_build_array(
    jsonb_build_object(
      'icon', 'pi pi-dollar',
      'title', 'Total Revenue',
      'value', 'GBP ' || to_char(round(v_current_revenue, 2), 'FM999G999G999G990D00'),
      'change', case when v_revenue_growth >= 0 then '+' else '' end || round(v_revenue_growth, 1)::text || '%',
      'changeLabel', 'vs previous period',
      'tone', case when v_revenue_growth >= 0 then 'positive' else 'negative' end
    ),
    jsonb_build_object(
      'icon', 'pi pi-chart-line',
      'title', 'Revenue Growth',
      'value', round(v_revenue_growth, 1)::text || '%',
      'change', case when v_revenue_growth >= 0 then '+' else '' end || round(v_revenue_growth, 1)::text || '%',
      'changeLabel', 'vs previous period',
      'tone', case when v_revenue_growth >= 0 then 'positive' else 'negative' end
    ),
    jsonb_build_object(
      'icon', 'pi pi-percentage',
      'title', 'Conversion Rate',
      'value', round(v_conversion_rate, 2)::text || '%',
      'change', '',
      'changeLabel', 'from available activity',
      'tone', 'neutral'
    ),
    jsonb_build_object(
      'icon', 'pi pi-shopping-cart',
      'title', 'Avg Order Value',
      'value', 'GBP ' || to_char(round(case when v_current_orders > 0 then v_current_revenue / v_current_orders else 0 end, 2), 'FM999G999G999G990D00'),
      'change', '',
      'changeLabel', 'current period',
      'tone', 'neutral'
    )
  );

  with buckets as (
    select generate_series(
      date_trunc(case when v_bucket_interval = interval '1 month' then 'month' else 'day' end, v_start_date::timestamp),
      date_trunc(case when v_bucket_interval = interval '1 month' then 'month' else 'day' end, v_end_date::timestamp),
      v_bucket_interval
    ) as bucket_start
  ),
  revenue as (
    select
      date_trunc(case when v_bucket_interval = interval '1 month' then 'month' else 'day' end, o.created_at) as bucket_start,
      sum(o.total) as revenue
    from public.orders o
    where o.created_at::date between v_start_date and v_end_date
    group by 1
  )
  select jsonb_build_object(
    'labels', coalesce(jsonb_agg(to_char(b.bucket_start, v_bucket_format) order by b.bucket_start), '[]'::jsonb),
    'revenue', coalesce(jsonb_agg(coalesce(round(r.revenue, 2), 0) order by b.bucket_start), '[]'::jsonb)
  )
  into v_revenue_growth_chart
  from buckets b
  left join revenue r on r.bucket_start = b.bucket_start;

  with buckets as (
    select generate_series(
      date_trunc(case when v_bucket_interval = interval '1 month' then 'month' else 'day' end, v_start_date::timestamp),
      date_trunc(case when v_bucket_interval = interval '1 month' then 'month' else 'day' end, v_end_date::timestamp),
      v_bucket_interval
    ) as bucket_start
  ),
  customer_counts as (
    select
      date_trunc(case when v_bucket_interval = interval '1 month' then 'month' else 'day' end, c.created_at) as bucket_start,
      count(*) filter (where coalesce(c.total_orders, 0) <= 1) as new_customers,
      count(*) filter (where coalesce(c.total_orders, 0) > 1) as returning_customers
    from public.customers c
    where c.created_at::date between v_start_date and v_end_date
    group by 1
  )
  select jsonb_build_object(
    'labels', coalesce(jsonb_agg(to_char(b.bucket_start, v_bucket_format) order by b.bucket_start), '[]'::jsonb),
    'newCustomers', coalesce(jsonb_agg(coalesce(cc.new_customers, 0) order by b.bucket_start), '[]'::jsonb),
    'returningCustomers', coalesce(jsonb_agg(coalesce(cc.returning_customers, 0) order by b.bucket_start), '[]'::jsonb)
  )
  into v_customer_growth_chart
  from buckets b
  left join customer_counts cc on cc.bucket_start = b.bucket_start;

  select coalesce(
    jsonb_agg(jsonb_build_object('label', category_name, 'value', round(revenue, 2)) order by revenue desc),
    '[]'::jsonb
  )
  into v_category_revenue_split
  from (
    select coalesce(cat.name, 'Uncategorized') as category_name, sum(oi.total) as revenue
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id
    left join public.categories cat on cat.id = p.category_id
    where o.created_at::date between v_start_date and v_end_date
    group by coalesce(cat.name, 'Uncategorized')
  ) category_revenue;

  with raw_steps as (
    select *
    from (
      values
        (1, 'Visits', v_visit_count),
        (2, 'Product Views', v_product_view_count),
        (3, 'Add to Cart', v_add_to_cart_count),
        (4, 'Purchase', v_purchase_count)
    ) as step_data(step_number, step_label, step_value)
    where step_value > 0
  ),
  numbered_steps as (
    select
      row_number() over (order by step_number) as step,
      step_label,
      step_value,
      first_value(step_value) over (order by step_number rows between unbounded preceding and unbounded following) as first_step_value,
      lag(step_value) over (order by step_number) as previous_step_value
    from raw_steps
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'step', step,
        'label', step_label,
        'value', step_value,
        'percentage', case when first_step_value > 0 then round((step_value::numeric / first_step_value) * 100, 1) else 0 end,
        'dropOff', case when previous_step_value is null then null else greatest(previous_step_value - step_value, 0) end
      )
      order by step
    ),
    '[]'::jsonb
  )
  into v_conversion_funnel
  from numbered_steps;

  with weekdays as (
    select *
    from (
      values
        (1, 'Mon'),
        (2, 'Tue'),
        (3, 'Wed'),
        (4, 'Thu'),
        (5, 'Fri'),
        (6, 'Sat'),
        (7, 'Sun')
    ) as weekday_data(day_number, day_label)
  ),
  sales as (
    select extract(isodow from o.created_at)::integer as day_number, sum(o.total) as revenue
    from public.orders o
    where o.created_at::date between v_start_date and v_end_date
    group by 1
  )
  select jsonb_build_object(
    'labels', jsonb_agg(w.day_label order by w.day_number),
    'revenue', jsonb_agg(coalesce(round(s.revenue, 2), 0) order by w.day_number)
  )
  into v_weekly_sales_pattern
  from weekdays w
  left join sales s on s.day_number = w.day_number;

  v_performance_breakdown := jsonb_build_array(
    jsonb_build_object(
      'label', 'Revenue Growth (Period)',
      'value', round(v_revenue_growth, 1),
      'displayValue', round(v_revenue_growth, 1)::text || '%',
      'tone', case when v_revenue_growth >= 0 then 'positive' else 'negative' end
    ),
    jsonb_build_object(
      'label', 'New Customers Growth',
      'value', round(v_new_customers_growth, 1),
      'displayValue', round(v_new_customers_growth, 1)::text || '%',
      'tone', case when v_new_customers_growth >= 0 then 'positive' else 'negative' end
    ),
    jsonb_build_object(
      'label', 'Repeat Purchase Rate',
      'value', round(v_repeat_purchase_rate, 1),
      'displayValue', round(v_repeat_purchase_rate, 1)::text || '%',
      'tone', 'neutral'
    ),
    jsonb_build_object(
      'label', 'Cart Abandonment Rate',
      'value', round(v_cart_abandonment_rate, 1),
      'displayValue', round(v_cart_abandonment_rate, 1)::text || '%',
      'tone', case when v_cart_abandonment_rate > 50 then 'negative' else 'positive' end
    ),
    jsonb_build_object(
      'label', 'Avg Review Score',
      'value', round((v_avg_review_score / 5) * 100, 1),
      'displayValue', round(v_avg_review_score, 2)::text || '/5',
      'tone', 'neutral'
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
    v_period_key,
    v_period_label,
    v_start_date,
    v_end_date,
    v_kpi_cards,
    v_revenue_growth_chart,
    v_customer_growth_chart,
    v_category_revenue_split,
    v_conversion_funnel,
    v_weekly_sales_pattern,
    v_performance_breakdown,
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
  returning * into v_result;

  return v_result;
end;
$$;
