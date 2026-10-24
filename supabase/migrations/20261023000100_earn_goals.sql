-- Earn My Goal: owner-only planning preferences and a current, bounded marketplace snapshot.
-- Identity details supplied is an account eligibility rule, NOT external identity verification.
-- Matching, prospective earnings and graph memory never write to the financial ledger.

create table public.earn_goals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null unique references public.profiles(id) on delete cascade,
  target_cents integer not null check (target_cents between 100 and 10000000),
  deadline date not null,
  area_slug text not null references public.areas(slug),
  weekdays integer[] not null check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]
    and array_position(weekdays, null) is null
  ),
  time_windows text[] not null check (
    cardinality(time_windows) between 1 and 3
    and time_windows <@ array['morning','afternoon','evening']::text[]
    and array_position(time_windows, null) is null
  ),
  radius_km numeric not null check (radius_km between 1 and 100),
  skills text[] not null check (
    cardinality(skills) between 1 and 12
    and skills <@ array['cleaning','gardening','tutoring','hair-beauty','repairs','painting',
      'catering','photography','moving','tech-support','automotive','other']::text[]
    and array_position(skills, null) is null
  ),
  memory_opt_in boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.earn_goals enable row level security;
revoke all on public.earn_goals from public, anon, authenticated;
grant select on public.earn_goals to authenticated;
create policy "Workers read only their own earnings goal" on public.earn_goals
  for select to authenticated using (worker_id = (select auth.uid()));

create function public.save_earn_goal(p_goal jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_deadline date;
  v_goal public.earn_goals;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'worker') then
    raise exception 'Earnings goals are available to worker accounts.' using errcode = '42501';
  end if;
  if p_goal is null or jsonb_typeof(p_goal) <> 'object' then
    raise exception 'Please provide an earnings goal.' using errcode = '22023';
  end if;
  v_deadline := (p_goal ->> 'deadline')::date;
  if v_deadline is null or v_deadline not between v_today and v_today + 90 then
    raise exception 'Choose a deadline from today to 90 days ahead.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_goal -> 'weekdays') is distinct from 'array'
    or jsonb_typeof(p_goal -> 'time_windows') is distinct from 'array'
    or jsonb_typeof(p_goal -> 'skills') is distinct from 'array' then
    raise exception 'Choose your available days, time windows and skills.' using errcode = '22023';
  end if;

  insert into public.earn_goals (worker_id, target_cents, deadline, area_slug, weekdays, time_windows,
    radius_km, skills, memory_opt_in)
  values (v_uid, (p_goal ->> 'target_cents')::integer, v_deadline, p_goal ->> 'area_slug',
    array(select distinct x::integer from jsonb_array_elements_text(p_goal -> 'weekdays') as x order by 1),
    array(select distinct x from jsonb_array_elements_text(p_goal -> 'time_windows') as x order by 1),
    (p_goal ->> 'radius_km')::numeric,
    array(select distinct x from jsonb_array_elements_text(p_goal -> 'skills') as x order by 1),
    coalesce((p_goal ->> 'memory_opt_in')::boolean, false))
  on conflict (worker_id) do update set
    target_cents = excluded.target_cents, deadline = excluded.deadline, area_slug = excluded.area_slug,
    weekdays = excluded.weekdays, time_windows = excluded.time_windows, radius_km = excluded.radius_km,
    skills = excluded.skills, memory_opt_in = excluded.memory_opt_in,
    started_at = case when public.earn_goals.target_cents <> excluded.target_cents
      or public.earn_goals.deadline <> excluded.deadline then now() else public.earn_goals.started_at end,
    updated_at = now()
  returning * into v_goal;
  return to_jsonb(v_goal);
end $$;

