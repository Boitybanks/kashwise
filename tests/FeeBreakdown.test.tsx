import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeeBreakdown } from '../src/components/gig/FeeBreakdown'

describe('<FeeBreakdown />', () => {
  it('shows the client what they pay, with nothing added — not the provider’s take-home', () => {
    render(<FeeBreakdown payoutCents={50_000} perspective="customer" />)
    expect(screen.getByText('R500')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is added on top/)).toBeInTheDocument()
    expect(screen.queryByText('R450')).not.toBeInTheDocument()
    expect(screen.queryByText(/VAT/)).not.toBeInTheDocument()
  })
  it('tells the provider what they receive; the fee is the only deduction and no VAT is taken', () => {
    render(<FeeBreakdown payoutCents={50_000} perspective="worker" />)
    expect(screen.getByText('You receive')).toBeInTheDocument()
    expect(screen.getByText('R450')).toBeInTheDocument()
    expect(screen.getByText('After KashWise’s 10% fee (R50), the only deduction. No VAT is taken from your pay.')).toBeInTheDocument()
    expect(screen.queryByText('R500')).not.toBeInTheDocument()
  })
  it('while posting, previews what the other side will see', () => {
    const { unmount } = render(<FeeBreakdown payoutCents={50_000} perspective="customer" counterpart />)
    expect(screen.getByText(/Service providers see/)).toBeInTheDocument()
    expect(screen.getByText('R450')).toBeInTheDocument()
    unmount()
    render(<FeeBreakdown payoutCents={50_000} perspective="worker" counterpart />)
    expect(screen.getByText('Clients see')).toBeInTheDocument()
    expect(screen.getByText('R500')).toBeInTheDocument()
  })
})
