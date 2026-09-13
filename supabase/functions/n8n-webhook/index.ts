import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:3000', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-integration-secret', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('N8N_SHARED_SECRET');
  if (!secret || req.headers.get('x-integration-secret') !== secret) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } });
  const body = await req.json().catch(() => null);
  if (!body?.event_type || !body?.payload) return new Response(JSON.stringify({ error: 'event_type and payload are required' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.schema('private').from('webhook_outbox').insert({ event_type: body.event_type, aggregate_type: body.aggregate_type ?? 'external', aggregate_id: body.aggregate_id ?? crypto.randomUUID(), payload: body.payload }).select('id').single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ accepted: true, id: data.id }), { headers: { ...cors, 'content-type': 'application/json' } });
});
