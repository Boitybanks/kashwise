-- Hardening from the independent review (.pipeline/quality-review.md, Stage 8).

-- M2: a verified record needs BOTH parties: the worker marks the job done, then the customer confirms.
create or replace function public.confirm_completion(p_gig uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs;
  v_customer_name text;
  v_label text;
  v_code text;
  v_item uuid;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into v_gig from public.gigs g where g.id = p_gig for update;
  if not found or v_gig.customer_id <> v_uid then raise exception 'Only the person who posted this gig can confirm completion.' using errcode = '42501'; end if;
  if v_gig.status <> 'in_progress' or v_gig.worker_done_at is null then
    raise exception 'The worker needs to mark the job as done before you can confirm it.' using errcode = '22023';
  end if;

  update public.gigs g set status = 'completed', completed_at = now() where g.id = p_gig;
  update public.transactions t set status = 'released', settled_at = now() where t.gig_id = p_gig and t.status = 'held';

  select p.display_name into v_customer_name from public.profiles p where p.id = v_gig.customer_id;
  v_label := split_part(v_customer_name, ' ', 1)
    || case when position(' ' in v_customer_name) > 0
         then ' ' || upper(left(regexp_replace(v_customer_name, '^.*\s', ''), 1)) || '.'
         else '' end;
  v_code := 'SG-' || upper(left(encode(sha256(convert_to(v_gig.id::text || v_gig.assigned_worker_id::text || clock_timestamp()::text, 'UTF8')), 'hex'), 10));

  insert into public.portfolio_items (worker_id, gig_id, title, category, area_slug, completed_at, customer_label, record_code, is_demo)
  values (v_gig.assigned_worker_id, p_gig, v_gig.title, v_gig.category, v_gig.area_slug, now(), v_label, v_code, v_gig.is_demo)
  returning id into v_item;

  insert into public.gig_events (gig_id, actor_id, kind, detail) values
    (p_gig, v_uid, 'completed', null),
    (p_gig, v_uid, 'payment_released', null),
    (p_gig, v_uid, 'portfolio_record', v_code);
  return v_item;
end $$;

-- H1: demo accounts are shared by every judge, so the per-customer daily posting limit must not lock them out.
create or replace function public.create_gig(
  p_id uuid, p_title text, p_category text, p_description text, p_area text,
  p_date date, p_time_window text, p_payout_cents integer, p_envelope jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid;
  if not found then raise exception 'Please complete your profile first.' using errcode = '22023'; end if;
  if p_date is null or p_date < v_today then
    raise exception 'Please choose today or a future date.' using errcode = '22023';
  end if;
  if p_date > v_today + 180 then
    raise exception 'Please choose a date within the next 6 months.' using errcode = '22023';
  end if;
  if not v_demo and (select count(*) from public.gigs g where g.customer_id = v_uid and g.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have posted a lot of gigs today. Please try again tomorrow.' using errcode = '54000';
  end if;
  if v_demo and (select count(*) from public.gigs g where g.customer_id = v_uid and g.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'The demo account is busy. Please try again in a minute.' using errcode = '54000';
  end if;
  if p_envelope is not null and not private.is_valid_envelope(p_envelope) then
    raise exception 'Private details could not be encrypted. Please try again.' using errcode = '22023';
  end if;

  insert into public.gigs (id, customer_id, title, category, description, area_slug, scheduled_date, time_window, payout_cents, is_demo)
  values (v_id, v_uid, btrim(p_title), p_category, btrim(p_description), p_area, p_date, coalesce(p_time_window, 'flexible'), p_payout_cents, v_demo);
  if p_envelope is not null then
    insert into public.gig_private (gig_id, envelope) values (v_id, p_envelope);
  end if;
  insert into public.gig_events (gig_id, actor_id, kind) values (v_id, v_uid, 'posted');
  return v_id;
end $$;

-- H2: shared demo logins must stay usable — no password/email changes, demo profiles are read-only.
create function private.is_demo_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = p_user), false);
$$;
revoke all on function private.is_demo_user(uuid) from public, anon, authenticated;
grant execute on function private.is_demo_user(uuid) to authenticated;

create function private.protect_demo_credentials() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_demo_user(old.id)
     and (new.encrypted_password is distinct from old.encrypted_password
          or new.email is distinct from old.email
          or new.phone is distinct from old.phone) then
    raise exception 'Demo account credentials cannot be changed.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_demo_credentials before update on auth.users
  for each row execute function private.protect_demo_credentials();

drop policy "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and not is_demo) with check (id = (select auth.uid()) and not is_demo);

drop policy "Owner writes phone envelope" on public.profile_private;
create policy "Owner writes phone envelope" on public.profile_private for insert to authenticated
  with check (id = (select auth.uid()) and not private.is_demo_user(id));
drop policy "Owner updates phone envelope" on public.profile_private;
create policy "Owner updates phone envelope" on public.profile_private for update to authenticated
  using (id = (select auth.uid()) and not private.is_demo_user(id))
  with check (id = (select auth.uid()) and not private.is_demo_user(id));

-- L1: owners must be able to SELECT their evidence objects so storage.remove() actually deletes them.
create policy "Workers read their own evidence objects" on storage.objects for select to authenticated
  using (bucket_id = 'work-evidence' and owner_id = (select auth.uid())::text);

-- L5: keep seeded demo gigs discoverable — roll past-dated demo open gigs forward daily.
create extension if not exists pg_cron;
select cron.schedule(
  'sidegigs-refresh-demo-gigs',
  '15 0 * * *',
  $$update public.gigs
      set scheduled_date = (now() at time zone 'Africa/Johannesburg')::date + 2 + (abs(hashtext(id::text)) % 6)
    where is_demo and status in ('open', 'matched')
      and scheduled_date < (now() at time zone 'Africa/Johannesburg')::date + 1$$
);
