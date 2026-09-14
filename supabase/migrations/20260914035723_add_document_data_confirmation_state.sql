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
    'awaiting_extracted_data_confirmation',
    'awaiting_amount', 'awaiting_confirmation', 'ready_for_review',
    'approved', 'rejected', 'declined', 'human_handoff'
  ));
