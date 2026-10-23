-- iBanks financial truth layer (docs/IBANKS_ARCHITECTURE.md, docs/IBANKS_EVENT_CONTRACTS.md).
-- NOT YET APPLIED to the live project: apply only with the founder's approval (see docs/IMPLEMENTATION_STATUS.md).
--
-- What changes:
-- 1. Customer confirmation no longer marks money paid. confirm_completion keeps creating the verified portfolio
--    record, but the payment stays held until a SIGNED provider event (payment_settled) settles it.
-- 2. Provider events are authenticated in the database: HMAC-SHA256 over the exact payload text with a secret kept in
--    Supabase Vault (name 'ibanks_provider_webhook_secret'). No service-role key is needed or used anywhere.
-- 3. Append-only ledger in integer cents. Each provider event posts exactly once ((provider, event id) unique +
--    per-worker advisory lock); refunds/chargebacks are compensating entries; updates and deletes are blocked.
-- 4. Payouts are requested by the worker (payout_pending) and only become paid_out when the provider confirms.
-- 5. Outbox → iBanks dispatcher, worker-scoped insights, private decision audit, opt-in goal preferences.
-- Posting rules mirror src/lib/ibanks/ledger.ts; tests/ibanks-sql.test.ts checks they agree.

-- ── Tables ──────────────────────────────────────────────────────────────────
create table public.financial_provider_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('sandbox_payment_provider', 'kashwise_platform', 'legacy_backfill')),
  provider_event_id text not null,
  event_type text not null,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.gigs (id) on delete set null,
  payment_id text,
  payout_id text,
  payload jsonb not null,
  payload_sha256 text not null,
  signature_status text not null check (signature_status in ('verified', 'platform', 'backfill')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index financial_provider_events_worker_idx on public.financial_provider_events (worker_id, occurred_at);

create table public.financial_ledger_entries (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.gigs (id) on delete set null,
  payment_id text,
  payout_id text,
  provider text not null,
  event_id text not null,
  account text not null check (account in ('gross', 'platform_fee', 'net_earned', 'disputed_hold', 'payout_pending', 'paid_out')),
  amount_cents bigint not null check (amount_cents <> 0),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  occurred_at timestamptz not null,
  reversal_of text,
  posted_at timestamptz not null default now()
);
create index financial_ledger_entries_worker_idx on public.financial_ledger_entries (worker_id, occurred_at);

-- Payment-level state (one row per provider payment) used by the posting rules.
create table private.ibanks_payments (
  payment_id text primary key,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.gigs (id) on delete set null,
  state text not null check (state in ('settled', 'disputed', 'refunded')),
  gross_cents bigint not null,
  fee_cents bigint not null,
  processor_fee_cents bigint not null default 0,
  net_cents bigint not null,
  settle_event_id text not null
);
create unique index ibanks_payments_job_idx on private.ibanks_payments (job_id) where job_id is not null;

create table public.ibanks_event_outbox (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  event_id text not null,
  event_type text not null,
  dedupe_key text not null unique,
  state text not null default 'pending' check (state in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  created_at timestamptz not null default now()
);
create index ibanks_event_outbox_pending_idx on public.ibanks_event_outbox (available_at) where state = 'pending';

create table public.ibanks_insights (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (char_length(kind) <= 60),
  severity text not null check (severity in ('info', 'low', 'medium', 'high')),
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 1000),
  scope text not null,
  source_event_ids text[] not null default '{}',
  fact_snapshot jsonb not null default '{}',
  actions text[] not null default '{}',
  generated_by text not null default 'rules' check (generated_by in ('rules', 'ai')),
  status text not null default 'active' check (status in ('active', 'dismissed', 'resolved')),
  helpful boolean,
  data_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  dedupe_key text unique
);
create index ibanks_insights_worker_idx on public.ibanks_insights (worker_id, created_at desc);

create table public.ibanks_decision_audit (
  id bigint generated always as identity primary key,
  worker_id uuid references public.profiles (id) on delete set null,
  trigger_event_id text,
  ingest_status text,
  rule_id text,
  rule_version integer,
  proposed_action text,
  policy_outcome text,
  policy_version text,
  reason text,
  actor_type text not null check (actor_type in ('system_rule', 'agent', 'worker', 'ingest')),
  created_at timestamptz not null default now()
);
create index ibanks_decision_audit_worker_idx on public.ibanks_decision_audit (worker_id, created_at desc);

create table public.ibanks_worker_preferences (
  worker_id uuid primary key references public.profiles (id) on delete cascade,
  savings_bps integer not null default 0 check (savings_bps between 0 and 2000),
  retirement_bps integer not null default 0 check (retirement_bps between 0 and 2000),
  ai_explanations_opt_in boolean not null default false,
  consent_version text not null,
  updated_at timestamptz not null default now()
);

-- Payouts: requested by the worker, confirmed (or failed) only by the provider.
alter table public.wallet_cashouts drop constraint wallet_cashouts_status_check;
alter table public.wallet_cashouts add constraint wallet_cashouts_status_check check (status in ('processing', 'paid', 'failed'));
alter table public.wallet_cashouts alter column status set default 'processing';
alter table public.wallet_cashouts drop constraint wallet_cashouts_method_check;
alter table public.wallet_cashouts add constraint wallet_cashouts_method_check check (method in ('bank', 'cash', 'payshap', 'ewallet'));
alter table public.wallet_cashouts
  add column settled_at timestamptz,
  add column failure_reason text check (failure_reason is null or char_length(failure_reason) <= 120);

-- ── Append-only guarantees ──────────────────────────────────────────────────
create function private.ibanks_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Financial records are append-only: post a compensating entry instead.' using errcode = '42501';
end $$;
create trigger financial_ledger_entries_append_only before update or delete on public.financial_ledger_entries
  for each row execute function private.ibanks_append_only();
create trigger financial_provider_events_append_only before update or delete on public.financial_provider_events
  for each row execute function private.ibanks_append_only();

-- ── RLS: workers read only their own money; nobody writes except through the RPCs below ───────────────────
alter table public.financial_provider_events enable row level security;
alter table public.financial_ledger_entries enable row level security;
alter table private.ibanks_payments enable row level security;
alter table public.ibanks_event_outbox enable row level security;
alter table public.ibanks_insights enable row level security;
alter table public.ibanks_decision_audit enable row level security;
alter table public.ibanks_worker_preferences enable row level security;
revoke all on public.financial_provider_events, public.financial_ledger_entries, public.ibanks_event_outbox,
  public.ibanks_insights, public.ibanks_decision_audit, public.ibanks_worker_preferences, private.ibanks_payments
  from public, anon, authenticated;

create policy "Workers read their own ledger" on public.financial_ledger_entries for select to authenticated
  using (worker_id = (select auth.uid()));
grant select on public.financial_ledger_entries to authenticated;
create policy "Workers read their own insights" on public.ibanks_insights for select to authenticated
  using (worker_id = (select auth.uid()));
grant select on public.ibanks_insights to authenticated;
create policy "Workers read their own preferences" on public.ibanks_worker_preferences for select to authenticated
  using (worker_id = (select auth.uid()));
grant select on public.ibanks_worker_preferences to authenticated;
-- financial_provider_events, outbox, decision audit and payment state: no client access at all.

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Verifies an HMAC-SHA256 (hex) over the exact payload text. Fails closed when the secret is not configured.
create function private.ibanks_verify_signature(p_payload text, p_signature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_secret text;
begin
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'ibanks_provider_webhook_secret';
  if v_secret is null or char_length(v_secret) < 32 then
    raise exception 'Provider webhook secret is not configured.' using errcode = '55000';
  end if;
  if p_payload is null or p_signature is null or p_signature !~ '^[0-9a-f]{64}$' or octet_length(p_payload) > 16384 then
    return false;
  end if;
  return encode(extensions.hmac(convert_to(p_payload, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex') = p_signature;
end $$;

create function private.ibanks_audit(
  p_worker uuid, p_event text, p_status text, p_rule text, p_action text, p_outcome text, p_reason text, p_actor text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ibanks_decision_audit (worker_id, trigger_event_id, ingest_status, rule_id, rule_version, proposed_action,
                                            policy_outcome, policy_version, reason, actor_type)
  values (p_worker, p_event, p_status, p_rule, case when p_rule is null then null else 1 end, p_action, p_outcome,
          'policy-2026-10-08.1', left(p_reason, 200), p_actor);
$$;

create function private.ibanks_available_cents(p_worker uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when account = 'net_earned' then amount_cents
                           when account in ('paid_out', 'payout_pending', 'disputed_hold') then -amount_cents
                           else 0 end), 0)
  from public.financial_ledger_entries where worker_id = p_worker;
$$;

-- ── The posting engine (mirror of src/lib/ibanks/ledger.ts applyEvent) ─────────────────────────────────────
-- p_event is already authenticated by the caller. Returns {status, event_id, reason, worker_id}.
create function private.ibanks_post_event(p_event jsonb, p_provider text, p_signature_status text, p_raw text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_event ->> 'event_type';
  v_eid text := p_event ->> 'event_id';
  v_worker uuid;
  v_job uuid;
  v_payment text := nullif(p_event ->> 'payment_id', '');
  v_payout text := nullif(p_event ->> 'payout_id', '');
  v_at timestamptz;
  v_gross bigint;
  v_fee bigint;
  v_proc bigint;
  v_net bigint;
  v_amount bigint;
  v_pay private.ibanks_payments;
  v_co public.wallet_cashouts;
  v_entries jsonb := '[]'::jsonb;
  e jsonb;
  function_result json;
begin
  -- Contract validation (same rules as providerEventSchema in src/lib/ibanks/contracts.ts).
  begin
    v_worker := (p_event ->> 'worker_id')::uuid;
    v_job := nullif(p_event ->> 'job_id', '')::uuid;
    v_at := (p_event ->> 'occurred_at')::timestamptz;
    v_gross := coalesce((p_event ->> 'gross_cents')::bigint, 0);
    v_fee := coalesce((p_event ->> 'marketplace_fee_cents')::bigint, 0);
    v_proc := coalesce((p_event ->> 'processor_fee_cents')::bigint, 0);
    v_net := coalesce((p_event ->> 'worker_net_cents')::bigint, 0);
    v_amount := coalesce((p_event ->> 'amount_cents')::bigint, 0);
  exception when others then
    return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'malformed fields');
  end;
  if v_eid is null or v_eid !~ '^[A-Za-z0-9_.:-]{1,100}$' or v_worker is null or v_at is null
     or (p_event ->> 'schema_version') is distinct from '1' or (p_event ->> 'currency') is distinct from 'ZAR'
     or (p_event ->> 'simulation') is distinct from 'true'
     or least(v_gross, v_fee, v_proc, v_net, v_amount) < 0 or greatest(v_gross, v_amount) > 500000000 then
    return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'event fails the contract');
  end if;
  if v_type in ('payment_settled', 'payment_disputed', 'dispute_resolved', 'refund_settled', 'chargeback_confirmed') then
    if v_payment is null or v_job is null or v_gross = 0 or v_gross <> v_fee + v_net then
      return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'gross must equal marketplace fee + worker net');
    end if;
  elsif v_type in ('payout_requested', 'payout_settled', 'payout_failed') then
    if v_payout is null or v_amount = 0 then
      return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'payout events need payout_id and amount');
    end if;
    -- Only KashWise itself requests payouts; only the provider confirms them.
    if (v_type = 'payout_requested') <> (p_provider = 'kashwise_platform') then
      return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'wrong source for this payout event');
    end if;
  else
    return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'unknown event type');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_worker) then
    return json_build_object('status', 'invalid', 'event_id', v_eid, 'reason', 'unknown worker');
  end if;

  -- One event at a time per worker; the unique key below makes a replay a no-op even across sessions.
  perform pg_advisory_xact_lock(hashtextextended('ibanks:' || v_worker::text, 0));
  if exists (select 1 from public.financial_provider_events f where f.provider = p_provider and f.provider_event_id = v_eid) then
    perform private.ibanks_audit(v_worker, v_eid, 'duplicate', 'R001_provider_replay', 'audit_only', 'allow', 'provider event already processed', 'system_rule');
    return json_build_object('status', 'duplicate', 'event_id', v_eid, 'reason', 'provider event already processed', 'worker_id', v_worker);
  end if;

  if v_payment is not null then
    select * into v_pay from private.ibanks_payments p where p.payment_id = v_payment for update;
  end if;

  case v_type
    when 'payment_settled' then
      if v_pay.payment_id is not null then
        function_result := json_build_object('status', 'rejected', 'reason', 'payment already settled by another event');
      elsif exists (select 1 from private.ibanks_payments p where p.job_id = v_job) then
        function_result := json_build_object('status', 'rejected', 'reason', 'this job already has a settled payment');
      elsif not exists (select 1 from public.gigs g where g.id = v_job and g.assigned_worker_id = v_worker and g.status = 'completed') then
        function_result := json_build_object('status', 'rejected', 'reason', 'job is not a completed job of this worker');
      else
        insert into private.ibanks_payments (payment_id, worker_id, job_id, state, gross_cents, fee_cents, processor_fee_cents, net_cents, settle_event_id)
        values (v_payment, v_worker, v_job, 'settled', v_gross, v_fee, v_proc, v_net, v_eid);
        v_entries := jsonb_build_array(
          jsonb_build_object('account', 'gross', 'amount', v_gross),
          jsonb_build_object('account', 'platform_fee', 'amount', v_fee),
          jsonb_build_object('account', 'net_earned', 'amount', v_net));
        update public.transactions t set status = 'released', settled_at = v_at where t.gig_id = v_job and t.status = 'held';
        insert into public.gig_events (gig_id, actor_id, kind, detail) values (v_job, null, 'payment_settled', v_eid);
      end if;
    when 'payment_disputed' then
      if v_pay.payment_id is null then function_result := json_build_object('status', 'out_of_order', 'reason', 'payment not settled yet');
      elsif v_pay.state <> 'settled' then function_result := json_build_object('status', 'rejected', 'reason', 'cannot dispute a ' || v_pay.state || ' payment');
      else
        update private.ibanks_payments p set state = 'disputed' where p.payment_id = v_payment;
        v_entries := jsonb_build_array(jsonb_build_object('account', 'disputed_hold', 'amount', v_pay.net_cents));
      end if;
    when 'dispute_resolved' then
      if v_pay.payment_id is null then function_result := json_build_object('status', 'out_of_order', 'reason', 'payment not settled yet');
      elsif v_pay.state <> 'disputed' then function_result := json_build_object('status', 'rejected', 'reason', 'no open dispute on this payment');
      else
        update private.ibanks_payments p set state = 'settled' where p.payment_id = v_payment;
        v_entries := jsonb_build_array(jsonb_build_object('account', 'disputed_hold', 'amount', -v_pay.net_cents));
      end if;
    when 'refund_settled', 'chargeback_confirmed' then
      if v_pay.payment_id is null then function_result := json_build_object('status', 'out_of_order', 'reason', 'payment not settled yet');
      elsif v_pay.state = 'refunded' then function_result := json_build_object('status', 'rejected', 'reason', 'payment already reversed');
      elsif v_gross <> v_pay.gross_cents or v_net <> v_pay.net_cents then
        function_result := json_build_object('status', 'rejected', 'reason', 'only full reversals are supported; amounts must match the settlement');
      else
        v_entries := jsonb_build_array(
          jsonb_build_object('account', 'gross', 'amount', -v_pay.gross_cents, 'reversal_of', v_pay.settle_event_id),
          jsonb_build_object('account', 'platform_fee', 'amount', -v_pay.fee_cents, 'reversal_of', v_pay.settle_event_id),
          jsonb_build_object('account', 'net_earned', 'amount', -v_pay.net_cents, 'reversal_of', v_pay.settle_event_id));
        if v_pay.state = 'disputed' then
          v_entries := v_entries || jsonb_build_array(jsonb_build_object('account', 'disputed_hold', 'amount', -v_pay.net_cents, 'reversal_of', v_pay.settle_event_id));
        end if;
        update private.ibanks_payments p set state = 'refunded' where p.payment_id = v_payment;
        update public.transactions t set status = 'refunded' where t.gig_id = v_pay.job_id;
        insert into public.gig_events (gig_id, actor_id, kind, detail) values (v_pay.job_id, null, 'payment_refunded', v_eid);
      end if;
    when 'payout_requested' then
      if exists (select 1 from public.financial_ledger_entries l where l.payout_id = v_payout and l.account = 'payout_pending') then
        function_result := json_build_object('status', 'rejected', 'reason', 'payout already requested');
      elsif v_amount > private.ibanks_available_cents(v_worker) then
        function_result := json_build_object('status', 'rejected', 'reason', 'payout exceeds available earnings');
      else
        v_entries := jsonb_build_array(jsonb_build_object('account', 'payout_pending', 'amount', v_amount));
      end if;
    when 'payout_settled', 'payout_failed' then
      select * into v_co from public.wallet_cashouts c where c.reference = v_payout for update;
      if v_co.id is null then function_result := json_build_object('status', 'out_of_order', 'reason', 'payout not requested yet');
      elsif v_co.worker_id <> v_worker or v_co.amount_cents <> v_amount then
        function_result := json_build_object('status', 'rejected', 'reason', 'payout does not match the request');
      elsif v_co.status <> 'processing' then
        function_result := json_build_object('status', 'rejected', 'reason', 'payout already ' || v_co.status);
      elsif v_type = 'payout_settled' then
        update public.wallet_cashouts c set status = 'paid', settled_at = v_at where c.id = v_co.id;
        v_entries := jsonb_build_array(
          jsonb_build_object('account', 'payout_pending', 'amount', -v_amount),
          jsonb_build_object('account', 'paid_out', 'amount', v_amount));
      else
        update public.wallet_cashouts c set status = 'failed', failure_reason = left(p_event ->> 'failure_reason', 120) where c.id = v_co.id;
        v_entries := jsonb_build_array(jsonb_build_object('account', 'payout_pending', 'amount', -v_amount));
      end if;
  end case;

  if function_result is not null then
    perform private.ibanks_audit(v_worker, v_eid, function_result ->> 'status', null, 'audit_only', 'allow', function_result ->> 'reason', 'ingest');
    return json_build_object('status', function_result ->> 'status', 'event_id', v_eid, 'reason', function_result ->> 'reason', 'worker_id', v_worker);
  end if;

  insert into public.financial_provider_events (provider, provider_event_id, event_type, worker_id, job_id, payment_id, payout_id,
                                                payload, payload_sha256, signature_status, occurred_at)
  values (p_provider, v_eid, v_type, v_worker, coalesce(v_job, v_pay.job_id), v_payment, v_payout, p_event,
          encode(sha256(convert_to(coalesce(p_raw, p_event::text), 'UTF8')), 'hex'), p_signature_status, v_at);
  for e in select * from jsonb_array_elements(v_entries) loop
    insert into public.financial_ledger_entries (worker_id, job_id, payment_id, payout_id, provider, event_id, account, amount_cents, occurred_at, reversal_of)
    values (v_worker, coalesce(v_job, v_pay.job_id), v_payment, v_payout, p_provider, v_eid, e ->> 'account', (e ->> 'amount')::bigint, v_at, e ->> 'reversal_of');
  end loop;
  -- Backfilled history is recorded, but must not wake iBanks with "new payment" alerts for old jobs.
  if p_provider <> 'legacy_backfill' then
    insert into public.ibanks_event_outbox (worker_id, event_id, event_type, dedupe_key)
    values (v_worker, v_eid, v_type, p_provider || ':' || v_eid);
  end if;
  perform private.ibanks_audit(v_worker, v_eid, 'posted', null, 'audit_only', 'allow', v_type, 'ingest');
  return json_build_object('status', 'posted', 'event_id', v_eid, 'worker_id', v_worker, 'entries', jsonb_array_length(v_entries));
