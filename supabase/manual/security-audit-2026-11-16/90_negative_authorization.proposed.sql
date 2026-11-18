-- STAGING-ONLY psql test proposal. NEVER execute against production.
-- Uses EXISTING, explicitly selected staging fixtures; creates no users/products/orders.
-- Required psql variables: staging_database, customer_a, customer_b, admin_id, inactive_admin_id,
-- order_a, order_b, video_id. Set staging_approved=yes separately.
-- Example invocation is described in the audit report. ON_ERROR_STOP must remain on.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
select set_config('nestora.test.staging', :'staging_approved',true),
       set_config('nestora.test.database', :'staging_database',true),
       set_config('nestora.test.customer_a', :'customer_a',true),
       set_config('nestora.test.customer_b', :'customer_b',true),
       set_config('nestora.test.admin', :'admin_id',true),
       set_config('nestora.test.inactive_admin', :'inactive_admin_id',true),
       set_config('nestora.test.order_a', :'order_a',true),
       set_config('nestora.test.order_b', :'order_b',true),
       set_config('nestora.test.video', :'video_id',true);
do $$
declare actor record;
begin
  if current_user<>'postgres' then raise exception 'Reviewed postgres staging connection required'; end if;
  if current_setting('nestora.test.staging')<>'yes' or
     current_database()<>current_setting('nestora.test.database') then
    raise exception 'Explicit staging database selection required';
  end if;
  if current_setting('nestora.test.customer_a')=current_setting('nestora.test.customer_b') then
    raise exception 'Two distinct customers required';
  end if;
  for actor in select * from (values
    (current_setting('nestora.test.customer_a')::uuid,'customer'),
    (current_setting('nestora.test.customer_b')::uuid,'customer'),
    (current_setting('nestora.test.admin')::uuid,'admin')
  ) as actors(id,role_name) loop
    if not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id
      where p.id=actor.id and p.is_active is true
        and (r.name=actor.role_name or (actor.role_name='admin' and r.name='super_admin'))) then
      raise exception 'Fixture is missing or has wrong activation/role';
    end if;
  end loop;
  if not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=current_setting('nestora.test.inactive_admin')::uuid
      and p.is_active is false and r.name in ('admin','super_admin')) then
    raise exception 'Existing inactive Admin/Super Admin staging fixture required';
  end if;
  if not exists(select 1 from public.orders where id=current_setting('nestora.test.order_a')::uuid
      and user_id=current_setting('nestora.test.customer_a')::uuid) or
     not exists(select 1 from public.orders where id=current_setting('nestora.test.order_b')::uuid
      and user_id=current_setting('nestora.test.customer_b')::uuid) or
     not exists(select 1 from public.product_videos v join public.products p on p.id=v.product_id
       where v.id=current_setting('nestora.test.video')::uuid and v.is_active is true and p.is_active is true) then
    raise exception 'Real staging orders/video fixtures required to avoid vacuous tests';
  end if;
end $$;
create function pg_temp.expect_permission_denied(label text,statement text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then
    raise notice 'PASS: %',label;
    return;
  end;
  raise exception 'FAIL: % did not raise 42501',label;
end $$;
create function pg_temp.expect_count(label text,statement text,expected bigint,affected boolean default false)
returns void language plpgsql security invoker as $$
declare actual bigint;
begin
  begin
    if affected then
      execute statement;
      get diagnostics actual=row_count;
    else
      execute 'select count(*) from ('||statement||') test_rows' into actual;
    end if;
  exception when insufficient_privilege then
    if expected=0 then raise notice 'PASS: % (42501)',label; return; end if;
    raise;
  end;
  if actual<>expected then raise exception 'FAIL: % count %, expected %',label,actual,expected; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.expect_can_call(label text,statement text)
returns void language plpgsql security invoker as $$
begin
  execute statement;
  raise notice 'PASS: %',label;
end $$;
-- Use valid typed arguments and require authorization before any target lookup.
-- P0001 counts only for the exact deployed Admin authorization message.
create function pg_temp.expect_admin_rpc_denied(label text,statement text)
returns void language plpgsql security invoker as $$
begin
  begin execute statement;
  exception when insufficient_privilege then raise notice 'PASS: %',label; return;
    when raise_exception then
      if sqlerrm='Admin access is required.' then raise notice 'PASS: %',label; return; end if;
      raise;
  end;
  raise exception 'FAIL: % was not denied',label;
end $$;
create function pg_temp.check_admin_rpc_denials()
returns void language plpgsql security invoker as $$
declare target uuid:=current_setting('nestora.test.order_b')::uuid;
begin
  perform pg_temp.expect_admin_rpc_denied('order status RPC',format('select public.update_admin_order_status(%L::uuid,''processing'',''unpaid'')',target));
  perform pg_temp.expect_admin_rpc_denied('order item RPC',format('select public.remove_admin_order_item(%L::uuid,%L::uuid)',target,target));
  perform pg_temp.expect_admin_rpc_denied('loyalty adjustment RPC',format('select public.adjust_customer_loyalty_points(%L::uuid,1,''Authorization staging test'')',current_setting('nestora.test.customer_b')));
  perform pg_temp.expect_admin_rpc_denied('discount gift RPC',format('select public.replace_discount_gift_products(%L::uuid,array[]::uuid[])',target));
  perform pg_temp.expect_admin_rpc_denied('inventory RPC',format('select public.update_inventory_stock(%L::uuid,0,''adjustment'',null)',target));
  perform pg_temp.expect_admin_rpc_denied('variants RPC',format('select public.replace_product_variants(%L::uuid,''[]''::jsonb)',target));
  perform pg_temp.expect_admin_rpc_denied('promotion products RPC',format('select public.replace_promotion_products(%L::uuid,array[]::uuid[])',target));
  perform pg_temp.expect_admin_rpc_denied('analytics RPC','select public.refresh_analytics(''30D'')');
  perform pg_temp.expect_admin_rpc_denied('dashboard RPC','select public.refresh_dashboard_statistics(''30D'')');
end $$;
-- Helpers run as the switched API role, never as their trusted creator.
do $$ begin execute format('grant usage on schema %I to anon,authenticated',
  (select nspname from pg_namespace where oid=pg_my_temp_schema())); end $$;

-- Exercise the trigger independently of column ACLs using the trusted connection
-- with browser claims. Every attempted change must fail before row constraints.
select set_config('request.jwt.claim','',true),
       set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('nestora.test.customer_a'))::text,true),
       set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claim.sub',current_setting('nestora.test.customer_a'),true);
