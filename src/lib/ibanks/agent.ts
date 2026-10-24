// Ask iBanks: grounded answers about a worker's own KashWise money (spec §5.7).
// Numbers come ONLY from server-computed facts. The deterministic answer always works (no key, outage, offline);
// an optional LLM may re-phrase it, and its output is rejected unless every amount it states is in the facts.
// Questions, job titles and reviews are untrusted DATA: nothing in them is ever followed as an instruction.
import { z } from 'zod'
import { categoryLabel } from '../categories'
import { formatRand } from '../money'
import type { EarningsIntelligence } from './analytics'
import { SCOPE_LABEL } from './contracts'
import type { Insight } from './orchestrator'
import { savingsScenario, type SavingsScenario } from './savings'

export const INTENTS = [
  'get_earnings',
  'compare_periods',
  'explain_fee',
  'get_payout_status',
  'explain_alert',
  'forecast_income',
  'simulate_savings',
  'show_work_proof',
  'get_financial_education',
  'contact_support',
] as const
export type Intent = (typeof INTENTS)[number]

export const agentOutputSchema = z.object({
  answer: z.string().min(1).max(1200),
  intent: z.enum(INTENTS),
  as_of: z.string(),
  source_refs: z.array(z.string()).max(50),
  assumptions: z.array(z.string()).max(10),
  limitations: z.array(z.string()).max(10),
  suggested_actions: z.array(z.object({ action: z.string(), requires_consent: z.boolean() })).max(5),
  safety: z.enum(['informational', 'refused_out_of_scope']),
  answered_by: z.enum(['rules', 'ai']),
})
export type AgentOutput = z.infer<typeof agentOutputSchema>

export interface ProofFacts {
  confirmed_jobs: number
  reviews: number
  average_rating: number | null
  record_codes: string[]
}

export interface AgentFacts {
  intel: EarningsIntelligence
  insights: readonly Insight[]
  proof: ProofFacts
  source_event_ids: string[]
  simulation: boolean
}

const RULES: [Intent, RegExp][] = [
  ['contact_support', /\b(support|help ?desk|complain|speak to (a )?(person|human)|report a problem)\b/i],
  ['simulate_savings', /\b(sav(e|ing|ings)|put away|retire(ment)?|pension|goal)\b/i],
  ['forecast_income', /\b(next week|next month|forecast|predict|slow|expect|will i (earn|make))\b/i],
  ['get_payout_status', /\b(payout|paid out|cash ?out|pending|bank|receive[d]? (my|the) money|when will i get)\b/i],
  ['explain_fee', /\b(fee|commission|deduct|gross|net|why .* (less|lower)|cut)\b/i],
  ['explain_alert', /\b(alert|warning|dispute|refund|fail(ed|ure)?|suspicious|fraud|wrong)\b/i],
  ['show_work_proof', /\b(proofscript|proof script|work transcript|proof|portfolio|cv|reference|verified|record|review|rating)\b/i],
  ['compare_periods', /\b(compare|compared|versus|vs\.?|last week|than before|best|which (kind|type|gig|job))\b/i],
  ['get_financial_education', /\b(what is|explain|how does|learn|budget|emergency fund|annuity|interest)\b/i],
  ['get_earnings', /\b(earn(ed|ings)?|make|made|income|money|how much)\b/i],
]

export function classifyIntent(question: string): Intent {
  const q = question.slice(0, 500)
  for (const [intent, re] of RULES) if (re.test(q)) return intent
  return 'get_earnings'
}

/** "save 5% and 2% for retirement" → { savingsBps: 500, retirementBps: 200 }. Defaults 5% / 2%, capped by the scenario. */
export function parseAllocation(question: string): { savingsBps: number; retirementBps: number } {
  let savingsBps = 500
  let retirementBps = 200
  const re = /(\d{1,2}(?:\.\d{1,2})?)\s*%(?:\s*(?:to|for|towards|into|of)?\s*(?:my\s+)?(\w+))?/gi
  let first = true
  for (const m of question.matchAll(re)) {
    const bps = Math.round(Number(m[1]) * 100)
    if (/retire|pension|annuity/i.test(m[2] ?? '')) retirementBps = bps
    else if (first) savingsBps = bps
    first = false
  }
  return { savingsBps: Math.min(savingsBps, 2000), retirementBps: Math.min(retirementBps, 2000) }
}

const pct = (bps: number) => `${bps / 100}%`

function base(intent: Intent, f: AgentFacts, answer: string, extra: Partial<AgentOutput> = {}): AgentOutput {
  return {
    answer,
    intent,
    as_of: f.intel.as_of,
    source_refs: f.source_event_ids.slice(-20),
    assumptions: [],
    limitations: [SCOPE_LABEL, ...(f.simulation ? ['Payments are a sandbox simulation; no real money moved'] : [])],
    suggested_actions: [],
    safety: 'informational',
    answered_by: 'rules',
    ...extra,
  }
}

