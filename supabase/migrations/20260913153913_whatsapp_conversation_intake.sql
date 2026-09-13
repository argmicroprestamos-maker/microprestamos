create table private.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique check (wa_id ~ '^[1-9][0-9]{7,14}$'),
  mode text check (mode in ('app', 'assisted')),
  state text not null default 'awaiting_channel_choice' check (state in (
    'awaiting_channel_choice', 'app_link_sent', 'awaiting_consent',
    'awaiting_full_name', 'awaiting_dni', 'awaiting_birth_date',
    'awaiting_address', 'awaiting_email',
    'awaiting_contact_1_name', 'awaiting_contact_1_relationship', 'awaiting_contact_1_phone',
    'awaiting_contact_2_name', 'awaiting_contact_2_relationship', 'awaiting_contact_2_phone',
    'awaiting_cbu', 'awaiting_holder_name',
    'awaiting_dni_front', 'awaiting_dni_back', 'awaiting_cbu_certificate',
    'awaiting_amount', 'awaiting_confirmation', 'ready_for_review',
    'declined', 'human_handoff'
  )),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object'),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.whatsapp_message_receipts (
  external_message_id text primary key check (length(external_message_id) between 1 and 200),
  conversation_id uuid not null references private.whatsapp_conversations(id) on delete restrict,
  message_type text not null check (message_type in ('text', 'image', 'document', 'interactive', 'unknown')),
  received_at timestamptz not null default now()
);

create index whatsapp_conversations_state_updated_idx
  on private.whatsapp_conversations(state, updated_at desc);
create index whatsapp_message_receipts_conversation_idx
  on private.whatsapp_message_receipts(conversation_id, received_at desc);

alter table private.whatsapp_conversations enable row level security;
alter table private.whatsapp_message_receipts enable row level security;
revoke all on private.whatsapp_conversations from public, anon, authenticated;
revoke all on private.whatsapp_message_receipts from public, anon, authenticated;

create trigger whatsapp_conversations_updated_at
  before update on private.whatsapp_conversations
  for each row execute function private.set_updated_at();
