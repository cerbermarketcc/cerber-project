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

create table if not exists admin_accounts (
  id text primary key,
  scope text not null check (scope in ('site', 'store')),
  login_key text not null,
  login text not null,
  store_id text references stores(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator', 'manager', 'support', 'staff')),
  password_hash text,
  permissions jsonb not null default '[]'::jsonb,
  totp_secret_enc text,
  pending_totp_secret_enc text,
  totp_enabled boolean not null default false,
  recovery_code_hashes jsonb not null default '[]'::jsonb,
  last_totp_step bigint not null default -1,
  credential_version bigint not null default 1,
  session_version bigint not null default 1,
  disabled boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_accounts_site_login_idx
  on admin_accounts(login_key) where scope = 'site';
create unique index if not exists admin_accounts_store_login_idx
  on admin_accounts(store_id, login_key) where scope = 'store';
create index if not exists admin_accounts_scope_idx on admin_accounts(scope);
create index if not exists admin_accounts_store_idx on admin_accounts(store_id);
alter table admin_accounts add column if not exists session_version bigint not null default 1;

create table if not exists operation_locks (
  lock_key text primary key,
  holder text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists operation_locks_expires_at_idx on operation_locks(expires_at);

create or replace function acquire_operation_locks(
  requested_keys text[],
  requested_holder text,
  ttl_seconds integer default 45
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_keys text[];
begin
  if requested_holder is null or length(requested_holder) < 16 then
    return false;
  end if;
  select array_agg(distinct lock_name order by lock_name)
    into normalized_keys
    from unnest(requested_keys) as requested(lock_name)
    where lock_name is not null and lock_name ~ '^[a-z0-9:_-]{1,160}$';
  if normalized_keys is null or cardinality(normalized_keys) = 0 then
    return false;
  end if;
  delete from operation_locks where expires_at <= now();
  if exists (select 1 from operation_locks where lock_key = any(normalized_keys)) then
    return false;
  end if;
  insert into operation_locks(lock_key, holder, expires_at)
    select lock_name, requested_holder, now() + make_interval(secs => greatest(5, least(ttl_seconds, 120)))
    from unnest(normalized_keys) as requested(lock_name);
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

create or replace function release_operation_locks(
  requested_keys text[],
  requested_holder text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from operation_locks
  where lock_key = any(requested_keys) and holder = requested_holder;
$$;

-- The browser never connects to database tables directly. All access goes through
-- the server with the service-role key, so public Supabase roles must have no table access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'sessions',
    'stores',
    'messages',
    'app_settings',
    'orders',
    'wallet_deposits',
    'wallet_withdrawals',
    'ledger_entries',
    'payment_ipn_events',
    'audit_logs',
    'admin_accounts',
    'operation_locks'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
  end loop;
end
$$;

revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke all privileges on schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
revoke execute on function acquire_operation_locks(text[], text, integer) from public, anon, authenticated;
revoke execute on function release_operation_locks(text[], text) from public, anon, authenticated;
grant execute on function acquire_operation_locks(text[], text, integer) to service_role;
grant execute on function release_operation_locks(text[], text) to service_role;
revoke insert, update, delete on table storage.objects from public, anon, authenticated;
