create extension if not exists pgcrypto;

create schema if not exists private;

create type private.admin_role as enum ('superadmin', 'analista', 'cobranzas', 'solo_lectura');
create type private.client_status as enum ('pending', 'active', 'blocked', 'deleted');
create type private.application_status as enum ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled');
create type private.loan_status as enum ('approved', 'awaiting_disbursement', 'active', 'paid', 'overdue', 'defaulted', 'cancelled');
create type private.installment_status as enum ('pending', 'partial', 'paid', 'late', 'cancelled');
create type private.document_status as enum ('pending', 'approved', 'rejected');
create type private.disbursement_status as enum ('pending', 'sent', 'confirmed', 'failed', 'cancelled');
create type private.payment_status as enum ('pending', 'confirmed', 'reversed');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = private, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table private.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role private.admin_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.clients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  dni text not null unique,
  cuil text,
  full_name text not null,
  birth_date date not null,
  phone text not null,
  email text,
  address text,
  status private.client_status not null default 'pending',
  phone_verified_at timestamptz,
  identity_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.consent_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references private.clients(id) on delete restrict,
  consent_type text not null check (consent_type in ('terms', 'privacy', 'credit_check', 'emergency_contact', 'communications')),
  version text not null,
  channel text not null check (channel in ('android', 'web', 'admin', 'n8n')),
  accepted boolean not null,
  accepted_at timestamptz not null default now(),
  technical_metadata jsonb not null default '{}'::jsonb
);

create table private.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references private.clients(id) on delete restrict,
  position smallint not null check (position in (1, 2)),
  full_name text not null,
  relationship text not null,
  phone text not null,
  consent_declared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, position)
);

create table private.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references private.clients(id) on delete restrict,
  cbu text not null check (cbu ~ '^[0-9]{22}$'),
  alias text,
  bank_name text,
  holder_name text not null,
  holder_tax_id text,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bank_accounts_one_primary_per_client
  on private.bank_accounts(client_id) where is_primary;

create table private.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references private.clients(id) on delete restrict,
  document_type text not null check (document_type in ('dni_front', 'dni_back', 'cbu_certificate', 'selfie', 'other')),
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status private.document_status not null default 'pending',
  review_note text,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.loan_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  currency text not null default 'ARS' check (currency = 'ARS'),
  min_amount numeric(14, 2) not null check (min_amount > 0),
  max_amount numeric(14, 2) not null check (max_amount >= min_amount),
  interest_rate_percent numeric(8, 4) not null check (interest_rate_percent >= 0),
  installment_count integer not null check (installment_count between 1 and 24),
  frequency text not null default 'monthly' check (frequency = 'monthly'),
  fees numeric(14, 2) not null default 0 check (fees >= 0),
  active boolean not null default false,
  rules_version text not null default 'flat-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.loan_applications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references private.clients(id) on delete restrict,
  product_id uuid not null references private.loan_products(id) on delete restrict,
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  interest_rate_percent numeric(8, 4) not null check (interest_rate_percent >= 0),
  installment_count integer not null check (installment_count > 0),
  fees numeric(14, 2) not null default 0 check (fees >= 0),
  interest_amount numeric(14, 2) not null check (interest_amount >= 0),
  total_due numeric(14, 2) not null check (total_due >= requested_amount),
  installment_amount numeric(14, 2) not null check (installment_amount > 0),
  first_due_date date,
  status private.application_status not null default 'draft',
  source text not null default 'android' check (source in ('android', 'web', 'admin', 'n8n')),
  external_id text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table private.application_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references private.loan_applications(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('human', 'system')),
  rules_version text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table private.loans (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references private.loan_applications(id) on delete restrict,
  client_id uuid not null references private.clients(id) on delete restrict,
  product_id uuid not null references private.loan_products(id) on delete restrict,
  principal numeric(14, 2) not null check (principal > 0),
  interest_rate_percent numeric(8, 4) not null check (interest_rate_percent >= 0),
  interest_amount numeric(14, 2) not null check (interest_amount >= 0),
  fees numeric(14, 2) not null default 0 check (fees >= 0),
  total_due numeric(14, 2) not null check (total_due >= principal),
  installment_count integer not null check (installment_count > 0),
  frequency text not null default 'monthly' check (frequency = 'monthly'),
  first_due_date date not null,
  status private.loan_status not null default 'approved',
  contract_version text not null default 'mvp-v1',
  approved_at timestamptz not null default now(),
  disbursed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references private.loans(id) on delete restrict,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_amount numeric(14, 2) not null check (principal_amount >= 0),
  interest_amount numeric(14, 2) not null check (interest_amount >= 0),
  fees numeric(14, 2) not null default 0 check (fees >= 0),
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  status private.installment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, installment_number)
);

