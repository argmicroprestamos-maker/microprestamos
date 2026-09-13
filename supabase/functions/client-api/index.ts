import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:3000';
const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'content-type': 'application/json' } });
const text = (value: unknown, max = 250) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const documentTypes = new Set(['dni_front', 'dni_back', 'cbu_certificate']);
const mimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function detectedMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  return undefined;
}

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticatedAdmin(req: Request) {
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return { response: json({ error: 'unauthorized' }, 401) } as const;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) return { response: json({ error: 'unauthorized' }, 401) } as const;
  return { admin, user: data.user } as const;
}

async function clientId(admin: ReturnType<typeof createClient>, authUserId: string) {
  const { data, error } = await admin.schema('private').from('clients').select('id').eq('auth_user_id', authUserId).maybeSingle();
  if (error) throw new Error('client_lookup_failed');
  return data?.id as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const identity = await authenticatedAdmin(req);
  if ('response' in identity) return identity.response;
  const { admin, user } = identity;
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const path = `/${parts.slice(parts.lastIndexOf('client-api') + 1).join('/')}`;

  if (path === '/me' && req.method === 'GET') {
    const { data, error } = await admin.schema('private').from('clients').select('id,dni,full_name,birth_date,phone,email,address,status,identity_verified_at').eq('auth_user_id', user.id).maybeSingle();
    if (error) return json({ error: 'profile_lookup_failed' }, 500);
    return json({ client: data });
  }

  if (path === '/products' && req.method === 'GET') {
    const { data, error } = await admin.schema('private').from('loan_products').select('id,name,currency,min_amount,max_amount,interest_rate_percent,installment_count,frequency,fees,rules_version').eq('active', true).order('min_amount');
    if (error) return json({ error: 'products_unavailable' }, 500);
    return json({ products: data });
  }

  if (path === '/quote' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const principal = Number(body?.principal), rate = Number(body?.interest_rate_percent), count = Number(body?.installment_count), fees = Number(body?.fees ?? 0);
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(count) || count < 1 || count > 24 || !Number.isFinite(fees) || fees < 0) return json({ error: 'invalid_parameters' }, 422);
    const { data, error } = await admin.schema('private').rpc('calculate_flat_loan', { p_principal: principal, p_interest_rate_percent: rate, p_installment_count: count, p_fees: fees });
    if (error) return json({ error: 'calculation_failed' }, 500);
    return json({ quote: data, binding: false });
  }

  if (path === '/profile' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.contacts)) return json({ error: 'invalid_profile' }, 422);
    const { data, error } = await admin.schema('private').rpc('upsert_client_profile_from_api', {
      p_auth_user_id: user.id, p_full_name: text(body.full_name, 150), p_dni: text(body.dni, 11), p_birth_date: text(body.birth_date, 10), p_phone: text(body.phone, 16), p_email: text(body.email, 254), p_address: text(body.address, 300), p_contacts: body.contacts,
      p_cbu: text(body.cbu, 22), p_holder_name: text(body.holder_name, 150), p_terms_version: text(body.terms_version, 80), p_privacy_version: text(body.privacy_version, 80),
    });
    if (error || !data) return json({ error: 'invalid_profile' }, 422);
    return json({ client_id: data, saved: true }, 201);
  }

  if (path === '/documents' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const documentType = text(body?.document_type, 30), storagePath = text(body?.storage_path, 500), mimeType = text(body?.mime_type, 100);
    const fileSize = Number(body?.file_size_bytes), declaredSha256 = text(body?.sha256, 64).toLowerCase();
    if (!documentTypes.has(documentType) || !mimeTypes.has(mimeType) || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > 10_485_760 || !/^[a-f0-9]{64}$/.test(declaredSha256) || !storagePath.startsWith(`${user.id}/`)) return json({ error: 'invalid_document' }, 422);
    const id = await clientId(admin, user.id);
    if (!id) return json({ error: 'profile_required' }, 409);
    const { data: object, error: objectError } = await admin.schema('storage').from('objects').select('name').eq('bucket_id', 'client-documents').eq('name', storagePath).maybeSingle();
    if (objectError || !object) return json({ error: 'uploaded_file_not_found' }, 409);
    const { data: file, error: fileError } = await admin.storage.from('client-documents').download(storagePath);
    if (fileError || !file) return json({ error: 'uploaded_file_not_readable' }, 409);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const actualMime = detectedMime(bytes);
    if (bytes.byteLength !== fileSize || actualMime !== mimeType || await sha256(bytes) !== declaredSha256) return json({ error: 'document_integrity_check_failed' }, 422);
    const { data: existing, error: existingError } = await admin.schema('private').from('client_documents').select('id').eq('client_id', id).eq('document_type', documentType).maybeSingle();
    if (existingError) return json({ error: 'document_lookup_failed' }, 500);
    const document = { client_id: id, document_type: documentType, storage_path: storagePath, mime_type: mimeType, file_size_bytes: fileSize, sha256: declaredSha256, status: 'pending' };
    const result = existing ? await admin.schema('private').from('client_documents').update(document).eq('id', existing.id).select('id,status').single() : await admin.schema('private').from('client_documents').insert(document).select('id,status').single();
    if (result.error) return json({ error: 'document_save_failed' }, 500);
    return json({ document: result.data }, 201);
  }

  if (path === '/applications' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const productId = text(body?.product_id, 36), amount = Number(body?.requested_amount), submit = body?.submit === true;
    if (!productId || !Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid_application' }, 422);
    const id = await clientId(admin, user.id);
    if (!id) return json({ error: 'profile_required' }, 409);
    const { data: product, error: productError } = await admin.schema('private').from('loan_products').select('id,min_amount,max_amount,interest_rate_percent,installment_count,fees').eq('id', productId).eq('active', true).maybeSingle();
    if (productError || !product || amount < Number(product.min_amount) || amount > Number(product.max_amount)) return json({ error: 'invalid_product_or_amount' }, 422);
    const { data: quote, error: quoteError } = await admin.schema('private').rpc('calculate_flat_loan', { p_principal: amount, p_interest_rate_percent: product.interest_rate_percent, p_installment_count: product.installment_count, p_fees: product.fees });
    if (quoteError || !quote) return json({ error: 'calculation_failed' }, 500);
    const { data: application, error: createError } = await admin.schema('private').from('loan_applications').insert({ client_id: id, product_id: product.id, requested_amount: amount, interest_rate_percent: product.interest_rate_percent, installment_count: product.installment_count, fees: product.fees, interest_amount: quote.interest_amount, total_due: quote.total_due, installment_amount: quote.installment_amount, source: 'android', status: 'draft' }).select('id,status,requested_amount,interest_amount,total_due,installment_amount,installment_count').single();
    if (createError || !application) return json({ error: 'application_create_failed' }, 500);
    if (!submit) return json({ application, submitted: false }, 201);
    const { data: submitted, error: submitError } = await admin.schema('private').from('loan_applications').update({ status: 'submitted' }).eq('id', application.id).select('id,status,submitted_at').single();
    if (submitError) return json({ error: 'application_incomplete', application }, 409);
    return json({ application: submitted, submitted: true }, 201);
  }

  if (path === '/applications' && req.method === 'GET') {
    const id = await clientId(admin, user.id);
    if (!id) return json({ applications: [] });
    const { data, error } = await admin.schema('private').from('loan_applications').select('id,status,requested_amount,interest_amount,total_due,installment_amount,installment_count,submitted_at,created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(20);
    if (error) return json({ error: 'applications_unavailable' }, 500);
    return json({ applications: data });
  }

  if (path === '/loans' && req.method === 'GET') {
    const id = await clientId(admin, user.id);
    if (!id) return json({ loans: [] });
    const { data, error } = await admin.schema('private').from('loans')
      .select('id,principal,total_due,status,installment_count,first_due_date,disbursed_at,paid_at,installments(installment_number,due_date,total_amount,paid_amount,status)')
      .eq('client_id', id).order('created_at', { ascending: false }).limit(20);
    if (error) return json({ error: 'loans_unavailable' }, 500);
    return json({ loans: data });
  }

  return json({ error: 'not_found' }, 404);
});
