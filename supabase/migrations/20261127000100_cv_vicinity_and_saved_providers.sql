-- 1) Auto-append completed job category to worker's profile skills whenever a job is confirmed (portfolio_items insert).
-- 2) Client saved service providers (client_saved_providers) so clients can retain their people and easily request
--    a service via KashWise while preserving independent-contractor status (providers still choose/decline work).

-- ── 1. Auto-append skill when a job is completed ────────────────────────────
create or replace function private.append_completed_job_skill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
  set skills = array_append(p.skills, new.category)
  where p.id = new.worker_id
    and not (new.category = any (p.skills))
    and cardinality(p.skills) < 12;
  return new;
end;
$$;
revoke all on function private.append_completed_job_skill() from public, anon, authenticated;

drop trigger if exists portfolio_append_worker_skill on public.portfolio_items;
create trigger portfolio_append_worker_skill after insert on public.portfolio_items
  for each row execute function private.append_completed_job_skill();

-- Backfill any completed job categories not yet present on the worker's profile.
update public.profiles p
set skills = (
  select coalesce(array_agg(s order by ord), '{}')
  from (
    select distinct on (u.s) u.s, u.ord
    from unnest(
      p.skills || coalesce(
        array(
          select pi.category
          from public.portfolio_items pi
          where pi.worker_id = p.id
          order by pi.completed_at desc
        ),
        '{}'
      )
    ) with ordinality as u(s, ord)
    order by u.s, u.ord
  ) deduped
  limit 12
)
where exists (
  select 1 from public.portfolio_items pi
  where pi.worker_id = p.id and not (pi.category = any (p.skills))
);

-- ── 2. Client saved service providers ───────────────────────────────────────
create table if not exists public.client_saved_providers (
  client_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  label text check (label is null or char_length(btrim(label)) <= 60),
  created_at timestamptz not null default now(),
  primary key (client_id, worker_id),
  constraint client_saved_providers_not_self check (client_id <> worker_id)
);
create index if not exists client_saved_providers_client_idx on public.client_saved_providers (client_id, created_at desc);

alter table public.client_saved_providers enable row level security;
revoke all on public.client_saved_providers from public, anon, authenticated;

create policy "Clients read their own saved service providers" on public.client_saved_providers
  for select to authenticated using (client_id = (select auth.uid()));
grant select on public.client_saved_providers to authenticated;

