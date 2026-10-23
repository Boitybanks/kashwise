import { useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import { reviewSchema, firstError } from '../../lib/validation'
import { Button } from '../ui'

const labels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

export function ReviewForm({ workerName, onSubmit }: { workerName: string; onSubmit: (rating: number, comment: string) => Promise<void> }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = reviewSchema.safeParse({ rating, comment })
    if (!parsed.success) {
      setError(Object.values(firstError(parsed.error))[0])
      return
    }
    setError('')
    setBusy(true)
    try {
      await onSubmit(parsed.data.rating, parsed.data.comment ?? '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset>
        <legend className="font-bold">How did {workerName} do?</legend>
        <p className="text-xs text-muted">Your review is added to their verified portfolio and helps them get their next job.</p>
        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''} — ${labels[n]}`}
              onClick={() => setRating(n)}
              className="rounded-lg p-1"
            >
              <Star className={`size-9 ${n <= rating ? 'fill-sun-400 text-sun-400' : 'text-line'}`} aria-hidden />
            </button>
          ))}
          <span className="ml-2 text-sm font-semibold text-muted">{labels[rating]}</span>
        </div>
      </fieldset>
      <label htmlFor="review-comment" className="block text-sm font-semibold">What would you tell a neighbour about their work? <span className="font-normal text-muted">(optional)</span></label>
      <textarea id="review-comment" rows={3} maxLength={500} className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p role="alert" className="text-sm font-medium text-clay-700">{error}</p>}
      <Button type="submit" loading={busy}>Submit review</Button>
    </form>
  )
}
