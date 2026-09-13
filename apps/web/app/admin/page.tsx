'use client';

import { FormEvent, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase-browser';

type Summary = { role: string; counts: Record<string, number> };
type ClientSummary = { full_name?: string; dni_masked?: string | null; phone_masked?: string | null };
type Application = { id: string; requested_amount: number; total_due: number; status: string; created_at: string; client?: ClientSummary | null };
type Loan = { id: string; principal: number; total_due: number; status: string; first_due_date: string; client?: ClientSummary | null };
type Action = { kind: 'decision' | 'disburse' | 'payment'; id: string };

const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
const base = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

export default function Admin() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [token, setToken] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null); const [applications, setApplications] = useState<Application[]>([]); const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [loading, setLoading] = useState(false); const [action, setAction] = useState<Action | null>(null);
  const [decision, setDecision] = useState('approved'); const [reason, setReason] = useState(''); const [reference, setReference] = useState(''); const [paymentAmount, setPaymentAmount] = useState(''); const [paymentMethod, setPaymentMethod] = useState('transfer');

  async function get(path: string, accessToken: string) { const response = await fetch(`${base()}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'No se pudo cargar la información'); return body; }
  async function refresh(accessToken = token) { const [nextSummary, nextApplications, nextLoans] = await Promise.all([get('/summary', accessToken), get('/applications', accessToken), get('/loans', accessToken)]); setSummary(nextSummary); setApplications(nextApplications.applications ?? []); setLoans(nextLoans.loans ?? []); }
  async function login(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    if (!supabase) { setError('Faltan las variables de Supabase.'); setLoading(false); return; }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.session) { setError('No se pudo iniciar sesión.'); setLoading(false); return; }
    try { setToken(result.data.session.access_token); await refresh(result.data.session.access_token); } catch (failure) { setError(failure instanceof Error && failure.message === 'forbidden' ? 'Tu usuario no tiene un rol administrativo activo.' : 'No se pudo cargar el panel.'); }
    setLoading(false);
  }
  async function submitAction(event: FormEvent) {
    event.preventDefault(); if (!action) return; setError(''); setNotice(''); setLoading(true);
    let path = ''; let body: Record<string, unknown> = {};
    if (action.kind === 'decision') { path = `/applications/${action.id}/decision`; body = { decision, reason }; }
    if (action.kind === 'disburse') { path = `/loans/${action.id}/disburse`; body = { transfer_reference: reference }; }
    if (action.kind === 'payment') { path = `/loans/${action.id}/payments`; body = { amount: Number(paymentAmount), method: paymentMethod, reference }; }
    try {
      const response = await fetch(`${base()}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'La operación fue rechazada');
      setNotice('Operación registrada y auditada.'); setAction(null); setReason(''); setReference(''); setPaymentAmount(''); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo completar la operación'); } finally { setLoading(false); }
  }
  function logout() { supabase?.auth.signOut(); setSummary(null); setApplications([]); setLoans([]); setToken(''); setAction(null); }

  return <main className="shell"><nav className="nav"><div className="brand"><span className="mark">MP</span> Panel MicroPréstamos</div><a href="/">Volver al sitio</a></nav><section style={{ padding: '40px 0', maxWidth: 1100, margin: 'auto' }}><h1>Operaciones</h1><p style={{ color: '#64748b' }}>Las decisiones, desembolsos y pagos se registran con actor y auditoría. No se inicia una transferencia bancaria desde este panel.</p>
    {!summary ? <form className="card" onSubmit={login} style={{ display: 'grid', gap: 14, maxWidth: 420 }}><label>Correo<input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></label><label>Contraseña<input required type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label><button className="cta" disabled={loading} style={buttonStyle}>{loading ? 'Ingresando…' : 'Ingresar'}</button>{error && <p role="alert" style={errorStyle}>{error}</p>}</form> : <>
      <p>Rol activo: <strong>{summary.role}</strong></p>{notice && <p role="status" style={{ color: '#047857' }}>{notice}</p>}{error && <p role="alert" style={errorStyle}>{error}</p>}
      <div className="features">{Object.entries(summary.counts).map(([key, value]) => <div className="card" key={key}><small>{key.replace(/_/g, ' ')}</small><h2>{value}</h2></div>)}</div>
      {action && <form className="card" onSubmit={submitAction} style={{ display: 'grid', gap: 12, margin: '24px 0' }}><h2>{action.kind === 'decision' ? 'Decidir solicitud' : action.kind === 'disburse' ? 'Registrar desembolso manual' : 'Registrar pago'}</h2>
        {action.kind === 'decision' && <><label>Decisión<select value={decision} onChange={e => setDecision(e.target.value)} style={inputStyle}><option value="approved">Aprobar</option><option value="rejected">Rechazar</option></select></label><label>Motivo<input required minLength={3} value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} /></label></>}
        {action.kind === 'disburse' && <label>Referencia de transferencia ya realizada<input required minLength={3} value={reference} onChange={e => setReference(e.target.value)} style={inputStyle} /></label>}
        {action.kind === 'payment' && <><label>Importe (ARS)<input required min="0.01" step="0.01" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} style={inputStyle} /></label><label>Medio<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="other">Otro</option></select></label><label>Referencia / comprobante<input value={reference} onChange={e => setReference(e.target.value)} style={inputStyle} /></label></>}
        <div style={{ display: 'flex', gap: 12 }}><button className="cta" disabled={loading} style={buttonStyle}>{loading ? 'Guardando…' : 'Confirmar'}</button><button type="button" onClick={() => setAction(null)}>Cancelar</button></div></form>}
      <Table title="Solicitudes recientes" empty="No hay solicitudes todavía." headers={['Cliente', 'Monto', 'Total', 'Estado', 'Fecha', 'Acción']} rows={applications.map(a => [a.client?.full_name || a.id.slice(0, 8), money(a.requested_amount), money(a.total_due), a.status, new Date(a.created_at).toLocaleDateString('es-AR'), (a.status === 'submitted' || a.status === 'under_review') ? <button key={a.id} onClick={() => setAction({ kind: 'decision', id: a.id })}>Revisar</button> : '—'])} />
      <Table title="Préstamos" empty="No hay préstamos generados." headers={['Cliente', 'Capital', 'Total', 'Estado', 'Primer vencimiento', 'Acción']} rows={loans.map(loan => [loan.client?.full_name || loan.id.slice(0, 8), money(loan.principal), money(loan.total_due), loan.status, new Date(loan.first_due_date).toLocaleDateString('es-AR'), loan.status === 'awaiting_disbursement' ? <button key={loan.id} onClick={() => setAction({ kind: 'disburse', id: loan.id })}>Registrar transferencia</button> : (loan.status === 'active' || loan.status === 'overdue') ? <button key={loan.id} onClick={() => setAction({ kind: 'payment', id: loan.id })}>Registrar pago</button> : '—'])} />
      <button className="cta" onClick={logout} style={buttonStyle}>Cerrar sesión</button>
    </>}</section></main>;
}

function Table({ title, empty, headers, rows }: { title: string; empty: string; headers: string[]; rows: ReactNode[][] }) { return <div className="card" style={{ overflowX: 'auto', margin: '24px 0' }}><h2>{title}</h2><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{headers.map(header => <th align="left" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td style={{ padding: '12px 8px' }} key={cell}>{value}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p style={{ color: '#64748b' }}>{empty}</p>}</div>; }
const inputStyle = { display: 'block', width: '100%', padding: 12, marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 8 } as const;
const buttonStyle = { border: 0, cursor: 'pointer' } as const;
const errorStyle = { color: '#b91c1c' } as const;
