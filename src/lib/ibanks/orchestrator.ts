// iBanks event dispatcher: a validated provider event wakes the relevant modules (not a chatbot, not an LLM per event).
// OBSERVE → VALIDATE → CONTEXTUALISE → DETECT → EXPLAIN → POLICY CHECK → ACT (notify/review only) → AUDIT.
// Pure: persistence happens behind the caller's port (in-memory for tests, Postgres RPCs in netlify/functions).
import { categoryLabel } from '../categories'
import { formatRand } from '../money'
import { earningsIntelligence, type JobInfo } from './analytics'
import { SCOPE_LABEL, type IngestResult, type LedgerEntry, type ProviderEvent } from './contracts'
import { OUTLOOK_METHOD } from './forecast'
import { evaluatePolicy, type Action, type PolicyDecision } from './policy'
import { runRules, type PayoutRecord, type RiskFinding, type Severity } from './risk-rules'

export interface Insight {
  worker_id: string
  kind: string
  severity: Severity
  title: string
  body: string
  scope: string
  source_event_ids: string[]
  fact_snapshot: Record<string, string | number | boolean | null>
  data_as_of: string
  generated_by: 'rules' // the LLM may later re-phrase, never originate, an insight
  actions: Action[]
}

export interface AuditRecord {
  worker_id: string
  trigger_event_id: string
  ingest_status: IngestResult['status']
  rule_id: string | null
  rule_version: number | null
  proposed_action: Action
  decision: PolicyDecision
  actor: 'system_rule'
  at: string
}

export interface DispatchInput {
  event: ProviderEvent
  ingest: IngestResult
  entries: readonly LedgerEntry[] // the worker's entries after applying the event
  payouts: readonly PayoutRecord[]
  jobs: ReadonlyMap<string, JobInfo>
  now: number
}

/** Which modules wake for which trigger (spec §5.1): cheap and targeted, never "everything for every event". */
export const MODULES_BY_TRIGGER: Record<ProviderEvent['event_type'], ('earnings' | 'risk' | 'payout')[]> = {
  payment_settled: ['earnings', 'risk'],
  payment_disputed: ['risk'],
  dispute_resolved: ['earnings'],
  refund_settled: ['earnings'],
  chargeback_confirmed: ['earnings'],
  payout_requested: ['risk'],
  payout_settled: ['payout'],
  payout_failed: ['risk'],
}

