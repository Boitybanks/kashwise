-- 1) SideGigs' fee moves from 8% to 10% of the job price. It is still the only deduction from the provider's pay and no
--    VAT is withheld. Providers keep 90% (R500 job → R50 fee → R450), still more than the 75–80% big platforms leave.
--    The 10% covers payment costs and one free cash-out a week, which is what lets workers without a bank account
--    collect cash at a shop.
-- 2) My Wallet (payments are simulated): a provider's released earnings minus their cash-outs. A cash-out goes to a
--    bank account or as an SMS cash voucher collected with a PIN at a shop. SideGigs never holds the money itself: in
--    production a licensed banking partner holds and pays it out. One free cash-out a week, then bank R3 / cash R20.

-- ── Fee: 10% ──────────────────────────────────────────────────────────────
-- Demo services keep their round client prices: re-base their take-home on today's price before the fee changes.
update public.services set take_home_cents = price_cents * 9 / 10 where is_demo;

create or replace function private.sidegigs_fee_cents(p_price integer) returns integer
language sql immutable set search_path = '' as $$
  select (p_price * 10 + 50) / 100;
$$;

-- The smallest price whose take-home is at least p_take_home (within 3 cents of take-home × 10/9).
create or replace function private.price_for_take_home(p_take_home integer) returns integer
language sql immutable set search_path = '' as $$
  select min(p)::integer
  from generate_series(greatest(p_take_home * 10 / 9 - 3, 0), p_take_home * 10 / 9 + 3) as p
  where private.take_home_cents(p) >= p_take_home;
$$;

-- Stored generated columns keep old values until their expression is set again, which recomputes every row.
alter table public.gigs alter column fee_cents set expression as (private.sidegigs_fee_cents(payout_cents));
alter table public.gigs alter column worker_net_cents set expression as (private.take_home_cents(payout_cents));

-- Take-home bounds follow the gig price bounds R50–R50 000.
alter table public.services drop constraint services_take_home_cents_check;
alter table public.services add constraint services_take_home_cents_check check (take_home_cents between 4500 and 4500000);
alter table public.services alter column price_cents set expression as (private.price_for_take_home(take_home_cents));

comment on column public.gigs.fee_cents is 'SideGigs 10% fee, deducted from the service provider''s pay. The only deduction.';
comment on column public.transactions.fee_cents is 'SideGigs 10% fee, deducted from the service provider''s pay.';

-- Payments are a labelled simulation, so existing records are restated under the new fee for consistency.
update public.transactions t
set payout_cents = g.worker_net_cents, fee_cents = g.fee_cents, total_cents = g.total_cents
from public.gigs g where g.id = t.gig_id;

