-- Atomic profile persistence used only by the authenticated client Edge Function.
-- The private schema prevents this RPC from being exposed directly to mobile clients.
create or replace function private.upsert_client_profile_from_api(
  p_auth_user_id uuid,
  p_full_name text,
  p_dni text,
  p_birth_date date,
  p_phone text,
  p_email text,
  p_address text,
  p_contacts jsonb,
  p_cbu text,
  p_holder_name text,
  p_terms_version text,
  p_privacy_version text
)
returns uuid
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_client_id uuid;
  v_contact jsonb;
  v_position integer := 0;
begin
  if p_full_name is null or length(btrim(p_full_name)) < 2 or length(p_full_name) > 150 then
    raise exception 'invalid_full_name' using errcode = '22023';
  end if;
  if p_dni !~ '^[0-9]{7,11}$' then
    raise exception 'invalid_dni' using errcode = '22023';
  end if;
  if p_birth_date is null or p_birth_date > current_date - interval '18 years' then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if p_cbu !~ '^[0-9]{22}$' then
    raise exception 'invalid_cbu' using errcode = '22023';
  end if;
  if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) <> 2 then
    raise exception 'exactly_two_contacts_required' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_terms_version)), 0) = 0 or coalesce(length(btrim(p_privacy_version)), 0) = 0 then
    raise exception 'consent_versions_required' using errcode = '22023';
  end if;

  select id into v_client_id from private.clients where auth_user_id = p_auth_user_id;
  if v_client_id is null then
    insert into private.clients (auth_user_id, dni, full_name, birth_date, phone, email, address, phone_verified_at)
    values (p_auth_user_id, p_dni, btrim(p_full_name), p_birth_date, p_phone, nullif(btrim(p_email), ''), nullif(btrim(p_address), ''), now())
    returning id into v_client_id;
  else
    if exists (select 1 from private.clients where id = v_client_id and dni <> p_dni) then
      raise exception 'dni_cannot_be_changed' using errcode = '22023';
    end if;
    update private.clients
      set full_name = btrim(p_full_name), birth_date = p_birth_date, phone = p_phone,
          email = nullif(btrim(p_email), ''), address = nullif(btrim(p_address), ''), phone_verified_at = now()
      where id = v_client_id;
  end if;

  insert into private.profiles (id, full_name, phone, email)
  values (p_auth_user_id, btrim(p_full_name), p_phone, nullif(btrim(p_email), ''))
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email;

  for v_contact in select value from jsonb_array_elements(p_contacts)
  loop
    v_position := v_position + 1;
    if coalesce(length(btrim(v_contact->>'full_name')), 0) < 2
       or coalesce(length(btrim(v_contact->>'relationship')), 0) < 2
       or coalesce(v_contact->>'phone', '') !~ '^\+[1-9][0-9]{7,14}$'
       or coalesce((v_contact->>'consent_declared')::boolean, false) is not true then
      raise exception 'invalid_emergency_contact' using errcode = '22023';
    end if;
    insert into private.emergency_contacts (client_id, position, full_name, relationship, phone, consent_declared)
    values (v_client_id, v_position, btrim(v_contact->>'full_name'), btrim(v_contact->>'relationship'), v_contact->>'phone', true)
    on conflict (client_id, position) do update
      set full_name = excluded.full_name, relationship = excluded.relationship,
          phone = excluded.phone, consent_declared = true;
  end loop;

  update private.bank_accounts
    set cbu = p_cbu, holder_name = btrim(p_holder_name)
    where client_id = v_client_id and is_primary;
  if not found then
    insert into private.bank_accounts (client_id, cbu, holder_name, is_primary)
    values (v_client_id, p_cbu, btrim(p_holder_name), true);
  end if;

  insert into private.consent_events (client_id, consent_type, version, channel, accepted)
  values
    (v_client_id, 'terms', p_terms_version, 'android', true),
    (v_client_id, 'privacy', p_privacy_version, 'android', true),
    (v_client_id, 'emergency_contact', p_terms_version, 'android', true);
  insert into private.audit_log (actor_user_id, actor_kind, action, entity_type, entity_id, after_data)
  values (p_auth_user_id, 'client', 'client_profile_upserted', 'client', v_client_id,
          jsonb_build_object('contacts', 2, 'bank_account_updated', true));
  return v_client_id;
end;
$$;

revoke all on function private.upsert_client_profile_from_api(uuid, text, text, date, text, text, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function private.upsert_client_profile_from_api(uuid, text, text, date, text, text, text, jsonb, text, text, text, text) to service_role;

-- An applicant must attach all three mandatory documents before submitting. Review happens after submission,
-- so requiring an analyst-approved document at this stage would create an impossible state.
create or replace function private.validate_application_submission()
returns trigger
language plpgsql
set search_path = private, pg_temp
as $$
declare
  v_contacts integer;
  v_primary_accounts integer;
  v_documents integer;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    select count(*) into v_contacts from private.emergency_contacts where client_id = new.client_id and consent_declared;
    select count(*) into v_primary_accounts from private.bank_accounts where client_id = new.client_id and is_primary;
    select count(*) into v_documents from private.client_documents
      where client_id = new.client_id and document_type in ('dni_front', 'dni_back', 'cbu_certificate') and status <> 'rejected';
    if v_contacts <> 2 then raise exception 'exactly two consented emergency contacts are required'; end if;
    if v_primary_accounts <> 1 then raise exception 'one primary bank account is required'; end if;
    if v_documents <> 3 then raise exception 'dni front, dni back and cbu certificate are required'; end if;
    new.submitted_at = coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;
