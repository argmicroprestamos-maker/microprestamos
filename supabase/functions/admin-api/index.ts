import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:3000';
const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'content-type': 'application/json' } });
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
type ClientRow = { full_name?: string | null; dni?: string | null; phone?: string | null };
const maskedClient = (value: ClientRow | ClientRow[] | null) => {
  const client = Array.isArray(value) ? value[0] ?? null : value;
  return {
    full_name: text(client?.full_name, 120) || 'Cliente',
    dni_masked: client?.dni ? `***${client.dni.slice(-3)}` : null,
    phone_masked: client?.phone ? `***${client.phone.slice(-4)}` : null,
  };
};
const whatsappCase = (row: { id: string; wa_id: string; state: string; draft: Record<string, unknown>; review_decision?: string | null; created_at: string }) => {
  const draft = row.draft ?? {};
  const dni = text(draft.dni, 20), cbu = text(draft.cbu, 30);
  const documents = draft.documents && typeof draft.documents === 'object' ? Object.keys(draft.documents as Record<string, unknown>).length : 0;
  return {
    id: row.id,
    state: row.state,
    review_decision: row.review_decision ?? null,
    created_at: row.created_at,
    full_name: text(draft.full_name, 150) || 'Solicitante',
    dni_masked: dni ? `***${dni.slice(-3)}` : null,
    phone_masked: `***${row.wa_id.slice(-4)}`,
    birth_date: text(draft.birth_date, 20),
    address: text(draft.address, 250),
    email: text(draft.email, 150) || null,
    employment_status: text(draft.employment_status, 40),
    employment_detail: text(draft.employment_detail, 200) || null,
    monthly_income: Number(draft.monthly_income ?? 0),
    requested_amount: Number(draft.requested_amount ?? 0),
    contact_1: { name: text(draft.contact_1_name, 150), relationship: text(draft.contact_1_relationship, 80), phone: text(draft.contact_1_phone, 30) },
    contact_2: { name: text(draft.contact_2_name, 150), relationship: text(draft.contact_2_relationship, 80), phone: text(draft.contact_2_phone, 30) },
    cbu_masked: cbu ? `***${cbu.slice(-4)}` : null,
    holder_name: text(draft.holder_name, 150),
    documents_received: documents,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: identity, error: identityError } = await admin.auth.getUser(authorization.slice(7));
  if (identityError || !identity.user) return json({ error: 'unauthorized' }, 401);
  const { data: membership } = await admin.schema('private').from('admin_memberships').select('role').eq('user_id', identity.user.id).eq('active', true).maybeSingle();
  if (!membership) return json({ error: 'forbidden' }, 403);
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const path = segments.slice(segments.lastIndexOf('admin-api') + 1);

  if (req.method === 'GET' && path[0] === 'summary') {
    const statuses = ['submitted', 'under_review', 'approved', 'active', 'overdue', 'paid'];
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const table = ['active', 'overdue', 'paid'].includes(status) ? 'loans' : 'loan_applications';
      const { count } = await admin.schema('private').from(table).select('id', { count: 'exact', head: true }).eq('status', status);
      counts[status] = count ?? 0;
    }
    const { count: whatsappPending } = await admin.schema('private').from('whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('state', 'ready_for_review');
    counts.whatsapp_pending = whatsappPending ?? 0;
    return json({ role: membership.role, counts });
  }

  if (req.method === 'GET' && path[0] === 'whatsapp-applications' && path.length === 1) {
    const { data, error } = await admin.schema('private').from('whatsapp_conversations').select('id,wa_id,state,draft,review_decision,created_at').in('state', ['ready_for_review', 'approved', 'rejected']).order('created_at', { ascending: false }).limit(50);
    if (error) return json({ error: 'whatsapp_applications_unavailable' }, 500);
    return json({ applications: (data ?? []).map((row) => whatsappCase(row as { id: string; wa_id: string; state: string; draft: Record<string, unknown>; review_decision?: string | null; created_at: string })) });
  }

  if (req.method === 'POST' && path[0] === 'whatsapp-applications' && path[2] === 'decision') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const decision = text(body?.decision, 10), reason = text(body?.reason, 500);
    if (!['approved', 'rejected'].includes(decision) || reason.length < 3) return json({ error: 'invalid_decision' }, 422);
    const { data, error } = await admin.schema('private').rpc('review_whatsapp_application', { p_conversation_id: path[1], p_actor_user_id: identity.user.id, p_decision: decision, p_reason: reason });
    if (error) {
      if (error.message.includes('open_loan')) return json({ error: 'client_already_has_open_loan' }, 409);
      return json({ error: 'decision_not_allowed' }, error.message.includes('permission') ? 403 : 409);
    }
    return json({ result: data }, 201);
  }

  if (req.method === 'GET' && path[0] === 'applications' && path.length === 1) {
    const { data, error } = await admin.schema('private').from('loan_applications').select('id,client_id,requested_amount,total_due,status,created_at,clients(full_name,dni,phone)').order('created_at', { ascending: false }).limit(50);
    if (error) return json({ error: 'applications_unavailable' }, 500);
    return json({ applications: (data ?? []).map(({ clients, ...application }) => ({ ...application, client: maskedClient(clients) })) });
  }

  if (req.method === 'POST' && path[0] === 'applications' && path[2] === 'decision') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const decision = text(body?.decision, 10), reason = text(body?.reason, 500);
    if (!['approved', 'rejected'].includes(decision) || reason.length < 3) return json({ error: 'invalid_decision' }, 422);
    const { data, error } = await admin.schema('private').rpc('record_application_decision_from_api', { p_application_id: path[1], p_actor_user_id: identity.user.id, p_decision: decision, p_reason: reason });
    if (error) return json({ error: 'decision_not_allowed' }, error.message.includes('permission') ? 403 : 409);
    return json({ result: data }, 201);
  }

  if (req.method === 'GET' && path[0] === 'loans' && path.length === 1) {
    const { data, error } = await admin.schema('private').from('loans').select('id,client_id,principal,total_due,status,first_due_date,created_at,clients(full_name,dni)').order('created_at', { ascending: false }).limit(50);
    if (error) return json({ error: 'loans_unavailable' }, 500);
    return json({ loans: (data ?? []).map(({ clients, ...loan }) => ({ ...loan, client: maskedClient(clients) })) });
  }

  if (req.method === 'POST' && path[0] === 'loans' && path[2] === 'disburse') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const reference = text(body?.transfer_reference, 150);
    if (reference.length < 3) return json({ error: 'transfer_reference_required' }, 422);
    const { data, error } = await admin.schema('private').rpc('record_disbursement_from_api', { p_loan_id: path[1], p_actor_user_id: identity.user.id, p_transfer_reference: reference });
    if (error) return json({ error: 'disbursement_not_allowed' }, error.message.includes('permission') ? 403 : 409);
    return json({ result: data }, 201);
  }

  if (req.method === 'POST' && path[0] === 'loans' && path[2] === 'payments') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const amount = Number(body?.amount), method = text(body?.method, 20), reference = text(body?.reference, 150);
    if (!Number.isFinite(amount) || amount <= 0 || !['transfer', 'cash', 'other'].includes(method)) return json({ error: 'invalid_payment' }, 422);
    const { data, error } = await admin.schema('private').rpc('record_payment_from_api', { p_loan_id: path[1], p_actor_user_id: identity.user.id, p_amount: amount, p_method: method, p_reference: reference });
    if (error) return json({ error: 'payment_not_allowed' }, error.message.includes('permission') ? 403 : 409);
    return json({ result: data }, 201);
  }

  return json({ error: 'not_found' }, 404);
});
