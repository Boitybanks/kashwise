import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { SignedCredential, WorkCredential } from '../src/lib/pq/credential'
import { cvFacts, cvReference, cvSkills, cvSummary } from '../src/lib/proofscript-cv'
import { goalBrief } from '../src/lib/earn-goal'
import type { GoalPlan } from '../src/lib/earn-goal-types'
import type { SkillsProfile } from '../src/lib/skills-profile'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), credential: vi.fn(), skills: vi.fn(), verify: vi.fn() }))
vi.mock('../src/lib/api', () => ({ fetchProfile: mocks.profile, fetchWorkCredential: mocks.credential, fetchSkillsProfile: mocks.skills }))
vi.mock('../src/components/ui/toast', () => ({ useToast: () => ({ show: vi.fn() }) }))
vi.mock('../src/lib/pq/verify-client', () => ({ verifySigned: mocks.verify, downloadSigned: vi.fn() }))

const { default: ProofScriptCv } = await import('../src/pages/ProofScriptCv')

const WORKER = '11111111-2222-3333-4444-555555555555'
const records = [
  { code: 'SG-1', title: 'Paint a lounge', category: 'painting', area: 'Orlando, Johannesburg', completed_at: '2026-09-10T10:00:00Z', rating: 5, review: 'He arrived early and left it tidy.', customer: 'Thandi M.' },
  { code: 'SG-2', title: 'Fix a gate', category: 'repairs', area: 'Orlando, Johannesburg', completed_at: '2026-10-02T10:00:00Z', rating: 4, review: null, customer: 'Lerato K.' },
]
const credential: WorkCredential = {
  type: 'SideGigsWorkHistory', version: 1, issuer: 'SideGigs', issued_at: '2026-10-30T10:00:00Z', demo_data: false,
  worker: { id: WORKER, name: 'Sipho Dlamini', area: 'Orlando, Johannesburg', member_since: '2026-08-01T10:00:00Z', skills: ['painting', 'tutoring'] },
  summary: { completed_gigs: 2, average_rating: 4.5, reviews: 2, repeat_customers: 1 }, records, profile_url: 'x',
}
const signed: SignedCredential = { credential, alg: 'ML-DSA-65', kid: 'key-1', signature: 'abcDEF+/1234567890' }

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/w/${WORKER}/cv`]}><Routes><Route path="w/:id/cv" element={<ProofScriptCv />} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProofScript CV page', () => {
  beforeEach(() => {
    mocks.profile.mockResolvedValue({ id: WORKER, display_name: 'Sipho Dlamini', headline: 'House painter', bio: 'I also do tutoring.', skills: ['painting', 'tutoring'] })
    mocks.credential.mockResolvedValue(signed)
    mocks.skills.mockResolvedValue(null)
    mocks.verify.mockResolvedValue(true)
  })

  it('shows the record only after the signature verifies, and marks it verified by KashWise', async () => {
    show()
    expect(await screen.findByRole('heading', { name: /Sipho Dlamini/ })).toBeInTheDocument()
    expect(screen.getByText('Verified by KashWise')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Paint a lounge' })).toBeInTheDocument()
    expect(screen.queryByText(/ML-DSA-65|SG-1/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download CV \(PDF\)/ })).toBeInTheDocument()
  })

  it('says what verified means', async () => {
    show()
    await screen.findByRole('heading', { name: /Sipho Dlamini/ })
    expect(screen.getByText(/not an identity or qualification check/)).toBeInTheDocument()
  })

  it('keeps self-written words apart from the proof, and never lists an unproven skill', async () => {
    show()
    await screen.findByRole('heading', { name: /Sipho Dlamini/ })
    expect(screen.getByText('Written by Sipho.')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Painting' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Tutoring' })).not.toBeInTheDocument()
  })

  it('refuses to show a document whose signature does not verify', async () => {
    mocks.verify.mockResolvedValue(false)
    show()
    expect(await screen.findByRole('heading', { name: /could not be verified/ })).toBeInTheDocument()
    expect(screen.queryByText('Paint a lounge')).not.toBeInTheDocument()
    expect(screen.queryByText('Verified by KashWise')).not.toBeInTheDocument()
  })

  it('refuses a validly signed record that belongs to someone else', async () => {
    mocks.credential.mockResolvedValue({ ...signed, credential: { ...credential, worker: { ...credential.worker, id: 'someone-else' } } })
    show()
    expect(await screen.findByRole('heading', { name: /could not be verified/ })).toBeInTheDocument()
  })

  it('labels demonstration data', async () => {
    mocks.credential.mockResolvedValue({ ...signed, credential: { ...credential, demo_data: true } })
    show()
    expect(await screen.findByText(/Sample profile/)).toBeInTheDocument()
  })
})

describe('what the CV prints', () => {
  const profile = { summary: 'A careful painter.', written_by: 'ai', skills: [
    { name: 'Interior painting', jobs: 9, evidence: ['SG-1', 'SG-404'], examples: [] },
    { name: 'Roofing', jobs: 3, evidence: ['SG-404'], examples: [] },
  ] } as unknown as SkillsProfile

  it('only counts evidence that is in the signed history', () => {
    expect(cvSkills(credential, profile)).toEqual([expect.objectContaining({ name: 'Interior painting', jobs: 1, evidence: ['SG-1'] })])
  })

  it('without a signed profile, builds skills and summary from the records', () => {
    expect(cvSkills(credential, null).map((s) => s.name)).toEqual(['Painting', 'Repairs & handyman'])
    expect(cvSummary(credential, null)).toContain('2 customer-confirmed jobs')
    expect(cvSummary(credential, profile)).toBe('A careful painter.')
  })

  it('states facts from the signed summary', () => {
    expect(cvFacts(credential).map((f) => f.value)).toEqual(['2', '4.5 / 5', '1', 'Sep 2026 – Oct 2026'])
  })

  it('makes a short, stable reference', () => {
    expect(cvReference('abcDEF+/1234567890', WORKER)).toBe('PS-1111-34567890')
  })
})

describe('iBanks read-out', () => {
  const NOW = new Date('2026-11-02T08:00:00Z')
  const plan = (over: Partial<GoalPlan['progress']>, extra: Partial<GoalPlan> = {}): GoalPlan => ({
    goal: { target_cents: 90_000, deadline: '2026-11-08' }, candidates_count: 2,
    suggestions: [{ title: 'Paint a wall', worker_net_cents: 45_000 }],
    progress: { settled_cents: 0, booked_cents: 0, planned_cents: 45_000, remaining_cents: 90_000, remaining_after_plan_cents: 45_000, paid_out_cents: 0, payout_pending_cents: 0, disputed_hold_cents: 0, ...over },
    ...extra,
  }) as unknown as GoalPlan

  it('says how far the matches get you, and where to start', () => {
    const brief = goalBrief(plan({}), NOW)
    expect(brief).toContain('You need R900 more in the next 6 days.')
    expect(brief).toContain('1 open job fits')
    expect(brief).toContain('R450 to you')
    expect(brief).toContain('leave you R450 short, and 1 more job also fits')
    expect(brief).toContain('Start with “Paint a wall”')
  })

  it('never promises the money', () => {
    expect(goalBrief(plan({ remaining_after_plan_cents: 0 }), NOW)).toContain('if you are hired and the work is confirmed')
  })

  it('handles reached, ended and empty plans', () => {
    expect(goalBrief(plan({ remaining_cents: 0 }), NOW)).toContain('You have reached')
    expect(goalBrief(plan({}), new Date('2026-12-01T08:00:00Z'))).toContain('has ended')
    expect(goalBrief(plan({ planned_cents: 0 }, { suggestions: [] }), NOW)).toContain('No open job fits')
  })
})
