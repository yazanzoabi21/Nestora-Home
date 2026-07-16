alter table public.profiles add column if not exists birthday date null;

-- Customers may read and edit only their own profile. Existing admin policies remain separate.
alter table public.profiles enable row level security;
drop policy if exists "Customers can read own profile" on public.profiles;
create policy "Customers can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Customers can update own profile" on public.profiles;
create policy "Customers can update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