select pg_temp.expect_permission_denied('trigger blocks actual role promotion',format('update public.profiles set role_id=(select role_id from public.profiles where id=%L::uuid) where id=%L::uuid',current_setting('nestora.test.admin'),current_setting('nestora.test.customer_a')));
select pg_temp.expect_permission_denied('trigger blocks actual identity change',format('update public.profiles set id=%L::uuid where id=%L::uuid',current_setting('nestora.test.customer_b'),current_setting('nestora.test.customer_a')));
select pg_temp.expect_permission_denied('trigger blocks activation change',format('update public.profiles set is_active=false where id=%L::uuid',current_setting('nestora.test.customer_a')));
select pg_temp.expect_permission_denied('trigger blocks inactive Admin reactivation',format('update public.profiles set is_active=true where id=%L::uuid',current_setting('nestora.test.inactive_admin')));

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true),
       set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','anon',true);
select pg_temp.expect_count('anon profile privacy','select id from public.profiles',0);
select pg_temp.expect_count('anon order privacy','select id from public.orders',0);
select pg_temp.expect_count('anon payment privacy','select id from public.payment_transactions',0);
select pg_temp.expect_permission_denied('anon profile UPDATE','update public.profiles set role_id=role_id');
select pg_temp.expect_permission_denied('anon role UPDATE','update public.roles set name=name');
select pg_temp.check_admin_rpc_denials();
select pg_temp.expect_can_call('Guest image-search count RPC','select public.get_customer_image_search_index_count()');
select pg_temp.expect_can_call('Guest image-search RPC','select * from public.search_products_by_image(array_fill(0.1::real,array[384])::extensions.vector,1,0.99)');
select pg_temp.expect_count('Guest public video read',format('select id from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')),1);
select pg_temp.expect_permission_denied('Guest video INSERT',format('insert into public.product_videos(product_id,storage_path) select product_id,storage_path from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')));
select pg_temp.expect_count('anon cannot update video',format('update public.product_videos set sort_order=sort_order where id=%L::uuid',current_setting('nestora.test.video')),0,true);
select pg_temp.expect_count('anon cannot delete video',format('delete from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')),0,true);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('nestora.test.customer_a'),
         'user_metadata',json_build_object('role','super_admin'))::text,true),
       set_config('request.jwt.claim.sub',current_setting('nestora.test.customer_a'),true),
       set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.expect_count('customer sees own order',format('select id from public.orders where id=%L::uuid',current_setting('nestora.test.order_a')),1);
select pg_temp.expect_count('customer cannot see other order',format('select id from public.orders where id=%L::uuid',current_setting('nestora.test.order_b')),0);
select pg_temp.expect_count('customer cannot see other profile',format('select id from public.profiles where id=%L::uuid',current_setting('nestora.test.customer_b')),0);
select pg_temp.expect_count('customer cannot see payments','select id from public.payment_transactions',0);
select pg_temp.expect_permission_denied('customer role escalation','update public.profiles set role_id=role_id where id=auth.uid()');
select pg_temp.expect_permission_denied('customer activation change','update public.profiles set is_active=is_active where id=auth.uid()');
select pg_temp.expect_permission_denied('customer identity change','update public.profiles set id=id where id=auth.uid()');
select pg_temp.expect_permission_denied('customer role catalogue update','update public.roles set name=name');
select pg_temp.expect_count('customer claimed Admin role does not authorize','select 1 where public.current_user_is_admin()',0);
select pg_temp.check_admin_rpc_denials();
select pg_temp.expect_can_call('Customer image-search count RPC','select public.get_customer_image_search_index_count()');
select pg_temp.expect_can_call('Customer image-search RPC','select * from public.search_products_by_image(array_fill(0.1::real,array[384])::extensions.vector,1,0.99)');
select pg_temp.expect_count('Customer public video read',format('select id from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')),1);
select pg_temp.expect_permission_denied('customer video INSERT',format('insert into public.product_videos(product_id,storage_path) select product_id,storage_path from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')));
select pg_temp.expect_count('customer cannot update video',format('update public.product_videos set sort_order=sort_order where id=%L::uuid',current_setting('nestora.test.video')),0,true);
select pg_temp.expect_count('customer cannot delete video',format('delete from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')),0,true);
-- Positive personal-field edit must still affect exactly one row (rolled back).
select pg_temp.expect_count('customer personal edit','update public.profiles set full_name=full_name where id=auth.uid()',1,true);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('nestora.test.admin'))::text,true),
       set_config('request.jwt.claim.sub',current_setting('nestora.test.admin'),true);
