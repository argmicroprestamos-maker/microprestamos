create or replace function private.enforce_status_transition()
returns trigger
language plpgsql
set search_path = private, pg_temp
as $$
declare
  valid boolean := false;
begin
  if old.status = new.status then return new; end if;
  if tg_table_name = 'loan_applications' then
    valid := (old.status::text, new.status::text) in (('draft','submitted'),('draft','cancelled'),('submitted','under_review'),('submitted','cancelled'),('under_review','approved'),('under_review','rejected'),('under_review','cancelled'));
  elsif tg_table_name = 'loans' then
    valid := (old.status::text, new.status::text) in (('approved','awaiting_disbursement'),('approved','cancelled'),('awaiting_disbursement','active'),('awaiting_disbursement','cancelled'),('active','overdue'),('active','paid'),('active','defaulted'),('overdue','active'),('overdue','paid'),('overdue','defaulted'),('defaulted','paid'));
  elsif tg_table_name = 'installments' then
    valid := (old.status::text, new.status::text) in (('pending','partial'),('pending','paid'),('pending','late'),('pending','cancelled'),('partial','paid'),('partial','late'),('partial','cancelled'),('late','paid'),('late','cancelled'));
  elsif tg_table_name = 'disbursements' then
    valid := (old.status::text, new.status::text) in (('pending','sent'),('pending','failed'),('pending','cancelled'),('sent','confirmed'),('sent','failed'),('sent','cancelled'));
  elsif tg_table_name = 'payments' then
    valid := (old.status::text, new.status::text) in (('pending','confirmed'),('pending','reversed'),('confirmed','reversed'));
  end if;
  if not valid then raise exception 'invalid % status transition: % -> %', tg_table_name, old.status, new.status using errcode = 'check_violation'; end if;
  return new;
end;
$$;

drop trigger if exists loan_applications_status_guard on private.loan_applications;
create trigger loan_applications_status_guard before update of status on private.loan_applications for each row execute function private.enforce_status_transition();
drop trigger if exists loans_status_guard on private.loans;
create trigger loans_status_guard before update of status on private.loans for each row execute function private.enforce_status_transition();
drop trigger if exists installments_status_guard on private.installments;
create trigger installments_status_guard before update of status on private.installments for each row execute function private.enforce_status_transition();
drop trigger if exists disbursements_status_guard on private.disbursements;
create trigger disbursements_status_guard before update of status on private.disbursements for each row execute function private.enforce_status_transition();
drop trigger if exists payments_status_guard on private.payments;
create trigger payments_status_guard before update of status on private.payments for each row execute function private.enforce_status_transition();

revoke all on function private.enforce_status_transition() from public, anon, authenticated;
