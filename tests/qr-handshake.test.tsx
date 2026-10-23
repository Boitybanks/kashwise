import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatHandshakeCode, handshakeUrl, parseHandshake } from '../src/lib/qr-scan'

const gigId = 'b29819ec-1e85-4fcf-8de7-85e37d7560a5'

describe('handshake codes', () => {
  it('reads the code from a scanned link', () => {
    expect(parseHandshake(handshakeUrl('https://sidegigs-codecraft.netlify.app', gigId, 'start', 'K7Q4MX'))).toEqual({ code: 'K7Q4MX', step: 'start', gigId })
  })
  it('accepts a typed code in any case, with or without the dash', () => {
    expect(parseHandshake('k7q-4mx')).toEqual({ code: 'K7Q4MX' })
    expect(parseHandshake(' K7Q 4MX ')).toEqual({ code: 'K7Q4MX' })
  })
  it('rejects anything that is not a SideGigs code', () => {
    expect(parseHandshake('K7Q4M')).toBeNull()
    expect(parseHandshake('K7Q4MO')).toBeNull() // O and 0 are never used
    expect(parseHandshake('https://example.com/?code=nope')).toBeNull()
  })
  it('formats codes for reading aloud', () => {
    expect(formatHandshakeCode('K7Q4MX')).toBe('K7Q-4MX')
  })
})

const fetchHandshakes = vi.fn()
vi.mock('../src/lib/api', () => ({ fetchHandshakes: (id: string) => fetchHandshakes(id) }))
const { ScanCodeDialog } = await import('../src/components/gig/ScanCodeDialog')
const { JobQrMenu } = await import('../src/components/gig/JobQrMenu')

afterEach(() => Reflect.deleteProperty(navigator, 'mediaDevices'))

describe('<ScanCodeDialog /> (worker)', () => {
  it('falls back to typing the code when there is no camera', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ScanCodeDialog step="start" gigId={gigId} onSubmit={onSubmit} onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/can’t open the camera/)
    fireEvent.change(screen.getByLabelText('Or type the 6-character code'), { target: { value: 'k7q-4mx' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start job' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('K7Q4MX'))
  })
  it('refuses the finish code when starting, and shows server errors', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('That code doesn’t match.'))
    render(<ScanCodeDialog step="start" gigId={gigId} onSubmit={onSubmit} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Or type the 6-character code')
    fireEvent.change(input, { target: { value: handshakeUrl('https://x.test', gigId, 'finish', 'K7Q4MX') } })
    fireEvent.click(screen.getByRole('button', { name: 'Start job' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That’s the finish-job code')
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'ABC234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start job' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code doesn’t match.')
  })
})

describe('<JobQrMenu /> (customer)', () => {
  function renderMenu(status: 'matched' | 'in_progress') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <JobQrMenu gig={{ id: gigId, status, worker_done_at: null }} workerName="Sipho" />
      </QueryClientProvider>,
    )
  }
  it('offers the start code before the job and shows it with the typed code', async () => {
    fetchHandshakes.mockResolvedValue([{ step: 'start', code: 'K7Q4MX', used_at: null }, { step: 'finish', code: 'ABC234', used_at: null }])
    renderMenu('matched')
    fireEvent.click(screen.getByRole('button', { name: /Show a QR code/ }))
    const finish = await screen.findByRole('button', { name: /Finish-job QR code/ })
    expect(finish).toBeDisabled()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Start-job QR code/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Start-job QR code/ }))
    expect(screen.getByText('K7Q-4MX')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Start-job QR code for Sipho to scan/ })).toBeInTheDocument()
  })
  it('marks the start code as scanned once the job is under way', async () => {
    fetchHandshakes.mockResolvedValue([{ step: 'start', code: 'K7Q4MX', used_at: '2026-09-26T08:00:00Z' }, { step: 'finish', code: 'ABC234', used_at: null }])
    renderMenu('in_progress')
    fireEvent.click(screen.getByRole('button', { name: /Show a QR code/ }))
    expect(await screen.findByRole('button', { name: /Start-job QR code Scanned/ })).toBeDisabled()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Finish-job QR code/ })).toBeEnabled())
  })
})
