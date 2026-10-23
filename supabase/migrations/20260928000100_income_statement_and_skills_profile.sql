-- Proof of income and skills profiles: formalising informal work.
-- 1. public.income_statement(months): a worker's released earnings, month by month, for a signed income statement.
-- 2. public.skills_profiles: a worker's skills profile, signed by SideGigs (ML-DSA-65) in a Netlify Function.
--    Anyone may read it (it is shared like a business card); only the worker may save or remove their own, through RPCs.
--    The page shows a profile only when its signature verifies, so a hand-made profile saved through the RPC is ignored.

create function public.income_statement(p_months integer default 3) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_months integer := coalesce(p_months, 3);
  v_profile public.profiles;
  v_from date;
  v_to date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if v_months < 1 or v_months > 12 then raise exception 'Choose between 1 and 12 months.' using errcode = '22023'; end if;
  select * into v_profile from public.profiles p where p.id = v_uid;
  if not found or v_profile.role <> 'worker' then
    raise exception 'Income statements are for service providers.' using errcode = '42501';
  end if;
  v_from := (date_trunc('month', now() at time zone 'Africa/Johannesburg') - make_interval(months => v_months - 1))::date;

  return json_build_object(
    'worker', json_build_object(
      'id', v_profile.id, 'name', v_profile.display_name, 'area_slug', v_profile.area_slug,
      'member_since', v_profile.created_at, 'is_demo', v_profile.is_demo),
    'period', json_build_object('from', v_from, 'to', v_to, 'months', v_months),
    'months', (
      select json_agg(json_build_object(
        'month', to_char(m, 'YYYY-MM'), 'jobs', coalesce(x.jobs, 0), 'client_paid_cents', coalesce(x.paid, 0),
        'fee_cents', coalesce(x.fee, 0), 'net_cents', coalesce(x.net, 0)) order by m)
      from generate_series(v_from::timestamp, v_to::timestamp, interval '1 month') m
      left join lateral (
        select count(*) as jobs, sum(t.total_cents) as paid, sum(t.fee_cents) as fee, sum(t.payout_cents) as net
        from public.transactions t
        where t.worker_id = v_uid and t.status = 'released' and t.settled_at is not null
          and date_trunc('month', t.settled_at at time zone 'Africa/Johannesburg') = m
      ) x on true),
    'lines', (
      select coalesce(json_agg(json_build_object(
        'settled_at', l.settled_at, 'title', l.title, 'category', l.category, 'area_slug', l.area_slug,
        'client_paid_cents', l.total_cents, 'fee_cents', l.fee_cents, 'net_cents', l.payout_cents,
        'record_code', l.record_code, 'customer_label', l.customer_label, 'is_demo', l.is_demo) order by l.settled_at desc), '[]'::json)
      from (
        select t.settled_at, g.title, g.category, g.area_slug, t.total_cents, t.fee_cents, t.payout_cents,
               pi.record_code, pi.customer_label, g.is_demo
        from public.transactions t
        join public.gigs g on g.id = t.gig_id
        left join public.portfolio_items pi on pi.gig_id = t.gig_id
        where t.worker_id = v_uid and t.status = 'released' and t.settled_at is not null
          and (t.settled_at at time zone 'Africa/Johannesburg')::date >= v_from
        order by t.settled_at desc
        limit 500
      ) l),
    'clients', (
      select count(distinct t.customer_id) from public.transactions t
      where t.worker_id = v_uid and t.status = 'released' and t.settled_at is not null
        and (t.settled_at at time zone 'Africa/Johannesburg')::date >= v_from),
    'cashouts', (
      select json_build_object('count', count(*), 'amount_cents', coalesce(sum(c.amount_cents), 0), 'fee_cents', coalesce(sum(c.fee_cents), 0))
      from private.counted_cashouts(v_uid) c
      where (c.created_at at time zone 'Africa/Johannesburg')::date >= v_from),
    -- Every payment is simulated until a licensed payment partner is connected (transactions.mode is 'simulation').
    'simulated', coalesce((select bool_or(t.mode = 'simulation') from public.transactions t where t.worker_id = v_uid), true)
  );
end $$;

revoke all on function public.income_statement(integer) from public, anon, authenticated;
grant execute on function public.income_statement(integer) to authenticated;

create table public.skills_profiles (
  worker_id uuid primary key references public.profiles (id) on delete cascade,
  signed jsonb not null check (pg_column_size(signed) < 65536),
  written_by text not null check (written_by in ('ai', 'summary')),
  created_at timestamptz not null default now()
);
comment on table public.skills_profiles is
  'Worker skills profiles signed by SideGigs (ML-DSA-65) from customer-confirmed records. Written only via save_skills_profile.';

alter table public.skills_profiles enable row level security;
create policy skills_profiles_read on public.skills_profiles for select to anon, authenticated using (true);
revoke all on public.skills_profiles from public, anon, authenticated;
grant select on public.skills_profiles to anon, authenticated;

create function public.save_skills_profile(p_signed jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_by text := p_signed #>> '{credential,written_by}';
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if jsonb_typeof(p_signed) is distinct from 'object'
     or (p_signed #>> '{credential,type}') is distinct from 'SideGigsSkillsProfile'
     or (p_signed #>> '{credential,worker,id}') is distinct from v_uid::text then
    raise exception 'That skills profile is not yours.' using errcode = '42501';
  end if;
  if v_by is null or v_by not in ('ai', 'summary') then
    raise exception 'Invalid skills profile.' using errcode = '22023';
  end if;
  if pg_column_size(p_signed) >= 65536 then raise exception 'Skills profile too large.' using errcode = '22023'; end if;
  insert into public.skills_profiles (worker_id, signed, written_by) values (v_uid, p_signed, v_by)
  on conflict (worker_id) do update set signed = excluded.signed, written_by = excluded.written_by, created_at = now();
end $$;

create function public.delete_skills_profile() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  delete from public.skills_profiles s where s.worker_id = auth.uid();
end $$;

revoke all on function public.save_skills_profile(jsonb), public.delete_skills_profile() from public, anon, authenticated;
grant execute on function public.save_skills_profile(jsonb), public.delete_skills_profile() to authenticated;
