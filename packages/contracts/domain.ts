export type LoanApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'cancelled';
export type LoanStatus = 'approved' | 'awaiting_disbursement' | 'active' | 'paid' | 'overdue' | 'defaulted' | 'cancelled';
export type Quote = { principal: number; interest_amount: number; fees: number; total_due: number; installment_amount: number; installment_count: number; rules_version: 'flat-v1' };
export type QuoteRequest = { principal: number; interest_rate_percent: number; installment_count: number; fees?: number };
export type ClientProfile = { id: string; dni: string; full_name: string; birth_date: string; phone: string; email?: string; address?: string; status: 'pending' | 'active' | 'blocked' | 'deleted' };
export type AdminSummary = { role: 'superadmin' | 'analista' | 'cobranzas' | 'solo_lectura'; counts: Record<string, number> };
