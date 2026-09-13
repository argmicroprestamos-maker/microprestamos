create unique index if not exists emergency_contacts_client_position_uidx on private.emergency_contacts(client_id, position);

create or replace function private.validate_application_submission()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_contacts integer;
  v_primary_accounts integer;
  v_documents integer;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select count(*) into v_contacts from private.emergency_contacts where client_id = new.client_id and consent_declared;
    if v_contacts <> 2 then raise exception 'exactly two consented emergency contacts are required'; end if;
    select count(*) into v_primary_accounts from private.bank_accounts where client_id = new.client_id and is_primary;
    if v_primary_accounts <> 1 then raise exception 'exactly one primary bank account is required'; end if;
    select count(*) into v_documents from private.client_documents where client_id = new.client_id and document_type in ('dni_front','dni_back','cbu_certificate') and status = 'approved';
    if v_documents <> 3 then raise exception 'approved DNI front, DNI back and CBU document are required'; end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists loan_applications_submission_guard on private.loan_applications;
create trigger loan_applications_submission_guard before update of status on private.loan_applications
for each row execute function private.validate_application_submission();

revoke all on function private.validate_application_submission() from public, anon, authenticated;
