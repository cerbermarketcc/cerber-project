-- Defense-in-depth migration for installations that still contain the legacy
-- browser-managed public.cerberus_state table. The current Cerber server does
-- not use this table; sensitive data is accessed through server.js with the
-- service_role key and application-level authorization.

begin;

do $$
declare
  policy_row record;
begin
  if to_regclass('public.cerberus_state') is null then
    raise notice 'public.cerberus_state is absent; no legacy table to lock down';
    return;
  end if;

  alter table public.cerberus_state enable row level security;
  alter table public.cerberus_state force row level security;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'cerberus_state'
  loop
    execute format('drop policy if exists %I on public.cerberus_state', policy_row.policyname);
  end loop;

  revoke all privileges on table public.cerberus_state from public, anon, authenticated;
  grant all privileges on table public.cerberus_state to service_role;
end
$$;

-- Remove indirect browser access as well. A legacy SECURITY DEFINER RPC could
-- otherwise continue exposing the locked table even after its table grants
-- and policies were removed.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke all privileges on schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep future public tables private unless an audited migration explicitly
-- grants a narrower role. The browser must never receive service_role.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

do $$
declare
  exposed_grants integer;
  exposed_policies integer;
begin
  if to_regclass('public.cerberus_state') is null then
    return;
  end if;

  select count(*) into exposed_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'cerberus_state'
    and grantee in ('PUBLIC', 'anon', 'authenticated');

  select count(*) into exposed_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'cerberus_state';

  if exposed_grants <> 0 or exposed_policies <> 0 then
    raise exception 'Legacy cerberus_state lockdown verification failed';
  end if;
end
$$;

commit;
