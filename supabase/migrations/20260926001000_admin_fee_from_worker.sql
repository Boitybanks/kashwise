-- The 15% SideGigs admin fee now comes out of the worker's pay instead of being added on top for the customer.
--   payout_cents      the agreed job price: what the customer pays
--   fee_cents         15% admin fee (same rounding as before), deducted from the worker's pay
--   total_cents       what the customer pays = the job price
--   worker_net_cents  what the worker receives = job price - fee
alter table public.gigs alter column total_cents set expression as (payout_cents);
alter table public.gigs add column worker_net_cents integer
  generated always as (payout_cents - (payout_cents * 15 + 50) / 100) stored;

comment on column public.gigs.payout_cents is 'Agreed job price: what the customer pays.';
comment on column public.gigs.fee_cents is '15% SideGigs admin fee, deducted from the worker''s pay.';
comment on column public.gigs.total_cents is 'What the customer pays: the job price.';
comment on column public.gigs.worker_net_cents is 'What the worker receives after the admin fee.';
comment on column public.transactions.payout_cents is 'Paid out to the worker (after the admin fee).';
comment on column public.transactions.total_cents is 'Paid by the customer.';

-- Payments are a labelled simulation, so existing records are restated under the new model for consistency.
update public.transactions t set payout_cents = g.worker_net_cents, total_cents = g.total_cents
from public.gigs g where g.id = t.gig_id;

create or replace function public.select_worker(p_gig uuid, p_application uuid) returns void
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
  values (p_gig, v_uid, v_app.worker_id, v_gig.worker_net_cents, v_gig.fee_cents, v_gig.total_cents);

  select p.display_name into v_name from public.profiles p where p.id = v_app.worker_id;
  insert into public.gig_events (gig_id, actor_id, kind, detail) values
    (p_gig, v_uid, 'matched', v_name),
    (p_gig, v_uid, 'payment_held', null);
end $$;

create or replace function public.impact_metrics(p_include_demo boolean default true) returns json
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
    'income_earned_cents', (select coalesce(sum(worker_net_cents), 0) from done),
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

create or replace function public.worker_stats(p_worker uuid) returns json
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
      then (select coalesce(sum(worker_net_cents), 0) from g where status = 'completed') end
  );
$$;
