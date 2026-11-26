begin;

-- Guest and signed-in newsletter signups; independent of account-only preferences.
create table public.newsletter_subscriptions (
  email text primary key,
  subscribed_at timestamptz not null default now(),
  constraint newsletter_subscriptions_email_valid check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

alter table public.newsletter_subscriptions enable row level security;

-- Explicitly restrict the Data API to email insertion, with no subscriber reads,
-- updates or deletes. Timestamps can only be assigned by the database.
revoke all on table public.newsletter_subscriptions from public, anon, authenticated;
grant insert (email) on table public.newsletter_subscriptions to anon, authenticated;
grant all on table public.newsletter_subscriptions to service_role;

create policy newsletter_subscriptions_insert
  on public.newsletter_subscriptions
  for insert
  to anon, authenticated
  with check (true);

commit;
