import { conversationStep } from './index.ts';

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

Deno.test('offers app or assisted WhatsApp on the first message', () => {
  const start = conversationStep('awaiting_channel_choice', {}, { message_type: 'text', text: 'hola' });
  assert(start.state === 'awaiting_channel_choice', 'should wait for a channel choice');
  assert(start.messages[0].text.includes('APP'), 'should offer the app');
  assert(start.messages[0].text.includes('WHATSAPP'), 'should offer WhatsApp');
});

Deno.test('starts assisted flow only after consent', () => {
  const assisted = conversationStep('awaiting_channel_choice', {}, { message_type: 'text', text: '2' });
  assert(assisted.mode === 'assisted', 'should select assisted mode');
  assert(assisted.state === 'awaiting_consent', 'should request consent');
  const consented = conversationStep(assisted.state, assisted.draft, { message_type: 'text', text: 'sí' });
  assert(consented.state === 'awaiting_full_name', 'should request full name after consent');
  assert((consented.draft.consent as { accepted: boolean }).accepted, 'should record consent');
});

Deno.test('rejects invalid DNI without advancing', () => {
  const result = conversationStep('awaiting_dni', {}, { message_type: 'text', text: '123' });
  assert(result.state === 'awaiting_dni', 'should remain on DNI step');
  assert(result.draft.dni === undefined, 'should not store invalid DNI');
});

Deno.test('records media metadata and requests secure download', () => {
  const result = conversationStep('awaiting_dni_front', {}, { message_type: 'image', media_id: 'media-123', mime_type: 'image/jpeg' });
  assert(result.state === 'awaiting_dni_back', 'should advance to DNI back');
  assert(result.action?.type === 'download_and_store_media', 'should tell n8n to download media');
  assert(result.action?.document_type === 'dni_front', 'should classify the document');
});

Deno.test('allows human handoff at any point', () => {
  const result = conversationStep('awaiting_cbu', {}, { message_type: 'text', text: 'quiero un asesor' });
  assert(result.state === 'human_handoff', 'should hand off to a human');
  assert(result.action?.type === 'human_handoff', 'should emit handoff action');
});

