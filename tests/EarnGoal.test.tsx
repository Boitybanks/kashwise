import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { GoalInput, GoalMemory, GoalPlan, GoalRecord, GoalResponse } from '../src/lib/earn-goal-types'
import { addDays, todayInSA } from '../src/lib/validation'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), plan: vi.fn(), forget: vi.fn(), role: 'worker' as 'worker' | 'customer',
}))
vi.mock('../src/lib/earn-goal-api', () => ({ fetchEarnGoal: mocks.fetch, planEarnGoal: mocks.plan, forgetEarnGoalMemory: mocks.forget }))
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({
  loading: false, userId: 'worker-1', profile: { id: 'worker-1', role: mocks.role, area_slug: 'orlando', skills: ['gardening'], display_name: 'Sipho' },
}) }))
vi.mock('../src/lib/hooks', () => ({
  useAreas: () => ({ data: [{ slug: 'orlando', name: 'Orlando', city: 'Johannesburg', province: 'Gauteng' }], isLoading: false }),
  useAreaLookup: () => () => ({ slug: 'orlando', name: 'Orlando' }),
}))

const { default: EarnGoal } = await import('../src/pages/EarnGoal')

const memoryOff: GoalMemory = { status: 'off', preferences: null, facts: [], message: 'Your preferences are not being shared with personal memory.' }
const input: GoalInput = {
  target_cents: 90_000, deadline: addDays(todayInSA(), 7), area_slug: 'orlando',
  weekdays: [0, 1, 2, 3, 4, 5, 6], time_windows: ['morning', 'afternoon', 'evening'],
  radius_km: 10, skills: ['gardening'], memory_opt_in: false,
}
const goal: GoalRecord = { ...input, id: 'goal-1', started_at: new Date().toISOString(), updated_at: new Date().toISOString() }
function plan(overrides: Partial<GoalPlan> = {}): GoalPlan {
  return {
    goal, candidates_count: 1,
    suggestions: [{
      id: 'gig-1', title: 'Tidy a garden', category: 'gardening', area_slug: 'orlando', scheduled_date: addDays(todayInSA(), 1), time_window: 'flexible',
      payout_cents: 50_000, fee_cents: 5_000, worker_net_cents: 45_000, distance_km: 2, is_demo: true, poster_eligible: true, application_status: null,
      reasons: ['Matches your gardening skills.', 'Within your chosen area.'], schedule_note: 'Flexible time: confirm the start and finish with the client.',
    }],
    progress: { settled_cents: 10_000, booked_cents: 20_000, planned_cents: 45_000, remaining_cents: 80_000, remaining_after_plan_cents: 15_000, paid_out_cents: 0, payout_pending_cents: 0, disputed_hold_cents: 0 },
    as_of: new Date().toISOString(), simulation: true, notes: ['Availability may change before you apply.'], memory: memoryOff, ...overrides,
  }
}
function response(p: GoalPlan | null = null): GoalResponse { return { goal: p?.goal ?? null, plan: p, memory: p?.memory ?? memoryOff } }
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><EarnGoal /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.role = 'worker'
  mocks.fetch.mockResolvedValue(response())
  mocks.plan.mockImplementation(async (saved: GoalInput) => plan({ goal: { ...goal, ...saved } }))
  mocks.forget.mockResolvedValue({ memory: { ...memoryOff, message: 'Your remembered preferences have been deleted.' } })
})