export function dispatch(input: DispatchInput): { insights: Insight[]; audits: AuditRecord[]; findings: RiskFinding[] } {
  const { event, ingest, now } = input
  const asOf = new Date(now).toISOString()
  const insights: Insight[] = []
  const audits: AuditRecord[] = []
  const policyCtx = { actor: 'system_rule' as const, principalId: null, subjectWorkerId: event.worker_id }
  const audit = (action: Action, finding: Pick<RiskFinding, 'rule_id' | 'version'> | null) => {
    const decision = evaluatePolicy(action, policyCtx)
    audits.push({
      worker_id: event.worker_id,
      trigger_event_id: event.event_id,
      ingest_status: ingest.status,
      rule_id: finding?.rule_id ?? null,
      rule_version: finding?.version ?? null,
      proposed_action: action,
      decision,
      actor: 'system_rule',
      at: asOf,
    })
    return decision
  }

  // Duplicates / out-of-order / rejected events change no money: only the protection rules see them, and only audit.
  const modules = ingest.status === 'posted' ? MODULES_BY_TRIGGER[event.event_type] : ['risk']
  const findings = modules.includes('risk') ? runRules(input) : []
  if (ingest.status !== 'posted' && findings.length === 0) audit('audit_only', null)

  for (const f of findings) {
    const allowed = f.proposed_actions.filter((a) => audit(a, f).outcome !== 'deny')
    if (f.audience === 'worker' && allowed.includes('notify')) {
      insights.push({
        worker_id: event.worker_id,
        kind: `risk:${f.rule_id}`,
        severity: f.severity,
        title: f.title,
        body: f.explanation,
        scope: SCOPE_LABEL,
        source_event_ids: [event.event_id],
        fact_snapshot: f.evidence,
        data_as_of: asOf,
        generated_by: 'rules',
        actions: allowed,
      })
    }
  }

  if (ingest.status !== 'posted') return { insights, audits, findings }
  const intel = earningsIntelligence(input.entries, input.jobs, now)

  if (modules.includes('earnings') && event.event_type === 'payment_settled') {
    const job = event.job_id ? input.jobs.get(event.job_id) : undefined
    insights.push({
      worker_id: event.worker_id,
      kind: 'earnings:new_payment',
      severity: 'info',
      title: 'iBanks noticed a new payment',
      body:
        `A ${formatRand(event.gross_cents)} job payment${job ? ` for "${job.title}"` : ''} has settled. ` +
        `After the ${formatRand(event.marketplace_fee_cents)} KashWise service fee, ${formatRand(event.worker_net_cents)} is recorded as earned and awaiting payout. ` +
        `Your earnings this week are now ${formatRand(intel.this_week.net_earned_cents)}.`,
      scope: SCOPE_LABEL,
      source_event_ids: [event.event_id],
      fact_snapshot: {
        gross_cents: event.gross_cents,
        fee_cents: event.marketplace_fee_cents,
        net_cents: event.worker_net_cents,
        week_net_cents: intel.this_week.net_earned_cents,
        payout_status: 'pending',
      },
      data_as_of: asOf,
      generated_by: 'rules',
      actions: ['show_explanation'],
    })
    audit('notify', null)
  }
  if (modules.includes('earnings') && (event.event_type === 'refund_settled' || event.event_type === 'chargeback_confirmed')) {
    insights.push({
      worker_id: event.worker_id,
      kind: 'earnings:reversal',
      severity: 'medium',
      title: event.event_type === 'refund_settled' ? 'A payment was refunded' : 'A chargeback was confirmed',
      body:
        `${formatRand(event.worker_net_cents)} of earnings was reversed by the payment provider. The original payment stays in your history ` +
        `next to the reversal. Your available earnings are now ${formatRand(intel.lifetime.available_cents)}.`,
      scope: SCOPE_LABEL,
      source_event_ids: [event.event_id],
      fact_snapshot: { reversed_net_cents: event.worker_net_cents, available_cents: intel.lifetime.available_cents },
      data_as_of: asOf,
      generated_by: 'rules',
      actions: ['show_explanation', 'open_support_case'],
    })
    audit('notify', null)
  }
  // The income outlook and earning pattern are recomputed whenever earned money changes, and the new card replaces
  // the old one (the database supersedes earlier 'forecast:' / 'pattern:' insights). Rules, not an LLM.
  if (modules.includes('earnings')) {
    insights.push(outlookInsight(event, intel, asOf))
    audit('notify', OUTLOOK_RULE)
    const p = patternInsight(event, intel, asOf)
    if (p) {
      insights.push(p)
      audit('notify', PATTERN_RULE)
    }
  }
  if (modules.includes('payout')) {
    insights.push({
      worker_id: event.worker_id,
      kind: 'payout:confirmed',
      severity: 'info',
      title: 'Your payout was confirmed',
      body:
        `${formatRand(event.amount_cents)} was marked as paid out by our payment provider` +
        `${event.destination_label ? ` to ${event.destination_label}` : ''}. ` +
        'When it reaches your account depends on your bank. You can find it in your payout history.',
      scope: SCOPE_LABEL,
      source_event_ids: [event.event_id],
      fact_snapshot: { payout_id: event.payout_id, amount_cents: event.amount_cents, paid_out_total_cents: intel.lifetime.paid_out_cents },
      data_as_of: asOf,
      generated_by: 'rules',
      actions: ['show_explanation'],
    })
    audit('notify', null)
  }
  return { insights, audits, findings }
}

export const OUTLOOK_RULE = { rule_id: 'F001_income_outlook', version: 1 } as const
export const PATTERN_RULE = { rule_id: 'P001_earning_pattern', version: 1 } as const

