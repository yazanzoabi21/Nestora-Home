create table if not exists public.payment_transactions (
  id uuid primary key default extensions.uuid_generate_v4(),
  order_id uuid null references public.orders(id) on delete set null,
  payment_method_id uuid null references public.payment_methods(id) on delete set null,
  transaction_code varchar(80) not null unique,
  order_number varchar(80) null,
  customer_name varchar(160) null,
  customer_email varchar(180) null,
  method_code varchar(50) not null,
  method_name varchar(120) not null,
  provider varchar(80) null,
  amount numeric(10,2) not null default 0,
  fee_amount numeric(10,2) not null default 0,
  currency varchar(10) not null default 'USD',
  status varchar(40) not null default 'pending',
  reference varchar(180) null,
  provider_transaction_id varchar(180) null,
  notes text null,
  paid_at timestamptz null,
  refunded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  config jsonb not null default '{}'::jsonb,
  constraint payment_transactions_status_check check (
    status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')
  )
);

create index if not exists payment_transactions_order_id_idx
on public.payment_transactions(order_id);

create index if not exists payment_transactions_status_idx
on public.payment_transactions(status);

create index if not exists payment_transactions_created_at_idx
on public.payment_transactions(created_at desc);

notify pgrst, 'reload schema';
