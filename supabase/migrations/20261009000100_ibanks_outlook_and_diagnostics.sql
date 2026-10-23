-- iBanks intelligence, part 2 (KashWise, 9 Oct 2026). Additive; no table changes and no data rewritten.
--  1. ibanks_record_dispatch: a new 'forecast:' or 'pattern:' insight supersedes the worker's earlier one of the same
--     kind (marked 'resolved', never deleted), so the Money screen shows one current outlook.
--  2. ibanks_worker_context: jobs also carry completed_at and an opaque client_key (hash) for pattern detection.
--  3. ibanks_my_diagnostics(): a worker can see how iBanks reached its decisions about THEIR money — triggering
--     events, rule/policy versions and outcomes, outbox state — and nothing about anyone else.
-- Rollback: re-run the two function bodies from 20261008000100_ibanks_ledger.sql and drop ibanks_my_diagnostics().

create or replace function public.ibanks_record_dispatch(p_payload text, p_signature text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req jsonb;
  i jsonb;
  a jsonb;
  v_key text;
begin
  if not private.ibanks_verify_signature(p_payload, p_signature) then
    raise exception 'Invalid signature.' using errcode = '42501';
  end if;
  v_req := p_payload::jsonb;
  for i in select * from jsonb_array_elements(coalesce(v_req -> 'insights', '[]'::jsonb)) loop
    v_key := (i ->> 'kind') || ':' || (i -> 'source_event_ids' ->> 0);
    if (i ->> 'kind') like 'forecast:%' or (i ->> 'kind') like 'pattern:%' then
      update public.ibanks_insights x set status = 'resolved'
      where x.worker_id = (i ->> 'worker_id')::uuid and x.kind = i ->> 'kind' and x.status = 'active'
        and x.dedupe_key is distinct from v_key;
    end if;
    insert into public.ibanks_insights (worker_id, kind, severity, title, body, scope, source_event_ids, fact_snapshot, actions,
                                        generated_by, data_as_of, dedupe_key)
    values ((i ->> 'worker_id')::uuid, i ->> 'kind', i ->> 'severity', i ->> 'title', i ->> 'body', i ->> 'scope',
            array(select jsonb_array_elements_text(i -> 'source_event_ids')), coalesce(i -> 'fact_snapshot', '{}'),
            array(select jsonb_array_elements_text(i -> 'actions')), 'rules', (i ->> 'data_as_of')::timestamptz, v_key)
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

create or replace function public.ibanks_worker_context(p_payload text, p_signature text) returns json
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
    'jobs', (select coalesce(json_agg(json_build_object('id', g.id, 'title', g.title, 'category', g.category,
        'completed_at', g.completed_at,
        -- Opaque: lets iBanks count repeat clients without ever seeing who they are.
        'client_key', left(encode(sha256(convert_to('kw-client:' || g.customer_id::text, 'UTF8')), 'hex'), 16))), '[]'::json)
      from public.gigs g where g.assigned_worker_id = v_worker and g.status = 'completed')
  );
end $$;

create function public.ibanks_my_diagnostics() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Please sign in first.' using errcode = '42501'; end if;
  return json_build_object(
    'decisions', (select coalesce(json_agg(json_build_object(
        'at', d.created_at, 'trigger_event_id', d.trigger_event_id, 'ingest_status', d.ingest_status, 'rule_id', d.rule_id,
        'rule_version', d.rule_version, 'proposed_action', d.proposed_action, 'policy_outcome', d.policy_outcome,
        'policy_version', d.policy_version, 'reason', d.reason, 'actor', d.actor_type) order by d.id desc), '[]'::json)
      from (select * from public.ibanks_decision_audit x where x.worker_id = v_uid order by x.id desc limit 40) d),
    'events', (select coalesce(json_agg(json_build_object(
        'event_id', o.event_id, 'event_type', o.event_type, 'state', o.state, 'attempts', o.attempts, 'received_at', o.created_at)
      order by o.id desc), '[]'::json)
      from (select * from public.ibanks_event_outbox x where x.worker_id = v_uid order by x.id desc limit 20) o),
    'ledger_entries', (select count(*) from public.financial_ledger_entries l where l.worker_id = v_uid),
    'as_of', now()
  );
end $$;

revoke all on function public.ibanks_my_diagnostics() from public, anon, authenticated;
grant execute on function public.ibanks_my_diagnostics() to authenticated;
-- create or replace keeps the earlier grants on the two replaced functions (server-signed, reachable with the publishable key).

-- 4. KashWise Proof levels. A portfolio record exists only after the client confirmed the job (client-confirmed);
--    it becomes payment-confirmed once the payment provider's settlement for that job is posted and not reversed.
--    Public, like the portfolio itself, and it reveals no amounts. Disputed or refunded jobs simply stay
--    client-confirmed here; the worker sees the full payment history in KashWise Money.
create function public.portfolio_payment_confirmed(p_worker uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.job_id from private.ibanks_payments p
  where p.worker_id = p_worker and p.job_id is not null and p.state = 'settled'
$$;
revoke all on function public.portfolio_payment_confirmed(uuid) from public;
grant execute on function public.portfolio_payment_confirmed(uuid) to anon, authenticated;

-- 5. Fix: ibanks_claim_outbox used a data-modifying CTE inside a subquery expression, which Postgres rejects
--    ("WITH clause containing a data-modifying statement must be at the top level"), so the retry path never ran.
--    Same behaviour, with the CTE at the top level of a SELECT … INTO. Grants are kept by create or replace.
create or replace function public.ibanks_claim_outbox(p_payload text, p_signature text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_rows json;
begin
  if not private.ibanks_verify_signature(p_payload, p_signature) then
    raise exception 'Invalid signature.' using errcode = '42501';
  end if;
  with claimed as (
    update public.ibanks_event_outbox o set attempts = o.attempts + 1,
      available_at = now() + make_interval(secs => least(3600, 30 * power(2, o.attempts)::int)),
      state = case when o.attempts >= 8 then 'failed' else o.state end
    where o.id in (select x.id from public.ibanks_event_outbox x where x.state = 'pending' and x.available_at <= now()
                   order by x.id limit 20 for update skip locked)
    returning o.*)
  select coalesce(json_agg(json_build_object('worker_id', c.worker_id, 'event_id', c.event_id, 'event_type', c.event_type,
    'dedupe_key', c.dedupe_key, 'payload', f.payload)), '[]'::json)
  into v_rows
  from claimed c join public.financial_provider_events f on f.provider || ':' || f.provider_event_id = c.dedupe_key;
  return v_rows;
end $$;