function outlookInsight(event: ProviderEvent, intel: ReturnType<typeof earningsIntelligence>, asOf: string): Insight {
  const o = intel.outlook
  const base = {
    worker_id: event.worker_id,
    kind: 'forecast:outlook',
    scope: SCOPE_LABEL,
    source_event_ids: [event.event_id],
    data_as_of: asOf,
    generated_by: 'rules' as const,
    actions: ['show_explanation' as const],
  }
  if (o.kind === 'insufficient_history') {
    return {
      ...base,
      severity: 'info',
      title: 'Not enough history to forecast yet',
      body:
        `iBanks updated your outlook: you have ${o.complete_weeks} complete ${o.complete_weeks === 1 ? 'week' : 'weeks'} of KashWise earnings and needs at least ${o.needed_weeks} ` +
        `before it estimates future weeks. Known so far: ${formatRand(intel.lifetime.net_earned_cents)} earned in total.`,
      fact_snapshot: { method: OUTLOOK_METHOD, complete_weeks: o.complete_weeks, needed_weeks: o.needed_weeks, net_earned_cents: intel.lifetime.net_earned_cents },
    }
  }
  const w = o.next_7_days
  const m = o.next_30_days
  return {
    ...base,
    severity: 'info',
    title: 'Your income outlook was updated',
    body:
      `Based on your last ${o.basis_weeks} complete weeks, the next 7 days could bring about ${formatRand(w.central_cents)} net ` +
      `(range ${formatRand(w.low_cents)} to ${formatRand(w.high_cents)}), and the next 30 days ${formatRand(m.low_cents)} to ${formatRand(m.high_cents)}. ` +
      `Confidence: ${o.confidence}.` +
      (o.backtest ? ` Tested on ${o.backtest.tests} past ${o.backtest.tests === 1 ? 'week' : 'weeks'}, it was off by ${formatRand(o.backtest.mean_abs_error_cents)} on average.` : '') +
      ' An estimate, not a guarantee: plan with the lower figure.',
    fact_snapshot: {
      method: OUTLOOK_METHOD,
      basis_weeks: o.basis_weeks,
      confidence: o.confidence,
      week_low_cents: w.low_cents,
      week_central_cents: w.central_cents,
      week_high_cents: w.high_cents,
      month_low_cents: m.low_cents,
      month_central_cents: m.central_cents,
      month_high_cents: m.high_cents,
      backtest_tests: o.backtest?.tests ?? 0,
      backtest_mae_cents: o.backtest?.mean_abs_error_cents ?? null,
      backtest_coverage_bps: o.backtest?.coverage_bps ?? null,
    },
  }
}

function patternInsight(event: ProviderEvent, intel: ReturnType<typeof earningsIntelligence>, asOf: string): Insight | null {
  const s = intel.patterns.suggestion
  if (s.kind !== 'focus_category') return null
  const label = categoryLabel(s.category).toLowerCase()
  return {
    worker_id: event.worker_id,
    kind: 'pattern:suggestion',
    severity: 'info',
    title: 'A pattern in your paid work',
    body:
      `${s.jobs} of your ${s.of_jobs} paid jobs were ${label}, averaging ${formatRand(s.avg_net_per_job_cents)} net per job.` +
      (s.busiest_weekday ? ` Most of your paid jobs were completed on a ${s.busiest_weekday} (${s.weekday_jobs}).` : '') +
      ` Keeping your ${label} profile and services up to date may help clients find you. This is a pattern in your history, not a promise of future work.`,
    scope: SCOPE_LABEL,
    source_event_ids: [event.event_id],
    fact_snapshot: {
      category: s.category,
      category_jobs: s.jobs,
      paid_jobs: s.of_jobs,
      avg_net_per_job_cents: s.avg_net_per_job_cents,
      busiest_weekday: s.busiest_weekday,
      weekday_jobs: s.weekday_jobs,
    },
    data_as_of: asOf,
    generated_by: 'rules',
    actions: ['show_explanation'],
  }
}
