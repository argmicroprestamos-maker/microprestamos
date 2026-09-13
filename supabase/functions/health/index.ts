import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
serve(() => new Response(JSON.stringify({ ok: true, service: 'microprestamos-api', version: 'mvp-1' }), { headers: { 'content-type': 'application/json' } }));
