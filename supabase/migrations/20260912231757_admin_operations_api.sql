-- Privileged workflows are invoked by the authenticated admin Edge Function only.
-- Each function validates the actual actor against admin_memberships before writing.
create or replace function private.record_application_decision_from_api(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_application private.loan_applications%rowtype;
  v_loan_id uuid;
  v_n integer;
  v_base numeric(14,2);
  v_last numeric(14,2);
  v_due date;
begin
  if p_decision not in ('approved', 'rejected') or coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'invalid_decision';
  end if;
  if not exists (select 1 from private.admin_memberships where user_id = p_actor_user_id and active and role in ('superadmin', 'analista')) then
    raise exception 'decision_permission_denied';
  end if;
  select * into v_application from private.loan_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if v_application.status = 'submitted' then
    update private.loan_applications set status = 'under_review' where id = v_application.id;
    select * into v_application from private.loan_applications where id = p_application_id;
  end if;
  if v_application.status <> 'under_review' then raise exception 'application_not_reviewable'; end if;

  update private.loan_applications set status = p_decision::private.application_status where id = v_application.id;
  insert into private.application_decisions (application_id, decision, reason, actor_user_id, actor_kind, rules_version)
    values (v_application.id, p_decision, btrim(p_reason), p_actor_user_id, 'human', 'flat-v1');

  if p_decision = 'approved' then
    insert into private.loans (
      application_id, client_id, product_id, principal, interest_rate_percent, interest_amount,
      fees, total_due, installment_count, first_due_date, status, approved_at
    ) values (
      v_application.id, v_application.client_id, v_application.product_id, v_application.requested_amount,
      v_application.interest_rate_percent, v_application.interest_amount, v_application.fees,
      v_application.total_due, v_application.installment_count, (current_date + interval '1 month')::date,
      'awaiting_disbursement', now()
    ) returning id into v_loan_id;
    v_base := round(v_application.total_due / v_application.installment_count, 2);
    for v_n in 1..v_application.installment_count loop
      v_due := (current_date + (v_n || ' month')::interval)::date;
      v_last := case when v_n = v_application.installment_count then v_application.total_due - v_base * (v_application.installment_count - 1) else v_base end;
      insert into private.installments (loan_id, installment_number, due_date, principal_amount, interest_amount, fees, total_amount)
      values (
        v_loan_id, v_n, v_due,
        case when v_n = v_application.installment_count then v_application.requested_amount - round(v_application.requested_amount / v_application.installment_count, 2) * (v_application.installment_count - 1) else round(v_application.requested_amount / v_application.installment_count, 2) end,
        case when v_n = v_application.installment_count then v_application.interest_amount - round(v_application.interest_amount / v_application.installment_count, 2) * (v_application.installment_count - 1) else round(v_application.interest_amount / v_application.installment_count, 2) end,
        case when v_n = v_application.installment_count then v_application.fees - round(v_application.fees / v_application.installment_count, 2) * (v_application.installment_count - 1) else round(v_application.fees / v_application.installment_count, 2) end,
        v_last
      );
    end loop;
  end if;
  insert into private.audit_log (actor_user_id, actor_kind, action, entity_type, entity_id, after_data)
    values (p_actor_user_id, 'admin', 'application_decided', 'loan_application', v_application.id, jsonb_build_object('decision', p_decision, 'loan_id', v_loan_id));
  return jsonb_build_object('application_id', v_application.id, 'status', p_decision, 'loan_id', v_loan_id);
end;
$$;

create or replace function private.record_disbursement_from_api(
  p_loan_id uuid,
  p_actor_user_id uuid,
  p_transfer_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_loan private.loans%rowtype;
  v_bank_account private.bank_accounts%rowtype;
  v_disbursement_id uuid;
begin
  if coalesce(length(btrim(p_transfer_reference)), 0) < 3 then raise exception 'transfer_reference_required'; end if;
  if not exists (select 1 from private.admin_memberships where user_id = p_actor_user_id and active and role in ('superadmin', 'analista')) then raise exception 'disbursement_permission_denied'; end if;
  select * into v_loan from private.loans where id = p_loan_id for update;
  if not found or v_loan.status <> 'awaiting_disbursement' then raise exception 'loan_not_ready_for_disbursement'; end if;
  select * into v_bank_account from private.bank_accounts where client_id = v_loan.client_id and is_primary for update;
  if not found then raise exception 'primary_bank_account_missing'; end if;
  insert into private.disbursements (loan_id, bank_account_id, amount, destination_cbu_last4, transfer_reference, status, sent_at, confirmed_at, created_by)
  values (v_loan.id, v_bank_account.id, v_loan.principal, right(v_bank_account.cbu, 4), btrim(p_transfer_reference), 'confirmed', now(), now(), p_actor_user_id)
  returning id into v_disbursement_id;
  update private.loans set status = 'active', disbursed_at = now() where id = v_loan.id;
  insert into private.audit_log (actor_user_id, actor_kind, action, entity_type, entity_id, after_data)
    values (p_actor_user_id, 'admin', 'disbursement_recorded', 'disbursement', v_disbursement_id, jsonb_build_object('loan_id', v_loan.id, 'amount', v_loan.principal));
  return jsonb_build_object('disbursement_id', v_disbursement_id, 'loan_id', v_loan.id, 'status', 'active');
end;
$$;

create or replace function private.record_payment_from_api(
  p_loan_id uuid,
  p_actor_user_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_loan private.loans%rowtype;
  v_payment_id uuid;
  v_installment private.installments%rowtype;
  v_remaining numeric(14,2) := round(p_amount, 2);
  v_allocated numeric(14,2);
  v_outstanding numeric(14,2);
begin
  if p_amount <= 0 or p_method not in ('transfer', 'cash', 'other') then raise exception 'invalid_payment'; end if;
  if not exists (select 1 from private.admin_memberships where user_id = p_actor_user_id and active and role in ('superadmin', 'analista', 'cobranzas')) then raise exception 'payment_permission_denied'; end if;
  select * into v_loan from private.loans where id = p_loan_id for update;
  if not found or v_loan.status not in ('active', 'overdue') then raise exception 'loan_not_payable'; end if;
  select coalesce(sum(total_amount - paid_amount), 0) into v_outstanding from private.installments where loan_id = p_loan_id and status <> 'cancelled';
  if v_remaining > v_outstanding then raise exception 'payment_exceeds_outstanding_balance'; end if;
  insert into private.payments (loan_id, amount, paid_at, method, reference, status, created_by)
    values (p_loan_id, v_remaining, now(), p_method::text, nullif(btrim(p_reference), ''), 'confirmed', p_actor_user_id)
    returning id into v_payment_id;
  for v_installment in select * from private.installments where loan_id = p_loan_id and status in ('pending', 'partial', 'late') order by due_date, installment_number for update loop
    exit when v_remaining = 0;
    v_allocated := least(v_remaining, v_installment.total_amount - v_installment.paid_amount);
    insert into private.payment_allocations (payment_id, installment_id, amount) values (v_payment_id, v_installment.id, v_allocated);
    update private.installments set paid_amount = paid_amount + v_allocated,
      status = case when paid_amount + v_allocated = total_amount then 'paid'::private.installment_status when status = 'late' then 'late'::private.installment_status else 'partial'::private.installment_status end
      where id = v_installment.id;
    v_remaining := v_remaining - v_allocated;
  end loop;
  if exists (select 1 from private.installments where loan_id = p_loan_id and paid_amount < total_amount and status <> 'cancelled') then
    null;
  else
    update private.loans set status = 'paid', paid_at = now() where id = p_loan_id;
  end if;
  insert into private.audit_log (actor_user_id, actor_kind, action, entity_type, entity_id, after_data)
    values (p_actor_user_id, 'admin', 'payment_recorded', 'payment', v_payment_id, jsonb_build_object('loan_id', p_loan_id, 'amount', p_amount));
  return jsonb_build_object('payment_id', v_payment_id, 'loan_id', p_loan_id, 'remaining_unallocated', v_remaining);
end;
$$;

revoke all on function private.record_application_decision_from_api(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function private.record_disbursement_from_api(uuid,uuid,text) from public, anon, authenticated;
revoke all on function private.record_payment_from_api(uuid,uuid,numeric,text,text) from public, anon, authenticated;
grant execute on function private.record_application_decision_from_api(uuid,uuid,text,text) to service_role;
grant execute on function private.record_disbursement_from_api(uuid,uuid,text) to service_role;
grant execute on function private.record_payment_from_api(uuid,uuid,numeric,text,text) to service_role;
