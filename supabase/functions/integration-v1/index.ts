import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:3000';
const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'content-type,x-integration-secret,x-integration-timestamp,x-integration-nonce,x-integration-signature,idempotency-key', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });
const encoder = new TextEncoder();
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 30;

const hex = (bytes: Uint8Array) => Array.from(bytes).map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha256(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}
function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
function route(req: Request) {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  return parts.slice(parts.lastIndexOf('integration-v1') + 1);
}

type ConversationResult = { state: string; mode?: 'app' | 'assisted'; draft: Record<string, unknown>; messages: Array<{ type: 'text'; text: string }>; action?: Record<string, unknown> };
const textMessage = (text: string) => ({ type: 'text' as const, text });
const normalizedText = (value: unknown) => String(value ?? '').trim();
const isYes = (value: string) => /^(si|sí|s|acepto|confirmo|1)$/i.test(value);
const isNo = (value: string) => /^(no|n|cancelar|2)$/i.test(value);
const isPhone = (value: string) => /^\+[1-9][0-9]{7,14}$/.test(value);
const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
function isValidCbu(value: string) {
  if (!/^\d{22}$/.test(value) || /^0+$/.test(value)) return false;
  const check = (digits: string, weights: number[], expected: string) => (10 - digits.split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 10) % 10 === Number(expected);
  return check(value.slice(0, 7), [7, 1, 3, 9, 7, 1, 3], value[7]) && check(value.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3], value[21]);
}
export function conversationStep(state: string, currentDraft: Record<string, unknown>, input: Record<string, unknown>): ConversationResult {
  const draft = structuredClone(currentDraft);
  const text = normalizedText(input.text);
  const lower = text.toLocaleLowerCase('es');
  const kind = normalizedText(input.message_type) || 'unknown';
  const mediaId = normalizedText(input.media_id);
  const reply = (nextState: string, message: string, action?: Record<string, unknown>): ConversationResult => ({ state: nextState, draft, messages: [textMessage(message)], ...(action ? { action } : {}) });
  if (/\b(humano|persona|asesor|operador|ayuda)\b/i.test(text)) return reply('human_handoff', 'Perfecto. Derivé la conversación a un asesor. Te responderemos por este mismo chat.', { type: 'human_handoff' });
  if (state === 'awaiting_channel_choice') {
    if (/^(1|app|aplicacion|aplicación)$/i.test(text)) return { ...reply('app_link_sent', 'Podés descargar la app desde https://microprestamos.vercel.app/descargar. Si preferís continuar por WhatsApp, escribí ASISTENCIA.'), mode: 'app' };
    if (/^(2|whatsapp|asistencia|chat)$/i.test(text)) return { ...reply('awaiting_consent', 'Te ayudaré por WhatsApp. Para continuar, ¿aceptás que usemos tus datos y documentos sólo para evaluar esta solicitud? Respondé SÍ o NO.'), mode: 'assisted' };
    return reply('awaiting_channel_choice', 'Hola, soy el asistente de MicroPréstamos. ¿Podés instalar la app o necesitás ayuda por WhatsApp? Respondé 1 para APP o 2 para WHATSAPP.');
  }
  if (state === 'app_link_sent') {
    if (/^(2|whatsapp|asistencia|chat)$/i.test(text)) return { ...reply('awaiting_consent', 'Para asistirte por WhatsApp necesitamos usar tus datos y documentos para evaluar la solicitud. ¿Aceptás? Respondé SÍ o NO.'), mode: 'assisted' };
    return { ...reply('app_link_sent', 'Descargá la app en https://microprestamos.vercel.app/descargar. Para seguir por este chat, respondé ASISTENCIA.'), mode: 'app' };
  }
  if (state === 'awaiting_consent') {
    if (isYes(text)) { draft.consent = { accepted: true, version: 'whatsapp-demo-2026-09', accepted_at: new Date().toISOString() }; return reply('awaiting_full_name', 'Gracias. Escribí tu nombre y apellido completos.'); }
    if (isNo(text)) return reply('declined', 'Entendido. No guardaremos una solicitud. Si cambiás de idea, escribí HOLA para comenzar nuevamente.');
    return reply(state, 'Necesito una respuesta clara. Escribí SÍ para continuar o NO para finalizar.');
  }
  if (state === 'awaiting_full_name') { if (text.length < 3 || text.length > 150) return reply(state, 'Ingresá un nombre y apellido válidos.'); draft.full_name = text; return reply('awaiting_dni', 'Ahora escribí tu DNI, sólo números.'); }
  if (state === 'awaiting_dni') { const dni = text.replace(/\D/g, ''); if (!/^\d{7,11}$/.test(dni)) return reply(state, 'El DNI debe tener entre 7 y 11 números. Intentá nuevamente.'); draft.dni = dni; return reply('awaiting_birth_date', 'Indicá tu fecha de nacimiento con formato AAAA-MM-DD.'); }
  if (state === 'awaiting_birth_date') { if (!isValidDate(text)) return reply(state, 'Usá el formato AAAA-MM-DD, por ejemplo 1990-05-21.'); draft.birth_date = text; return reply('awaiting_address', 'Escribí tu domicilio completo.'); }
  if (state === 'awaiting_address') { if (text.length < 5 || text.length > 250) return reply(state, 'Ingresá un domicilio válido.'); draft.address = text; return reply('awaiting_email', 'Escribí tu correo electrónico o respondé OMITIR.'); }
  if (state === 'awaiting_email') { if (!/^omitir$/i.test(text) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return reply(state, 'Ese correo no parece válido. Escribilo nuevamente o respondé OMITIR.'); draft.email = /^omitir$/i.test(text) ? null : text.toLowerCase(); return reply('awaiting_employment_status', '¿Cuál es tu situación laboral? Respondé 1 EMPLEADO, 2 INDEPENDIENTE, 3 JUBILADO/PENSIONADO, 4 SIN EMPLEO o 5 OTRO.'); }
  if (state === 'awaiting_employment_status') {
    const statuses: Record<string, string> = { '1': 'employed', empleado: 'employed', empleada: 'employed', '2': 'independent', independiente: 'independent', autonomo: 'independent', autónomo: 'independent', monotributista: 'independent', '3': 'retired', jubilado: 'retired', jubilada: 'retired', pensionado: 'retired', pensionada: 'retired', '4': 'unemployed', desempleado: 'unemployed', desempleada: 'unemployed', 'sin empleo': 'unemployed', '5': 'other', otro: 'other', otra: 'other' };
    const employmentStatus = statuses[lower];
    if (!employmentStatus) return reply(state, 'Elegí una opción: 1 EMPLEADO, 2 INDEPENDIENTE, 3 JUBILADO/PENSIONADO, 4 SIN EMPLEO o 5 OTRO.');
    draft.employment_status = employmentStatus;
    if (employmentStatus === 'employed') return reply('awaiting_employment_detail', 'Escribí el nombre de tu empleador y tu puesto.');
    if (employmentStatus === 'independent') return reply('awaiting_employment_detail', 'Describí brevemente tu actividad independiente.');
    if (employmentStatus === 'other') return reply('awaiting_employment_detail', 'Describí brevemente tu situación laboral o fuente de ingresos.');
    draft.employment_detail = null;
    return reply('awaiting_monthly_income', '¿Cuál es tu ingreso mensual aproximado en pesos? Escribí sólo números; si no tenés ingresos, escribí 0.');
  }
  if (state === 'awaiting_employment_detail') { if (text.length < 3 || text.length > 200) return reply(state, 'Ingresá una descripción válida de entre 3 y 200 caracteres.'); draft.employment_detail = text; return reply('awaiting_monthly_income', '¿Cuál es tu ingreso mensual aproximado en pesos? Escribí sólo números.'); }
  if (state === 'awaiting_monthly_income') { const income = Number(text.replace(/[^0-9]/g, '')); if (!Number.isFinite(income) || income < 0 || income > 1_000_000_000) return reply(state, 'Ingresá un ingreso mensual válido, sólo números. Si no tenés ingresos, escribí 0.'); draft.monthly_income = income; return reply('awaiting_contact_1_name', 'Contacto de emergencia 1: nombre y apellido.'); }
  if (state === 'awaiting_contact_1_name') { if (text.length < 3) return reply(state, 'Ingresá el nombre completo del contacto.'); draft.contact_1_name = text; return reply('awaiting_contact_1_relationship', '¿Qué vínculo tiene con vos?'); }
  if (state === 'awaiting_contact_1_relationship') { if (text.length < 2) return reply(state, 'Indicá el vínculo, por ejemplo hermana o amigo.'); draft.contact_1_relationship = text; return reply('awaiting_contact_1_phone', 'Ingresá su teléfono con código de país, por ejemplo +54911…'); }
  if (state === 'awaiting_contact_1_phone') { if (!isPhone(text)) return reply(state, 'El teléfono debe incluir + y código de país.'); draft.contact_1_phone = text; return reply('awaiting_contact_2_name', 'Contacto de emergencia 2: nombre y apellido.'); }
  if (state === 'awaiting_contact_2_name') { if (text.length < 3) return reply(state, 'Ingresá el nombre completo del contacto.'); draft.contact_2_name = text; return reply('awaiting_contact_2_relationship', '¿Qué vínculo tiene con vos?'); }
  if (state === 'awaiting_contact_2_relationship') { if (text.length < 2) return reply(state, 'Indicá el vínculo.'); draft.contact_2_relationship = text; return reply('awaiting_contact_2_phone', 'Ingresá su teléfono con código de país.'); }
  if (state === 'awaiting_contact_2_phone') { if (!isPhone(text)) return reply(state, 'El teléfono debe incluir + y código de país.'); if (text === draft.contact_1_phone) return reply(state, 'Los dos contactos deben tener teléfonos diferentes. Ingresá otro número.'); draft.contact_2_phone = text; return reply('awaiting_cbu', 'Ingresá el CBU de 22 dígitos de una cuenta a tu nombre.'); }
  if (state === 'awaiting_cbu') { const cbu = text.replace(/\s/g, ''); if (!isValidCbu(cbu)) return reply(state, 'El CBU no es válido. Revisá los 22 dígitos.'); draft.cbu = cbu; return reply('awaiting_holder_name', 'Escribí el nombre completo del titular de la cuenta.'); }
  if (state === 'awaiting_holder_name') { if (text.length < 3) return reply(state, 'Ingresá el nombre completo del titular.'); draft.holder_name = text; return reply('awaiting_dni_front', 'Enviá una foto clara del frente de tu DNI.'); }
  const documentSteps: Record<string, { documentType: string; next: string; prompt: string }> = {
    awaiting_dni_front: { documentType: 'dni_front', next: 'awaiting_dni_back', prompt: 'Recibido. Ahora enviá una foto del dorso del DNI.' },
    awaiting_dni_back: { documentType: 'dni_back', next: 'awaiting_cbu_certificate', prompt: 'Recibido. Enviá una constancia de CBU en imagen o PDF.' },
    awaiting_cbu_certificate: { documentType: 'cbu_certificate', next: 'awaiting_amount', prompt: 'Documentación recibida. ¿Qué monto querés solicitar? Escribí sólo el importe en pesos.' },
  };
  if (documentSteps[state]) {
    if (!['image', 'document'].includes(kind) || !mediaId) return reply(state, 'Necesito que adjuntes una imagen o un documento válido.');
    const target = documentSteps[state]; const documents = (draft.documents as Record<string, unknown> | undefined) ?? {};
    documents[target.documentType] = { media_id: mediaId, mime_type: normalizedText(input.mime_type).slice(0, 100), received_at: new Date().toISOString() }; draft.documents = documents;
    return reply(target.next, target.prompt, { type: 'download_and_store_media', document_type: target.documentType, media_id: mediaId });
  }
  if (state === 'awaiting_amount') { const amount = Number(text.replace(/[^0-9]/g, '')); if (!Number.isFinite(amount) || amount <= 0) return reply(state, 'Ingresá un monto válido, sólo números.'); draft.requested_amount = amount; const dni = String(draft.dni ?? ''); const cbu = String(draft.cbu ?? ''); const income = Number(draft.monthly_income ?? 0); return reply('awaiting_confirmation', `Revisá: ${draft.full_name}, DNI ***${dni.slice(-3)}, CBU ***${cbu.slice(-4)}, ingreso mensual $${income.toLocaleString('es-AR')} y monto solicitado $${amount.toLocaleString('es-AR')}. Respondé CONFIRMAR o ASESOR.`); }
  if (state === 'awaiting_confirmation') { if (/^(confirmar|confirmo|si|sí)$/i.test(text)) return reply('ready_for_review', 'Solicitud preliminar completa. Un analista revisará los datos y documentos antes de cualquier aprobación.', { type: 'human_review_required' }); return reply(state, 'Respondé CONFIRMAR para enviar a revisión o ASESOR si necesitás corregir información.'); }
  if (state === 'ready_for_review') return reply(state, 'Tu solicitud está esperando revisión. Te avisaremos por este chat cuando haya novedades.');
  if (state === 'approved') return reply(state, 'Tu solicitud fue aprobada. Un asesor continuará la gestión y confirmará las condiciones antes del desembolso.');
  if (state === 'rejected') return reply(state, 'Tu solicitud fue revisada y no fue aprobada. Si necesitás ayuda, escribí ASESOR.');
  if (state === 'human_handoff') return reply(state, 'La conversación está asignada a un asesor.');
  if (state === 'declined' && /^hola$/i.test(lower)) return reply('awaiting_channel_choice', 'Empecemos nuevamente. Respondé 1 para usar la APP o 2 para continuar por WHATSAPP.');
  return reply(state, 'No pude interpretar ese mensaje. Escribí ASESOR para recibir ayuda humana.');
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const sharedSecret = Deno.env.get('N8N_SHARED_SECRET');
  const timestamp = req.headers.get('x-integration-timestamp') ?? '';
  const nonce = req.headers.get('x-integration-nonce') ?? '';
  const signature = (req.headers.get('x-integration-signature') ?? '').toLowerCase();
  const idempotencyKey = req.headers.get('idempotency-key') ?? '';
  const rawBody = req.method === 'GET' ? '' : await req.text();
  const requestTime = Number(timestamp) * 1000;
  if (!sharedSecret || req.headers.get('x-integration-secret') !== sharedSecret) return json({ error: 'unauthorized' }, 401);
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() - requestTime) > MAX_AGE_MS || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || nonce !== idempotencyKey || !/^[a-f0-9]{64}$/.test(signature)) return json({ error: 'invalid_request_signature' }, 401);
  if (!equal(signature, await hmac(sharedSecret, `${timestamp}.${nonce}.${rawBody}`))) return json({ error: 'invalid_request_signature' }, 401);
  if (encoder.encode(rawBody).byteLength > 65_536) return json({ error: 'payload_too_large' }, 413);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const integration = await admin.schema('private').from('integration_clients').select('id').eq('name', 'n8n').eq('active', true).maybeSingle();
  if (integration.error || !integration.data) return json({ error: 'integration_not_configured' }, 503);
  const integrationId = integration.data.id;
  const path = route(req), endpoint = `${req.method} /${path.join('/')}`;
  const payloadHash = await sha256(rawBody);
  const prior = await admin.schema('private').from('integration_requests').select('request_hash,response_status,response_body').eq('integration_client_id', integrationId).eq('idempotency_key', idempotencyKey).maybeSingle();
  if (prior.error) return json({ error: 'idempotency_lookup_failed' }, 500);
  if (prior.data) {
    if (prior.data.request_hash !== payloadHash) return json({ error: 'idempotency_key_reused' }, 409);
    return json(prior.data.response_body ?? { error: 'request_in_progress' }, prior.data.response_status ?? 202);
  }
  const since = new Date(Date.now() - 60_000).toISOString();
  const rate = await admin.schema('private').from('integration_requests').select('id', { count: 'exact', head: true }).eq('integration_client_id', integrationId).gte('created_at', since);
  if (rate.error) return json({ error: 'rate_limit_unavailable' }, 500);
  if ((rate.count ?? 0) >= MAX_REQUESTS_PER_MINUTE) return json({ error: 'rate_limited' }, 429);
  const reservation = await admin.schema('private').from('integration_requests').insert({ integration_client_id: integrationId, idempotency_key: idempotencyKey, request_hash: payloadHash, endpoint, response_status: 202, response_body: { status: 'processing' } });
  if (reservation.error) return json({ error: 'request_reservation_failed' }, 409);

  const complete = async (body: unknown, status: number) => {
    await admin.schema('private').from('integration_requests').update({ response_status: status, response_body: body }).eq('integration_client_id', integrationId).eq('idempotency_key', idempotencyKey);
    return json(body, status);
  };
  const body = rawBody ? await Promise.resolve().then(() => JSON.parse(rawBody) as Record<string, unknown>).catch(() => null) : {};
  if (!body || Array.isArray(body)) return complete({ error: 'invalid_json' }, 400);

  if (req.method === 'POST' && path.length === 2 && path[0] === 'conversations' && path[1] === 'inbound') {
    const originalWaId = normalizedText(body.wa_id);
    const waId = originalWaId.replace(/^\+/, '');
    const messageId = normalizedText(body.message_id);
    const messageType = normalizedText(body.message_type) || 'unknown';
    if (!/^\+?[1-9][0-9]{7,14}$/.test(originalWaId) || messageId.length < 1 || messageId.length > 200 || !['text', 'image', 'document', 'interactive', 'unknown'].includes(messageType) || normalizedText(body.text).length > 2_000 || normalizedText(body.media_id).length > 500 || normalizedText(body.mime_type).length > 100 || normalizedText(body.file_name).length > 255) return complete({ error: 'invalid_conversation_event' }, 422);
    const conversation = await admin.schema('private').from('whatsapp_conversations').select('id,mode,state,draft').eq('wa_id', waId).maybeSingle();
    if (conversation.error) return complete({ error: 'conversation_lookup_failed' }, 500);
    let conversationData = conversation.data;
    if (!conversationData) {
      const created = await admin.schema('private').from('whatsapp_conversations').insert({ wa_id: waId }).select('id,mode,state,draft').single();
      if (created.error || !created.data) return complete({ error: 'conversation_create_failed' }, 500);
      conversationData = created.data;
    }
    const receipt = await admin.schema('private').from('whatsapp_message_receipts').insert({ external_message_id: messageId, conversation_id: conversationData.id, message_type: messageType });
    if (receipt.error?.code === '23505') return complete({ duplicate: true, conversation: { id: conversationData.id, state: conversationData.state, mode: conversationData.mode }, messages: [] }, 200);
    if (receipt.error) return complete({ error: 'message_receipt_failed' }, 500);
    const result = conversationStep(conversationData.state, (conversationData.draft ?? {}) as Record<string, unknown>, body);
    const updated = await admin.schema('private').from('whatsapp_conversations').update({ state: result.state, mode: result.mode ?? conversationData.mode, draft: result.draft, last_inbound_at: new Date().toISOString(), last_outbound_at: new Date().toISOString() }).eq('id', conversationData.id).select('id,mode,state').single();
    if (updated.error) return complete({ error: 'conversation_update_failed' }, 500);
    if (result.action?.type === 'human_review_required' || result.action?.type === 'human_handoff') await admin.schema('private').from('audit_log').insert({ actor_kind: 'n8n', action: String(result.action.type), entity_type: 'whatsapp_conversation', entity_id: conversationData.id, request_id: idempotencyKey, after_data: { state: result.state } });
    return complete({ duplicate: false, conversation: updated.data, messages: result.messages, action: result.action ?? null }, 200);
  }

  if (req.method === 'POST' && path.length === 3 && path[0] === 'conversations' && path[1] === 'outbox' && path[2] === 'claim') {
    const limit = Number(body.limit ?? 5);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) return complete({ error: 'invalid_limit' }, 422);
    const claimed = await admin.schema('private').rpc('claim_whatsapp_outbox', { p_limit: limit });
    if (claimed.error) return complete({ error: 'outbox_unavailable' }, 500);
    return complete({ messages: (claimed.data ?? []).map((item: Record<string, unknown>) => ({ id: item.id, payload: item.payload, attempts: item.attempts })) }, 200);
  }

  if (req.method === 'POST' && path.length === 4 && path[0] === 'conversations' && path[1] === 'outbox' && path[3] === 'complete') {
    const outboxId = path[2];
    const sent = body.sent === true;
    const errorMessage = normalizedText(body.error).slice(0, 500);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outboxId)) return complete({ error: 'invalid_outbox_id' }, 422);
    const current = await admin.schema('private').from('whatsapp_outbox').select('id,status,attempts').eq('id', outboxId).maybeSingle();
    if (current.error) return complete({ error: 'outbox_lookup_failed' }, 500);
    if (!current.data) return complete({ error: 'not_found' }, 404);
    if (current.data.status === 'sent') return complete({ message: current.data }, 200);
    const nextStatus = sent ? 'sent' : current.data.attempts >= 5 ? 'failed' : 'pending';
    const update = await admin.schema('private').from('whatsapp_outbox').update({ status: nextStatus, sent_at: sent ? new Date().toISOString() : null, available_at: sent ? new Date().toISOString() : new Date(Date.now() + 60_000).toISOString(), last_error: sent ? null : (errorMessage || 'custom_api_delivery_failed') }).eq('id', outboxId).eq('status', 'sending').select('id,status,attempts').maybeSingle();
    if (update.error || !update.data) return complete({ error: 'outbox_completion_failed' }, 409);
    return complete({ message: update.data }, 200);
  }

  if (req.method === 'POST' && path.length === 1 && path[0] === 'quotes') {
    const principal = Number(body.principal), ratePercent = Number(body.interest_rate_percent), count = Number(body.installment_count), fees = Number(body.fees ?? 0);
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0 || !Number.isInteger(count) || count < 1 || count > 24 || !Number.isFinite(fees) || fees < 0) return complete({ error: 'invalid_parameters' }, 422);
    const calculation = await admin.schema('private').rpc('calculate_flat_loan', { p_principal: principal, p_interest_rate_percent: ratePercent, p_installment_count: count, p_fees: fees });
    if (calculation.error) return complete({ error: 'calculation_failed' }, 500);
    return complete({ quote: calculation.data, binding: false }, 200);
  }

  if (req.method === 'POST' && path.length === 1 && path[0] === 'applications') {
    const required = ['client_id', 'product_id', 'requested_amount', 'interest_rate_percent', 'installment_count'];
    if (required.some((field) => body[field] === undefined)) return complete({ error: 'missing_fields', fields: required }, 422);
    const calculation = await admin.schema('private').rpc('calculate_flat_loan', { p_principal: Number(body.requested_amount), p_interest_rate_percent: Number(body.interest_rate_percent), p_installment_count: Number(body.installment_count), p_fees: Number(body.fees ?? 0) });
    if (calculation.error) return complete({ error: 'calculation_failed' }, 422);
    const quote = calculation.data as Record<string, unknown>;
    const insert = await admin.schema('private').from('loan_applications').insert({ client_id: body.client_id, product_id: body.product_id, requested_amount: body.requested_amount, interest_rate_percent: body.interest_rate_percent, installment_count: body.installment_count, fees: body.fees ?? 0, interest_amount: quote.interest_amount, total_due: quote.total_due, installment_amount: quote.installment_amount, source: 'n8n', external_id: typeof body.external_id === 'string' ? body.external_id.slice(0, 120) : null, status: 'draft' }).select('id,status,external_id').single();
    if (insert.error) return complete({ error: 'application_create_failed' }, 422);
    return complete({ application: insert.data }, 201);
  }

  if (req.method === 'GET' && path[0] === 'applications' && path.length === 2) {
    const application = await admin.schema('private').from('loan_applications').select('id,external_id,status,requested_amount,total_due,installment_count,submitted_at,created_at').eq('source', 'n8n').eq('external_id', path[1]).maybeSingle();
    if (application.error) return complete({ error: 'application_lookup_failed' }, 500);
    return application.data ? complete({ application: application.data }, 200) : complete({ error: 'not_found' }, 404);
  }

  if (req.method === 'POST' && path[0] === 'applications' && path[2] === 'submit' && path.length === 3) {
    const submitted = await admin.schema('private').from('loan_applications').update({ status: 'submitted' }).eq('id', path[1]).eq('source', 'n8n').eq('status', 'draft').select('id,status,submitted_at').maybeSingle();
    if (submitted.error) return complete({ error: 'application_incomplete' }, 409);
    return submitted.data ? complete({ application: submitted.data }, 200) : complete({ error: 'not_found_or_not_draft' }, 409);
  }

  if (req.method === 'POST' && path[0] === 'decisions') return complete({ error: 'automated_decisions_disabled' }, 403);
  return complete({ error: 'not_found' }, 404);
});
