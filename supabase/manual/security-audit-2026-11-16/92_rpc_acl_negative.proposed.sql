-- STAGING ONLY; read-only privilege assertions, no fixture creation or RPC invocation.
\set ON_ERROR_STOP on
begin;
select set_config('nestora.test.staging', :'staging_approved',true),set_config('nestora.test.database', :'staging_database',true);
do $test$ declare failures integer; begin
  if current_setting('nestora.test.staging') <> 'yes' or current_database() <> current_setting('nestora.test.database') then
    raise exception 'Explicit staging selection required';
  end if;
  select count(*) into failures from (select 'anon: internal append_customer_loyalty_ledger_entry(p_user_id uuid, p_order_id uuid, p_order_item_id uuid, p_transaction_type text, p_points_delta integer, p_note text) denied' as check_name, (not has_function_privilege('anon','"public"."append_customer_loyalty_ledger_entry"(uuid, uuid, uuid, text, integer, text)','EXECUTE')) as passed
union all
select 'anon: internal attach_customer_to_order(p_order_id uuid) denied' as check_name, (not has_function_privilege('anon','"public"."attach_customer_to_order"(uuid)','EXECUTE')) as passed
union all
select 'anon: internal enforce_variant_order_item_price() denied' as check_name, (not has_function_privilege('anon','"public"."enforce_variant_order_item_price"()','EXECUTE')) as passed
union all
select 'anon: internal handle_new_user() denied' as check_name, (not has_function_privilege('anon','"public"."handle_new_user"()','EXECUTE')) as passed
union all
select 'anon: internal handle_public_customer_signup() denied' as check_name, (not has_function_privilege('anon','"public"."handle_public_customer_signup"()','EXECUTE')) as passed
union all
select 'anon: internal notify_admin_new_order() denied' as check_name, (not has_function_privilege('anon','"public"."notify_admin_new_order"()','EXECUTE')) as passed
union all
select 'anon: internal notify_admin_new_order_from_address() denied' as check_name, (not has_function_privilege('anon','"public"."notify_admin_new_order_from_address"()','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text)','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric)','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid)','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[]) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[])','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[]) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[])','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order_legacy_discount(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order_legacy_discount"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text)','EXECUTE')) as passed
union all
select 'anon: internal place_customer_order_legacy_products_only(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) denied' as check_name, (not has_function_privilege('anon','"public"."place_customer_order_legacy_products_only"(uuid, uuid, uuid, jsonb, jsonb, text)','EXECUTE')) as passed
union all
select 'anon: internal prepare_customer_address() denied' as check_name, (not has_function_privilege('anon','"public"."prepare_customer_address"()','EXECUTE')) as passed
union all
select 'anon: internal prevent_customer_profile_privilege_changes() denied' as check_name, (not has_function_privilege('anon','"public"."prevent_customer_profile_privilege_changes"()','EXECUTE')) as passed
union all
select 'anon: internal prevent_loyalty_ledger_mutation() denied' as check_name, (not has_function_privilege('anon','"public"."prevent_loyalty_ledger_mutation"()','EXECUTE')) as passed
union all
select 'anon: internal process_order_loyalty_status_change() denied' as check_name, (not has_function_privilege('anon','"public"."process_order_loyalty_status_change"()','EXECUTE')) as passed
union all
select 'anon: internal promote_customer_address_after_delete() denied' as check_name, (not has_function_privilege('anon','"public"."promote_customer_address_after_delete"()','EXECUTE')) as passed
union all
select 'anon: internal recalculate_admin_order_after_item_change(p_order_id uuid) denied' as check_name, (not has_function_privilege('anon','"public"."recalculate_admin_order_after_item_change"(uuid)','EXECUTE')) as passed
union all
select 'anon: internal restore_admin_order_item_inventory(p_order_item_id uuid, p_note text) denied' as check_name, (not has_function_privilege('anon','"public"."restore_admin_order_item_inventory"(uuid, text)','EXECUTE')) as passed
union all
select 'anon: internal set_customer_help_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_customer_help_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_customer_offers_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_customer_offers_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_customers_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_customers_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_order_shipping_addresses_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_order_shipping_addresses_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_payment_methods_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_payment_methods_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_payment_transactions_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_payment_transactions_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_product_image_embedding_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_product_image_embedding_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal set_updated_at() denied' as check_name, (not has_function_privilege('anon','"public"."set_updated_at"()','EXECUTE')) as passed
union all
select 'anon: internal sync_customer_from_profile() denied' as check_name, (not has_function_privilege('anon','"public"."sync_customer_from_profile"()','EXECUTE')) as passed
union all
select 'anon: required public place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[], p_free_gift_product_ids uuid[]) retained' as check_name, (has_function_privilege('anon','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[], uuid[])','EXECUTE')) as passed
union all
select 'anon: required public search_products_by_image(query_embedding vector, match_count integer, minimum_similarity double precision) retained' as check_name, (has_function_privilege('anon','"public"."search_products_by_image"(vector, integer, double precision)','EXECUTE')) as passed
union all
select 'anon: required public get_customer_image_search_index_count() retained' as check_name, (has_function_privilege('anon','"public"."get_customer_image_search_index_count"()','EXECUTE')) as passed
union all
select 'anon: profiles.id UPDATE denied' as check_name, (not has_column_privilege('anon','public.profiles','id','UPDATE')) as passed
union all
select 'anon: profiles.id INSERT denied' as check_name, (not has_column_privilege('anon','public.profiles','id','INSERT')) as passed
union all
select 'anon: profiles.role_id UPDATE denied' as check_name, (not has_column_privilege('anon','public.profiles','role_id','UPDATE')) as passed
union all
select 'anon: profiles.role_id INSERT denied' as check_name, (not has_column_privilege('anon','public.profiles','role_id','INSERT')) as passed
union all
select 'anon: profiles.is_active UPDATE denied' as check_name, (not has_column_privilege('anon','public.profiles','is_active','UPDATE')) as passed
union all
select 'anon: profiles.is_active INSERT denied' as check_name, (not has_column_privilege('anon','public.profiles','is_active','INSERT')) as passed
union all
select 'anon: profiles.created_at UPDATE denied' as check_name, (not has_column_privilege('anon','public.profiles','created_at','UPDATE')) as passed
union all
select 'anon: profiles.created_at INSERT denied' as check_name, (not has_column_privilege('anon','public.profiles','created_at','INSERT')) as passed
union all
select 'anon: roles INSERT denied' as check_name, (not has_table_privilege('anon','public.roles','INSERT')) as passed
union all
select 'anon: roles UPDATE denied' as check_name, (not has_table_privilege('anon','public.roles','UPDATE')) as passed
union all
select 'anon: roles DELETE denied' as check_name, (not has_table_privilege('anon','public.roles','DELETE')) as passed
union all
select 'anon: roles TRUNCATE denied' as check_name, (not has_table_privilege('anon','public.roles','TRUNCATE')) as passed
union all
select 'authenticated: internal append_customer_loyalty_ledger_entry(p_user_id uuid, p_order_id uuid, p_order_item_id uuid, p_transaction_type text, p_points_delta integer, p_note text) denied' as check_name, (not has_function_privilege('authenticated','"public"."append_customer_loyalty_ledger_entry"(uuid, uuid, uuid, text, integer, text)','EXECUTE')) as passed
union all
select 'authenticated: internal attach_customer_to_order(p_order_id uuid) denied' as check_name, (not has_function_privilege('authenticated','"public"."attach_customer_to_order"(uuid)','EXECUTE')) as passed
union all
select 'authenticated: internal enforce_variant_order_item_price() denied' as check_name, (not has_function_privilege('authenticated','"public"."enforce_variant_order_item_price"()','EXECUTE')) as passed
union all
select 'authenticated: internal handle_new_user() denied' as check_name, (not has_function_privilege('authenticated','"public"."handle_new_user"()','EXECUTE')) as passed
union all
select 'authenticated: internal handle_public_customer_signup() denied' as check_name, (not has_function_privilege('authenticated','"public"."handle_public_customer_signup"()','EXECUTE')) as passed
union all
select 'authenticated: internal notify_admin_new_order() denied' as check_name, (not has_function_privilege('authenticated','"public"."notify_admin_new_order"()','EXECUTE')) as passed
union all
select 'authenticated: internal notify_admin_new_order_from_address() denied' as check_name, (not has_function_privilege('authenticated','"public"."notify_admin_new_order_from_address"()','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text)','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric)','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid)','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[]) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[])','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[]) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[])','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order_legacy_discount(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order_legacy_discount"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text)','EXECUTE')) as passed
union all
select 'authenticated: internal place_customer_order_legacy_products_only(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text) denied' as check_name, (not has_function_privilege('authenticated','"public"."place_customer_order_legacy_products_only"(uuid, uuid, uuid, jsonb, jsonb, text)','EXECUTE')) as passed
union all
select 'authenticated: internal prepare_customer_address() denied' as check_name, (not has_function_privilege('authenticated','"public"."prepare_customer_address"()','EXECUTE')) as passed
union all
select 'authenticated: internal prevent_customer_profile_privilege_changes() denied' as check_name, (not has_function_privilege('authenticated','"public"."prevent_customer_profile_privilege_changes"()','EXECUTE')) as passed
union all
select 'authenticated: internal prevent_loyalty_ledger_mutation() denied' as check_name, (not has_function_privilege('authenticated','"public"."prevent_loyalty_ledger_mutation"()','EXECUTE')) as passed
union all
select 'authenticated: internal process_order_loyalty_status_change() denied' as check_name, (not has_function_privilege('authenticated','"public"."process_order_loyalty_status_change"()','EXECUTE')) as passed
union all
select 'authenticated: internal promote_customer_address_after_delete() denied' as check_name, (not has_function_privilege('authenticated','"public"."promote_customer_address_after_delete"()','EXECUTE')) as passed
union all
select 'authenticated: internal recalculate_admin_order_after_item_change(p_order_id uuid) denied' as check_name, (not has_function_privilege('authenticated','"public"."recalculate_admin_order_after_item_change"(uuid)','EXECUTE')) as passed
union all
select 'authenticated: internal restore_admin_order_item_inventory(p_order_item_id uuid, p_note text) denied' as check_name, (not has_function_privilege('authenticated','"public"."restore_admin_order_item_inventory"(uuid, text)','EXECUTE')) as passed
union all
select 'authenticated: internal set_customer_help_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_customer_help_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_customer_offers_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_customer_offers_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_customers_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_customers_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_order_shipping_addresses_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_order_shipping_addresses_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_payment_methods_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_payment_methods_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_payment_transactions_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_payment_transactions_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_product_image_embedding_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_product_image_embedding_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal set_updated_at() denied' as check_name, (not has_function_privilege('authenticated','"public"."set_updated_at"()','EXECUTE')) as passed
union all
select 'authenticated: internal sync_customer_from_profile() denied' as check_name, (not has_function_privilege('authenticated','"public"."sync_customer_from_profile"()','EXECUTE')) as passed
union all
select 'authenticated: required public place_customer_order(p_cart_id uuid, p_shipping_method_id uuid, p_payment_method_id uuid, p_shipping_address jsonb, p_items jsonb, p_customer_notes text, p_discount_id uuid, p_discount_code text, p_expected_subtotal numeric, p_checkout_token uuid, p_redeem_product_ids uuid[], p_redeem_variant_ids uuid[], p_free_gift_product_ids uuid[]) retained' as check_name, (has_function_privilege('authenticated','"public"."place_customer_order"(uuid, uuid, uuid, jsonb, jsonb, text, uuid, text, numeric, uuid, uuid[], uuid[], uuid[])','EXECUTE')) as passed
union all
select 'authenticated: required public search_products_by_image(query_embedding vector, match_count integer, minimum_similarity double precision) retained' as check_name, (has_function_privilege('authenticated','"public"."search_products_by_image"(vector, integer, double precision)','EXECUTE')) as passed
union all
select 'authenticated: required public get_customer_image_search_index_count() retained' as check_name, (has_function_privilege('authenticated','"public"."get_customer_image_search_index_count"()','EXECUTE')) as passed
union all
select 'authenticated: profiles.id UPDATE denied' as check_name, (not has_column_privilege('authenticated','public.profiles','id','UPDATE')) as passed
union all
select 'authenticated: profiles.id INSERT denied' as check_name, (not has_column_privilege('authenticated','public.profiles','id','INSERT')) as passed
union all
select 'authenticated: profiles.role_id UPDATE denied' as check_name, (not has_column_privilege('authenticated','public.profiles','role_id','UPDATE')) as passed
union all
select 'authenticated: profiles.role_id INSERT denied' as check_name, (not has_column_privilege('authenticated','public.profiles','role_id','INSERT')) as passed
union all
select 'authenticated: profiles.is_active UPDATE denied' as check_name, (not has_column_privilege('authenticated','public.profiles','is_active','UPDATE')) as passed
union all
select 'authenticated: profiles.is_active INSERT denied' as check_name, (not has_column_privilege('authenticated','public.profiles','is_active','INSERT')) as passed
union all
select 'authenticated: profiles.created_at UPDATE denied' as check_name, (not has_column_privilege('authenticated','public.profiles','created_at','UPDATE')) as passed
union all
select 'authenticated: profiles.created_at INSERT denied' as check_name, (not has_column_privilege('authenticated','public.profiles','created_at','INSERT')) as passed
union all
select 'authenticated: roles INSERT denied' as check_name, (not has_table_privilege('authenticated','public.roles','INSERT')) as passed
union all
select 'authenticated: roles UPDATE denied' as check_name, (not has_table_privilege('authenticated','public.roles','UPDATE')) as passed
union all
select 'authenticated: roles DELETE denied' as check_name, (not has_table_privilege('authenticated','public.roles','DELETE')) as passed
union all
select 'authenticated: roles TRUNCATE denied' as check_name, (not has_table_privilege('authenticated','public.roles','TRUNCATE')) as passed
union all
select 'authenticated: personal profiles.full_name UPDATE retained' as check_name, (has_column_privilege('authenticated','public.profiles','full_name','UPDATE')) as passed
union all
select 'authenticated: personal profiles.email UPDATE retained' as check_name, (has_column_privilege('authenticated','public.profiles','email','UPDATE')) as passed
union all
select 'authenticated: personal profiles.phone UPDATE retained' as check_name, (has_column_privilege('authenticated','public.profiles','phone','UPDATE')) as passed
union all
select 'authenticated: personal profiles.birthday UPDATE retained' as check_name, (has_column_privilege('authenticated','public.profiles','birthday','UPDATE')) as passed
union all
select 'authenticated: personal profiles.avatar_url UPDATE retained' as check_name, (has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE')) as passed
union all
select 'authenticated: personal profiles.avatar_media_id UPDATE retained' as check_name, (has_column_privilege('authenticated','public.profiles','avatar_media_id','UPDATE')) as passed) checks where passed is distinct from true;
  if failures <> 0 then raise exception 'FAIL: % privilege assertions',failures; end if;
  raise notice 'PASS: 96 exact-signature/column privilege assertions';
end $test$;
rollback;
