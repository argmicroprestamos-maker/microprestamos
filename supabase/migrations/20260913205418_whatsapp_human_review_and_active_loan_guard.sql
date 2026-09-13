alter table private.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_state_check;

alter table private.whatsapp_conversations
  add constraint whatsapp_conversations_state_check check (state in (
    'awaiting_channel_choice', 'app_link_sent', 'awaiting_consent',
    'awaiting_full_name', 'awaiting_dni', 'awaiting_birth_date',
    'awaiting_address', 'awaiting_email',
    'awaiting_employment_status', 'awaiting_employment_detail', 'awaiting_monthly_income',
    'awaiting_contact_1_name', 'awaiting_contact_1_relationship', 'awaiting_contact_1_phone',
    'awaiting_contact_2_name', 'awaiting_contact_2_relationship', 'awaiting_contact_2_phone',
    'awaiting_cbu', 'awaiting_holder_name',
    'awaiting_dni_front', 'awaiting_dni_back', 'awaiting_cbu_certificate',
    'awaiting_amount', 'awaiting_confirmation', 'ready_for_review',
    'approved', 'rejected', 'declined', 'human_handoff'
  ));

alter table private.whatsapp_conversations
  add column review_decision text check (review_decision in ('approved', 'rejected')),
  add column review_reason text check (review_reason is null or length(btrim(review_reason)) between 3 and 500),
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz;

create table private.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references private.whatsapp_conversations(id) on delete restrict,
  recipient_wa_id text not null check (recipient_wa_id ~ '^[1-9][0-9]{7,14}$'),
  message_type text not null default 'text' check (message_type in ('text', 'file', 'audio')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_outbox_delivery_idx
  on private.whatsapp_outbox(status, available_at, created_at);

create unique index loans_one_open_per_client
  on private.loans(client_id)
  where status in (
    'approved'::private.loan_status,
    'awaiting_disbursement'::private.loan_status,
    'active'::private.loan_status,
    'overdue'::private.loan_status,
    'defaulted'::private.loan_status
  );

alter table private.whatsapp_outbox enable row level security;
revoke all on private.whatsapp_outbox from public, anon, authenticated;

create trigger whatsapp_outbox_updated_at
  before update on private.whatsapp_outbox
  for each row execute function private.set_updated_at();

create or replace function private.review_whatsapp_application(
  p_conversation_id uuid,
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
  v_conversation private.whatsapp_conversations%rowtype;
  v_dni text;
  v_message text;
begin
  if p_decision not in ('approved', 'rejected') or coalesce(length(btrim(p_reason)), 0) < 3 then
    raise exception 'invalid_decision';
  end if;
  if not exists (
    select 1 from private.admin_memberships
    where user_id = p_actor_user_id and active and role in ('superadmin', 'analista')
  ) then
    raise exception 'decision_permission_denied';
  end if;

  select * into v_conversation
  from private.whatsapp_conversations
  where id = p_conversation_id
  for update;

  if not found then raise exception 'whatsapp_application_not_found'; end if;
  if v_conversation.state <> 'ready_for_review' or v_conversation.review_decision is not null then
    raise exception 'whatsapp_application_not_reviewable';
  end if;

  v_dni := nullif(v_conversation.draft ->> 'dni', '');
  if p_decision = 'approved' and exists (
    select 1
    from private.clients c
    join private.loans l on l.client_id = c.id
    where c.dni = v_dni
      and l.status in ('approved', 'awaiting_disbursement', 'active', 'overdue', 'defaulted')
  ) then
    raise exception 'client_already_has_open_loan';
  end if;

  update private.whatsapp_conversations
  set state = p_decision,
      review_decision = p_decision,
      review_reason = btrim(p_reason),
      reviewed_by = p_actor_user_id,
      reviewed_at = now()
  where id = p_conversation_id;

  v_message := case
    when p_decision = 'approved' then 'Tu solicitud fue aprobada. Un asesor continuará la gestión y confirmará las condiciones antes del desembolso.'
    else 'Tu solicitud fue revisada y no fue aprobada. Si necesitás una revisión humana, respondé ASESOR.'
  end;

  insert into private.whatsapp_outbox (conversation_id, recipient_wa_id, payload)
  values (
    v_conversation.id,
    v_conversation.wa_id,
    jsonb_build_object('to', v_conversation.wa_id, 'type', 'text', 'text', v_message)
  );

  insert into private.audit_log (actor_user_id, actor_kind, action, entity_type, entity_id, after_data)
  values (
    p_actor_user_id,
    'admin',
    'whatsapp_application_decided',
    'whatsapp_conversation',
    v_conversation.id,
    jsonb_build_object('decision', p_decision)
  );

  return jsonb_build_object('conversation_id', v_conversation.id, 'status', p_decision);
end;
$$;

create or replace function private.claim_whatsapp_outbox(p_limit integer default 5)
returns setof private.whatsapp_outbox
language sql
security definer
set search_path = private, pg_temp
as $$
  update private.whatsapp_outbox o
  set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
  from (
    select id
    from private.whatsapp_outbox
    where (
      status = 'pending'
      or (status = 'sending' and claimed_at < now() - interval '5 minutes')
    )
      and available_at <= now()
      and attempts < 5
    order by created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 10)
  ) queued
  where o.id = queued.id
  returning o.*;
$$;

revoke all on function private.review_whatsapp_application(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function private.claim_whatsapp_outbox(integer) from public, anon, authenticated;
grant execute on function private.review_whatsapp_application(uuid,uuid,text,text) to service_role;
grant execute on function private.claim_whatsapp_outbox(integer) to service_role;
