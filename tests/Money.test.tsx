// KashWise Money renders figures computed from ledger rows — nothing hardcoded — and keeps "earned" and
// "paid out" visibly distinct, with the simulation and scope labels always present.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { MoneyData } from '../src/lib/api'
import type { LedgerEntry } from '../src/lib/ibanks/contracts'

const SIPHO = '11111111-1111-4111-8111-111111111111'
const JOB = '22222222-2222-4222-8222-222222222222'
const at = new Date().toISOString()
const e = (account: LedgerEntry['account'], amount: number, event_id = 'evt_demo_0001'): LedgerEntry => ({
  worker_id: SIPHO, job_id: JOB, payment_id: 'pay_1', payout_id: null, event_id, account, amount_cents: amount, occurred_at: at, reversal_of: null,
})

let data: MoneyData
const fetchMoney = vi.fn(async () => data)
vi.mock('../src/lib/api', () => ({
  fetchMoney: () => fetchMoney(),
  askIbanks: vi.fn(),
  insightFeedback: vi.fn(),
  saveIbanksPreferences: vi.fn(),
  fetchIbanksDiagnostics: vi.fn(async () => ({
    decisions: [{ at, trigger_event_id: 'evt_demo_0001', ingest_status: 'posted', rule_id: 'F001_income_outlook', rule_version: 1,
      proposed_action: 'notify', policy_outcome: 'allow', policy_version: 'policy-2026-10-08.1', reason: 'in-app notice', actor: 'system_rule' }],
    events: [{ event_id: 'evt_demo_0001', event_type: 'payment_settled', state: 'done', attempts: 1, received_at: at }],
    ledger_entries: 3,
    as_of: at,
  })),
}))
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({ userId: SIPHO }) }))
vi.mock('../src/components/ui/toast', () => ({ useToast: () => ({ show: vi.fn() }) }))

const { default: Money } = await import('../src/pages/Money')

function renderMoney() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Money /></MemoryRouter>
    </QueryClientProvider>,
  )
}

const base = (entries: LedgerEntry[]): MoneyData => ({
  enabled: true,
  entries,
  insights: [],
  jobs: new Map([[JOB, { title: 'House painting', category: 'painting' }]]),
  proof: { confirmed_jobs: 1, reviews: 0, average_rating: null, record_codes: [] },
  preferences: null,
})

describe('<Money />', () => {
  it('shows R900 earned but R0 paid out after a settlement, with simulation and scope labels', async () => {
    data = base([e('gross', 100_000), e('platform_fee', 10_000), e('net_earned', 90_000)])
    renderMoney()
    const earned = await screen.findByText('Earned this week')
    expect(within(earned.closest('.card') as HTMLElement).getByText('R900')).toBeInTheDocument()
    expect(within(screen.getByText('Paid out to you').closest('.card') as HTMLElement).getByText('R0')).toBeInTheDocument()
    expect(within(screen.getByText('Earned, not yet paid out').closest('.card') as HTMLElement).getByText('R900')).toBeInTheDocument()
    expect(screen.getAllByText('System-verified').length).toBeGreaterThan(0)
    expect(screen.getByText(/No real money moves, and no bank is connected/)).toBeInTheDocument()
    expect(screen.getByText(/Based on your KashWise activity only/)).toBeInTheDocument()
  })

  it('moves the money to "paid out" only when the ledger says the provider confirmed it', async () => {
    data = base([
      e('gross', 100_000), e('platform_fee', 10_000), e('net_earned', 90_000),
      e('payout_pending', 90_000, 'po_req'), e('payout_pending', -90_000, 'po_ok'), e('paid_out', 90_000, 'po_ok'),
    ])
    renderMoney()
    const paid = await screen.findByText('Paid out to you')
    expect(within(paid.closest('.card') as HTMLElement).getByText('R900')).toBeInTheDocument()
    expect(within(screen.getByText('Earned, not yet paid out').closest('.card') as HTMLElement).getByText('R0')).toBeInTheDocument()
  })

  it('Goals simulates 5% / 2% of R900 as R45 / R18 / R837 and says nothing is moved', async () => {
    data = base([e('gross', 100_000), e('platform_fee', 10_000), e('net_earned', 90_000)])
    renderMoney()
    await userEvent.click(await screen.findByRole('tab', { name: 'Goals' }))
    expect(screen.getByText('R45')).toBeInTheDocument()
    expect(screen.getByText('R18')).toBeInTheDocument()
    expect(screen.getByText('R837')).toBeInTheDocument()
    expect(screen.getByText(/no money is moved or deducted/)).toBeInTheDocument()
  })

  it('History lists every ledger entry with its source event', async () => {
    data = base([e('gross', 100_000), e('platform_fee', 10_000), e('net_earned', 90_000)])
    renderMoney()
    await userEvent.click(await screen.findByRole('tab', { name: 'History' }))
    expect(screen.getAllByText('evt_demo_0001')).toHaveLength(3)
    expect(screen.getByText('Earned (net)')).toBeInTheDocument()
  })

  it('says plainly when iBanks is not enabled on the database', async () => {
    data = { ...base([]), enabled: false }
    renderMoney()
    expect(await screen.findByText('iBanks is not switched on yet')).toBeInTheDocument()
  })

  it('Earnings says "not enough data" with thin history instead of forecasting', async () => {
    data = base([e('gross', 100_000), e('platform_fee', 10_000), e('net_earned', 90_000)])
    renderMoney()
    await userEvent.click(await screen.findByRole('tab', { name: 'Earnings' }))
    expect(screen.getByText('Not enough data to forecast reliably.')).toBeInTheDocument()
    expect(screen.getByText(/Too early to see a pattern/)).toBeInTheDocument()
  })

  it('Earnings shows 7- and 30-day ranges, labelled estimates, once 4 complete weeks exist', async () => {
    const WEEK = 7 * 86_400_000
    data = base([1, 2, 3, 4, 5].map((w, n) => ({ ...e('net_earned', 45_000, `evt_${n}`), payment_id: `pay_${n}`, occurred_at: new Date(Date.now() - w * WEEK).toISOString() })))
    renderMoney()
    await userEvent.click(await screen.findByRole('tab', { name: 'Earnings' }))
    expect(screen.getByText('Next 7 days')).toBeInTheDocument()
    expect(screen.getByText('Next 30 days')).toBeInTheDocument()
    expect(screen.getAllByText('Estimated').length).toBeGreaterThan(0)
    expect(screen.getByText(/An estimate, not a guarantee/)).toBeInTheDocument()
  })

  it('Insights opens the read-only audit trail with rule and policy versions', async () => {
    data = base([e('gross', 100_000), e('platform_fee', 10_000), e('net_earned', 90_000)])
    renderMoney()
    await userEvent.click(await screen.findByRole('tab', { name: 'Insights' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show audit trail' }))
    expect(await screen.findByText('F001_income_outlook v1')).toBeInTheDocument()
    expect(screen.getByText('policy-2026-10-08.1')).toBeInTheDocument()
  })
})
