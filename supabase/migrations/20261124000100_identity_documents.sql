-- Sign-up with a passport or an asylum-seeker / refugee permit, not only an SA ID.
-- Many people doing local work in South Africa are foreign nationals. They can now join with the document they hold.
-- Nothing is verified with Home Affairs or any other authority: like the SA ID, the number is format-checked,
-- encrypted in the browser, and kept here only as a keyed hash so one document opens one account.
-- Passport and permit holders give their date of birth (an SA ID number contains it) for the 18+ check, and the
-- country that issued the passport, or their nationality for a permit. Immigration or work-permit status is not asked.

alter table public.profile_identity
  add column document_type text not null default 'sa_id' check (document_type in ('sa_id', 'passport', 'permit'));
grant select (document_type) on public.profile_identity to authenticated;

-- Returns the key that is hashed for one-account-per-document, or raises a friendly error.
create function private.check_identity_document(p_type text, p_number text, p_country text, p_dob date) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_type text := coalesce(p_type, 'sa_id');
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v text;
begin
  if v_type = 'sa_id' then
    -- Unchanged: the same key as before, so existing accounts keep their hash.
    return private.check_sa_id(p_number) ->> 'id';
  end if;
  if v_type not in ('passport', 'permit') then
    raise exception 'Choose SA ID, passport or asylum / refugee permit.' using errcode = '22023';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'Choose your country.' using errcode = '22023';
  end if;
  if v_country = 'ZA' then
    raise exception 'South Africans sign up with their SA ID number.' using errcode = '22023';
  end if;
  if p_dob is null or p_dob > v_today then
    raise exception 'Enter your date of birth.' using errcode = '22023';
  end if;
  if p_dob < (v_today - interval '110 years')::date then
    raise exception 'Check your date of birth.' using errcode = '22023';
  end if;
  if p_dob > (v_today - interval '18 years')::date then
    raise exception 'You must be 18 or older to join KashWise.' using errcode = '22023';
  end if;

  v := upper(regexp_replace(coalesce(p_number, ''), '\s', '', 'g'));
  if v_type = 'passport' then
    v := replace(v, '-', '');
    if v !~ '^[A-Z0-9]{6,9}$' then
      raise exception 'Enter your passport number: 6 to 9 letters and numbers.' using errcode = '22023';
    end if;
    return 'passport:' || v_country || ':' || v;
  end if;
  if v !~ '^[A-Z0-9/-]{6,25}$' or char_length(regexp_replace(v, '[^0-9]', '', 'g')) < 4 then
    raise exception 'Enter the number on your asylum-seeker or refugee permit.' using errcode = '22023';
  end if;
  return 'permit:' || v;
end $$;
revoke all on function private.check_identity_document(text, text, text, date) from public, anon, authenticated;

create function private.store_identity_document(
  p_user uuid, p_type text, p_number text, p_country text, p_dob date,
  p_gender text, p_identity_envelope jsonb, p_address_envelope jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_type text := coalesce(p_type, 'sa_id');
  v_key text := private.check_identity_document(v_type, p_number, p_country, p_dob);
  v_hmac bytea;
begin
  if p_gender is null or p_gender not in ('male', 'female') then
    raise exception 'Please choose male or female.' using errcode = '22023';
  end if;
  if not private.is_valid_envelope(p_identity_envelope) or not private.is_valid_envelope(p_address_envelope) then
    raise exception 'Your details could not be secured. Please try again.' using errcode = '22023';
  end if;
  v_hmac := private.sa_id_hmac(v_key);
  if exists (select 1 from public.profile_identity i where i.id_number_hmac = v_hmac and i.id <> p_user) then
    raise exception 'This document is already linked to a KashWise account. Sign in instead, or contact support.' using errcode = '23505';
  end if;
  insert into public.profile_identity (id, gender, identity_envelope, address_envelope, id_number_hmac, document_type)
  values (p_user, p_gender, p_identity_envelope, p_address_envelope, v_hmac, v_type)
  on conflict (id) do update set gender = excluded.gender, identity_envelope = excluded.identity_envelope,
    address_envelope = excluded.address_envelope, id_number_hmac = excluded.id_number_hmac, document_type = excluded.document_type;
end $$;
revoke all on function private.store_identity_document(uuid, text, text, text, date, text, jsonb, jsonb) from public, anon, authenticated;

-- create_account and save_identity gain three optional arguments. Callers that send only the old ones (the
-- previous app build) still match and are treated as SA ID sign-ups, exactly as before.
drop function public.create_account(uuid, text, text, text, text, text, text, text, jsonb, jsonb);
create function public.create_account(
  p_id uuid, p_email text, p_password text, p_display_name text, p_role text, p_area text,
  p_id_number text, p_gender text, p_identity_envelope jsonb, p_address_envelope jsonb,
  p_document_type text default 'sa_id', p_document_country text default null, p_date_of_birth date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;
  if p_password is null or char_length(p_password) < 8 or octet_length(p_password) > 72 then
    raise exception 'Your password must be at least 8 characters.' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 60 then
    raise exception 'Please enter your name (2–60 characters).' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('worker', 'customer') then
    raise exception 'Please choose whether you want to find work or get help.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.areas a where a.slug = p_area) then
    raise exception 'Please choose your area.' using errcode = '22023';
  end if;
  if (select count(*) from auth.users u where u.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Lots of people are signing up right now. Please try again in a minute.' using errcode = '54000';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'An account with this email already exists. Please sign in instead.' using errcode = '23505';
  end if;
  if v_id is null or exists (select 1 from auth.users u where u.id = v_id) then
    raise exception 'Something went wrong. Please try again.' using errcode = '22023';
  end if;
  perform private.check_identity_document(p_document_type, p_id_number, p_document_country, p_date_of_birth);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('display_name', v_name), now(), now(),
    '', '', '', '', '', '', '', '', false, false
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );
  insert into public.profiles (id, display_name, role, area_slug) values (v_id, v_name, p_role, p_area);
  perform private.store_identity_document(v_id, p_document_type, p_id_number, p_document_country, p_date_of_birth,
    p_gender, p_identity_envelope, p_address_envelope);
  return v_id;
end $$;
revoke all on function public.create_account(uuid, text, text, text, text, text, text, text, jsonb, jsonb, text, text, date) from public;
grant execute on function public.create_account(uuid, text, text, text, text, text, text, text, jsonb, jsonb, text, text, date) to anon, authenticated;

drop function public.save_identity(text, text, jsonb, jsonb);
create function public.save_identity(
  p_id_number text, p_gender text, p_identity_envelope jsonb, p_address_envelope jsonb,
  p_document_type text default 'sa_id', p_document_country text default null, p_date_of_birth date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if private.is_demo_user(v_uid) then raise exception 'Shared demo accounts can’t add identity details.' using errcode = '42501'; end if;
  perform private.store_identity_document(v_uid, p_document_type, p_id_number, p_document_country, p_date_of_birth,
    p_gender, p_identity_envelope, p_address_envelope);
end $$;
revoke all on function public.save_identity(text, text, jsonb, jsonb, text, text, date) from public, anon;
grant execute on function public.save_identity(text, text, jsonb, jsonb, text, text, date) to authenticated;
