import { conversationStep } from './index.ts';

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const validFrontAnalysis = {
  status: 'ok', accepted: true, document_type: 'dni', side: 'front', legible: true, confidence: 0.98,
  fields: { full_name: 'Persona Prueba', dni: '12345678', birth_date: '1990-05-21' }, reasons: [],
};

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

Deno.test('does not accept documents that were not validated', () => {
  const result = conversationStep('awaiting_dni_front', {}, { message_type: 'image', media_id: 'media-123', mime_type: 'image/jpeg' });
  assert(result.state === 'awaiting_dni_front', 'should remain on DNI front');
  assert(result.messages[0].text.includes('validar'), 'should explain validation was unavailable');
});

Deno.test('records a document already persisted by the integration endpoint', () => {
  const result = conversationStep('awaiting_dni_front', {}, { message_type: 'image', media_id: 'whatsapp/case/dni.jpg', storage_path: 'whatsapp/case/dni.jpg', mime_type: 'image/jpeg', file_name: 'dni.jpg', document_analysis: validFrontAnalysis });
  assert(result.action?.type === 'media_stored', 'should not request another download');
  assert(result.state === 'awaiting_dni_back', 'should request DNI back after validation');
  assert(result.messages[0].text.includes('validada correctamente'), 'should confirm the completed validation');
  const stored = (result.draft.documents as Record<string, { storage_path: string }>).dni_front;
  assert(stored.storage_path === 'whatsapp/case/dni.jpg', 'should retain the private storage path');
});

Deno.test('rejects extracted DNI that contradicts customer input', () => {
  const result = conversationStep('awaiting_dni_front', { dni: '87654321' }, { message_type: 'image', media_id: 'whatsapp/case/dni.jpg', storage_path: 'whatsapp/case/dni.jpg', mime_type: 'image/jpeg', document_analysis: validFrontAnalysis });
  assert(result.state === 'awaiting_dni_front', 'should request another front image');
  assert(result.messages[0].text.includes('no coinciden'), 'should explain the mismatch');
});

Deno.test('repeats extracted document data and waits for customer confirmation', () => {
  const draft = { extracted_data: { full_name: 'Persona Prueba', dni: '12345678', birth_date: '1990-05-21' }, documents: {} };
  const cbuAnalysis = {
    status: 'ok', accepted: true, document_type: 'cbu_certificate', side: 'not_applicable', legible: true, confidence: 0.97,
    fields: { cbu: '1111111911111111111117', holder_name: 'Persona Prueba' }, reasons: [],
  };
  const result = conversationStep('awaiting_cbu_certificate', draft, { message_type: 'image', media_id: 'whatsapp/case/cbu.jpg', storage_path: 'whatsapp/case/cbu.jpg', mime_type: 'image/jpeg', document_analysis: cbuAnalysis });
  assert(result.state === 'awaiting_extracted_data_confirmation', 'should wait for confirmation');
  assert(result.messages[0].text.includes('12345678'), 'should repeat extracted DNI');
  assert(result.messages[0].text.includes('1111111911111111111117'), 'should repeat extracted CBU');
  const confirmed = conversationStep(result.state, result.draft, { message_type: 'text', text: 'sí' });
  assert(confirmed.state === 'awaiting_amount', 'should request amount after confirmation');
});

Deno.test('allows human handoff at any point', () => {
  const result = conversationStep('awaiting_cbu', {}, { message_type: 'text', text: 'quiero un asesor' });
  assert(result.state === 'human_handoff', 'should hand off to a human');
  assert(result.action?.type === 'human_handoff', 'should emit handoff action');
});

Deno.test('collects employment and income before emergency contacts', () => {
  const employment = conversationStep('awaiting_employment_status', {}, { message_type: 'text', text: '1' });
  assert(employment.state === 'awaiting_employment_detail', 'employees should identify their employer');
  const detail = conversationStep(employment.state, employment.draft, { message_type: 'text', text: 'Comercio Centro, vendedor' });
  assert(detail.state === 'awaiting_monthly_income', 'should request monthly income');
  const income = conversationStep(detail.state, detail.draft, { message_type: 'text', text: '$850.000' });
  assert(income.state === 'awaiting_contact_1_name', 'should continue with contacts');
  assert(income.draft.monthly_income === 850000, 'should store normalized monthly income');
});

Deno.test('allows zero income without deciding the case automatically', () => {
  const result = conversationStep('awaiting_monthly_income', { employment_status: 'unemployed' }, { message_type: 'text', text: '0' });
  assert(result.state === 'awaiting_contact_1_name', 'human review should decide cases with no income');
  assert(result.draft.monthly_income === 0, 'should store zero income');
});
