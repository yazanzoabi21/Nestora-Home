-- Temporary read-only header-integrity probe. No IP value, credentials or order data returned.
-- Cleanup: DROP FUNCTION public.order_email_ingress_probe();
begin;
do $$ begin
  if current_user <> 'postgres' or to_regprocedure('public.order_email_ingress_probe()') is not null then
    raise exception 'Owner required; diagnostic name must be unused';
  end if;
end $$;
create function public.order_email_ingress_probe() returns jsonb
language sql stable set search_path=pg_catalog as $$
  select jsonb_build_object(
    'has_cf_ip',coalesce(h->>'cf-connecting-ip','')<>'',
    'forged_cf_received',h->>'cf-connecting-ip'='203.0.113.99',
    'forged_forwarded_received',split_part(h->>'x-forwarded-for',',',1)='203.0.113.99',
    'cf_equals_real_ip',h->>'cf-connecting-ip'=h->>'x-real-ip')
  from (select coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb h) s;
$$;
revoke all on function public.order_email_ingress_probe() from public,authenticated;
grant execute on function public.order_email_ingress_probe() to anon;
notify pgrst,'reload schema';
commit;
