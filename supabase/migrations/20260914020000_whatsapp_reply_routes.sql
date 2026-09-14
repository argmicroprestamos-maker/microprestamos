alter table private.whatsapp_conversations
  add column reply_route text
  check (reply_route is null or reply_route ~ '^[1-9][0-9]{7,20}@(c\.us|lid)$');

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
  v_recipient text;
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
  v_recipient := coalesce(v_conversation.reply_route, v_conversation.wa_id);

  insert into private.whatsapp_outbox (conversation_id, recipient_wa_id, payload)
  values (
    v_conversation.id,
    v_conversation.wa_id,
    jsonb_build_object('to', v_recipient, 'type', 'text', 'text', v_message)
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
