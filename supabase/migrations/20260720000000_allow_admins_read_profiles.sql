-- Allow admin users to read customer profiles for admin workflows.
-- This complements existing customer-only profile select policy.

alter table public.profiles enable row level security;

drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles"
  on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid() and r.name in ('admin', 'super_admin')
    )
  );
