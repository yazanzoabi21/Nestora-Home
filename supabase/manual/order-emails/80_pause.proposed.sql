-- PROPOSAL ONLY. First disable both Edge gates. Already-started SMTP may finish.
begin;
update nestora_order_email.settings set enabled=false,send_enabled=false where singleton;
update nestora_order_email.sandbox_orders set send_until=null;
commit;
-- Preserves existing checkout, dashboard notifications, ledger and deduplication tombstones.
