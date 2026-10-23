-- 1) Pricing: SideGigs' fee drops from 15% to 8%, still taken from the service provider's pay. No VAT is withheld:
--    most providers are informal, non-VAT-registered independent contractors, and VAT is not theirs to account for.
--      fee_cents         8% of the job price, rounded half-up to the cent (the only deduction)
--      worker_net_cents  what the service provider receives: price − fee (92%)
--      total_cents       what the client pays: the price, nothing added
--    R500 job → fee R40, provider receives R460. Same formulas as src/lib/money.ts.
-- 2) Services: a provider lists a service at the amount they want to take home. The client is shown the price that
--    pays exactly that after the fee (R460 take-home → client pays R500). Booking it creates a gig that is matched to
--    the provider straight away, so it runs through the same QR start/finish, confirmation and portfolio.

-- ── Pricing ────────────────────────────────────────────────────────────────
create function private.sidegigs_fee_cents(p_price integer) returns integer
language sql immutable set search_path = '' as $$
  select (p_price * 8 + 50) / 100;
$$;

create function private.take_home_cents(p_price integer) returns integer
language sql immutable set search_path = '' as $$
  select p_price - private.sidegigs_fee_cents(p_price);
$$;

-- The smallest price whose take-home is at least p_take_home. Take-home rises by 0 or 1 cent for every cent of price,
-- so that price pays exactly p_take_home, and it always lies within 3 cents of take-home × 25/23.
create function private.price_for_take_home(p_take_home integer) returns integer
language sql immutable set search_path = '' as $$
  select min(p)::integer
  from generate_series(greatest(p_take_home * 25 / 23 - 3, 0), p_take_home * 25 / 23 + 3) as p
  where private.take_home_cents(p) >= p_take_home;
$$;

revoke all on function
  private.sidegigs_fee_cents(integer), private.take_home_cents(integer), private.price_for_take_home(integer)
from public;
grant execute on function
  private.sidegigs_fee_cents(integer), private.take_home_cents(integer), private.price_for_take_home(integer)
to anon, authenticated;

alter table public.gigs alter column fee_cents set expression as (private.sidegigs_fee_cents(payout_cents));
alter table public.gigs alter column worker_net_cents set expression as (private.take_home_cents(payout_cents));

comment on column public.gigs.fee_cents is 'SideGigs 8% fee, deducted from the service provider''s pay. The only deduction.';
comment on column public.gigs.worker_net_cents is 'What the service provider receives: job price less the SideGigs fee.';
comment on column public.transactions.fee_cents is 'SideGigs 8% fee, deducted from the service provider''s pay.';

-- Payments are a labelled simulation, so existing records are restated under the new fee for consistency.
-- select_worker (20260926001000) already records worker_net_cents / fee_cents / total_cents from these columns.
update public.transactions t
set payout_cents = g.worker_net_cents, fee_cents = g.fee_cents, total_cents = g.total_cents
from public.gigs g where g.id = t.gig_id;

-- ── Services ───────────────────────────────────────────────────────────────
create table public.services (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 80),
  category text not null check (category in (
    'cleaning', 'gardening', 'tutoring', 'hair-beauty', 'repairs', 'painting',
    'catering', 'photography', 'moving', 'tech-support', 'automotive', 'other'
  )),
  description text not null check (char_length(btrim(description)) between 20 and 1000),
  area_slug text not null references public.areas (slug),
  -- What the provider typed: the amount they take home. Bounds map to the gig price bounds R50–R50 000.
  take_home_cents integer not null check (take_home_cents between 4600 and 4600000),
  -- What the client pays; the SideGigs fee comes out of it before it reaches the provider.
  price_cents integer generated always as (private.price_for_take_home(take_home_cents)) stored,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_active_idx on public.services (created_at desc) where is_active;
create index services_worker_idx on public.services (worker_id, created_at desc);
create index services_category_idx on public.services (category);
create trigger services_touch before update on public.services
  for each row execute function private.touch_updated_at();

alter table public.services enable row level security;
create policy "Active services are public; providers see all of their own" on public.services for select to anon, authenticated
  using (is_active or worker_id = (select auth.uid()));
-- Read-only for clients (default privileges would grant writes); changes go through save_service / set_service_active.
revoke all on public.services from anon, authenticated;
grant select on public.services to anon, authenticated;

alter table public.gigs add column service_id uuid references public.services (id) on delete set null;
create index gigs_service_idx on public.gigs (service_id);
comment on column public.gigs.service_id is 'Set when the gig was booked from a provider''s listed service.';

