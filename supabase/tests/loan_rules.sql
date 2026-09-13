-- Ejecutar con `supabase test db` contra un proyecto local. Todo queda aislado por rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select is((private.calculate_flat_loan(10000, 10, 3, 0)->>'total_due')::numeric, 11000::numeric, 'flat interest total');
select is((private.calculate_flat_loan(10000, 10, 3, 0)->>'installment_amount')::numeric, 3666.67::numeric, 'rounded installment');
select is((private.calculate_flat_loan(1, 10, 3, 0)->>'interest_amount')::numeric, 0.10::numeric, 'small principal rounds deterministically');
select throws_ok($$select private.calculate_flat_loan(-1, 10, 3, 0)$$, 'P0001', 'invalid loan parameters', 'rejects negative principal');

select ok(private.is_valid_cbu('1111111911111111111117'), 'accepts a CBU with valid checksum');
select ok(not private.is_valid_cbu('1111111911111111111118'), 'rejects invalid CBU checksum');
select ok(not private.is_valid_cbu('0000000000000000000000'), 'rejects all-zero CBU');

select has_index('private', 'emergency_contacts', 'emergency_contacts_client_id_position_key', 'contact position is unique');
select has_index('private', 'client_documents', 'client_documents_required_type_once', 'mandatory document types cannot be duplicated');
select has_trigger('private', 'loan_applications', 'loan_applications_submission_guard', 'submission requirements are database-enforced');
select has_trigger('private', 'loans', 'loans_status_guard', 'loan status transitions are database-enforced');
select has_table('private', 'whatsapp_conversations', 'WhatsApp conversations are private');
select has_table('private', 'whatsapp_message_receipts', 'WhatsApp message receipts are private');
select has_index('private', 'whatsapp_conversations', 'whatsapp_conversations_wa_id_key', 'WhatsApp identity is unique');
select has_trigger('private', 'whatsapp_conversations', 'whatsapp_conversations_updated_at', 'conversation timestamps are maintained');
select has_table('private', 'whatsapp_outbox', 'WhatsApp delivery outbox is private');
select has_trigger('private', 'whatsapp_outbox', 'whatsapp_outbox_updated_at', 'outbox timestamps are maintained');
select has_index('private', 'loans', 'loans_one_open_per_client', 'only one open loan is allowed per client');
select has_function('private', 'review_whatsapp_application', array['uuid', 'uuid', 'text', 'text'], 'WhatsApp decisions require the reviewed function');

select * from finish();
rollback;
