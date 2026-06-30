alter table public.promotions
add column if not exists display_type varchar(50) null default 'bar',
add column if not exists icon varchar(50) null;
