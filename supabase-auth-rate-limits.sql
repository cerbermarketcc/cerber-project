-- Persistent brute-force protection for privileged (site/store admin) logins.
-- Apply once in the Supabase SQL editor after supabase-security-2fa.sql.

begin;

create table if not exists public.auth_rate_limits (
  scope text not null,
  key_hash text not null,
  failures integer not null default 0 check (failures >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash),
  check (scope ~ '^[a-z0-9:_-]{1,96}$'),
  check (key_hash ~ '^[a-f0-9]{24}$')
);

create index if not exists auth_rate_limits_updated_at_idx
  on public.auth_rate_limits(updated_at);

create or replace function public.auth_rate_limit_status(
  requested_scope text,
  requested_key_hash text
) returns table(failures integer, locked_until timestamptz, retry_after_seconds integer)
language sql
security definer
set search_path = public
as $$
  select
    item.failures,
    item.locked_until,
    greatest(0, coalesce(ceil(extract(epoch from (item.locked_until - now())))::integer, 0))
  from public.auth_rate_limits as item
  where item.scope = requested_scope
    and item.key_hash = requested_key_hash
    and item.locked_until > now();
$$;

create or replace function public.record_auth_failure(
  requested_scope text,
  requested_key_hash text,
  failure_limit integer,
  window_seconds integer,
  lock_seconds integer
) returns table(failures integer, locked_until timestamptz, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.auth_rate_limits%rowtype;
  safe_limit integer := greatest(2, least(failure_limit, 100));
  safe_window integer := greatest(60, least(window_seconds, 86400));
  safe_lock integer := greatest(60, least(lock_seconds, 86400));
begin
  if requested_scope is null
    or requested_scope !~ '^[a-z0-9:_-]{1,96}$'
    or requested_key_hash is null
    or requested_key_hash !~ '^[a-f0-9]{24}$' then
    raise exception 'invalid auth rate-limit key';
  end if;

  insert into public.auth_rate_limits(scope, key_hash)
  values (requested_scope, requested_key_hash)
  on conflict (scope, key_hash) do nothing;

  select * into current_row
  from public.auth_rate_limits as item
  where item.scope = requested_scope and item.key_hash = requested_key_hash
  for update;

  if current_row.window_started_at <= now() - make_interval(secs => safe_window) then
    current_row.failures := 0;
    current_row.window_started_at := now();
    current_row.locked_until := null;
  end if;

  current_row.failures := current_row.failures + 1;
  if current_row.failures >= safe_limit then
    current_row.locked_until := greatest(
      coalesce(current_row.locked_until, now()),
      now() + make_interval(secs => safe_lock)
    );
  end if;

  update public.auth_rate_limits as item
  set failures = current_row.failures,
      window_started_at = current_row.window_started_at,
      locked_until = current_row.locked_until,
      updated_at = now()
  where item.scope = requested_scope and item.key_hash = requested_key_hash;

  return query
  select
    current_row.failures,
    current_row.locked_until,
    greatest(0, coalesce(ceil(extract(epoch from (current_row.locked_until - now())))::integer, 0));
end;
$$;

create or replace function public.clear_auth_failures(
  requested_scope text,
  requested_key_hash text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_rate_limits as item
  where item.scope = requested_scope and item.key_hash = requested_key_hash;
$$;

alter table public.auth_rate_limits enable row level security;
alter table public.auth_rate_limits force row level security;

revoke all privileges on table public.auth_rate_limits from public, anon, authenticated;
revoke execute on function public.auth_rate_limit_status(text, text) from public, anon, authenticated;
revoke execute on function public.record_auth_failure(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.clear_auth_failures(text, text) from public, anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on table public.auth_rate_limits to service_role;
grant execute on function public.auth_rate_limit_status(text, text) to service_role;
grant execute on function public.record_auth_failure(text, text, integer, integer, integer) to service_role;
grant execute on function public.clear_auth_failures(text, text) to service_role;

commit;
