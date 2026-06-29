alter table public.categories
add column if not exists parent_id uuid null references public.categories(id) on delete cascade;