end $$;

-- ── Public RPCs ─────────────────────────────────────────────────────────────
-- Trusted provider webhook entry point. Callable with the publishable key, but useless without the Vault secret:
-- the signature is checked here, in the database, before anything is read or written.
create function public.ibanks_ingest_provider_event(p_payload text, p_signature text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_event jsonb;
begin
  if not private.ibanks_verify_signature(p_payload, p_signature) then
    perform private.ibanks_audit(null, null, 'signature_invalid', null, 'audit_only', 'deny', 'bad provider signature', 'ingest');
    raise exception 'Invalid provider signature.' using errcode = '42501';
  end if;
  v_event := p_payload::jsonb;
  if (v_event ->> 'source') is distinct from 'sandbox_payment_provider' then
    raise exception 'Unknown provider.' using errcode = '22023';
  end if;
  return private.ibanks_post_event(v_event, 'sandbox_payment_provider', 'verified', p_payload);
end $$;

-- Signed server-side read of one worker's financial context, for the iBanks dispatcher (netlify function).
-- Payload: {"worker_id": "...", "issued_at": "<ISO>"}; rejected after 5 minutes.
create function public.ibanks_worker_context(p_payload text, p_signature text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_req jsonb;
  v_worker uuid;
begin
  if not private.ibanks_verify_signature(p_payload, p_signature) then
    raise exception 'Invalid signature.' using errcode = '42501';
  end if;
  v_req := p_payload::jsonb;
  v_worker := (v_req ->> 'worker_id')::uuid;
  if abs(extract(epoch from now() - (v_req ->> 'issued_at')::timestamptz)) > 300 then
    raise exception 'Request expired.' using errcode = '42501';
  end if;
  return json_build_object(
    'entries', (select coalesce(json_agg(json_build_object(
        'worker_id', l.worker_id, 'job_id', l.job_id, 'payment_id', l.payment_id, 'payout_id', l.payout_id, 'event_id', l.event_id,
        'account', l.account, 'amount_cents', l.amount_cents, 'occurred_at', l.occurred_at, 'reversal_of', l.reversal_of) order by l.id), '[]'::json)
      from public.financial_ledger_entries l where l.worker_id = v_worker),
    'payouts', (select coalesce(json_agg(json_build_object(
        'payout_id', c.reference, 'requested_at', c.created_at, 'amount_cents', c.amount_cents,
        'destination_label', c.destination, 'state', case c.status when 'processing' then 'requested' when 'paid' then 'settled' else 'failed' end)
      order by c.created_at), '[]'::json) from public.wallet_cashouts c where c.worker_id = v_worker),
    'jobs', (select coalesce(json_agg(json_build_object('id', g.id, 'title', g.title, 'category', g.category)), '[]'::json)
      from public.gigs g where g.assigned_worker_id = v_worker and g.status = 'completed')
  );
end $$;

-- Signed write of the dispatcher's insights and policy decisions; marks the outbox row done. Idempotent per insight.
create function public.ibanks_record_dispatch(p_payload text, p_signature text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req jsonb;
  i jsonb;
  a jsonb;
begin
  if not private.ibanks_verify_signature(p_payload, p_signature) then
    raise exception 'Invalid signature.' using errcode = '42501';
  end if;
  v_req := p_payload::jsonb;
  for i in select * from jsonb_array_elements(coalesce(v_req -> 'insights', '[]'::jsonb)) loop
    insert into public.ibanks_insights (worker_id, kind, severity, title, body, scope, source_event_ids, fact_snapshot, actions,
                                        generated_by, data_as_of, dedupe_key)
    values ((i ->> 'worker_id')::uuid, i ->> 'kind', i ->> 'severity', i ->> 'title', i ->> 'body', i ->> 'scope',
            array(select jsonb_array_elements_text(i -> 'source_event_ids')), coalesce(i -> 'fact_snapshot', '{}'),
            array(select jsonb_array_elements_text(i -> 'actions')), 'rules', (i ->> 'data_as_of')::timestamptz,
            (i ->> 'kind') || ':' || (i -> 'source_event_ids' ->> 0))
    on conflict (dedupe_key) do nothing;
  end loop;
  for a in select * from jsonb_array_elements(coalesce(v_req -> 'audits', '[]'::jsonb)) loop
    insert into public.ibanks_decision_audit (worker_id, trigger_event_id, ingest_status, rule_id, rule_version, proposed_action,
                                              policy_outcome, policy_version, reason, actor_type)
    values ((a ->> 'worker_id')::uuid, a ->> 'trigger_event_id', a ->> 'ingest_status', a ->> 'rule_id', (a ->> 'rule_version')::integer,
            a ->> 'proposed_action', a #>> '{decision,outcome}', a #>> '{decision,policy_version}', left(a #>> '{decision,reason}', 200), 'system_rule');
  end loop;
  update public.ibanks_event_outbox o set state = 'done', attempts = o.attempts + 1
  where o.dedupe_key = v_req ->> 'outbox_key';
end $$;

-- Pending outbox rows (retry path for a scheduled dispatcher). Signed like the others.
create function public.ibanks_claim_outbox(p_payload text, p_signature text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not private.ibanks_verify_signature(p_payload, p_signature) then
    raise exception 'Invalid signature.' using errcode = '42501';
  end if;
  return (
    with claimed as (
      update public.ibanks_event_outbox o set attempts = o.attempts + 1,
        available_at = now() + make_interval(secs => least(3600, 30 * power(2, o.attempts)::int)),
        state = case when o.attempts >= 8 then 'failed' else o.state end
      where o.id in (select x.id from public.ibanks_event_outbox x where x.state = 'pending' and x.available_at <= now()
                     order by x.id limit 20 for update skip locked)
      returning o.*)
    select coalesce(json_agg(json_build_object('worker_id', c.worker_id, 'event_id', c.event_id, 'event_type', c.event_type,
      'dedupe_key', c.dedupe_key, 'payload', f.payload)), '[]'::json)
    from claimed c join public.financial_provider_events f on f.provider || ':' || f.provider_event_id = c.dedupe_key);
end $$;

-- Worker: dismiss an insight or say whether it helped (feedback for the learning loop).
create function public.ibanks_insight_feedback(p_insight uuid, p_status text, p_helpful boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('active', 'dismissed', 'resolved') then
    raise exception 'Invalid status.' using errcode = '22023';
  end if;
  update public.ibanks_insights i set status = coalesce(p_status, i.status), helpful = coalesce(p_helpful, i.helpful)
  where i.id = p_insight and i.worker_id = auth.uid();
  if not found then raise exception 'You can only update your own insights.' using errcode = '42501'; end if;
end $$;

-- Worker: opt-in savings/retirement SIMULATION settings. Nothing is ever deducted.
create function public.ibanks_save_preferences(p_savings_bps integer, p_retirement_bps integer, p_ai_opt_in boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  if p_savings_bps not between 0 and 2000 or p_retirement_bps not between 0 and 2000 then
    raise exception 'Each goal can be between 0%% and 20%%.' using errcode = '22023';
  end if;
  insert into public.ibanks_worker_preferences (worker_id, savings_bps, retirement_bps, ai_explanations_opt_in, consent_version)
  values (auth.uid(), p_savings_bps, p_retirement_bps, coalesce(p_ai_opt_in, false), 'ibanks-consent-2026-10-08')
  on conflict (worker_id) do update set savings_bps = excluded.savings_bps, retirement_bps = excluded.retirement_bps,
    ai_explanations_opt_in = excluded.ai_explanations_opt_in, consent_version = excluded.consent_version, updated_at = now();
end $$;

-- ── Customer confirmation no longer pays anyone ─────────────────────────────
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
  -- The payment stays 'held' (authorised) until the payment provider's signed payment_settled event arrives.

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
    (p_gig, v_uid, 'payment_settlement_pending', null),
    (p_gig, v_uid, 'portfolio_record', v_code);
  return v_item;
end $$;

-- ── Wallet: balances come from the ledger; payouts start 'processing' ───────────────────────────────────
create or replace function public.wallet_summary() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_week_start timestamp := date_trunc('week', now() at time zone 'Africa/Johannesburg');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  b record;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select coalesce(sum(amount_cents) filter (where account = 'net_earned'), 0) as earned,
         coalesce(sum(amount_cents) filter (where account = 'paid_out'), 0) as paid,
         coalesce(sum(amount_cents) filter (where account = 'payout_pending'), 0) as pending,
         coalesce(sum(amount_cents) filter (where account = 'disputed_hold'), 0) as held
    into b from public.financial_ledger_entries where worker_id = v_uid;
  return json_build_object(
    'available_cents', greatest(b.earned - b.paid - b.pending - b.held, 0),
    'held_cents', (select coalesce(sum(t.payout_cents), 0) from public.transactions t where t.worker_id = v_uid and t.status = 'held') + b.held,
    'earned_cents', b.earned,
    'cashed_out_cents', b.paid,
    'payout_pending_cents', b.pending,
    'free_cashout_available', not exists (
      select 1 from public.wallet_cashouts c where c.worker_id = v_uid and c.status <> 'failed'
        and (c.created_at at time zone 'Africa/Johannesburg') >= v_week_start),
    'cash_today_cents', (
      select coalesce(sum(c.amount_cents), 0) from public.wallet_cashouts c
      where c.worker_id = v_uid and c.method in ('cash', 'ewallet') and c.status <> 'failed'
        and (c.created_at at time zone 'Africa/Johannesburg')::date = v_today),
    'cashouts', (
      select coalesce(json_agg(json_build_object(
        'id', c.id, 'method', c.method, 'amount_cents', c.amount_cents, 'fee_cents', c.fee_cents,
        'destination', c.destination, 'reference', c.reference, 'status', c.status, 'created_at', c.created_at,
        'settled_at', c.settled_at, 'failure_reason', c.failure_reason
      ) order by c.created_at desc), '[]'::json)
      from (select * from public.wallet_cashouts x where x.worker_id = v_uid order by x.created_at desc limit 20) c)
  );
end $$;

-- p_bank_name / p_account_last4: for 'bank' the bank and last 4 digits; for 'payshap' a ShapID label is masked the
-- same way; for 'ewallet'/'cash' the last 4 digits of the cellphone number. Full numbers are never stored here.
create or replace function public.request_cashout(
  p_method text, p_amount_cents integer, p_bank_name text, p_account_last4 text
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_uid uuid := auth.uid();
  v_demo boolean;
  v_available bigint;
  v_week_start timestamp := date_trunc('week', now() at time zone 'Africa/Johannesburg');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_fee integer;
  v_destination text;
  v_ref text;
  v_row public.wallet_cashouts;
  v_post json;
  b bytea;
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  select p.is_demo into v_demo from public.profiles p where p.id = v_uid;
  if not found then raise exception 'Please complete your profile first.' using errcode = '22023'; end if;
  if p_method is null or p_method not in ('bank', 'cash', 'payshap', 'ewallet') then
    raise exception 'Choose how you want to be paid out.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 5000 then
    raise exception 'The minimum cash-out is R50.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ibanks:' || v_uid::text, 0));
  v_available := private.ibanks_available_cents(v_uid);
  if p_amount_cents > v_available then
    raise exception 'You can cash out up to the R% available in your wallet.', trim(to_char(v_available / 100.0, 'FM999999990.00'))
      using errcode = '22023';
  end if;
  if (select count(*) from public.wallet_cashouts c where c.worker_id = v_uid and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have cashed out many times today. Please try again tomorrow.' using errcode = '54000';
  end if;

  if p_account_last4 is null or p_account_last4 !~ '^[0-9]{4}$' then
    raise exception 'Enter the last 4 digits.' using errcode = '22023';
  end if;
  if p_method in ('cash', 'ewallet') then
    -- Existing cash limits (unchanged): R5 000 per voucher and per day, R25 000 a month. eWallet payouts also follow
    -- FNB's public consumer eWallet limit of R3 000 per send (fnb.co.za, Oct 2026); confirm in the FNB agreement.
    if p_method = 'ewallet' and p_amount_cents > 300000 then
      raise exception 'An eWallet payout can be at most R3 000. Choose a bank account or PayShap for more.' using errcode = '22023';
    end if;
    if p_amount_cents > 500000 then
      raise exception 'A cash voucher can be at most R5 000. Cash out to your bank account for more.' using errcode = '22023';
    end if;
    if (select coalesce(sum(c.amount_cents), 0) from public.wallet_cashouts c
        where c.worker_id = v_uid and c.method in ('cash', 'ewallet') and c.status <> 'failed'
          and (c.created_at at time zone 'Africa/Johannesburg')::date = v_today) + p_amount_cents > 500000 then
      raise exception 'Cash payouts are limited to R5 000 a day. Try a smaller amount or your bank account.' using errcode = '22023';
    end if;
    if (select coalesce(sum(c.amount_cents), 0) from public.wallet_cashouts c
        where c.worker_id = v_uid and c.method in ('cash', 'ewallet') and c.status <> 'failed'
          and (c.created_at at time zone 'Africa/Johannesburg') >= date_trunc('month', now() at time zone 'Africa/Johannesburg')) + p_amount_cents > 2500000 then
      raise exception 'Cash payouts are limited to R25 000 a month. Cash out to your bank account instead.' using errcode = '22023';
    end if;
    v_destination := case p_method when 'ewallet' then 'eWallet to cellphone ending ' else 'Cash voucher to cellphone ending ' end || p_account_last4;
  elsif p_method = 'payshap' then
    v_destination := 'PayShap ShapID ending ' || p_account_last4;
  else
    if p_bank_name is null or char_length(btrim(p_bank_name)) not between 2 and 40 then
      raise exception 'Choose your bank.' using errcode = '22023';
    end if;
    v_destination := btrim(p_bank_name) || ' ending ' || p_account_last4;
  end if;

  -- First payout each week free; after that the existing fees: R3 to an account (bank, PayShap), R20 for cash
  -- (voucher, eWallet). Placeholder costs, not FNB pricing; real provider fees are recorded from provider events.
  v_fee := case
    when exists (select 1 from public.wallet_cashouts c where c.worker_id = v_uid and c.status <> 'failed'
                 and (c.created_at at time zone 'Africa/Johannesburg') >= v_week_start)
      then case when p_method in ('bank', 'payshap') then 300 else 2000 end
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
  values (v_uid, p_method, p_amount_cents, v_fee, v_destination, v_ref, 'processing', v_demo)
  returning * into v_row;

  -- KashWise's own payout_requested event: pending until the provider confirms or fails it.
  v_post := private.ibanks_post_event(jsonb_build_object(
    'event_id', 'po_req_' || v_ref, 'schema_version', 1, 'event_type', 'payout_requested', 'occurred_at', now(),
    'source', 'kashwise_platform', 'worker_id', v_uid, 'job_id', null, 'payment_id', null, 'payout_id', v_ref,
    'provider_ref', v_ref, 'currency', 'ZAR', 'gross_cents', 0, 'marketplace_fee_cents', 0, 'processor_fee_cents', 0,
    'worker_net_cents', 0, 'amount_cents', p_amount_cents, 'destination_label', v_destination, 'failure_reason', null,
    'simulation', true), 'kashwise_platform', 'platform', null);
  if (v_post ->> 'status') <> 'posted' then
    raise exception 'Could not record the payout request (%).', v_post ->> 'reason' using errcode = '22023';
  end if;
  return json_build_object(
    'id', v_row.id, 'method', v_row.method, 'amount_cents', v_row.amount_cents, 'fee_cents', v_row.fee_cents,
    'destination', v_row.destination, 'reference', v_row.reference, 'status', v_row.status, 'created_at', v_row.created_at);
end $$;

-- ── Backfill: existing released payments and paid cash-outs become ledger history ──────────────────────
do $$
declare
  t record;
  c record;
  v jsonb;
begin
  -- transactions.payout_cents is the worker's net and fee_cents the KashWise fee, so gross = fee + net by construction.
  for t in select tr.*, tr.fee_cents + tr.payout_cents as price from public.transactions tr
           where tr.status = 'released' and tr.settled_at is not null order by tr.settled_at loop
    v := jsonb_build_object('event_id', 'backfill_pay_' || t.id, 'schema_version', 1, 'event_type', 'payment_settled',
      'occurred_at', t.settled_at, 'source', 'legacy_backfill', 'worker_id', t.worker_id, 'job_id', t.gig_id,
      'payment_id', 'legacy_' || t.id, 'payout_id', null, 'provider_ref', 'legacy_' || t.id, 'currency', 'ZAR',
      'gross_cents', t.price, 'marketplace_fee_cents', t.fee_cents, 'processor_fee_cents', 0,
      'worker_net_cents', t.payout_cents, 'amount_cents', 0, 'simulation', true);
    perform private.ibanks_post_event(v, 'legacy_backfill', 'backfill', null);
  end loop;
  -- Shared demo accounts' expired cash-outs (older than 30 min) were never counted, so they are not carried over.
  for c in select * from public.wallet_cashouts x where x.status = 'paid' and (not x.is_demo or x.created_at > now() - interval '30 minutes')
           order by x.created_at loop
    insert into public.financial_ledger_entries (worker_id, payout_id, provider, event_id, account, amount_cents, occurred_at)
    select c.worker_id, c.reference, 'legacy_backfill', 'backfill_po_' || c.reference, 'paid_out', c.amount_cents, c.created_at
    where private.ibanks_available_cents(c.worker_id) >= c.amount_cents;
  end loop;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on function private.ibanks_verify_signature(text, text), private.ibanks_audit(uuid, text, text, text, text, text, text, text),
  private.ibanks_available_cents(uuid), private.ibanks_post_event(jsonb, text, text, text), private.ibanks_append_only()
  from public, anon, authenticated;
revoke all on function public.ibanks_ingest_provider_event(text, text), public.ibanks_worker_context(text, text),
  public.ibanks_record_dispatch(text, text), public.ibanks_claim_outbox(text, text),
  public.ibanks_insight_feedback(uuid, text, boolean), public.ibanks_save_preferences(integer, integer, boolean)
  from public, anon, authenticated;
-- Server-signed RPCs: reachable with the publishable key, authenticated by the Vault-held HMAC secret.
grant execute on function public.ibanks_ingest_provider_event(text, text), public.ibanks_worker_context(text, text),
  public.ibanks_record_dispatch(text, text), public.ibanks_claim_outbox(text, text) to anon, authenticated;
grant execute on function public.ibanks_insight_feedback(uuid, text, boolean), public.ibanks_save_preferences(integer, integer, boolean)
  to authenticated;
