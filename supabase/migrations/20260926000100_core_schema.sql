-- SideGigs core schema: tables, constraints, indexes, RLS, grants.
-- Design: docs/architecture.md §3. All writes to trust-bearing tables go through RPCs (next migration).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create type public.gig_status as enum ('open', 'matched', 'in_progress', 'completed', 'cancelled');
create type public.application_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type public.txn_status as enum ('held', 'released', 'refunded');

-- Envelope = post-quantum encrypted blob produced in the browser (architecture §7).
create function private.is_valid_envelope(e jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select e is not null
     and jsonb_typeof(e) = 'object'
     and e ? 'v' and e ? 'kid' and e ? 'alg' and e ? 'kem' and e ? 'iv' and e ? 'ct'
     and pg_catalog.octet_length(e::text) < 8192;
$$;

create function private.distance_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable set search_path = '' as $$
  select case when lat1 is null or lat2 is null then null else
    6371 * 2 * asin(least(1, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))) end;
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.areas (
  slug text primary key,
  name text not null,
  city text not null,
  province text not null,
  lat double precision not null,
  lng double precision not null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  role text not null default 'worker' check (role in ('worker', 'customer')),
  area_slug text not null references public.areas (slug),
  headline text check (headline is null or char_length(headline) <= 80),
  bio text check (bio is null or char_length(bio) <= 500),
  skills text[] not null default '{}' check (
    cardinality(skills) <= 12 and skills <@ array[
      'cleaning', 'gardening', 'tutoring', 'hair-beauty', 'repairs', 'painting',
      'catering', 'photography', 'moving', 'tech-support', 'automotive', 'other'
    ]::text[]
  ),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  phone_envelope jsonb not null check (private.is_valid_envelope(phone_envelope)),
  updated_at timestamptz not null default now()
);

create table public.gigs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 80),
  category text not null check (category in (
    'cleaning', 'gardening', 'tutoring', 'hair-beauty', 'repairs', 'painting',
    'catering', 'photography', 'moving', 'tech-support', 'automotive', 'other'
  )),
  description text not null check (char_length(btrim(description)) between 20 and 1000),
  area_slug text not null references public.areas (slug),
  scheduled_date date not null,
  time_window text not null default 'flexible' check (time_window in ('morning', 'afternoon', 'evening', 'flexible')),
  payout_cents integer not null check (payout_cents between 5000 and 5000000),
  -- 15% SideGigs protection fee, added to the customer, rounded half-up to the cent.
  fee_cents integer generated always as ((payout_cents * 15 + 50) / 100) stored,
  total_cents integer generated always as (payout_cents + (payout_cents * 15 + 50) / 100) stored,
  status public.gig_status not null default 'open',
  assigned_worker_id uuid references public.profiles (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  started_at timestamptz,
  worker_done_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint gigs_assigned_when_matched check (status in ('open', 'cancelled') or assigned_worker_id is not null),
  constraint gigs_not_self_assigned check (assigned_worker_id is distinct from customer_id)
);
create index gigs_open_created_idx on public.gigs (created_at desc) where status = 'open';
create index gigs_customer_idx on public.gigs (customer_id, created_at desc);
create index gigs_worker_idx on public.gigs (assigned_worker_id, created_at desc);
create index gigs_area_idx on public.gigs (area_slug);
create index gigs_category_idx on public.gigs (category);

create table public.gig_private (
  gig_id uuid primary key references public.gigs (id) on delete cascade,
  envelope jsonb not null check (private.is_valid_envelope(envelope)),
  created_at timestamptz not null default now()
);