create or replace function public.save_client_provider(p_worker uuid, p_label text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_clean_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if p_worker is null or p_worker = v_uid then
    raise exception 'Choose a service provider to add.' using errcode = '22023';
  end if;
  if v_clean_label is not null and char_length(v_clean_label) > 60 then
    raise exception 'Keep the note under 60 characters.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_worker) then
    raise exception 'Service provider not found.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.client_saved_providers c where c.client_id = v_uid) >= 50
     and not exists (select 1 from public.client_saved_providers c where c.client_id = v_uid and c.worker_id = p_worker) then
    raise exception 'You can save up to 50 service providers.' using errcode = '54000';
  end if;

  insert into public.client_saved_providers (client_id, worker_id, label)
  values (v_uid, p_worker, v_clean_label)
  on conflict (client_id, worker_id) do update
    set label = coalesce(excluded.label, public.client_saved_providers.label);
end;
$$;

create or replace function public.remove_client_provider(p_worker uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  delete from public.client_saved_providers c
  where c.client_id = v_uid and c.worker_id = p_worker;
end;
$$;

-- Direct service request from a client to a retained/chosen service provider.
-- Creates a matched gig (like book_service) so the provider can accept/start on site via QR or decline before start.
create or replace function public.request_provider_service(
  p_id uuid, p_worker uuid, p_title text, p_category text, p_description text,
  p_area text, p_date date, p_time_window text, p_payout_cents integer, p_envelope jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_worker_demo boolean;
  v_gig public.gigs;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid;
  if not found then raise exception 'Please complete your profile first.' using errcode = '22023'; end if;
  select p.display_name, p.is_demo into v_name, v_worker_demo from public.profiles p where p.id = p_worker;
  if not found then raise exception 'This service provider is not available.' using errcode = 'P0002'; end if;
  if p_worker = v_uid then raise exception 'You cannot request a service from yourself.' using errcode = '42501'; end if;
  if v_demo is distinct from v_worker_demo then
    raise exception 'Demo and real marketplace activity must stay separate.' using errcode = '42501';
  end if;
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
                           payout_cents, is_demo)
  values (v_id, v_uid, btrim(p_title), p_category, btrim(p_description), p_area, p_date,
          coalesce(p_time_window, 'flexible'), p_payout_cents, v_demo);
  if p_envelope is not null then
    insert into public.gig_private (gig_id, envelope) values (v_id, p_envelope);
  end if;
  update public.gigs g set status = 'matched', assigned_worker_id = p_worker, matched_at = now()
  where g.id = v_id
  returning * into v_gig;
  insert into public.transactions (gig_id, customer_id, worker_id, payout_cents, fee_cents, total_cents)
  values (v_id, v_uid, p_worker, v_gig.worker_net_cents, v_gig.fee_cents, v_gig.total_cents);

  insert into public.gig_events (gig_id, actor_id, kind, detail) values
    (v_id, v_uid, 'booked', v_name),
    (v_id, v_uid, 'payment_held', null);
  return v_id;
end;
$$;

revoke all on function
  public.save_client_provider(uuid, text),
  public.remove_client_provider(uuid),
  public.request_provider_service(uuid, uuid, text, text, text, text, date, text, integer, jsonb)
from public, anon, authenticated;

grant execute on function
  public.save_client_provider(uuid, text),
  public.remove_client_provider(uuid),
  public.request_provider_service(uuid, uuid, text, text, text, text, date, text, integer, jsonb)
to authenticated;

-- ── 3. Creative, hyper-specific Mzansi marketplace gigs ─────────────────────
insert into public.gigs (customer_id, title, category, description, area_slug, scheduled_date, time_window, payout_cents, is_demo)
select p.id, v.title, v.category, v.description, v.area_slug,
       (now() at time zone 'Africa/Johannesburg')::date + v.days_ahead,
       v.time_window, v.payout_rands * 100, true
from (values
  ('Braai master for 4kg chuck, wors & chakalaka during the derby', 'catering',
   'Hosting 12 cousins for the Chiefs vs Pirates match. Meat, charcoal and spices are bought — I just need someone with serious tong skills to braai everything to perfection and make spicy chakalaka so I do not miss a minute of the game.',
   'soweto', 2, 'afternoon', 750),
  ('Hold my spot in the Home Affairs queue from 5:30am with a chair', 'other',
   'Need an early riser to stand in the passport collection queue before the doors open and call me when you are 15 people from the front. Bring a flask and a folding chair — paying specifically for the 3 hours you save my morning.',
   'sandton', 1, 'morning', 400),
  ('Mount a 75-inch TV on a skew brick wall & hide every single cable', 'repairs',
   'My lounge wall in Braam is not completely straight and the dangling HDMI and PlayStation cords are driving me crazy. Bring a heavy-duty masonry drill, a spirit level and trunking so the TV sits dead-level and looks like it is floating.',
   'braamfontein', 2, 'morning', 550),
  ('Teach my mom crispy slap chips & kota secrets for her tuckshop', 'catering',
   'My mom just opened a corner spaza window and wants her kotas to be the talk of Tembisa. Spend one morning showing her the exact oil temperature for soft-inside crispy chips, proper atchar-and-Russian layering, and fast wrapping.',
   'tembisa', 3, 'morning', 650),
  ('Untangle my gogo WhatsApp storage & recover her choir videos', 'tech-support',
   'Gogo Samsung phone is 99% full of forwarded Good Morning roses and she cannot find her Sunday choir clips. Sit with her patiently for two hours, clear duplicate memes, back up her photos and make the font extra large.',
   'rosebank', 1, 'afternoon', 450),
  ('Golden-hour sneaker & vintage denim rooftop shoot in Maboneng', 'photography',
   'Launching a 15-piece thrifted denim and sneaker drop on Instagram. I do not want stiff studio photos — I want 90 minutes of gritty, high-energy golden-hour shots on a CBD rooftop with someone who knows angles and natural light.',
   'joburg-cbd', 3, 'evening', 800),
  ('Bakkie rescue: move one giant L-shape couch & a stubborn aloe pot', 'moving',
   'Bought a huge velvet L-shape couch on Marketplace and it will not fit in my hatchback even with prayers. Need someone with a bakkie, blankets and strong arms to pivot it out of a first-floor townhouse in Ferndale to Blairgowrie.',
   'randburg', 2, 'afternoon', 600),
  ('Pre-purchase mechanic check on a 2016 Polo Vivo before I pay', 'automotive',
   'Seller swears the car has never been in a bump and just needs regas. Meet me at the dealership in Midrand for 45 minutes with an OBD scanner and a torch to check for overspray, head-gasket mayo and gearbox noises before I sign.',
   'midrand', 1, 'morning', 550),
  ('Rescue my neglected balcony succulents & repot 14 monsteras', 'gardening',
   'I bought too many houseplants and now half look sad. Bring potting soil mix, perlite and secateurs — spend the morning repotting them on my stoep, pruning yellow leaves and writing a simple watering cheat-sheet for my fridge.',
   'roodepoort', 4, 'morning', 480),
  ('2-hour conversational isiZulu crash course before meeting in-laws', 'tutoring',
   'Meeting my partner extended family this weekend and I refuse to just smile and nod. Coach me through respectful greetings, how to compliment the food properly, and warm small-talk phrases with real pronunciation.',
   'alexandra', 2, 'evening', 420),
  ('6am bridal squad: melt 4 lace frontal wigs & crisp groom line-up', 'hair-beauty',
   'Lobby call is 8am sharp for a traditional wedding in Orlando West. Need a mobile stylist who does not play with time to lay four lace frontals and give the best man a razor-sharp fade and beard line-up before the taxis leave.',
   'soweto', 5, 'morning', 680),
  ('Post-amapiano-chill patio rescue: scrub braai grid & glass doors', 'cleaning',
   'Had 15 friends over last night. Nothing is broken, but the patio tiles, sliding glass doors and stainless-steel braai stand need a miracle before my landlord visits at 3pm. All cleaning chemicals and a pressure washer are on site.',
   'sandton', 1, 'morning', 700)
) as v (title, category, description, area_slug, days_ahead, time_window, payout_rands)
join auth.users u on lower(u.email) = 'demo.customer@sidegigs.app'
join public.profiles p on p.id = u.id;
