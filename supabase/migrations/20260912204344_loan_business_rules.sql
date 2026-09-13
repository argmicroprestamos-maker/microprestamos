-- Deterministic flat-interest calculations used by the API and admin panel.
create or replace function private.calculate_flat_loan(
  p_principal numeric,
  p_interest_rate_percent numeric,
  p_installment_count integer,
  p_fees numeric default 0
)
returns jsonb
language plpgsql
immutable
set search_path = private, pg_temp
as $$
declare
  v_interest numeric(14,2);
  v_total numeric(14,2);
  v_installment numeric(14,2);
begin
  if p_principal <= 0 or p_interest_rate_percent < 0 or p_installment_count < 1 or p_fees < 0 then
    raise exception 'invalid loan parameters';
  end if;
  v_interest := round(p_principal * p_interest_rate_percent / 100, 2);
  v_total := round(p_principal + v_interest + p_fees, 2);
  v_installment := round(v_total / p_installment_count, 2);
  return jsonb_build_object(
    'principal', round(p_principal, 2),
    'interest_amount', v_interest,
    'fees', round(p_fees, 2),
    'total_due', v_total,
    'installment_amount', v_installment,
    'installment_count', p_installment_count,
    'rules_version', 'flat-v1'
  );
end;
$$;

-- Creates a loan and a rounded payment schedule atomically after an application is approved.
create or replace function private.create_loan_from_application(
  p_application_id uuid,
  p_disbursement_date date default current_date
)
returns uuid
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
  if not private.is_admin() then
    raise exception 'admin access required';
  end if;
  select * into v_application from private.loan_applications where id = p_application_id for update;
  if not found or v_application.status <> 'approved' then
    raise exception 'application must be approved';
  end if;
  if exists (select 1 from private.loans where application_id = p_application_id) then
    select id into v_loan_id from private.loans where application_id = p_application_id;
    return v_loan_id;
  end if;

  insert into private.loans (
    application_id, client_id, product_id, principal, interest_rate_percent,
    interest_amount, fees, total_due, installment_count, first_due_date, status,
    approved_at
  ) values (
    v_application.id, v_application.client_id, v_application.product_id,
    v_application.requested_amount, v_application.interest_rate_percent,
    v_application.interest_amount, v_application.fees, v_application.total_due,
    v_application.installment_count, (p_disbursement_date + interval '1 month')::date,
    'awaiting_disbursement', now()
  ) returning id into v_loan_id;

  v_base := round(v_application.total_due / v_application.installment_count, 2);
  for v_n in 1..v_application.installment_count loop
    v_due := (p_disbursement_date + (v_n || ' month')::interval)::date;
    v_last := case when v_n = v_application.installment_count
      then v_application.total_due - (v_base * (v_application.installment_count - 1))
      else v_base end;
    insert into private.installments (
      loan_id, installment_number, due_date, principal_amount,
      interest_amount, fees, total_amount
    ) values (
      v_loan_id, v_n, v_due,
      round(v_application.requested_amount / v_application.installment_count, 2),
      round(v_application.interest_amount / v_application.installment_count, 2),
      case when v_n = v_application.installment_count
        then v_application.fees - round(v_application.fees / v_application.installment_count, 2) * (v_application.installment_count - 1)
        else round(v_application.fees / v_application.installment_count, 2) end,
      v_last
    );
  end loop;
  insert into private.audit_log (actor_user_id, actor_kind, action, entity_type, entity_id, after_data)
    values (auth.uid(), 'admin', 'loan_created', 'loan', v_loan_id, jsonb_build_object('application_id', p_application_id));
  return v_loan_id;
end;
$$;

revoke all on function private.calculate_flat_loan(numeric,numeric,integer,numeric) from public, anon, authenticated;
revoke all on function private.create_loan_from_application(uuid,date) from public, anon, authenticated;
grant execute on function private.create_loan_from_application(uuid,date) to authenticated;

create index if not exists installments_loan_id_idx on private.installments(loan_id);
create index if not exists applications_client_id_idx on private.loan_applications(client_id);
create index if not exists loans_client_id_idx on private.loans(client_id);
