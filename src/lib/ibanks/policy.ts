// Deterministic policy gate (spec §6, PolicyExecutor). The AI may reason and explain; only this decides what may happen.
// No model output, chat phrasing or client flag can widen these permissions.

export const ACTIONS = [
  'audit_only',
  'notify',
  'show_explanation',
  'open_support_case',
  'request_human_review',
  'require_step_up',
  'block_payout_detail_change',
  // Never permitted inside KashWise: listed so attempts are denied and audited, not silently ignored.
  'initiate_transfer',
  'move_savings',
  'approve_payout',
  'edit_ledger',
  'freeze_bank_card',
] as const
export type Action = (typeof ACTIONS)[number]

export type Actor = 'system_rule' | 'agent' | 'worker'
export type PolicyOutcome = 'allow' | 'deny' | 'require_confirmation' | 'escalate'

export interface PolicyContext {
  actor: Actor
  /** Authenticated principal (derived server-side) and the worker whose data is touched. */
  principalId: string | null
  subjectWorkerId: string
  notificationsOptIn?: boolean
}

export interface PolicyDecision {
  action: Action
  outcome: PolicyOutcome
  reason: string
  policy_version: string
}

export const POLICY_VERSION = 'policy-2026-10-08.1'

const FORBIDDEN: ReadonlySet<Action> = new Set(['initiate_transfer', 'move_savings', 'approve_payout', 'edit_ledger', 'freeze_bank_card'])

export function evaluatePolicy(action: Action, ctx: PolicyContext): PolicyDecision {
  const d = (outcome: PolicyOutcome, reason: string): PolicyDecision => ({ action, outcome, reason, policy_version: POLICY_VERSION })
  if (FORBIDDEN.has(action)) return d('deny', 'KashWise iBanks cannot move money, approve payouts, edit the ledger or control bank products')
  // A worker or the agent acting for a worker may only touch that worker's own data.
  if (ctx.actor !== 'system_rule' && (!ctx.principalId || ctx.principalId !== ctx.subjectWorkerId)) {
    return d('deny', 'principal is not the subject worker')
  }
  switch (action) {
    case 'audit_only':
    case 'show_explanation':
      return d('allow', 'informational')
    case 'notify':
      // In-app insight cards are always allowed; push/SMS would need notificationsOptIn (not wired in the MVP).
      return d('allow', 'in-app notice')
    case 'open_support_case':
      return ctx.actor === 'agent' ? d('require_confirmation', 'the worker confirms before a case is opened') : d('allow', 'support case')
    case 'request_human_review':
      return d('escalate', 'routed to a human reviewer')
    case 'require_step_up':
    case 'block_payout_detail_change':
      return ctx.actor === 'system_rule' ? d('allow', 'protective control on a KashWise-owned setting') : d('deny', 'only deterministic rules may apply protective controls')
  }
  return d('deny', 'unknown action')
}
