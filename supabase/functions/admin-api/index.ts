import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:3000';
const headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'content-type': 'application/json' } });
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const maskedClient = (client: { full_name?: string | null; dni?: string | null; phone?: string | null } | null) => ({
  full_name: text(client?.full_name, 120) || 'Cliente',
  dni_masked: client?.dni ? `***${client.dni.slice(-3)}` : null,
  phone_masked: client?.phone ? `***${client.phone.slice(-4)}` : null,
});

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
    return json({ role: membership.role, counts });
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
