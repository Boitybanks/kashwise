-- 1) Start/finish QR handshake: the worker can only start or finish a job by scanning (or typing) a one-time code
--    that only the customer can see, which shows the worker was there with the customer.
-- 2) Sign-up identity: SA ID number (validated here too), gender, legal name and home address. The ID number, legal
--    name and address are encrypted in the browser; the database keeps only ciphertext plus a keyed hash of the ID
--    number so one ID can't open many accounts. This checks the number is well-formed; it is NOT a Home Affairs check.
--
-- Backward compatible: the old one-argument start_gig / mark_gig_done and five-argument create_account stay until the
-- new app is deployed; 20260926000900 drops them.

-- ── QR handshake ───────────────────────────────────────────────────────────
create table public.gig_handshakes (
  gig_id uuid not null references public.gigs (id) on delete cascade,
  step text not null check (step in ('start', 'finish')),
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  used_at timestamptz,
  primary key (gig_id, step)
);
alter table public.gig_handshakes enable row level security;
create policy "Only the customer sees the job QR codes" on public.gig_handshakes for select to authenticated
  using (private.is_gig_customer(gig_id));
grant select on public.gig_handshakes to authenticated;

-- 6 characters from a 32-letter alphabet without 0/O/1/I (30 random bits), e.g. K7Q4MX.
create function private.new_handshake_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(6);
  c text := '';
begin
  for i in 0..5 loop
    c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return c;
end $$;
revoke all on function private.new_handshake_code() from public, anon, authenticated;

create function private.issue_handshake_codes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'matched' and old.status = 'open' then
    insert into public.gig_handshakes (gig_id, step, code)
    values (new.id, 'start', private.new_handshake_code()), (new.id, 'finish', private.new_handshake_code())
    on conflict (gig_id, step) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.issue_handshake_codes() from public, anon, authenticated;
create trigger gigs_issue_handshake_codes after update of status on public.gigs
  for each row execute function private.issue_handshake_codes();

-- Backfill gigs already matched or under way.
insert into public.gig_handshakes (gig_id, step, code)
select g.id, s.step, private.new_handshake_code()
from public.gigs g cross join (values ('start'), ('finish')) as s (step)
where g.status = 'matched'
on conflict do nothing;
insert into public.gig_handshakes (gig_id, step, code, used_at)
select g.id, 'start', private.new_handshake_code(), coalesce(g.started_at, now()) from public.gigs g where g.status = 'in_progress'
on conflict do nothing;
insert into public.gig_handshakes (gig_id, step, code, used_at)
select g.id, 'finish', private.new_handshake_code(), g.worker_done_at from public.gigs g where g.status = 'in_progress'
on conflict do nothing;

