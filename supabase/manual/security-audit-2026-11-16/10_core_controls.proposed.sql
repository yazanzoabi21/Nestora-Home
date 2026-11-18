-- SUPERSEDED by metadata-backed 40/41 drafts. DO NOT USE OR COMBINE.
-- PROPOSAL ONLY. NOT EXECUTED. Deliberately outside automatic migrations.
-- Incomplete security coverage: see the audit report before approving installation.
-- Requires an inspected staging clone, saved original ACLs/definitions, and approval.
-- Do not combine with the old phase2-v2 proposal without reconciling both packages.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$
begin
  if current_setting('nestora.security_review_approved',true) is distinct from 'yes' then
    raise exception 'Proposal only: approval and deployed metadata review required';
  end if;
  if to_regnamespace('nestora_security_20261116') is not null then
    raise exception 'Reserved schema exists: reconcile migration state';
  end if;
  if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Trusted BYPASSRLS owner required for non-recursive authorization';
  end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'API roles must not bypass RLS';
  end if;
  if exists(select 1 from pg_class where oid in ('public.profiles'::regclass,'public.roles'::regclass,
      'public.product_videos'::regclass) and not relrowsecurity) then
    raise exception 'Expected RLS-enabled tables';
  end if;
end $$;

create schema nestora_security_20261116;
revoke all on schema nestora_security_20261116 from public,anon,authenticated;
grant usage on schema nestora_security_20261116 to anon,authenticated;
-- This schema must NOT be in Supabase's exposed schemas. API roles cannot CREATE here.
create function nestora_security_20261116.active_actor()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active is true)
$$;
create function nestora_security_20261116.active_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=auth.uid() and p.is_active is true and r.name in ('admin','super_admin'))
$$;
revoke all on function nestora_security_20261116.active_actor() from public,anon,authenticated;
revoke all on function nestora_security_20261116.active_admin() from public,anon,authenticated;
grant execute on function nestora_security_20261116.active_actor() to anon,authenticated;
grant execute on function nestora_security_20261116.active_admin() to anon,authenticated;

-- A column REVOKE alone cannot override a table-level or inherited grant.
-- Remove table AND direct column grants, then restore the existing personal fields.
revoke all on public.profiles from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.profiles from authenticated;
revoke insert,update,delete,truncate,references,trigger on public.roles from public,anon,authenticated;
do $$
declare col record;
begin
  for col in select attname from pg_attribute where attrelid='public.profiles'::regclass
    and attnum>0 and not attisdropped loop
    execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.profiles from public,anon',
      col.attname,col.attname,col.attname,col.attname);
    execute format('revoke insert(%I),update(%I),references(%I) on public.profiles from authenticated',
      col.attname,col.attname,col.attname);
  end loop;
  for col in select attname from pg_attribute where attrelid='public.roles'::regclass
    and attnum>0 and not attisdropped loop
    execute format('revoke insert(%I),update(%I),references(%I) on public.roles from public,anon,authenticated',
      col.attname,col.attname,col.attname);
  end loop;
end $$;
grant update(full_name,email,phone,birthday,avatar_media_id,avatar_url) on public.profiles to authenticated;
-- Retain the existing customer-email protection trigger. Admin personal email editing
-- stays possible. Auth email identity changes continue through Supabase Auth only.
create policy security_20261116_profile_read on public.profiles as restrictive
  for select to anon,authenticated
  using (id=(select auth.uid()) or (select nestora_security_20261116.active_admin()));
create policy security_20261116_profile_update on public.profiles as restrictive
  for update to authenticated
  using ((select nestora_security_20261116.active_actor()) and
    (id=(select auth.uid()) or (select nestora_security_20261116.active_admin())))
  with check ((select nestora_security_20261116.active_actor()) and
    (id=(select auth.uid()) or (select nestora_security_20261116.active_admin())));

-- Restrictive policies AND with existing policies: broad permissive policies cannot
-- bypass these gates, and existing module permissions still restrict active Admins.
-- This list is a proposal based on actual browser callers, not a live table manifest.
-- Reconcile every target/caller and preserve existing authorized server function owners.
do $$
declare relation_name text; command_name text;
begin
  foreach relation_name in array array[
    'products','product_variants','product_videos','categories','promotions','promotion_products',
    'discounts','discount_gift_products','customer_offers','orders','order_items',
    'order_shipping_addresses','payment_methods','payment_transactions','shipping_methods',
    'delivery_zones','shipping_method_zones','media_assets','media_usages','inventory_logs',
    'loyalty_program_settings','product_image_embeddings','customer_content_pages','customer_faqs'
  ] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||relation_name)
        and relrowsecurity and relkind in ('r','p')) then
      raise exception 'Missing/RLS-disabled proposal target: %',relation_name;
    end if;
    foreach command_name in array array['INSERT','UPDATE','DELETE'] loop
      execute format('create policy %I on public.%I as restrictive for %s to anon,authenticated %s %s',
        'security_20261116_admin_'||lower(command_name),relation_name,command_name,
        case when command_name in ('UPDATE','DELETE') then
          'using ((select nestora_security_20261116.active_admin()))' else '' end,
        case when command_name in ('INSERT','UPDATE') then
          'with check ((select nestora_security_20261116.active_admin()))' else '' end);
    end loop;
  end loop;
end $$;
-- Guard against inherited grants that would make the intended column controls ineffective.
do $$
declare role_name text; col_name text; privilege_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach col_name in array array['id','role_id','is_active'] loop
      if has_column_privilege(role_name,'public.profiles',col_name,'UPDATE') then
        raise exception 'Inherited UPDATE still allows %.profiles.%',role_name,col_name;
      end if;
    end loop;
    foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(role_name,'public.roles',privilege_name) then
        raise exception 'Inherited role-catalogue % remains for %',privilege_name,role_name;
      end if;
    end loop;
    foreach privilege_name in array array['INSERT','UPDATE','REFERENCES'] loop
      if has_any_column_privilege(role_name,'public.roles',privilege_name) then
        raise exception 'Inherited role-catalogue column % remains for %',privilege_name,role_name;
      end if;
    end loop;
    foreach privilege_name in array array['INSERT','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(role_name,'public.profiles',privilege_name) then
        raise exception 'Inherited profile % remains for %',privilege_name,role_name;
      end if;
    end loop;
    if has_any_column_privilege(role_name,'public.profiles','INSERT') or
       has_any_column_privilege(role_name,'public.profiles','REFERENCES') then
      raise exception 'Inherited profile column INSERT/REFERENCES remains for %',role_name;
    end if;
  end loop;
  if has_any_column_privilege('anon','public.profiles','SELECT') or
     has_any_column_privilege('anon','public.profiles','UPDATE') then
    raise exception 'Inherited anonymous profile read/write privilege remains';
  end if;
end $$;
notify pgrst,'reload schema';
commit;
