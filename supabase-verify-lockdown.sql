-- Read-only security verification. Expected result: zero rows in both result
-- sets. Run after supabase-schema.sql and supabase-legacy-state-lockdown.sql.

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and (
    coalesce(qual, '') ~* '^\\s*\\(?\\s*true\\s*\\)?\\s*$'
    or coalesce(with_check, '') ~* '^\\s*\\(?\\s*true\\s*\\)?\\s*$'
  )
order by tablename, policyname;
