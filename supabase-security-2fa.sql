-- Apply this migration before deploying the security-audit build.
-- It is idempotent and does not modify ordinary customer accounts.

create table if not exists public.admin_accounts (
  id text primary key,
  scope text not null check (scope in ('site', 'store')),
  login_key text not null,
  login text not null,
  store_id text references public.stores(id) on delete cascade,
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
  on public.admin_accounts(login_key) where scope = 'site';
create unique index if not exists admin_accounts_store_login_idx
  on public.admin_accounts(store_id, login_key) where scope = 'store';
create index if not exists admin_accounts_scope_idx on public.admin_accounts(scope);
create index if not exists admin_accounts_store_idx on public.admin_accounts(store_id);

alter table public.admin_accounts add column if not exists session_version bigint not null default 1;

create table if not exists public.operation_locks (
  lock_key text primary key,
  holder text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists operation_locks_expires_at_idx on public.operation_locks(expires_at);

create or replace function public.acquire_operation_locks(
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

create or replace function public.release_operation_locks(
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

alter table public.admin_accounts enable row level security;
alter table public.admin_accounts force row level security;
alter table public.operation_locks enable row level security;
alter table public.operation_locks force row level security;
revoke all privileges on table public.admin_accounts, public.operation_locks from public, anon, authenticated;
revoke execute on function public.acquire_operation_locks(text[], text, integer) from public, anon, authenticated;
revoke execute on function public.release_operation_locks(text[], text) from public, anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on table public.admin_accounts, public.operation_locks to service_role;
grant execute on function public.acquire_operation_locks(text[], text, integer) to service_role;
grant execute on function public.release_operation_locks(text[], text) to service_role;
