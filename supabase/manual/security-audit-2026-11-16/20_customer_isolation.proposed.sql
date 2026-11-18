-- SUPERSEDED by metadata-backed 40/41 drafts. DO NOT USE OR COMBINE.
-- PROPOSAL ONLY. NOT EXECUTED. Requires 10 and review of actual table/caller manifests.
-- These restrictive policies preserve existing permissive policies and do not grant
-- additional Admin rights. They do not constrain BYPASSRLS SECURITY DEFINER RPCs.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if current_setting('nestora.security_review_approved',true) is distinct from 'yes' then
    raise exception 'Proposal only: deployed privacy manifest review required';
  end if;
end $$;
create policy security_20261116_orders_read on public.orders as restrictive
  for select to anon,authenticated
  using ((select nestora_security_20261116.active_admin()) or
    (user_id=(select auth.uid()) and (select nestora_security_20261116.active_actor())));
create policy security_20261116_items_read on public.order_items as restrictive
  for select to anon,authenticated
  using (exists(select 1 from public.orders o where o.id=order_id and
    ((select nestora_security_20261116.active_admin()) or
      (o.user_id=(select auth.uid()) and (select nestora_security_20261116.active_actor())))));
create policy security_20261116_order_address_read on public.order_shipping_addresses as restrictive
  for select to anon,authenticated
  using (exists(select 1 from public.orders o where o.id=order_id and
    ((select nestora_security_20261116.active_admin()) or
      (o.user_id=(select auth.uid()) and (select nestora_security_20261116.active_actor())))));
create policy security_20261116_payment_read on public.payment_transactions as restrictive
  for select to anon,authenticated using ((select nestora_security_20261116.active_admin()));

-- All listed ownership keys come from existing services/migrations. Verify that
-- customer_id is the Auth UUID (as used by CustomerSettingsService), not a CRM ID.
do $$
declare target record; command_name text; predicate text;
begin
  for target in select * from (values
    ('carts','user_id'),('customer_addresses','user_id'),('wishlist','user_id'),
    ('customer_product_history','user_id'),('customer_notification_preferences','customer_id'),
    ('customer_loyalty_points_ledger','user_id'),('customer_loyalty_points_balances','user_id')
  ) as targets(relation_name,owner_column) loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||target.relation_name)
        and relrowsecurity and relkind in ('r','p')) then
      raise exception 'Missing/RLS-disabled privacy target: %',target.relation_name;
    end if;
    predicate:=format('((select nestora_security_20261116.active_admin()) or
      (%I=(select auth.uid()) and (select nestora_security_20261116.active_actor())))',target.owner_column);
    foreach command_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      execute format('create policy %I on public.%I as restrictive for %s to anon,authenticated %s %s',
        'security_20261116_owner_'||lower(command_name),target.relation_name,command_name,
        case when command_name in ('SELECT','UPDATE','DELETE') then 'using ('||predicate||')' else '' end,
        case when command_name in ('INSERT','UPDATE') then 'with check ('||predicate||')' else '' end);
    end loop;
  end loop;
end $$;
create policy security_20261116_cart_items on public.cart_items as restrictive
  for all to anon,authenticated
  using (exists(select 1 from public.carts c where c.id=cart_id and
    ((select nestora_security_20261116.active_admin()) or
      (c.user_id=(select auth.uid()) and (select nestora_security_20261116.active_actor())))))
  with check (exists(select 1 from public.carts c where c.id=cart_id and
    ((select nestora_security_20261116.active_admin()) or
      (c.user_id=(select auth.uid()) and (select nestora_security_20261116.active_actor())))));
-- Read is already Admin-only in versioned SQL; add active-account enforcement.
create policy security_20261116_contact_read on public.customer_contact_messages as restrictive
  for select to anon,authenticated using ((select nestora_security_20261116.active_admin()));
create policy security_20261116_contact_update on public.customer_contact_messages as restrictive
  for update to anon,authenticated using ((select nestora_security_20261116.active_admin()))
  with check ((select nestora_security_20261116.active_admin()));
create policy security_20261116_contact_delete on public.customer_contact_messages as restrictive
  for delete to anon,authenticated using ((select nestora_security_20261116.active_admin()));
-- Guest contact INSERT is preserved. Active/inactive authenticated contact submission
-- requires a product decision; existing policy currently permits a null customer ID.
notify pgrst,'reload schema';
commit;
