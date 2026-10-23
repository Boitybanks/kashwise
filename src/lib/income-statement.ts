// Proof of income for workers without a payslip: what a worker earned through confirmed KashWise jobs, month by month,
// signed by KashWise (ML-DSA-65) so a lender, landlord or employer can check it at /verify.
// Only released payments count (the customer confirmed the job and the payment was paid out to the worker).

export interface StatementMonth {
  month: string // YYYY-MM
  jobs: number
  client_paid_cents: number
  fee_cents: number
  net_cents: number
}

export interface StatementLine {
  date: string
  title: string
  category: string
  area: string
  client_paid_cents: number
  fee_cents: number
  net_cents: number
  record: string | null
  customer: string | null
}

export interface IncomeStatement {
  type: 'SideGigsIncomeStatement'
  version: 1
  issuer: 'SideGigs'
  issued_at: string
  reference: string
  /** While KashWise runs in simulation mode no real money moves, so the statement is not proof of income. */
  payments_simulated: boolean
  demo_data: boolean
  worker: { id: string; name: string; area: string; member_since: string }
  period: { from: string; to: string; months: number }
  monthly: StatementMonth[]
  totals: {
    jobs: number
    client_paid_cents: number
    fee_cents: number
    net_cents: number
    average_monthly_net_cents: number
    distinct_clients: number
  }
  cash_outs: { count: number; amount_cents: number; fee_cents: number }
  lines: StatementLine[]
  verify_url: string
}

/** Shape returned by the public.income_statement RPC. */
export interface RawStatement {
  worker: { id: string; name: string; area_slug: string; member_since: string; is_demo: boolean }
  period: { from: string; to: string; months: number }
  months: StatementMonth[] | null
  lines:
    | {
        settled_at: string
        title: string
        category: string
        area_slug: string
        client_paid_cents: number
        fee_cents: number
        net_cents: number
        record_code: string | null
        customer_label: string | null
        is_demo: boolean
      }[]
    | null
  clients: number
  cashouts: { count: number; amount_cents: number; fee_cents: number }
  simulated: boolean
}

export const STATEMENT_MONTHS = [3, 6, 12] as const

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function statementReference(random: (n: number) => Uint8Array): string {
  return `IS-${[...random(8)].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`
}

export function buildIncomeStatement(
  raw: RawStatement,
  opts: { areaName: (slug: string) => string; origin: string; issuedAt: Date; reference: string },
): IncomeStatement {
  const monthly = raw.months ?? []
  const lines = raw.lines ?? []
  const sum = (key: 'jobs' | 'client_paid_cents' | 'fee_cents' | 'net_cents') => monthly.reduce((n, m) => n + Number(m[key] ?? 0), 0)
  const net = sum('net_cents')
  return {
    type: 'SideGigsIncomeStatement',
    version: 1,
    issuer: 'SideGigs',
    issued_at: opts.issuedAt.toISOString(),
    reference: opts.reference,
    payments_simulated: raw.simulated,
    demo_data: raw.worker.is_demo || lines.some((l) => l.is_demo),
    worker: {
      id: raw.worker.id,
      name: raw.worker.name,
      area: opts.areaName(raw.worker.area_slug),
      member_since: raw.worker.member_since,
    },
    period: raw.period,
    monthly: monthly.map((m) => ({
      month: m.month,
      jobs: Number(m.jobs),
      client_paid_cents: Number(m.client_paid_cents),
      fee_cents: Number(m.fee_cents),
      net_cents: Number(m.net_cents),
    })),
    totals: {
      jobs: sum('jobs'),
      client_paid_cents: sum('client_paid_cents'),
      fee_cents: sum('fee_cents'),
      net_cents: net,
      average_monthly_net_cents: monthly.length ? Math.round(net / monthly.length) : 0,
      distinct_clients: Number(raw.clients ?? 0),
    },
    cash_outs: {
      count: Number(raw.cashouts?.count ?? 0),
      amount_cents: Number(raw.cashouts?.amount_cents ?? 0),
      fee_cents: Number(raw.cashouts?.fee_cents ?? 0),
    },
    lines: lines.map((l) => ({
      date: l.settled_at,
      title: l.title,
      category: l.category,
      area: opts.areaName(l.area_slug),
      client_paid_cents: Number(l.client_paid_cents),
      fee_cents: Number(l.fee_cents),
      net_cents: Number(l.net_cents),
      record: l.record_code,
      customer: l.customer_label,
    })),
    verify_url: `${opts.origin}/verify`,
  }
}

/** "2026-09" -> "September 2026" (en-ZA, locale-independent month names). */
export function monthName(month: string): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const [y, m] = month.split('-').map(Number)
  return `${names[(m ?? 1) - 1] ?? month} ${y}`
}