create function private.claim_handshake(p_gig uuid, p_step text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  update public.gig_handshakes h set used_at = now()
  where h.gig_id = p_gig and h.step = p_step and h.used_at is null and h.code = v_code;
  if not found then
    raise exception 'That code doesn''t match. Ask the customer to show the % QR code for this job.',
      case p_step when 'start' then 'start-job' else 'finish-job' end using errcode = '22023';
  end if;
end $$;
revoke all on function private.claim_handshake(uuid, text, text) from public, anon, authenticated;

create function public.start_gig(p_gig uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.gigs g where g.id = p_gig and g.assigned_worker_id = v_uid and g.status = 'matched') then
    raise exception 'Only the chosen worker can start this gig once it is matched.' using errcode = '42501';
  end if;
  perform private.claim_handshake(p_gig, 'start', p_code);
  update public.gigs g set status = 'in_progress', started_at = now() where g.id = p_gig and g.status = 'matched';
  insert into public.gig_events (gig_id, actor_id, kind, detail) values (p_gig, v_uid, 'started', 'qr');
end $$;
revoke all on function public.start_gig(uuid, text) from public, anon;
grant execute on function public.start_gig(uuid, text) to authenticated;

create function public.mark_gig_done(p_gig uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.gigs g
    where g.id = p_gig and g.assigned_worker_id = v_uid and g.status = 'in_progress' and g.worker_done_at is null
  ) then
    raise exception 'Start the gig before marking it done.' using errcode = '22023';
  end if;
  perform private.claim_handshake(p_gig, 'finish', p_code);
  update public.gigs g set worker_done_at = now() where g.id = p_gig and g.worker_done_at is null;
  insert into public.gig_events (gig_id, actor_id, kind, detail) values (p_gig, v_uid, 'worker_done', 'qr');
end $$;
revoke all on function public.mark_gig_done(uuid, text) from public, anon;
grant execute on function public.mark_gig_done(uuid, text) to authenticated;

-- ── Sign-up identity ───────────────────────────────────────────────────────
create table public.profile_identity (
  id uuid primary key references public.profiles (id) on delete cascade,
  gender text not null check (gender in ('male', 'female')),
  identity_envelope jsonb not null check (private.is_valid_envelope(identity_envelope)),
  address_envelope jsonb not null check (private.is_valid_envelope(address_envelope)),
  id_number_hmac bytea not null unique,
  created_at timestamptz not null default now()
);
alter table public.profile_identity enable row level security;
create policy "People see only their own identity record" on public.profile_identity for select to authenticated
  using (id = (select auth.uid()));
grant select (id, gender, created_at) on public.profile_identity to authenticated;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sa_id_hmac_key', 'Keyed hash so one SA ID number opens one account');

-- Same rules as src/lib/sa-id.ts: 13 digits, real birth date (most recent century not in the future),
-- citizenship digit 0/1/2, Luhn checksum, plus 18 or older.
create function private.check_sa_id(p_id text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v text := regexp_replace(coalesce(p_id, ''), '[\s-]', '', 'g');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  s int := 0;
  d int;
  y int;
  v_dob date;
begin
  if v !~ '^[0-9]{13}$' then raise exception 'Enter your 13-digit SA ID number.' using errcode = '22023'; end if;
  y := (extract(year from v_today)::int / 100) * 100 + substr(v, 1, 2)::int;
  begin v_dob := make_date(y, substr(v, 3, 2)::int, substr(v, 5, 2)::int); exception when others then v_dob := null; end;
  if v_dob is null or v_dob > v_today then
    begin v_dob := make_date(y - 100, substr(v, 3, 2)::int, substr(v, 5, 2)::int); exception when others then v_dob := null; end;
  end if;
  if v_dob is null then raise exception 'The first 6 digits of the ID number must be a real date of birth.' using errcode = '22023'; end if;
  if substr(v, 11, 1) not in ('0', '1', '2') then
    raise exception 'The 11th digit of an SA ID number must be 0, 1 or 2.' using errcode = '22023';
  end if;
  for i in 0..12 loop
    d := substr(v, 13 - i, 1)::int;
    if i % 2 = 1 then
      d := d * 2;
      if d > 9 then d := d - 9; end if;
    end if;
    s := s + d;
  end loop;
  if s % 10 <> 0 then raise exception 'This ID number fails the checksum. Check for a mistyped digit.' using errcode = '22023'; end if;
  if v_dob > (v_today - interval '18 years')::date then raise exception 'You must be 18 or older to join SideGigs.' using errcode = '22023'; end if;
  return jsonb_build_object('id', v, 'dob', v_dob, 'sex', case when substr(v, 7, 4)::int < 5000 then 'female' else 'male' end);
end $$;
revoke all on function private.check_sa_id(text) from public, anon, authenticated;

create function private.sa_id_hmac(p_id text) returns bytea
language sql stable security definer set search_path = '' as $$
  select extensions.hmac(
    convert_to(p_id, 'UTF8'),
    convert_to((select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'sa_id_hmac_key'), 'UTF8'),
    'sha256'
  );
$$;
revoke all on function private.sa_id_hmac(text) from public, anon, authenticated;

create function private.store_identity(p_user uuid, p_id_number text, p_gender text, p_identity_envelope jsonb, p_address_envelope jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id text := private.check_sa_id(p_id_number) ->> 'id';
  v_hmac bytea;
begin
  if p_gender is null or p_gender not in ('male', 'female') then
    raise exception 'Please choose male or female.' using errcode = '22023';
  end if;
  if not private.is_valid_envelope(p_identity_envelope) or not private.is_valid_envelope(p_address_envelope) then
    raise exception 'Your details could not be secured. Please try again.' using errcode = '22023';
  end if;
  v_hmac := private.sa_id_hmac(v_id);
  if exists (select 1 from public.profile_identity i where i.id_number_hmac = v_hmac and i.id <> p_user) then
    raise exception 'This ID number is already linked to a SideGigs account. Sign in instead, or contact support.' using errcode = '23505';
  end if;
  insert into public.profile_identity (id, gender, identity_envelope, address_envelope, id_number_hmac)
  values (p_user, p_gender, p_identity_envelope, p_address_envelope, v_hmac)
  on conflict (id) do update set gender = excluded.gender, identity_envelope = excluded.identity_envelope,
    address_envelope = excluded.address_envelope, id_number_hmac = excluded.id_number_hmac;
end $$;
revoke all on function private.store_identity(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Sign-up with identity. p_id is chosen by the browser so the envelopes can be bound to the new account's id.
create function public.create_account(
  p_id uuid, p_email text, p_password text, p_display_name text, p_role text, p_area text,
  p_id_number text, p_gender text, p_identity_envelope jsonb, p_address_envelope jsonb
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
  perform private.check_sa_id(p_id_number);

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
  perform private.store_identity(v_id, p_id_number, p_gender, p_identity_envelope, p_address_envelope);
  return v_id;
end $$;
revoke all on function public.create_account(uuid, text, text, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.create_account(uuid, text, text, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;

-- Existing accounts can add (or correct) their identity details from their profile.
create function public.save_identity(p_id_number text, p_gender text, p_identity_envelope jsonb, p_address_envelope jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if private.is_demo_user(v_uid) then raise exception 'Shared demo accounts can’t add identity details.' using errcode = '42501'; end if;
  perform private.store_identity(v_uid, p_id_number, p_gender, p_identity_envelope, p_address_envelope);
end $$;
revoke all on function public.save_identity(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_identity(text, text, jsonb, jsonb) to authenticated;
