import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeeBreakdown } from '../src/components/gig/FeeBreakdown'

describe('<FeeBreakdown />', () => {
  it('shows the client only what they pay', () => {
    render(<FeeBreakdown payoutCents={50_000} perspective="customer" />)
    expect(screen.getByText('R500')).toBeInTheDocument()
    expect(screen.queryByText('R450')).not.toBeInTheDocument()
    expect(screen.queryByText(/fee|VAT/i)).not.toBeInTheDocument()
  })
  it('shows the provider only what they receive', () => {
    render(<FeeBreakdown payoutCents={50_000} perspective="worker" />)
    expect(screen.getByText('You receive')).toBeInTheDocument()
    expect(screen.getByText('R450')).toBeInTheDocument()
    expect(screen.queryByText('R500')).not.toBeInTheDocument()
    expect(screen.queryByText(/fee|VAT/i)).not.toBeInTheDocument()
  })
  it('while listing a service, the provider also sees the client price', () => {
    render(<FeeBreakdown payoutCents={50_000} perspective="worker" counterpart />)
    expect(screen.getByText('Clients see')).toBeInTheDocument()
    expect(screen.getByText('R500')).toBeInTheDocument()
  })
})
