-- Edge Functions use the server-only service role to reach the unexposed domain schema.
grant usage on schema private to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;

alter default privileges for role postgres in schema private
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema private
  grant usage, select on sequences to service_role;

revoke all on schema private from anon;