-- Create (p_id null) or edit one of your own services.
create function public.save_service(
  p_id uuid, p_title text, p_category text, p_description text, p_area text, p_take_home_cents integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid;
  if not found then raise exception 'Please complete your profile first.' using errcode = '22023'; end if;
  if p_take_home_cents is null or p_take_home_cents not between 4600 and 4600000 then
    raise exception 'What you receive must be between R46 and R46 000.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.areas a where a.slug = p_area) then
    raise exception 'Please choose the area you work in.' using errcode = '22023';
  end if;

  if p_id is null then
    if (select count(*) from public.services s where s.worker_id = v_uid) >= 12 then
      raise exception 'You can list up to 12 services. Edit or pause one instead.' using errcode = '54000';
    end if;
    insert into public.services (worker_id, title, category, description, area_slug, take_home_cents, is_demo)
    values (v_uid, btrim(p_title), p_category, btrim(p_description), p_area, p_take_home_cents, v_demo)
    returning id into v_id;
  else
    update public.services s
      set title = btrim(p_title), category = p_category, description = btrim(p_description),
          area_slug = p_area, take_home_cents = p_take_home_cents
    where s.id = p_id and s.worker_id = v_uid
    returning s.id into v_id;
    if v_id is null then raise exception 'You can only change your own services.' using errcode = '42501'; end if;
  end if;
  return v_id;
end $$;

create function public.set_service_active(p_service uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  update public.services s set is_active = coalesce(p_active, false) where s.id = p_service and s.worker_id = v_uid;
  if not found then raise exception 'You can only change your own services.' using errcode = '42501'; end if;
end $$;

-- The client books a listed service for a date. There is no application step: the provider set the price, so the gig
-- is matched to them at once (which issues the Work ID and the on-site QR codes) and the simulated payment is held.
create function public.book_service(
  p_id uuid, p_service uuid, p_area text, p_date date, p_time_window text, p_envelope jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_service public.services;
  v_gig public.gigs;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid;
  if not found then raise exception 'Please complete your profile first.' using errcode = '22023'; end if;
  select * into v_service from public.services s where s.id = p_service;
  if not found or not v_service.is_active then raise exception 'This service is no longer available.' using errcode = 'P0002'; end if;
  if v_service.worker_id = v_uid then raise exception 'You cannot book your own service.' using errcode = '42501'; end if;
  if p_date is null or p_date < v_today then
    raise exception 'Please choose today or a future date.' using errcode = '22023';
  end if;
  if p_date > v_today + 180 then
    raise exception 'Please choose a date within the next 6 months.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.areas a where a.slug = p_area) then
    raise exception 'Please choose the area where the work happens.' using errcode = '22023';
  end if;
  if (select count(*) from public.gigs g where g.customer_id = v_uid and g.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have booked a lot of work today. Please try again tomorrow.' using errcode = '54000';
  end if;
  if p_envelope is not null and not private.is_valid_envelope(p_envelope) then
    raise exception 'Private details could not be encrypted. Please try again.' using errcode = '22023';
  end if;

  insert into public.gigs (id, customer_id, title, category, description, area_slug, scheduled_date, time_window,
                           payout_cents, is_demo, service_id)
  values (v_id, v_uid, v_service.title, v_service.category, v_service.description, p_area, p_date,
          coalesce(p_time_window, 'flexible'), v_service.price_cents, v_demo or v_service.is_demo, v_service.id);
  if p_envelope is not null then
    insert into public.gig_private (gig_id, envelope) values (v_id, p_envelope);
  end if;
  update public.gigs g set status = 'matched', assigned_worker_id = v_service.worker_id, matched_at = now()
  where g.id = v_id
  returning * into v_gig;
  insert into public.transactions (gig_id, customer_id, worker_id, payout_cents, fee_cents, total_cents)
  values (v_id, v_uid, v_service.worker_id, v_gig.worker_net_cents, v_gig.fee_cents, v_gig.total_cents);

  select p.display_name into v_name from public.profiles p where p.id = v_service.worker_id;
  insert into public.gig_events (gig_id, actor_id, kind, detail) values
    (v_id, v_uid, 'booked', v_name),
    (v_id, v_uid, 'payment_held', null);
  return v_id;
end $$;

-- The provider can turn a booking down (e.g. the date doesn't work) until the job starts; the client is refunded.
create function public.decline_booking(p_gig uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_gig public.gigs;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select * into v_gig from public.gigs g where g.id = p_gig for update;
  if not found or v_gig.service_id is null or v_gig.assigned_worker_id is distinct from v_uid then
    raise exception 'Only the provider of a booked service can decline it.' using errcode = '42501';
  end if;
  if v_gig.status <> 'matched' then raise exception 'Bookings can only be declined before the job starts.' using errcode = '22023'; end if;

  update public.gigs g set status = 'cancelled', cancelled_at = now() where g.id = p_gig;
  update public.transactions t set status = 'refunded', settled_at = now() where t.gig_id = p_gig and t.status = 'held';
  insert into public.gig_events (gig_id, actor_id, kind) values
    (p_gig, v_uid, 'booking_declined'),
    (p_gig, v_uid, 'payment_refunded');
end $$;

-- Invoker rights: RLS returns active services only. Clients see the price they pay, never the provider's take-home.
create function public.discover_services(
  p_area text default null, p_category text default null, p_worker uuid default null,
  p_limit integer default 20, p_offset integer default 0
) returns table (
  id uuid, title text, category text, description text, area_slug text, area_name text, city text,
  price_cents integer, created_at timestamptz, is_demo boolean,
  worker_id uuid, worker_name text, worker_headline text, worker_avatar_path text, worker_is_demo boolean,
  completed integer, avg_rating numeric, review_count integer, distance_km numeric
)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.title, s.category, s.description, s.area_slug, a.name, a.city,
         s.price_cents, s.created_at, s.is_demo,
         s.worker_id, p.display_name, p.headline, p.avatar_path, p.is_demo,
         (select count(*)::int from public.portfolio_items pi where pi.worker_id = s.worker_id),
         (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.worker_id = s.worker_id),
         (select count(*)::int from public.reviews r where r.worker_id = s.worker_id),
         round(private.distance_km(o.lat, o.lng, a.lat, a.lng)::numeric, 1)
  from public.services s
  join public.areas a on a.slug = s.area_slug
  join public.profiles p on p.id = s.worker_id
  left join public.areas o on o.slug = p_area
  where s.is_active
    and (p_category is null or s.category = p_category)
    and (p_worker is null or s.worker_id = p_worker)
  order by 19 asc nulls last, s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function
  public.save_service(uuid, text, text, text, text, integer),
  public.set_service_active(uuid, boolean),
  public.book_service(uuid, uuid, text, date, text, jsonb),
  public.decline_booking(uuid),
  public.discover_services(text, text, uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.discover_services(text, text, uuid, integer, integer) to anon, authenticated;
grant execute on function
  public.save_service(uuid, text, text, text, text, integer),
  public.set_service_active(uuid, boolean),
  public.book_service(uuid, uuid, text, date, text, jsonb),
  public.decline_booking(uuid)
to authenticated;

-- ── Demo services (badged in the UI) ───────────────────────────────────────
-- Take-home amounts are chosen so clients see round prices (R460 take-home → R500).
insert into public.services (worker_id, title, category, description, area_slug, take_home_cents, is_demo)
select p.id, v.title, v.category, v.description, p.area_slug, v.take_home_cents, true
from (values
  ('demo.worker@sidegigs.app', 'Paint one interior room', 'painting',
   'Walls of one bedroom or lounge, two coats. I bring brushes, rollers and drop sheets; you choose and buy the paint.', 138000),
  ('demo.worker@sidegigs.app', 'Fix a door, hinge or cupboard', 'repairs',
   'Sticking doors, broken hinges, loose cupboard doors and handles. Small parts included; bigger parts quoted first.', 32200),
  ('lerato.demo@sidegigs.app', 'Knotless braids, shoulder length', 'hair-beauty',
   'Neat knotless braids at your home. Braiding hair included in black or brown. Takes about four hours.', 55200),
  ('lerato.demo@sidegigs.app', 'Deep clean a 2-bedroom home', 'cleaning',
   'Kitchen, bathroom, floors, windows inside and dusting throughout. I bring my own cleaning products.', 46000),
  ('ayanda.demo@sidegigs.app', 'One-hour maths or science lesson', 'tutoring',
   'Grade 8–12 maths or physical science. Bring your homework or test and we work through it together.', 18400),
  ('ayanda.demo@sidegigs.app', 'Laptop tune-up and virus clean', 'tech-support',
   'Speed up a slow Windows laptop: remove viruses and junk, update it and back up your photos and documents.', 27600),
  ('kagiso.demo@sidegigs.app', 'Minor car service at your home', 'automotive',
   'Oil, oil filter and air filter changed at your place, plus a check of brakes, battery and tyres. Parts extra.', 73600),
  ('nomsa.demo@sidegigs.app', 'Home-cooked meal for 20 guests', 'catering',
   'Pap, rice, chicken, beef stew and three salads for up to 20 people. Ingredients included, served hot.', 184000),
  ('themba.demo@sidegigs.app', 'Garden clean-up, half day', 'gardening',
   'Mowing, weeding, trimming hedges and taking the garden refuse away in my bakkie. About four hours.', 41400)
) as v (email, title, category, description, take_home_cents)
join auth.users u on lower(u.email) = v.email
join public.profiles p on p.id = u.id;
