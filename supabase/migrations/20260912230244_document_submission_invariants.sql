create unique index client_documents_required_type_once
  on private.client_documents (client_id, document_type)
  where document_type in ('dni_front', 'dni_back', 'cbu_certificate');

create or replace function private.validate_application_submission()
returns trigger
language plpgsql
set search_path = private, pg_temp
as $$
declare
  v_contacts integer;
  v_primary_accounts integer;
  v_documents integer;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select count(*) into v_contacts from private.emergency_contacts where client_id = new.client_id and consent_declared;
    select count(*) into v_primary_accounts from private.bank_accounts where client_id = new.client_id and is_primary;
    select count(distinct document_type) into v_documents from private.client_documents
      where client_id = new.client_id and document_type in ('dni_front', 'dni_back', 'cbu_certificate') and status <> 'rejected';
    if v_contacts <> 2 then raise exception 'exactly two consented emergency contacts are required'; end if;
    if v_primary_accounts <> 1 then raise exception 'one primary bank account is required'; end if;
    if v_documents <> 3 then raise exception 'dni front, dni back and cbu certificate are required'; end if;
    new.submitted_at = coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;
