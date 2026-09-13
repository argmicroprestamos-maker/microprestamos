-- Keep foreign-key lookups and deletes efficient as the operational tables grow.
create index if not exists application_decisions_application_id_idx on private.application_decisions(application_id);
create index if not exists application_decisions_actor_user_id_idx on private.application_decisions(actor_user_id);
create index if not exists audit_log_actor_user_id_idx on private.audit_log(actor_user_id);
create index if not exists consent_events_client_id_idx on private.consent_events(client_id);
create index if not exists disbursements_bank_account_id_idx on private.disbursements(bank_account_id);
create index if not exists disbursements_created_by_idx on private.disbursements(created_by);
create index if not exists loan_applications_product_id_idx on private.loan_applications(product_id);
create index if not exists loans_product_id_idx on private.loans(product_id);
create index if not exists payment_allocations_installment_id_idx on private.payment_allocations(installment_id);
create index if not exists payments_loan_id_idx on private.payments(loan_id);
create index if not exists payments_created_by_idx on private.payments(created_by);
create index if not exists system_settings_updated_by_idx on private.system_settings(updated_by);

-- The table-level unique constraint already enforces this pair.
drop index if exists private.emergency_contacts_client_position_uidx;
