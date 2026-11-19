-- RETIRED. This deployment is permanently recipient-locked to the sandbox mailbox.
-- A separately reviewed implementation/migration and guest policy are required for production delivery.
do $$ begin
  raise exception 'Production activation unavailable in the locked sandbox implementation';
end $$;
