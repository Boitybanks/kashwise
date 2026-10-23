-- SideGigs RPCs: every trust-bearing state change happens here, never via direct table writes.
-- All definer functions pin search_path = '' and fully qualify names.

-- ── Accounts ────────────────────────────────────────────────────────────────
-- Creates a confirmed Supabase Auth user (bcrypt, same as GoTrue) plus profile; client then signs in.
-- Rationale: hosted email confirmation would block judges (assumptions A5).
create function public.create_account(
  p_email text, p_password text, p_display_name text, p_role text, p_area text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
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
  return v_id;
end $$;

-- ── Gigs ────────────────────────────────────────────────────────────────────
create function public.create_gig(
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
  if (select count(*) from public.gigs g where g.customer_id = v_uid and g.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have posted a lot of gigs today. Please try again tomorrow.' using errcode = '54000';
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

create function public.apply_to_gig(p_gig uuid, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs;
  v_app_id uuid;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Please complete your profile first.' using errcode = '22023';
  end if;
  select * into v_gig from public.gigs g where g.id = p_gig for update;
  if not found then raise exception 'This gig no longer exists.' using errcode = 'P0002'; end if;
  if v_gig.customer_id = v_uid then raise exception 'You cannot apply to your own gig.' using errcode = '42501'; end if;
  if v_gig.status <> 'open' then raise exception 'This gig is no longer taking applications.' using errcode = '22023'; end if;
  if char_length(coalesce(v_msg, '')) > 300 then raise exception 'Please keep your message under 300 characters.' using errcode = '22023'; end if;

  insert into public.gig_applications (gig_id, worker_id, message)
  values (p_gig, v_uid, v_msg)
  on conflict (gig_id, worker_id) do update
    set status = 'pending', message = excluded.message, updated_at = now()
    where public.gig_applications.status = 'withdrawn'
  returning id into v_app_id;
  if v_app_id is null then raise exception 'You have already applied for this gig.' using errcode = '23505'; end if;

  insert into public.gig_events (gig_id, actor_id, kind) values (p_gig, v_uid, 'applied');
  return v_app_id;
end $$;

create function public.withdraw_application(p_gig uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  update public.gig_applications a set status = 'withdrawn', updated_at = now()
  where a.gig_id = p_gig and a.worker_id = v_uid and a.status = 'pending';
  if not found then raise exception 'There is no pending application to withdraw.' using errcode = '22023'; end if;
  insert into public.gig_events (gig_id, actor_id, kind) values (p_gig, v_uid, 'withdrawn');
end $$;

create function public.select_worker(p_gig uuid, p_application uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs;
  v_app public.gig_applications;
  v_name text;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into v_gig from public.gigs g where g.id = p_gig for update;
  if not found or v_gig.customer_id <> v_uid then raise exception 'Only the person who posted this gig can choose a worker.' using errcode = '42501'; end if;
  if v_gig.status <> 'open' then raise exception 'A worker has already been chosen for this gig.' using errcode = '22023'; end if;
  select * into v_app from public.gig_applications a where a.id = p_application and a.gig_id = p_gig for update;
  if not found or v_app.status <> 'pending' then raise exception 'This application is no longer available.' using errcode = '22023'; end if;

  update public.gigs g set status = 'matched', assigned_worker_id = v_app.worker_id, matched_at = now() where g.id = p_gig;
  update public.gig_applications a set status = 'accepted', updated_at = now() where a.id = v_app.id;
  update public.gig_applications a set status = 'declined', updated_at = now()
    where a.gig_id = p_gig and a.id <> v_app.id and a.status = 'pending';
  insert into public.transactions (gig_id, customer_id, worker_id, payout_cents, fee_cents, total_cents)
  values (p_gig, v_uid, v_app.worker_id, v_gig.payout_cents, v_gig.fee_cents, v_gig.total_cents);

  select p.display_name into v_name from public.profiles p where p.id = v_app.worker_id;
  insert into public.gig_events (gig_id, actor_id, kind, detail) values
    (p_gig, v_uid, 'matched', v_name),
    (p_gig, v_uid, 'payment_held', null);
end $$;

create function public.start_gig(p_gig uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  update public.gigs g set status = 'in_progress', started_at = now()
  where g.id = p_gig and g.assigned_worker_id = v_uid and g.status = 'matched';
  if not found then raise exception 'Only the chosen worker can start this gig once it is matched.' using errcode = '42501'; end if;
  insert into public.gig_events (gig_id, actor_id, kind) values (p_gig, v_uid, 'started');
end $$;

create function public.mark_gig_done(p_gig uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  update public.gigs g set worker_done_at = now()
  where g.id = p_gig and g.assigned_worker_id = v_uid and g.status = 'in_progress' and g.worker_done_at is null;
  if not found then raise exception 'Start the gig before marking it done.' using errcode = '22023'; end if;
  insert into public.gig_events (gig_id, actor_id, kind) values (p_gig, v_uid, 'worker_done');
end $$;

-- Customer-confirmed completion is the ONLY way a verified portfolio record is created.
create function public.confirm_completion(p_gig uuid) returns uuid
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
  if v_gig.status not in ('matched', 'in_progress') then raise exception 'This gig cannot be completed from its current state.' using errcode = '22023'; end if;

  update public.gigs g
    set status = 'completed', completed_at = now(), started_at = coalesce(g.started_at, now())
  where g.id = p_gig;
  update public.transactions t set status = 'released', settled_at = now() where t.gig_id = p_gig and t.status = 'held';

  select p.display_name into v_customer_name from public.profiles p where p.id = v_gig.customer_id;
  -- Public label: first word + initial of last word ("Thandi M."), never the full name.
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

create function public.submit_review(p_gig uuid, p_rating integer, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into v_gig from public.gigs g where g.id = p_gig;
  if not found or v_gig.customer_id <> v_uid then raise exception 'Only the person who posted this gig can review it.' using errcode = '42501'; end if;
  if v_gig.status <> 'completed' then raise exception 'You can review once the gig is completed.' using errcode = '22023'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Please choose a rating from 1 to 5 stars.' using errcode = '22023'; end if;
  if char_length(coalesce(v_comment, '')) > 500 then raise exception 'Please keep your review under 500 characters.' using errcode = '22023'; end if;
  if exists (select 1 from public.reviews r where r.gig_id = p_gig) then
    raise exception 'You have already reviewed this gig.' using errcode = '23505';
  end if;

  insert into public.reviews (gig_id, reviewer_id, worker_id, rating, comment)
  values (p_gig, v_uid, v_gig.assigned_worker_id, p_rating, v_comment);
  update public.portfolio_items pi set rating = p_rating, review = v_comment where pi.gig_id = p_gig;
  insert into public.gig_events (gig_id, actor_id, kind, detail) values (p_gig, v_uid, 'reviewed', p_rating::text);
end $$;

create function public.cancel_gig(p_gig uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into v_gig from public.gigs g where g.id = p_gig for update;
  if not found or v_gig.customer_id <> v_uid then raise exception 'Only the person who posted this gig can cancel it.' using errcode = '42501'; end if;
  if v_gig.status not in ('open', 'matched') then raise exception 'Gigs can only be cancelled before work starts.' using errcode = '22023'; end if;

  update public.gigs g set status = 'cancelled', cancelled_at = now() where g.id = p_gig;
  update public.gig_applications a set status = 'declined', updated_at = now() where a.gig_id = p_gig and a.status = 'pending';
  update public.transactions t set status = 'refunded', settled_at = now() where t.gig_id = p_gig and t.status = 'held';
  insert into public.gig_events (gig_id, actor_id, kind) values (p_gig, v_uid, 'cancelled');
  if v_gig.status = 'matched' then
    insert into public.gig_events (gig_id, actor_id, kind) values (p_gig, v_uid, 'payment_refunded');
  end if;
end $$;

-- ── Portfolio evidence ──────────────────────────────────────────────────────
create function public.add_portfolio_evidence(p_item uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_item public.portfolio_items;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into v_item from public.portfolio_items pi where pi.id = p_item for update;
  if not found or v_item.worker_id <> v_uid then raise exception 'You can only add photos to your own work records.' using errcode = '42501'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text then raise exception 'Invalid photo location.' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'work-evidence' and o.name = p_path) then
    raise exception 'Photo upload not found. Please try again.' using errcode = 'P0002';
  end if;
  if p_path = any (v_item.evidence_paths) then return; end if;
  if cardinality(v_item.evidence_paths) >= 6 then raise exception 'You can add up to 6 photos per record.' using errcode = '22023'; end if;
  update public.portfolio_items pi set evidence_paths = array_append(pi.evidence_paths, p_path) where pi.id = p_item;
end $$;

create function public.remove_portfolio_evidence(p_item uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  update public.portfolio_items pi set evidence_paths = array_remove(pi.evidence_paths, p_path)
  where pi.id = p_item and pi.worker_id = v_uid;
  if not found then raise exception 'You can only change your own work records.' using errcode = '42501'; end if;
end $$;

-- ── Safety ──────────────────────────────────────────────────────────────────
create function public.report_content(p_gig uuid, p_user uuid, p_reason text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Please sign in to report.' using errcode = '42501'; end if;
  if p_gig is null and p_user is null then raise exception 'Nothing to report.' using errcode = '22023'; end if;
  if p_user = v_uid then raise exception 'You cannot report yourself.' using errcode = '22023'; end if;
  if (select count(*) from public.reports r where r.reporter_id = v_uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have sent many reports today. Our team will review them.' using errcode = '54000';
  end if;
  insert into public.reports (reporter_id, gig_id, reported_user_id, reason, details)
  values (v_uid, p_gig, p_user, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Called by the reveal-contact function with the caller's JWT: audit every decryption.
create function public.log_contact_reveal(p_gig uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null or not private.can_view_gig_private(p_gig) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.gig_events e
    where e.gig_id = p_gig and e.actor_id = v_uid and e.kind = 'contact_revealed' and e.created_at > now() - interval '10 minutes'
  ) then return; end if;
  select p.display_name into v_name from public.profiles p where p.id = v_uid;
  insert into public.gig_events (gig_id, actor_id, kind, detail) values (p_gig, v_uid, 'contact_revealed', v_name);
end $$;

-- ── Discovery & metrics ─────────────────────────────────────────────────────
-- Invoker rights: RLS still applies (only open gigs are returned anyway).
create function public.discover_gigs(
  p_area text default null, p_category text default null, p_skills text[] default null,
  p_limit integer default 20, p_offset integer default 0
) returns table (
  id uuid, title text, category text, description text, area_slug text, area_name text, city text,
  scheduled_date date, time_window text, payout_cents integer, created_at timestamptz, is_demo boolean,
  customer_id uuid, customer_name text, customer_is_demo boolean, applicant_count integer, distance_km numeric
)
language sql stable security invoker set search_path = '' as $$
  select g.id, g.title, g.category, g.description, g.area_slug, a.name, a.city,
         g.scheduled_date, g.time_window, g.payout_cents, g.created_at, g.is_demo,
         g.customer_id, p.display_name, p.is_demo, private.applicant_count(g.id),
         round(private.distance_km(o.lat, o.lng, a.lat, a.lng)::numeric, 1)
  from public.gigs g
  join public.areas a on a.slug = g.area_slug
  join public.profiles p on p.id = g.customer_id
  left join public.areas o on o.slug = p_area
  where g.status = 'open'
    and g.scheduled_date >= (now() at time zone 'Africa/Johannesburg')::date
    and (p_category is null or g.category = p_category)
    and (p_skills is null or cardinality(p_skills) = 0 or g.category = any (p_skills))
  order by 17 asc nulls last, g.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.worker_stats(p_worker uuid) returns json
language sql stable security definer set search_path = '' as $$
  with g as (
    select * from public.gigs where assigned_worker_id = p_worker and matched_at is not null
  )
  select json_build_object(
    'completed', (select count(*) from g where status = 'completed'),
    'active', (select count(*) from g where status in ('matched', 'in_progress')),
    'cancelled_after_match', (select count(*) from g where status = 'cancelled'),
    'review_count', (select count(*) from public.reviews r where r.worker_id = p_worker),
    'avg_rating', (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.worker_id = p_worker),
    'repeat_customers', (
      select count(*) from (
        select customer_id from g where status = 'completed' group by customer_id having count(*) > 1
      ) x
    ),
    'categories', (
      select coalesce(json_agg(json_build_object('category', category, 'count', n) order by n desc, category), '[]'::json)
      from (select pi.category, count(*) as n from public.portfolio_items pi where pi.worker_id = p_worker group by pi.category) y
    ),
    'earned_cents', case when p_worker = (select auth.uid())
      then (select coalesce(sum(payout_cents), 0) from g where status = 'completed') end
  );
$$;

create function public.impact_metrics(p_include_demo boolean default true) returns json
language sql stable security definer set search_path = '' as $$
  with g as (select * from public.gigs where p_include_demo or not is_demo),
  done as (select * from g where status = 'completed')
  select json_build_object(
    'gigs_posted', (select count(*) from g),
    'gigs_matched', (select count(*) from g where matched_at is not null),
    'gigs_completed', (select count(*) from done),
    'gigs_open', (select count(*) from g where status = 'open'),
    'match_rate', (select round(count(*) filter (where matched_at is not null)::numeric / nullif(count(*), 0), 3) from g),
    'completion_rate', (
      select round(count(*) filter (where status = 'completed')::numeric
        / nullif(count(*) filter (where status in ('completed', 'cancelled') and matched_at is not null), 0), 3)
      from g
    ),
    'median_hours_to_match', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from matched_at - created_at)) / 3600)::numeric, 1)
      from g where matched_at is not null
    ),
    'income_earned_cents', (select coalesce(sum(payout_cents), 0) from done),
    'fees_cents', (select coalesce(sum(fee_cents), 0) from done),
    'people_earned', (select count(distinct assigned_worker_id) from done),
    'avg_rating', (select round(avg(r.rating)::numeric, 2) from public.reviews r join g on g.id = r.gig_id),
    'reviews', (select count(*) from public.reviews r join g on g.id = r.gig_id),
    'portfolio_records', (select count(*) from public.portfolio_items pi where p_include_demo or not pi.is_demo),
    'repeat_customers', (select count(*) from (select customer_id from done group by customer_id having count(*) > 1) x),
    'workers_with_repeat_work', (select count(*) from (select assigned_worker_id from done group by assigned_worker_id having count(*) > 1) y),
    'workers', (select count(*) from public.profiles p where p.role = 'worker' and (p_include_demo or not p.is_demo)),
    'customers', (select count(*) from public.profiles p where p.role = 'customer' and (p_include_demo or not p.is_demo)),
    'top_categories', (
      select coalesce(json_agg(json_build_object('category', category, 'count', n) order by n desc, category), '[]'::json)
      from (select category, count(*) as n from done group by category order by n desc limit 5) c
    )
  );
$$;

-- ── Privileges: nothing is callable unless granted here ─────────────────────
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.create_account(text, text, text, text, text) to anon, authenticated;
grant execute on function public.discover_gigs(text, text, text[], integer, integer) to anon, authenticated;
grant execute on function public.worker_stats(uuid) to anon, authenticated;
grant execute on function public.impact_metrics(boolean) to anon, authenticated;

grant execute on function
  public.create_gig(uuid, text, text, text, text, date, text, integer, jsonb),
  public.apply_to_gig(uuid, text),
  public.withdraw_application(uuid),
  public.select_worker(uuid, uuid),
  public.start_gig(uuid),
  public.mark_gig_done(uuid),
  public.confirm_completion(uuid),
  public.submit_review(uuid, integer, text),
  public.cancel_gig(uuid),
  public.add_portfolio_evidence(uuid, text),
  public.remove_portfolio_evidence(uuid, text),
  public.report_content(uuid, uuid, text, text),
  public.log_contact_reveal(uuid)
to authenticated;
