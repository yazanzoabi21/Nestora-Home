-- Run after 10_install in ONE transaction and ROLLBACK. No SMTP or persistent fixtures.
-- The runner also executes a second copy with authenticated_case=true.
do $$
declare authenticated_case boolean:=false; uid uuid:=gen_random_uuid(); cart uuid;
  product public.products%rowtype; ship uuid; payment uuid; token uuid:=gen_random_uuid();
  expected numeric; address jsonb; items jsonb; result jsonb; replay jsonb; target uuid; stock_after integer;
begin
  update nestora_order_email.settings set automatic_confirmations_enabled=true,
    automatic_confirmations_from=transaction_timestamp()-interval '1 second';
  select * into product from public.products p where is_active and stock>=3
    and not exists(select 1 from public.product_variants v where v.product_id=p.id) order by price,id limit 1;
  select id into ship from public.shipping_methods where is_active and code='pickup_store' limit 1;
  select id into payment from public.payment_methods where is_active and code='cod' and type='manual' and provider='Manual' limit 1;
  if product.id is null or ship is null or payment is null then raise exception 'Real reviewed catalog/pickup/manual COD required'; end if;
  if authenticated_case then
    -- Owned-address fixture exists only in this rollback transaction; no signup mail or credentials.
    insert into auth.users(id,email,aud,role,raw_user_meta_data,raw_app_meta_data)
      values(uid,'info@nestorahomelb.com','authenticated','authenticated','{"full_name":"OWNED ROLLBACK TEST"}','{}');
    if not exists(select 1 from public.profiles where id=uid and is_active) then raise exception 'Customer profile not initialized'; end if;
    insert into public.carts(user_id) values(uid) returning id into cart;
    insert into public.cart_items(cart_id,product_id,quantity) values(cart,product.id,1);
    perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',uid)::text,true);
  else
    perform set_config('request.jwt.claims','{"role":"anon"}',true);
  end if;
  perform set_config('request.path','/rpc/place_customer_order',true);
  perform set_config('request.method','POST',true);
  perform set_config('request.headers','{"cf-connecting-ip":"198.51.100.34","x-forwarded-for":"203.0.113.99"}',true);
  expected:=case when product.sale_price>0 and product.sale_price<product.price then product.sale_price else product.price end;
  address:=jsonb_build_object('first_name','Nestora','last_name','ROLLBACK TEST','email','info@nestorahomelb.com',
    'phone',null,'street_address','ROLLBACK ONLY - DO NOT FULFILL','city','No delivery','state_province','Lebanon',
    'postal_code','TEST','country','Lebanon','delivery_instructions','ROLLBACK ONLY');
  items:=jsonb_build_array(jsonb_build_object('product_id',product.id,'variant_id',null,'quantity',1));
  result:=public.place_customer_order(cart,ship,payment,address,items,'OWNED ROLLBACK ONLY',null,null,expected,token,
    '{}'::uuid[],'{}'::uuid[],'{}'::uuid[]);
  target:=(result->>'order_id')::uuid;
  if target is null or not nestora_order_email.automatic_recipient_authorized(target,'info@nestorahomelb.com') then
    raise exception 'Actual checkout did not capture context at token assignment'; end if;
  if (select user_id from nestora_order_email.checkout_contexts where order_id=target) is distinct from
    (case when authenticated_case then uid else null end) then raise exception 'Customer identity binding failed'; end if;
  if (select ip_hash from nestora_order_email.checkout_contexts where order_id=target)=
    (select encode(extensions.hmac('203.0.113.99',automatic_ip_salt,'sha256'),'hex') from nestora_order_email.settings) then
    raise exception 'Trusted IP hash used spoofable forwarded header'; end if;
  select stock into stock_after from public.products where id=product.id;
  replay:=public.place_customer_order(cart,ship,payment,address,items,'OWNED ROLLBACK ONLY',null,null,expected,token,
    '{}'::uuid[],'{}'::uuid[],'{}'::uuid[]);
  if replay->>'order_id'<>result->>'order_id' or
    (select stock from public.products where id=product.id)<>stock_after then raise exception 'Checkout replay changed order/stock'; end if;
  if public.order_email_prepare(target)<>2 or public.order_email_prepare(target)<>0 then raise exception 'Actual checkout did not queue exactly two jobs'; end if;
  if (select count(*) from nestora_order_email.deliveries where order_id=target and state='pending')<>2 then
    raise exception 'Actual checkout still requires verification'; end if;
  if nestora_order_email.valid_mailbox(E'info@nestorahomelb.com\r\nBcc:forged@example.invalid')
    or nestora_order_email.valid_mailbox('one@example.invalid,two@example.invalid') then raise exception 'Malicious recipient accepted'; end if;
end $$;
select 'PASS: real checkout RPC, customer/guest identity binding, server pricing, stock/replay protection, trusted IP selection, exactly two pending emails and malicious recipient denial; ALL ROLLED BACK' as result;
rollback;
