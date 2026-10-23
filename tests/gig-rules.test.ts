import { describe, expect, it } from 'vitest'
import { allowedActions, nextStepText, viewerOf } from '../src/lib/gig-rules'
import type { Gig } from '../src/lib/types'

const base: Pick<Gig, 'customer_id' | 'assigned_worker_id' | 'worker_done_at'> = {
  customer_id: 'c',
  assigned_worker_id: null,
  worker_done_at: null,
}

describe('gig lifecycle rules (UI mirror of the RPCs)', () => {
  it('identifies the viewer', () => {
    expect(viewerOf({ customer_id: 'c', assigned_worker_id: 'w' }, 'c')).toBe('customer')
    expect(viewerOf({ customer_id: 'c', assigned_worker_id: 'w' }, 'w')).toBe('assigned_worker')
    expect(viewerOf({ customer_id: 'c', assigned_worker_id: 'w' }, 'x')).toBe('other_worker')
    expect(viewerOf({ customer_id: 'c', assigned_worker_id: null }, null)).toBe('guest')
  })
  it('open gig: workers apply, customer selects or cancels', () => {
    expect(allowedActions({ ...base, status: 'open' }, 'other_worker')).toEqual(['apply'])
    expect(allowedActions({ ...base, status: 'open' }, 'other_worker', { hasApplied: true, applicationPending: true })).toEqual(['withdraw'])
    expect(allowedActions({ ...base, status: 'open' }, 'customer')).toEqual(['select_worker', 'cancel'])
  })
  it('matched → worker starts; customer can only cancel (no confirmation before work)', () => {
    const g = { ...base, assigned_worker_id: 'w', status: 'matched' as const }
    expect(allowedActions(g, 'assigned_worker')).toContain('start')
    expect(allowedActions(g, 'customer')).toEqual(['cancel', 'reveal_contact'])
    expect(allowedActions(g, 'assigned_worker')).not.toContain('decline_booking')
  })
  it('booked service → the provider can decline until they start; the client can still cancel', () => {
    const g = { ...base, assigned_worker_id: 'w', service_id: 's', status: 'matched' as const }
    expect(allowedActions(g, 'assigned_worker')).toEqual(['start', 'reveal_contact', 'decline_booking'])
    expect(allowedActions(g, 'customer')).toEqual(['cancel', 'reveal_contact'])
    expect(allowedActions({ ...g, status: 'in_progress' }, 'assigned_worker')).not.toContain('decline_booking')
    expect(nextStepText(g, 'assigned_worker')).toMatch(/New booking/)
    expect(nextStepText(g, 'customer')).toMatch(/Booked!/)
  })
  it('in progress → worker marks done once; customer cannot cancel', () => {
    const g = { ...base, assigned_worker_id: 'w', status: 'in_progress' as const }
    expect(allowedActions(g, 'assigned_worker')).toContain('mark_done')
    expect(allowedActions({ ...g, worker_done_at: 'now' }, 'assigned_worker')).not.toContain('mark_done')
    expect(allowedActions(g, 'customer')).not.toContain('cancel')
    expect(allowedActions(g, 'customer')).not.toContain('confirm_completion')
    expect(allowedActions({ ...g, worker_done_at: 'now' }, 'customer')).toContain('confirm_completion')
  })
  it('completed → customer reviews exactly once; strangers get nothing', () => {
    const g = { ...base, assigned_worker_id: 'w', status: 'completed' as const }
    expect(allowedActions(g, 'customer')).toContain('review')
    expect(allowedActions(g, 'customer', { hasReview: true })).not.toContain('review')
    expect(allowedActions(g, 'other_worker')).toEqual([])
  })
  it('gives plain-language next steps', () => {
    expect(nextStepText({ status: 'completed', worker_done_at: null }, 'assigned_worker')).toMatch(/portfolio/)
    expect(nextStepText({ status: 'in_progress', worker_done_at: 'x' }, 'customer')).toMatch(/confirm/i)
  })
})