create table private.disbursements (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null unique references private.loans(id) on delete restrict,
  bank_account_id uuid not null references private.bank_accounts(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  destination_cbu_last4 text not null check (destination_cbu_last4 ~ '^[0-9]{4}$'),
  transfer_reference text,
  status private.disbursement_status not null default 'pending',
  sent_at timestamptz,
  confirmed_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references private.loans(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null,
  method text not null check (method in ('transfer', 'cash', 'other')),
  reference text,
  status private.payment_status not null default 'pending',
  receipt_storage_path text,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.payment_allocations (
  payment_id uuid not null references private.payments(id) on delete restrict,
  installment_id uuid not null references private.installments(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (payment_id, installment_id)
);

create table private.integration_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  secret_hash text not null,
  scopes text[] not null default '{}',
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.integration_requests (
  id uuid primary key default gen_random_uuid(),
  integration_client_id uuid not null references private.integration_clients(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  endpoint text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (integration_client_id, idempotency_key)
);

create table private.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table private.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('client', 'admin', 'n8n', 'system')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table private.system_settings (
  key text primary key,
  value jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create index clients_phone_idx on private.clients(phone);
create index applications_status_created_idx on private.loan_applications(status, created_at desc);
create index loans_status_created_idx on private.loans(status, created_at desc);
create index installments_due_status_idx on private.installments(due_date, status);
create index audit_log_entity_idx on private.audit_log(entity_type, entity_id, created_at desc);
create index webhook_outbox_pending_idx on private.webhook_outbox(status, next_attempt_at);

create or replace function private.is_admin(required_role private.admin_role default null)
returns boolean
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select exists (
    select 1
    from private.admin_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.active
      and (required_role is null or membership.role = required_role)
  );
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(private.admin_role) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'admin_memberships', 'clients', 'consent_events', 'emergency_contacts',
    'bank_accounts', 'client_documents', 'loan_products', 'loan_applications',
    'application_decisions', 'loans', 'installments', 'disbursements', 'payments',
    'payment_allocations', 'integration_clients', 'integration_requests', 'webhook_outbox',
    'audit_log', 'system_settings'
  ] loop
    execute format('alter table private.%I enable row level security', table_name);
    execute format('revoke all on private.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

create policy profiles_admin_all on private.profiles
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy profiles_self_select on private.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_self_update on private.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy clients_admin_all on private.clients
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy clients_self_select on private.clients
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy clients_self_update on private.clients
  for update to authenticated using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create policy clients_self_insert on private.clients
  for insert to authenticated with check (auth_user_id = (select auth.uid()));

create policy admin_memberships_admin_all on private.admin_memberships
  for all to authenticated using (private.is_admin('superadmin')) with check (private.is_admin('superadmin'));

create policy client_related_admin_all on private.consent_events
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy client_related_self_select on private.consent_events
  for select to authenticated using (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  );

create policy emergency_contacts_admin_all on private.emergency_contacts
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy emergency_contacts_self_all on private.emergency_contacts
  for all to authenticated using (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  );

create policy bank_accounts_admin_all on private.bank_accounts
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy bank_accounts_self_all on private.bank_accounts
  for all to authenticated using (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  );

create policy documents_admin_all on private.client_documents
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy documents_self_select on private.client_documents
  for select to authenticated using (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  );

create policy products_admin_all on private.loan_products
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy products_client_select on private.loan_products
  for select to authenticated using (active = true);

create policy applications_admin_all on private.loan_applications
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy applications_self_all on private.loan_applications
  for all to authenticated using (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  );

create policy decisions_admin_all on private.application_decisions
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy loans_admin_all on private.loans
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy loans_self_select on private.loans
  for select to authenticated using (
    exists (select 1 from private.clients c where c.id = client_id and c.auth_user_id = (select auth.uid()))
  );

create policy installments_admin_all on private.installments
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy installments_self_select on private.installments
  for select to authenticated using (
    exists (
      select 1 from private.loans l
      join private.clients c on c.id = l.client_id
      where l.id = loan_id and c.auth_user_id = (select auth.uid())
    )
  );

create policy disbursements_admin_all on private.disbursements
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy payments_admin_all on private.payments
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy allocations_admin_all on private.payment_allocations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy audit_admin_select on private.audit_log
  for select to authenticated using (private.is_admin());

create policy settings_superadmin_all on private.system_settings
  for all to authenticated using (private.is_admin('superadmin')) with check (private.is_admin('superadmin'));

create trigger profiles_updated_at before update on private.profiles
  for each row execute function private.set_updated_at();
create trigger admin_memberships_updated_at before update on private.admin_memberships
  for each row execute function private.set_updated_at();
create trigger clients_updated_at before update on private.clients
  for each row execute function private.set_updated_at();
create trigger emergency_contacts_updated_at before update on private.emergency_contacts
  for each row execute function private.set_updated_at();
create trigger bank_accounts_updated_at before update on private.bank_accounts
  for each row execute function private.set_updated_at();
create trigger client_documents_updated_at before update on private.client_documents
  for each row execute function private.set_updated_at();
create trigger loan_products_updated_at before update on private.loan_products
  for each row execute function private.set_updated_at();
create trigger loan_applications_updated_at before update on private.loan_applications
  for each row execute function private.set_updated_at();
create trigger loans_updated_at before update on private.loans
  for each row execute function private.set_updated_at();
create trigger installments_updated_at before update on private.installments
  for each row execute function private.set_updated_at();
create trigger disbursements_updated_at before update on private.disbursements
  for each row execute function private.set_updated_at();
create trigger payments_updated_at before update on private.payments
  for each row execute function private.set_updated_at();
create trigger integration_clients_updated_at before update on private.integration_clients
  for each row execute function private.set_updated_at();

insert into private.loan_products (
  name, min_amount, max_amount, interest_rate_percent, installment_count, active
) values (
  'MVP mensual', 1000, 100000, 10, 3, true
);

insert into private.system_settings (key, value)
values
  ('environment', '{"name":"development","real_money_enabled":false}'::jsonb),
  ('document_uploads', '{"max_size_bytes":10485760,"allowed_mime_types":["image/jpeg","image/png","application/pdf"]}'::jsonb);

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do update set public = excluded.public;

create policy client_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy client_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or private.is_admin())
  );

create policy client_documents_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or private.is_admin())
  )
  with check (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or private.is_admin())
  );

create policy client_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'client-documents'
    and private.is_admin()
  );
