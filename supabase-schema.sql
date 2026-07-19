create table if not exists profiles (
  login_key text primary key,
  login text not null,
  password_hash text not null,
  name text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists language text not null default 'ru';

create table if not exists sessions (
  token text primary key,
  login_key text not null references profiles(login_key) on delete cascade,
  created_at timestamptz not null default now()
);

alter table sessions add column if not exists ip text;
alter table sessions add column if not exists user_agent text;
create index if not exists sessions_login_key_idx on sessions(login_key);
create index if not exists sessions_created_at_idx on sessions(created_at);

create table if not exists stores (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  login_key text references profiles(login_key) on delete set null,
  store_id text references stores(id) on delete set null,
  type text not null default 'product',
  status text not null default 'pending_payment',
  payment_status text not null default 'pending',
  amount_usd numeric(18, 8) not null default 0,
  seller_amount_usd numeric(18, 8) not null default 0,
  platform_commission_usd numeric(18, 8) not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists orders_login_key_idx on orders(login_key);
create index if not exists orders_store_id_idx on orders(store_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_payment_status_idx on orders(payment_status);

create table if not exists wallet_deposits (
  id text primary key,
  login_key text references profiles(login_key) on delete set null,
  provider text not null default 'nowpayments',
  provider_payment_id text unique,
  status text not null default 'pending',
  amount_usd numeric(18, 8) not null default 0,
  amount_ltc numeric(24, 12) not null default 0,
  coin_id text not null default 'ltc',
  pay_currency text not null default 'ltc',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists wallet_deposits_login_key_idx on wallet_deposits(login_key);
create index if not exists wallet_deposits_status_idx on wallet_deposits(status);

create table if not exists wallet_withdrawals (
  id text primary key,
  scope text not null default 'user',
  login_key text references profiles(login_key) on delete set null,
  store_id text references stores(id) on delete set null,
  provider text not null default 'manual',
  provider_payout_id text unique,
  idempotency_key text,
  request_signature text,
  status text not null default 'pending',
  amount_usd numeric(18, 8) not null default 0,
  amount_ltc numeric(24, 12) not null default 0,
  address text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists wallet_withdrawals_scope_idx on wallet_withdrawals(scope);
create index if not exists wallet_withdrawals_login_key_idx on wallet_withdrawals(login_key);
create index if not exists wallet_withdrawals_store_id_idx on wallet_withdrawals(store_id);
create index if not exists wallet_withdrawals_status_idx on wallet_withdrawals(status);
create unique index if not exists wallet_withdrawals_idempotency_idx
  on wallet_withdrawals(scope, coalesce(login_key, ''), coalesce(store_id, ''), idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table if not exists ledger_entries (
  id text primary key,
  scope text not null,
  login_key text references profiles(login_key) on delete set null,
  store_id text references stores(id) on delete set null,
  order_id text references orders(id) on delete set null,
  withdrawal_id text references wallet_withdrawals(id) on delete set null,
  kind text not null,
  amount_usd numeric(18, 8) not null default 0,
  amount_ltc numeric(24, 12) not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_scope_idx on ledger_entries(scope);
create index if not exists ledger_entries_login_key_idx on ledger_entries(login_key);
create index if not exists ledger_entries_store_id_idx on ledger_entries(store_id);
create index if not exists ledger_entries_order_id_idx on ledger_entries(order_id);

create table if not exists payment_ipn_events (
  fingerprint text primary key,
  provider text not null default 'nowpayments',
  kind text not null,
  provider_event_id text,
  order_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  action text not null,
  actor text not null default 'system',
  details jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_idx on audit_logs(action);
create index if not exists audit_logs_actor_idx on audit_logs(actor);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at);