create function public.earn_goal_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_goal public.earn_goals;
  v_candidates jsonb;
  v_truncated boolean;
  v_bookings jsonb;
  v_ledger jsonb;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid and p.role = 'worker';
  if not found then raise exception 'Earnings goals are available to worker accounts.' using errcode = '42501'; end if;
  select * into v_goal from public.earn_goals where worker_id = v_uid;
  if not found then
    return jsonb_build_object('goal', null, 'candidates', '[]'::jsonb, 'bookings', '[]'::jsonb,
      'ledger', '[]'::jsonb, 'simulation', true, 'market_demo', v_demo, 'truncated', false);
  end if;

  -- Read identity membership only within this definer. Private identity rows never leave the database.
  -- Demo accounts see only labelled demo work; a real account never receives a sandbox opportunity.
  with eligible as (
    select g.id, g.title, g.category, g.area_slug, g.scheduled_date, g.time_window,
      g.payout_cents, g.fee_cents, g.worker_net_cents,
      round(private.distance_km(o.lat, o.lng, a.lat, a.lng)::numeric, 1) as distance_km,
      g.is_demo, not v_demo as poster_eligible, application.status as application_status
    from public.gigs g
    join public.profiles poster on poster.id = g.customer_id
    join public.areas a on a.slug = g.area_slug
    join public.areas o on o.slug = v_goal.area_slug
    left join public.gig_applications application on application.gig_id = g.id and application.worker_id = v_uid
    where g.status = 'open' and g.assigned_worker_id is null and g.customer_id <> v_uid
      and g.scheduled_date between (now() at time zone 'Africa/Johannesburg')::date and v_goal.deadline
      and g.is_demo = v_demo and poster.is_demo = v_demo
      and (v_demo or exists (select 1 from public.profile_identity identity_row where identity_row.id = poster.id))
    order by g.scheduled_date, g.id
    limit 501
  ), numbered as (
    select eligible.*, row_number() over (order by scheduled_date, id) as rn from eligible
  )
  select coalesce(jsonb_agg(to_jsonb(numbered) - 'rn' order by scheduled_date, id) filter (where rn <= 500), '[]'::jsonb),
    coalesce(max(rn) > 500, false)
    into v_candidates, v_truncated from numbered;

  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'scheduled_date', g.scheduled_date,
      'time_window', g.time_window, 'worker_net_cents', g.worker_net_cents, 'status', g.status)
      order by g.scheduled_date, g.id), '[]'::jsonb)
    into v_bookings
    from public.gigs g
    where g.assigned_worker_id = v_uid and g.status in ('matched', 'in_progress', 'completed')
      and g.scheduled_date between (v_goal.started_at at time zone 'Africa/Johannesburg')::date and v_goal.deadline;

  -- These are NET CHANGES during the goal period, including refunds for older work.
  -- Keep payouts, disputes and pending payouts separate; they are never added to earned progress.
  select coalesce(jsonb_agg(jsonb_build_object('account', l.account, 'amount_cents', l.amount_cents,
      'occurred_at', l.occurred_at) order by l.occurred_at, l.id), '[]'::jsonb)
    into v_ledger from public.financial_ledger_entries l
    where l.worker_id = v_uid and l.account in ('net_earned', 'paid_out', 'payout_pending', 'disputed_hold')
      and l.occurred_at >= v_goal.started_at and l.occurred_at <= now()
      and l.occurred_at < ((v_goal.deadline + 1)::timestamp at time zone 'Africa/Johannesburg');

  -- The current payment integration is simulation-only for all accounts, not only shared demo users.
  return jsonb_build_object('goal', to_jsonb(v_goal), 'candidates', v_candidates, 'bookings', v_bookings,
    'ledger', v_ledger, 'simulation', true, 'market_demo', v_demo, 'truncated', v_truncated);
end $$;

create function public.forget_earn_goal_memory() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  update public.earn_goals set memory_opt_in = false, updated_at = now() where worker_id = auth.uid();
end $$;

revoke all on function public.save_earn_goal(jsonb), public.earn_goal_context(), public.forget_earn_goal_memory()
  from public, anon, authenticated;
grant execute on function public.save_earn_goal(jsonb), public.earn_goal_context(), public.forget_earn_goal_memory()
  to authenticated;

-- Close the legacy-account posting gap at the write boundary, including security-definer RPCs.
-- Shared sandbox identities are deliberately exempt, but must remain wholly labelled demo data.
create function private.require_eligible_listing_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_demo boolean;
begin
  if tg_table_name = 'gigs' then v_owner := new.customer_id; else v_owner := new.worker_id; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_owner;
  if not found then raise exception 'Please complete your profile first.' using errcode = '42501'; end if;
  if new.is_demo is distinct from v_demo then
    raise exception 'Demo and real marketplace activity must stay separate.' using errcode = '42501';
  end if;
  if not v_demo and not exists (select 1 from public.profile_identity i where i.id = v_owner) then
    raise exception 'Add your required identity details before posting work or services.' using errcode = '42501';
  end if;
  if tg_table_name = 'gigs' then
    if new.assigned_worker_id is not null and exists (
      select 1 from public.profiles p where p.id = new.assigned_worker_id and p.is_demo <> v_demo
    ) then
      raise exception 'Demo and real marketplace activity must stay separate.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.require_eligible_listing_owner() from public, anon, authenticated;
create trigger gigs_require_eligible_owner before insert or update of customer_id, title, category, description, area_slug, scheduled_date, time_window, payout_cents, assigned_worker_id, is_demo on public.gigs
  for each row execute function private.require_eligible_listing_owner();
create trigger services_require_eligible_owner before insert or update on public.services
  for each row execute function private.require_eligible_listing_owner();
