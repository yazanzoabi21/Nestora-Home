-- Read-only post-migration verification.
select to_regclass('public.customer_addresses') is not null
   and not exists (
     select 1 from pg_attribute
     where attrelid = 'public.customer_addresses'::regclass
       and attname = 'postal_code' and not attisdropped
   ) as saved_address_column_removed,
   not exists (
     select 1 from pg_constraint
     where conrelid = 'public.customer_addresses'::regclass
       and pg_get_constraintdef(oid) ilike '%postal_code%'
   ) as saved_address_constraint_removed,
   exists (
     select 1 from pg_attribute
     where attrelid = 'public.order_shipping_addresses'::regclass
       and attname = 'postal_code' and not attisdropped
   ) as historical_order_column_retained;

select p.oid::regprocedure as function_signature,
       p.prosrc !~* 'p_shipping_address[^;]*->>?[[:space:]]*''postal_code'''
         and p.prosrc !~* '(new|old)\s*\.\s*postal_code' as ignores_postal_code,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.proconfig as settings,
       p.proacl as acl
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and (p.proname like 'place_customer_order%' or p.proname = 'prepare_customer_address')
order by p.oid::regprocedure::text;

select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced, c.relacl as table_acl
from pg_class c
where c.oid = 'public.customer_addresses'::regclass;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'customer_addresses'
order by policyname;

select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.customer_addresses'::regclass and not tgisinternal
order by tgname;

