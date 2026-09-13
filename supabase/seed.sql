-- Solo datos ficticios; no contiene usuarios ni documentos reales.
insert into private.loan_products (name, currency, min_amount, max_amount, interest_rate_percent, installment_count, frequency, fees, active, rules_version)
values ('Demo semanal', 'ARS', 1000, 25000, 8, 4, 'monthly', 0, false, 'flat-v1')
on conflict (name) do nothing;
