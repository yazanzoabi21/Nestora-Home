create table if not exists public.payment_methods (
  id uuid primary key default extensions.uuid_generate_v4(),
  code varchar(50) not null unique,
  name varchar(120) not null,
  provider varchar(80) null,
  type varchar(50) not null default 'manual',
  description text null,
  icon varchar(120) null,
  instructions_en text null,
  instructions_ar text null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  min_amount numeric(10,2) null,
  max_amount numeric(10,2) null,
  fee_fixed numeric(10,2) not null default 0,
  fee_percentage numeric(5,2) not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_methods
  (code, name, provider, type, description, icon, instructions_en, instructions_ar, is_active, sort_order, config)
values
  (
    'cod',
    'Cash on Delivery',
    'Manual',
    'manual',
    'Customer pays when the order is delivered.',
    'pi pi-wallet',
    'Collect payment from the customer at delivery.',
    'يتم تحصيل الدفع من العميل عند التسليم.',
    true,
    1,
    '{"requires_online_payment": false}'::jsonb
  ),
  (
    'whish',
    'Whish',
    'Whish',
    'online',
    'Whish payment method prepared for future integration.',
    'pi pi-mobile',
    'Whish integration is not active yet. Keep this method disabled until API credentials are configured.',
    'تكامل Whish غير مفعّل حالياً. أبقِ هذه الطريقة معطّلة حتى يتم إعداد بيانات الربط.',
    false,
    2,
    '{"requires_online_payment": true, "integration_status": "planned"}'::jsonb
  )
on conflict (code) do nothing;
