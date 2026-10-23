import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../src/components/ui/toast'

const fetchWorkId = vi.fn<(gigId: string) => Promise<string | null>>()
vi.mock('../src/lib/api', () => ({ fetchWorkId: (id: string) => fetchWorkId(id) }))
const { WorkIdCard } = await import('../src/components/gig/WorkIdCard')

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <WorkIdCard gigId="g1" gigTitle="Paint my front wall" myName="Thandi" partnerName="Sipho" perspective="customer" />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('<WorkIdCard />', () => {
  it('shows the Work ID to the matched pair', async () => {
    fetchWorkId.mockResolvedValue('SG-7KQ4-M2XP')
    renderCard()
    expect(await screen.findByText('SG-7KQ4-M2XP')).toBeInTheDocument()
    expect(screen.getByText(/Only you and Sipho can see this/)).toBeInTheDocument()
    expect(fetchWorkId).toHaveBeenCalledWith('g1')
  })
  it('renders nothing when there is no Work ID for this viewer', async () => {
    fetchWorkId.mockResolvedValue(null)
    renderCard()
    await vi.waitFor(() => expect(fetchWorkId).toHaveBeenCalled())
    expect(screen.queryByText('Work ID')).not.toBeInTheDocument()
  })
})
