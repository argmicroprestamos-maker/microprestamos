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

Deno.serve(async (req) => {
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

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const integration = await admin.schema('private').from('integration_clients').select('id').eq('name', 'n8n').eq('active', true).maybeSingle();
  if (integration.error || !integration.data) return json({ error: 'integration_not_configured' }, 503);
  const path = route(req), endpoint = `${req.method} /${path.join('/')}`;
  const payloadHash = await sha256(rawBody);
  const prior = await admin.schema('private').from('integration_requests').select('request_hash,response_status,response_body').eq('integration_client_id', integration.data.id).eq('idempotency_key', idempotencyKey).maybeSingle();
  if (prior.error) return json({ error: 'idempotency_lookup_failed' }, 500);
  if (prior.data) {
    if (prior.data.request_hash !== payloadHash) return json({ error: 'idempotency_key_reused' }, 409);
    return json(prior.data.response_body ?? { error: 'request_in_progress' }, prior.data.response_status ?? 202);
  }
  const since = new Date(Date.now() - 60_000).toISOString();
  const rate = await admin.schema('private').from('integration_requests').select('id', { count: 'exact', head: true }).eq('integration_client_id', integration.data.id).gte('created_at', since);
  if (rate.error) return json({ error: 'rate_limit_unavailable' }, 500);
  if ((rate.count ?? 0) >= MAX_REQUESTS_PER_MINUTE) return json({ error: 'rate_limited' }, 429);
  const reservation = await admin.schema('private').from('integration_requests').insert({ integration_client_id: integration.data.id, idempotency_key: idempotencyKey, request_hash: payloadHash, endpoint, response_status: 202, response_body: { status: 'processing' } });
  if (reservation.error) return json({ error: 'request_reservation_failed' }, 409);

  const complete = async (body: unknown, status: number) => {
    await admin.schema('private').from('integration_requests').update({ response_status: status, response_body: body }).eq('integration_client_id', integration.data.id).eq('idempotency_key', idempotencyKey);
    return json(body, status);
  };
  const body = rawBody ? await Promise.resolve().then(() => JSON.parse(rawBody) as Record<string, unknown>).catch(() => null) : {};
  if (!body || Array.isArray(body)) return complete({ error: 'invalid_json' }, 400);

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