describe('<EarnGoal />', () => {
  it('submits structured worker choices with memory off, and links to a real gig without applying', async () => {
    renderPage()
    expect(await screen.findByLabelText('Earnings goal (rand)')).toHaveValue('900')
    expect(screen.getByRole('checkbox', { name: /Remember my preferences/ })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /Build my earnings plan/ }))
    expect(await screen.findByText('Tidy a garden')).toBeInTheDocument()
    expect(mocks.plan).toHaveBeenCalledTimes(1)
    expect(mocks.plan.mock.calls[0][0]).toEqual(input)
    expect(screen.getByRole('link', { name: 'Review gig' })).toHaveAttribute('href', '/gigs/gig-1')
    expect(screen.getByText('Flexible time: confirm the start and finish with the client.')).toBeInTheDocument()
    expect(screen.getByText(/Client price R500 · fee R50/)).toBeInTheDocument()
    expect(screen.getByText(/no real money moves/i)).toBeInTheDocument()
    expect(screen.getByText(/KashWise will never apply or accept work for you/)).toBeInTheDocument()
  })

  it('keeps settled, booked, planned and paid-out amounts separate, and preserves refund losses', async () => {
    const p = plan()
    p.progress.settled_cents = -5_000
    mocks.fetch.mockResolvedValue(response(p))
    renderPage()
    const settled = await screen.findByText('Settled earnings')
    expect(within(settled.parentElement!).getByText('-R50')).toBeInTheDocument()
    expect(within(screen.getByText('Booked work').parentElement!).getByText('R200')).toBeInTheDocument()
    expect(within(screen.getByText('Suggested opportunities').parentElement!).getByText('R450')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText(/After fees and refunds; not necessarily paid out/)).toBeInTheDocument()
    expect(screen.getByText(/All figures are before your travel, materials/)).toBeInTheDocument()
  })

  it('marks results stale after availability edits and sends only afternoon when selected', async () => {
    mocks.fetch.mockResolvedValue(response(plan()))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Morning' }))
    await userEvent.click(screen.getByRole('button', { name: 'Evening' }))
    expect(screen.getByText(/results below still use your last saved choices/)).toBeInTheDocument()
    expect(screen.queryByText(/starts a new earnings period/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Update my plan' }))
    await screen.findByText(/Your plan is updated/)
    expect(mocks.plan.mock.calls[0][0]).toEqual({ ...input, time_windows: ['afternoon'] })
    expect(screen.queryByText(/results below still use your last saved choices/)).not.toBeInTheDocument()
  })

  it('explains a new earnings period for target changes and validates before any request', async () => {
    mocks.fetch.mockResolvedValue(response(plan()))
    renderPage()
    const amount = await screen.findByLabelText('Earnings goal (rand)')
    await userEvent.clear(amount)
    await userEvent.type(amount, '1000000')
    expect(screen.getByText(/starts a new earnings period/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Update my plan' }))
    expect(screen.getByText(/Enter a goal between R1 and R100 000/)).toBeInTheDocument()
    expect(amount).toHaveFocus()
    expect(mocks.plan).not.toHaveBeenCalled()
  })

  it('shows an honest empty state when no opportunities fit', async () => {
    mocks.fetch.mockResolvedValue(response(plan({ candidates_count: 0, suggestions: [] })))
    renderPage()
    expect(await screen.findByText('No suitable opportunities right now')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse all work' })).toHaveAttribute('href', '/discover')
    expect(screen.queryByRole('link', { name: 'Review gig' })).not.toBeInTheDocument()
  })

  it('only restores memory on request, never opts in automatically, and reports failed deletion', async () => {
    const memory: GoalMemory = {
      status: 'ready', preferences: { ...input, target_cents: 60_000, deadline: addDays(todayInSA(), -1), time_windows: ['afternoon'] },
      facts: [], message: 'Saved preferences are available.',
    }
    mocks.fetch.mockResolvedValue({ ...response(), memory })
    mocks.forget.mockResolvedValue({ memory: { ...memoryOff, status: 'unavailable', message: 'Memory could not be reached. Deletion has not been confirmed.' } })
    renderPage()
    const amount = await screen.findByLabelText('Earnings goal (rand)')
    expect(amount).toHaveValue('900')
    await userEvent.click(screen.getByRole('button', { name: 'Use remembered preferences' }))
    expect(amount).toHaveValue('600')
    expect(screen.getByRole('checkbox', { name: /Remember my preferences/ })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Build my earnings plan' }))
    expect(screen.getByText(/Choose a date from today/)).toBeInTheDocument()
    expect(mocks.plan).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Forget my preferences' }))
    expect(await screen.findByText(/preferences could not be confirmed deleted/)).toBeInTheDocument()
    expect(screen.queryByText('Your remembered preferences have been deleted.')).not.toBeInTheDocument()
  })

  it('allows deletion retries while memory is off and sends explicit opt-in only on save', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Forget my preferences' }))
    expect(await screen.findAllByText('Your remembered preferences have been deleted.')).toHaveLength(2)
    await userEvent.click(screen.getByRole('checkbox', { name: /Remember my preferences/ }))
    expect(mocks.plan).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Build my earnings plan' }))
    await screen.findByText('Tidy a garden')
    expect(mocks.plan.mock.calls[0][0].memory_opt_in).toBe(true)
  })

  it('does not fetch or submit a worker goal for a customer', async () => {
    mocks.role = 'customer'
    renderPage()
    expect(screen.getByText('Make a plan with your worker profile')).toBeInTheDocument()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.plan).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Earnings goal (rand)')).not.toBeInTheDocument()
  })
})