select pg_temp.expect_count('admin retains customer-order access',format('select id from public.orders where id=%L::uuid',current_setting('nestora.test.order_b')),1);
select pg_temp.expect_count('admin retains video management',format('update public.product_videos set sort_order=sort_order where id=%L::uuid',current_setting('nestora.test.video')),1,true);
select pg_temp.expect_permission_denied('admin cannot change profile role','update public.profiles set role_id=role_id where id=auth.uid()');
select pg_temp.expect_permission_denied('admin cannot edit role catalogue','update public.roles set name=name');
reset role;

set local role authenticated;
-- Deliberately forge a claimed Admin role: authority must come from live tables,
-- not user-editable metadata or a stale role claim on an inactive account.
select set_config('request.jwt.claims',json_build_object('role','authenticated',
         'sub',current_setting('nestora.test.inactive_admin'),
         'user_metadata',json_build_object('role','super_admin'),
         'app_metadata',json_build_object('role','super_admin'))::text,true),
       set_config('request.jwt.claim.sub',current_setting('nestora.test.inactive_admin'),true),
       set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.expect_count('inactive admin cannot see customer order',format('select id from public.orders where id=%L::uuid',current_setting('nestora.test.order_b')),0);
select pg_temp.expect_count('inactive admin cannot see payments','select id from public.payment_transactions',0);
select pg_temp.expect_count('inactive admin cannot see other profile',format('select id from public.profiles where id=%L::uuid',current_setting('nestora.test.customer_b')),0);
select pg_temp.expect_count('inactive admin cannot update video',format('update public.product_videos set sort_order=sort_order where id=%L::uuid',current_setting('nestora.test.video')),0,true);
select pg_temp.expect_count('inactive admin cannot delete video',format('delete from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')),0,true);
select pg_temp.expect_permission_denied('inactive admin cannot self-activate','update public.profiles set is_active=true where id=auth.uid()');
select pg_temp.expect_permission_denied('inactive admin cannot change role','update public.profiles set role_id=role_id where id=auth.uid()');
select pg_temp.expect_permission_denied('inactive admin cannot change identity','update public.profiles set id=id where id=auth.uid()');
select pg_temp.expect_permission_denied('inactive admin cannot change role catalogue','update public.roles set name=name');
select pg_temp.expect_count('inactive helper false','select 1 where public.current_user_is_admin() or public.is_nestora_admin() or public.can_manage_customer_offers() or private.is_admin()',0);
select pg_temp.expect_count('inactive personal profile edit denied','update public.profiles set full_name=full_name where id=auth.uid()',0,true);
select pg_temp.expect_permission_denied('inactive video INSERT',format('insert into public.product_videos(product_id,storage_path) select product_id,storage_path from public.product_videos where id=%L::uuid',current_setting('nestora.test.video')));
select pg_temp.check_admin_rpc_denials();
select pg_temp.expect_permission_denied('inactive review RPC',format('select public.submit_product_review(%L::uuid,5,''Authorization staging test'')',current_setting('nestora.test.video')));
select pg_temp.expect_permission_denied('inactive history RPC',format('select public.record_product_view(%L::uuid)',current_setting('nestora.test.video')));
select pg_temp.expect_permission_denied('inactive loyalty balance RPC','select public.get_my_loyalty_balance()');
select pg_temp.expect_permission_denied('inactive loyalty history RPC','select * from public.get_my_loyalty_points_history(10,0)');
select pg_temp.expect_permission_denied('inactive loyalty products RPC','select * from public.get_my_redeemable_loyalty_products(10,0)');
select pg_temp.expect_permission_denied('inactive checkout RPC',format('select public.place_customer_order(null::uuid,null::uuid,null::uuid,''{}''::jsonb,''[]''::jsonb,null::text,null::uuid,null::text,0::numeric,%L::uuid,array[]::uuid[],array[]::uuid[],array[]::uuid[])',current_setting('nestora.test.order_a')));
reset role;
rollback;
-- SQL role switching validates database enforcement only. It does not validate JWT
-- signatures, PostgREST, Storage APIs, Edge auth, or Realtime. See the full matrix.