export function answerDeterministic(question: string, f: AgentFacts): { output: AgentOutput; scenario?: SavingsScenario } {
  const intent = classifyIntent(question)
  const { intel } = f
  const L = intel.lifetime
  const W = intel.this_week
  const noMoney = L.settled_jobs === 0

  switch (intent) {
    case 'get_earnings': {
      if (noMoney) return { output: base(intent, f, 'You have no settled job payments on KashWise yet. Earnings appear here once a client\'s payment settles.') }
      const payoutLine =
        L.payout_pending_cents > 0
          ? ` ${formatRand(L.payout_pending_cents)} is on its way to you as a payout.`
          : L.available_cents > 0
            ? ` ${formatRand(L.available_cents)} is earned and not yet paid out.`
            : ''
      return {
        output: base(
          intent,
          f,
          `This week you earned ${formatRand(W.net_earned_cents)} net from ${W.settled_jobs} settled ${W.settled_jobs === 1 ? 'job' : 'jobs'} ` +
            `(${formatRand(W.gross_cents)} paid by clients, less ${formatRand(W.platform_fee_cents)} in KashWise fees). ` +
            `This month: ${formatRand(intel.this_month.net_earned_cents)}. So far ${formatRand(L.paid_out_cents)} has been paid out to you.${payoutLine}`,
          { suggested_actions: [{ action: 'view_earnings', requires_consent: false }] },
        ),
      }
    }
    case 'compare_periods': {
      if (noMoney) return { output: base(intent, f, 'There is nothing to compare yet: you have no settled job payments on KashWise.') }
      const diff = W.net_earned_cents - intel.last_week.net_earned_cents
      const top = intel.by_category[0]
      return {
        output: base(
          intent,
          f,
          `This week: ${formatRand(W.net_earned_cents)} net. Last week: ${formatRand(intel.last_week.net_earned_cents)}. ` +
            `That is ${diff === 0 ? 'the same' : `${formatRand(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}`}.` +
            (top ? ` Your best-paying kind of work so far is ${categoryLabel(top.category).toLowerCase()}: ${formatRand(top.net_cents)} net from ${top.jobs} ${top.jobs === 1 ? 'job' : 'jobs'}.` : ''),
        ),
      }
    }
    case 'explain_fee':
      return {
        output: base(
          intent,
          f,
          'Clients pay the job price. KashWise keeps a 10% service fee and the rest is your net earnings — for example a R1 000 job gives you R900. ' +
            (noMoney ? '' : `So far clients paid ${formatRand(L.gross_cents)} for your settled jobs, fees were ${formatRand(L.platform_fee_cents)} and you earned ${formatRand(L.net_earned_cents)}. `) +
            'Payment-processing costs are paid by KashWise, not taken from you.',
        ),
      }
    case 'get_payout_status': {
      const parts = [`Earned (net): ${formatRand(L.net_earned_cents)}.`, `Paid out: ${formatRand(L.paid_out_cents)}.`]
      if (L.payout_pending_cents) parts.push(`On its way: ${formatRand(L.payout_pending_cents)}.`)
      if (L.disputed_hold_cents) parts.push(`On hold because of a dispute: ${formatRand(L.disputed_hold_cents)}.`)
      parts.push(`Available to cash out: ${formatRand(L.available_cents)}.`)
      return {
        output: base(
          intent,
          f,
          `${parts.join(' ')} Your balance and your paid-out total differ because money is only "paid out" once the payment provider confirms the payout.`,
          { suggested_actions: [{ action: 'view_payout_history', requires_consent: false }] },
        ),
      }
    }
    case 'explain_alert': {
      const alerts = f.insights.filter((i) => i.kind.startsWith('risk:') || i.kind === 'earnings:reversal')
      if (!alerts.length) return { output: base(intent, f, 'iBanks has no open alerts on your KashWise money right now.') }
      const a = alerts[0]
      return {
        output: base(intent, f, `${a.title}. ${a.body}`, {
          source_refs: a.source_event_ids,
          suggested_actions: a.actions.includes('open_support_case') ? [{ action: 'open_support_case', requires_consent: true }] : [],
        }),
      }
    }
    case 'forecast_income': {
      const o = intel.outlook
      if (o.kind === 'insufficient_history') {
        return {
          output: base(
            intent,
            f,
            `Not enough data to forecast reliably yet: you have ${o.complete_weeks} complete ${o.complete_weeks === 1 ? 'week' : 'weeks'} of KashWise earnings and iBanks needs at least ${o.needed_weeks}. ` +
              (noMoney ? '' : `What is known: ${formatRand(L.net_earned_cents)} earned in total so far.`),
          ),
        }
      }
      const w = o.next_7_days
      const m = o.next_30_days
      return {
        output: base(
          intent,
          f,
          `Based on your last ${o.basis_weeks} complete weeks, the next 7 days could bring about ${formatRand(w.central_cents)} net, most likely between ` +
            `${formatRand(w.low_cents)} and ${formatRand(w.high_cents)}. Over the next 30 days: ${formatRand(m.low_cents)} to ${formatRand(m.high_cents)}. ` +
            `Confidence is ${o.confidence}` +
            (o.backtest ? `; on ${o.backtest.tests} past ${o.backtest.tests === 1 ? 'week' : 'weeks'} this method was off by ${formatRand(o.backtest.mean_abs_error_cents)} on average` : '') +
            '. This is an estimate, not a guarantee. If next week is slow, plan with the lower figure.',
          {
            assumptions: [
              'Future weeks resemble recent complete weeks, with recent weeks counting more',
              'Only KashWise income is included; your expenses are unknown',
            ],
          },
        ),
      }
    }
    case 'simulate_savings': {
      const { savingsBps, retirementBps } = parseAllocation(question)
      const s = savingsScenario({ netCents: L.net_earned_cents, savingsBps, retirementBps, paidOutCents: L.paid_out_cents })
      return {
        scenario: s,
        output: base(
          intent,
          f,
          `Simulation only — no money is moved. Putting ${pct(savingsBps)} of your ${formatRand(s.base_net_cents)} net earnings towards savings is ${formatRand(s.savings_cents)}, ` +
            `and ${pct(retirementBps)} towards a retirement goal is ${formatRand(s.retirement_cents)}, leaving ${formatRand(s.remainder_cents)}. ` +
            'Emergency savings stay easy to reach; retirement annuities are long-term and regulated. iBanks does not know your expenses, so check your own bills first.' +
            (s.includes_unpaid ? ' Part of this money is earned but not paid out yet.' : ''),
          {
            assumptions: ['Percentages apply to settled net earnings, after the KashWise fee'],
            suggested_actions: [{ action: 'open_goals', requires_consent: true }],
          },
        ),
      }
    }
    case 'show_work_proof': {
      const p = f.proof
      return {
        output: base(
          intent,
          f,
          p.confirmed_jobs === 0
            ? 'You have no client-confirmed jobs yet. Each job a client confirms becomes a verified record in your ProofScript.'
            : `You have ${p.confirmed_jobs} client-confirmed ${p.confirmed_jobs === 1 ? 'job' : 'jobs'} and ${p.reviews} ${p.reviews === 1 ? 'review' : 'reviews'}` +
                `${p.average_rating != null ? ` averaging ${p.average_rating} out of 5` : ''}. ` +
                `Your settled KashWise earnings are ${formatRand(L.net_earned_cents)} net. "Verified" means confirmed by the paying client on KashWise — it is not a bank or government verification.`,
          { source_refs: p.record_codes.slice(0, 20), suggested_actions: [{ action: 'open_proof', requires_consent: false }] },
        ),
      }
    }
    case 'get_financial_education':
      return {
        output: base(
          intent,
          f,
          'Gross is what the client pays; net is what you keep after the KashWise fee. Earned means the payment settled; paid out means the money was sent to you. ' +
            'An emergency fund is money you can reach quickly for surprises. A retirement annuity is a long-term, regulated product you usually cannot touch until retirement — choose one with a licensed provider. iBanks gives information, not financial advice.',
        ),
      }
    case 'contact_support':
      return {
        output: base(intent, f, 'I can open a support case for a person on the KashWise team to look at. Confirm below and describe the problem — I will not share your money details beyond your case.', {
          suggested_actions: [{ action: 'open_support_case', requires_consent: true }],
        }),
      }
  }
}

// ── Grounding ───────────────────────────────────────────────────────────────

/** Every rand amount the answer may state: the facts, nothing else. */
export function allowedAmounts(f: AgentFacts, scenario?: SavingsScenario): Set<string> {
  const cents: number[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isInteger(v)) cents.push(v)
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(f.intel)
  walk(f.insights.map((i) => i.fact_snapshot))
  if (scenario) walk(scenario)
  cents.push(100_000, 90_000) // the fixed R1 000 → R900 fee example
  return new Set(cents.flatMap((c) => [formatRand(c), formatRand(Math.abs(c))]))
}

const RAND_RE = /R\s?\d[\d\s,]*(?:\.\d{1,2})?/g

/** Normalise "R1,000" / "R 1 000.00" to formatRand's "R1 000". */
export function normaliseRand(s: string): string {
  const digits = s.replace(/^R\s?/, '').replace(/[\s,]/g, '')
  const value = Number(digits)
  return Number.isFinite(value) ? formatRand(Math.round(value * 100)) : s
}

export function groundingViolations(answer: string, allowed: ReadonlySet<string>): string[] {
  return [...answer.matchAll(RAND_RE)].map((m) => m[0].trim()).filter((m) => !allowed.has(normaliseRand(m)))
}

/** Accept an AI re-phrasing only if it is schema-valid, keeps the intent, and states no amount outside the facts. */
export function acceptAiOutput(raw: unknown, fallback: AgentOutput, allowed: ReadonlySet<string>): AgentOutput {
  const parsed = agentOutputSchema.safeParse(raw)
  if (!parsed.success || parsed.data.intent !== fallback.intent) return fallback
  if (groundingViolations(parsed.data.answer, allowed).length) return fallback
  // Provenance and safety fields stay the server's, never the model's.
  return { ...fallback, answer: parsed.data.answer, answered_by: 'ai' }
}