create or replace function public.save_service(
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
  if p_take_home_cents is null or p_take_home_cents not between 4500 and 4500000 then
    raise exception 'What you receive must be between R45 and R45 000.' using errcode = '22023';
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

-- ── My Wallet ─────────────────────────────────────────────────────────────
create table public.wallet_cashouts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  method text not null check (method in ('bank', 'cash')),
  amount_cents integer not null check (amount_cents between 5000 and 2500000),
  fee_cents integer not null check (fee_cents >= 0 and fee_cents < amount_cents),
  destination text not null check (char_length(destination) between 2 and 60),
  reference text not null unique check (reference ~ '^CO-[A-HJ-NP-Z2-9]{8}$'),
  status text not null default 'paid' check (status in ('processing', 'paid')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index wallet_cashouts_worker_idx on public.wallet_cashouts (worker_id, created_at desc);
alter table public.wallet_cashouts enable row level security;
create policy "Workers see their own cash-outs" on public.wallet_cashouts for select to authenticated
  using (worker_id = (select auth.uid()));
revoke all on public.wallet_cashouts from anon, authenticated;
grant select on public.wallet_cashouts to authenticated;

-- Shared demo accounts: their cash-outs stop counting after 30 minutes, so the next person trying the demo still has
-- a balance to cash out. Real accounts are unaffected.
create function private.counted_cashouts(p_worker uuid) returns setof public.wallet_cashouts
language sql stable security definer set search_path = '' as $$
  select c.* from public.wallet_cashouts c
  where c.worker_id = p_worker and (not c.is_demo or c.created_at > now() - interval '30 minutes');
$$;
revoke all on function private.counted_cashouts(uuid) from public, anon, authenticated;

create function public.wallet_summary() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_released bigint;
  v_held bigint;
  v_cashed bigint;
  v_week_start timestamp := date_trunc('week', now() at time zone 'Africa/Johannesburg');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select coalesce(sum(t.payout_cents) filter (where t.status = 'released'), 0),
         coalesce(sum(t.payout_cents) filter (where t.status = 'held'), 0)
    into v_released, v_held
  from public.transactions t where t.worker_id = v_uid;
  select coalesce(sum(c.amount_cents), 0) into v_cashed from private.counted_cashouts(v_uid) c;
  return json_build_object(
    'available_cents', greatest(v_released - v_cashed, 0),
    'held_cents', v_held,
    'earned_cents', v_released,
    'cashed_out_cents', v_cashed,
    'free_cashout_available', not exists (
      select 1 from private.counted_cashouts(v_uid) c where (c.created_at at time zone 'Africa/Johannesburg') >= v_week_start),
    'cash_today_cents', (
      select coalesce(sum(c.amount_cents), 0) from private.counted_cashouts(v_uid) c
      where c.method = 'cash' and (c.created_at at time zone 'Africa/Johannesburg')::date = v_today),
    'cashouts', (
      select coalesce(json_agg(json_build_object(
        'id', c.id, 'method', c.method, 'amount_cents', c.amount_cents, 'fee_cents', c.fee_cents,
        'destination', c.destination, 'reference', c.reference, 'status', c.status, 'created_at', c.created_at
      ) order by c.created_at desc), '[]'::json)
      from (select * from private.counted_cashouts(v_uid) x order by x.created_at desc limit 20) c)
  );
end $$;

create function public.request_cashout(
  p_method text, p_amount_cents integer, p_bank_name text, p_account_last4 text
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_available bigint;
  v_week_start timestamp := date_trunc('week', now() at time zone 'Africa/Johannesburg');
  v_month_start timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_fee integer;
  v_destination text;
  v_ref text;
  v_row public.wallet_cashouts;
  b bytea;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid;
  if not found then raise exception 'Please complete your profile first.' using errcode = '22023'; end if;
  if p_method is null or p_method not in ('bank', 'cash') then
    raise exception 'Choose how you want to cash out.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 5000 then
    raise exception 'The minimum cash-out is R50.' using errcode = '22023';
  end if;

  -- One cash-out at a time per worker, so two quick taps can't spend the same balance twice.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select coalesce((select sum(t.payout_cents) from public.transactions t where t.worker_id = v_uid and t.status = 'released'), 0)
       - coalesce((select sum(c.amount_cents) from private.counted_cashouts(v_uid) c), 0)
    into v_available;
  if p_amount_cents > v_available then
    raise exception 'You can cash out up to the R% available in your wallet.', trim(to_char(v_available / 100.0, 'FM999999990.00'))
      using errcode = '22023';
  end if;
  if (select count(*) from public.wallet_cashouts c where c.worker_id = v_uid and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have cashed out many times today. Please try again tomorrow.' using errcode = '54000';
  end if;

  if p_method = 'cash' then
    if p_amount_cents > 500000 then
      raise exception 'A cash voucher can be at most R5 000. Cash out to your bank account for more.' using errcode = '22023';
    end if;
    if (select coalesce(sum(c.amount_cents), 0) from private.counted_cashouts(v_uid) c
        where c.method = 'cash' and (c.created_at at time zone 'Africa/Johannesburg')::date = v_today) + p_amount_cents > 500000 then
      raise exception 'Cash vouchers are limited to R5 000 a day. Try a smaller amount or your bank account.' using errcode = '22023';
    end if;
    if (select coalesce(sum(c.amount_cents), 0) from private.counted_cashouts(v_uid) c
        where c.method = 'cash' and (c.created_at at time zone 'Africa/Johannesburg') >= v_month_start) + p_amount_cents > 2500000 then
      raise exception 'Cash vouchers are limited to R25 000 a month. Cash out to your bank account instead.' using errcode = '22023';
    end if;
    v_destination := 'Cash voucher by SMS';
  else
    if p_bank_name is null or char_length(btrim(p_bank_name)) not between 2 and 40 then
      raise exception 'Choose your bank.' using errcode = '22023';
    end if;
    if p_account_last4 is null or p_account_last4 !~ '^[0-9]{4}$' then
      raise exception 'Enter the last 4 digits of your account number.' using errcode = '22023';
    end if;
    v_destination := btrim(p_bank_name) || ' ending ' || p_account_last4;
  end if;

  -- The first cash-out each week (Monday to Sunday, SA time) is free; after that, what the payout costs SideGigs.
  v_fee := case
    when exists (select 1 from private.counted_cashouts(v_uid) c where (c.created_at at time zone 'Africa/Johannesburg') >= v_week_start)
      then case p_method when 'cash' then 2000 else 300 end
    else 0 end;
  if v_fee >= p_amount_cents then
    raise exception 'Cash out more than the R% fee.', v_fee / 100 using errcode = '22023';
  end if;

  loop
    b := extensions.gen_random_bytes(8);
    v_ref := 'CO-';
    for i in 0..7 loop
      v_ref := v_ref || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.wallet_cashouts c where c.reference = v_ref);
  end loop;

  insert into public.wallet_cashouts (worker_id, method, amount_cents, fee_cents, destination, reference, status, is_demo)
  values (v_uid, p_method, p_amount_cents, v_fee, v_destination, v_ref, 'paid', v_demo)
  returning * into v_row;
  return json_build_object(
    'id', v_row.id, 'method', v_row.method, 'amount_cents', v_row.amount_cents, 'fee_cents', v_row.fee_cents,
    'destination', v_row.destination, 'reference', v_row.reference, 'status', v_row.status, 'created_at', v_row.created_at);
end $$;

revoke all on function public.wallet_summary(), public.request_cashout(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.wallet_summary(), public.request_cashout(text, integer, text, text) to authenticated;
