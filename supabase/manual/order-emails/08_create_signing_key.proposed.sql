-- Generate the webhook SIGNING key server-side. No plaintext key in SQL arguments or output.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_user<>'postgres' then raise exception 'Trusted owner required'; end if;
  if (select count(*) from vault.secrets where name='ORDER_EMAIL_WEBHOOK_TOKEN')>1 then
    raise exception 'Duplicate signing-key names'; end if;
  if not exists(select 1 from vault.secrets where name='ORDER_EMAIL_WEBHOOK_TOKEN') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
      'ORDER_EMAIL_WEBHOOK_TOKEN','Order-email HMAC key; never sent in pg_net headers');
  end if;
end $$;
commit;
