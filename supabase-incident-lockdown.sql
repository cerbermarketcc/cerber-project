-- CERBER incident lockdown, 2026-08-12.
-- Run once in Supabase SQL Editor as the project owner.
-- This does not delete profiles, stores, orders, balances, messages, or payments.

begin;

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
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    end if;
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

-- Remove any old permissive policies. The service role bypasses RLS and remains
-- the only application principal allowed to use these private tables.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

-- The backend service role remains the only database principal used by the app.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Public media can still be served from the public bucket, but browsers cannot
-- create, replace, or delete storage objects directly.
revoke insert, update, delete on table storage.objects from public, anon, authenticated;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end
$$;

-- Password hashes and seller credentials must be treated as compromised. Business
-- records are preserved, while every account and shop must receive a fresh password.
update public.profiles
set password_hash = 'incident-revoked:' || md5(random()::text || clock_timestamp()::text || login_key);

create or replace function pg_temp.cerber_revoke_store_credentials(items jsonb)
returns jsonb
language sql
as $$
  select coalesce(
    jsonb_agg(
      (item - 'adminPassword' - 'adminPasswordHash' - 'password' - 'passwordHash' - 'panel')
      || jsonb_build_object('staff', '[]'::jsonb, 'credentialVersion', 'incident-revoked')
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end
  ) as entries(item);
$$;

create or replace function pg_temp.cerber_revoke_bot_credentials(items jsonb)
returns jsonb
language sql
as $$
  select coalesce(
    jsonb_agg((item - 'token' - 'botToken' - 'webhookSecret') || jsonb_build_object('active', false, 'verified', false)),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end
  ) as entries(item);
$$;

update public.stores
set data = (data - 'adminPassword' - 'adminPasswordHash' - 'password' - 'passwordHash' - 'panel')
  || jsonb_build_object('staff', '[]'::jsonb, 'credentialVersion', 'incident-revoked'),
    updated_at = now();

update public.app_settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        data - 'adminSecurity' - 'adminPassword' - 'ownerPassword' - 'password' - 'passwordHash',
        '{ownerStores}', pg_temp.cerber_revoke_store_credentials(data->'ownerStores'), true
      ),
      '{publicStoresCache}', pg_temp.cerber_revoke_store_credentials(data->'publicStoresCache'), true
    ),
    '{stores}', pg_temp.cerber_revoke_store_credentials(data->'stores'), true
  ),
  '{mirrorBots}', pg_temp.cerber_revoke_bot_credentials(data->'mirrorBots'), true
), updated_at = now();

-- Remove obsolete audit reset markers and raw IP/user-agent details while
-- preserving the security event history itself.
update public.app_settings
set data = jsonb_set(
  data,
  '{adminLogs}',
  coalesce((
    select jsonb_agg(
      log_item || jsonb_build_object(
        'details', coalesce(log_item->'details', '{}'::jsonb)
          - 'ip' - 'userAgent' - 'user_agent' - 'referer'
      )
    )
    from jsonb_array_elements(
      case when jsonb_typeof(data->'adminLogs') = 'array' then data->'adminLogs' else '[]'::jsonb end
    ) as logs(log_item)
  ), '[]'::jsonb),
  true
), updated_at = now();

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    update public.audit_logs
    set ip = null,
        user_agent = null,
        details = coalesce(details, '{}'::jsonb) - 'ip' - 'userAgent' - 'user_agent' - 'referer';
  end if;
end
$$;

-- Revoke every browser session issued before or during the compromise.
truncate table public.sessions;

commit;
