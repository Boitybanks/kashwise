import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { IdentityVerification } from '../src/components/IdentityVerification'

afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(navigator, 'mediaDevices') })
function sample() {
  fireEvent.click(screen.getByRole('button', { name: 'Use sample details' }))
  fireEvent.click(screen.getByRole('button', { name: 'Check ID format' }))
}
function cameraMock() {
  const stop = vi.fn()
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  return { stop, getUserMedia }
}
describe('optional identity demonstration', () => {
  it('does not request a camera before explicit consent action', () => {
    const { getUserMedia } = cameraMock()
    render(<IdentityVerification onComplete={vi.fn()} />)
    sample()
    expect(screen.getByRole('button', { name: 'Open camera' })).toBeVisible()
    expect(getUserMedia).not.toHaveBeenCalled()
  })
  it('rejects bad checksum and clears sensitive inputs on a valid transition', () => {
    render(<IdentityVerification onComplete={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('SA ID number'), { target: { value: '8001015009088' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check ID format' }))
    expect(screen.getByRole('alert')).toHaveTextContent('checksum')
    sample()
    fireEvent.click(screen.getByRole('button', { name: 'Back to ID format' }))
    expect(screen.getByLabelText('SA ID number')).toHaveValue('')
    expect(screen.getByLabelText('Full date of birth')).toHaveValue('')
  })
  it('does not infer an adult birth century', () => {
    render(<IdentityVerification onComplete={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('SA ID number'), { target: { value: '1506015009082' } })
    fireEvent.change(screen.getByLabelText('Full date of birth'), { target: { value: '2015-06-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check ID format' }))
    expect(screen.getByRole('alert')).toHaveTextContent('18 or older')
  })
  it('labels skipped selfie honestly and emits no personal details or verified status', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<IdentityVerification onComplete={onComplete} />)
    sample()
    fireEvent.click(screen.getByRole('button', { name: 'Skip selfie — continue demo' }))
    expect(screen.getByRole('status')).toHaveTextContent('no biometric analysis')
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByText(/ID format checked · selfie skipped/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to job board' }))
    expect(onComplete).toHaveBeenCalledWith({ status: 'demo_completed', simulated: true, idFormatChecked: true, selfieCaptured: false })
  })
  it('stops a live camera on unmount and refuses an unready capture', async () => {
    const { stop } = cameraMock()
    const view = render(<IdentityVerification onComplete={vi.fn()} />)
    sample()
    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Snap selfie' }))
    expect(screen.getByRole('alert')).toHaveTextContent('not ready')
    expect(screen.queryByText('Demo completed')).not.toBeInTheDocument()
    view.unmount()
    expect(stop).toHaveBeenCalled()
  })
  it('shows permission failure without pretending to capture a selfie', async () => {
    const { getUserMedia } = cameraMock()
    getUserMedia.mockRejectedValue(new Error('denied'))
    render(<IdentityVerification onComplete={vi.fn()} />)
    sample()
    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('permission declined')
    expect(screen.queryByRole('button', { name: 'Snap selfie' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip selfie — continue demo' })).toBeEnabled()
  })
})