create table public.gig_applications (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 300),
  status public.application_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gig_id, worker_id)
);
create index gig_applications_worker_idx on public.gig_applications (worker_id, created_at desc);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null unique references public.gigs (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  payout_cents integer not null,
  fee_cents integer not null,
  total_cents integer not null,
  status public.txn_status not null default 'held',
  mode text not null default 'simulation' check (mode = 'simulation'),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index transactions_customer_idx on public.transactions (customer_id);
create index transactions_worker_idx on public.transactions (worker_id);

create table public.gig_events (
  id bigint generated always as identity primary key,
  gig_id uuid not null references public.gigs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index gig_events_gig_idx on public.gig_events (gig_id, created_at);
create index gig_events_actor_idx on public.gig_events (actor_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null unique references public.gigs (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index reviews_worker_idx on public.reviews (worker_id, created_at desc);
create index reviews_reviewer_idx on public.reviews (reviewer_id);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  gig_id uuid not null unique references public.gigs (id) on delete cascade,
  title text not null,
  category text not null,
  area_slug text not null references public.areas (slug),
  completed_at timestamptz not null,
  customer_label text not null,
  rating smallint check (rating is null or rating between 1 and 5),
  review text,
  evidence_paths text[] not null default '{}' check (cardinality(evidence_paths) <= 6),
  worker_note text check (worker_note is null or char_length(worker_note) <= 300),
  record_code text not null unique,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index portfolio_items_worker_idx on public.portfolio_items (worker_id, completed_at desc);
create index portfolio_items_area_idx on public.portfolio_items (area_slug);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  gig_id uuid references public.gigs (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('safety', 'scam', 'harassment', 'inappropriate', 'no_show', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  check (gig_id is not null or reported_user_id is not null)
);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_gig_idx on public.reports (gig_id);
create index reports_user_idx on public.reports (reported_user_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger profile_private_touch before update on public.profile_private
  for each row execute function private.touch_updated_at();

-- ── RLS helpers (security definer, non-exposed schema → no policy recursion) ──

create function private.is_gig_customer(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gigs g where g.id = p_gig and g.customer_id = (select auth.uid()));
$$;

create function private.is_gig_participant(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gigs g
    where g.id = p_gig
      and ((select auth.uid()) = g.customer_id or (select auth.uid()) = g.assigned_worker_id)
  );
$$;

create function private.has_applied(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gig_applications a
    where a.gig_id = p_gig and a.worker_id = (select auth.uid())
  );
$$;

create function private.can_view_gig_private(p_gig uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gigs g
    where g.id = p_gig
      and (
        g.customer_id = (select auth.uid())
        or (g.assigned_worker_id = (select auth.uid()) and g.status in ('matched', 'in_progress', 'completed'))
      )
  );
$$;

create function private.is_matched_counterpart(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gigs g
    where g.status in ('matched', 'in_progress', 'completed')
      and (
        (g.customer_id = (select auth.uid()) and g.assigned_worker_id = p_user)
        or (g.assigned_worker_id = (select auth.uid()) and g.customer_id = p_user)
      )
  );
$$;

create function private.applicant_count(p_gig uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.gig_applications a where a.gig_id = p_gig and a.status = 'pending';
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_valid_envelope(jsonb),
  private.distance_km(float8, float8, float8, float8),
  private.is_gig_customer(uuid),
  private.is_gig_participant(uuid),
  private.has_applied(uuid),
  private.can_view_gig_private(uuid),
  private.is_matched_counterpart(uuid),
  private.applicant_count(uuid)
to anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.gigs enable row level security;
alter table public.gig_private enable row level security;
alter table public.gig_applications enable row level security;
alter table public.transactions enable row level security;
alter table public.gig_events enable row level security;
alter table public.reviews enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.reports enable row level security;

-- Start from zero privileges, then grant the minimum.
revoke all on all tables in schema public from anon, authenticated;

create policy "Areas are public" on public.areas for select to anon, authenticated using (true);
grant select on public.areas to anon, authenticated;

create policy "Profiles are public" on public.profiles for select to anon, authenticated using (true);
create policy "Users create their own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Users update their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to anon, authenticated;
grant insert (id, display_name, role, area_slug, headline, bio, skills) on public.profiles to authenticated;
grant update (display_name, role, area_slug, headline, bio, skills) on public.profiles to authenticated;

create policy "Owner or matched counterpart reads phone envelope" on public.profile_private for select to authenticated
  using (id = (select auth.uid()) or private.is_matched_counterpart(id));
create policy "Owner writes phone envelope" on public.profile_private for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Owner updates phone envelope" on public.profile_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Owner deletes phone envelope" on public.profile_private for delete to authenticated
  using (id = (select auth.uid()));
grant select, insert, update, delete on public.profile_private to authenticated;

create policy "Anyone can see open gigs" on public.gigs for select to anon using (status = 'open');
create policy "Members see open, own, assigned and applied gigs" on public.gigs for select to authenticated
  using (
    status = 'open'
    or customer_id = (select auth.uid())
    or assigned_worker_id = (select auth.uid())
    or private.has_applied(id)
  );
grant select on public.gigs to anon, authenticated;

create policy "Only the customer and matched worker read gig envelopes" on public.gig_private for select to authenticated
  using (private.can_view_gig_private(gig_id));
grant select on public.gig_private to authenticated;

create policy "Worker and gig customer see applications" on public.gig_applications for select to authenticated
  using (worker_id = (select auth.uid()) or private.is_gig_customer(gig_id));
grant select on public.gig_applications to authenticated;

create policy "Parties see their simulated transactions" on public.transactions for select to authenticated
  using (customer_id = (select auth.uid()) or worker_id = (select auth.uid()));
grant select on public.transactions to authenticated;

create policy "Participants see the gig timeline" on public.gig_events for select to authenticated
  using (private.is_gig_participant(gig_id));
grant select on public.gig_events to authenticated;

create policy "Reviews are public" on public.reviews for select to anon, authenticated using (true);
grant select on public.reviews to anon, authenticated;

create policy "Portfolio records are public" on public.portfolio_items for select to anon, authenticated using (true);
create policy "Workers annotate their own records" on public.portfolio_items for update to authenticated
  using (worker_id = (select auth.uid())) with check (worker_id = (select auth.uid()));
grant select on public.portfolio_items to anon, authenticated;
grant update (worker_note) on public.portfolio_items to authenticated;

create policy "Reporters see their own reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
grant select on public.reports to authenticated;

-- ── Storage: work evidence photos ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-evidence', 'work-evidence', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Workers upload evidence into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'work-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Workers delete their own evidence" on storage.objects for delete to authenticated
  using (bucket_id = 'work-evidence' and owner_id = (select auth.uid())::text);
