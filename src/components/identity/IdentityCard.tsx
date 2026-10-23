import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IdCard } from 'lucide-react'
import { fetchMyIdentity, saveIdentity } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { EMPTY_IDENTITY, GENDER_LABEL, identitySchema, identityWarnings, withoutError, type IdentityDraft } from '../../lib/identity'
import { firstError } from '../../lib/validation'
import { Button, Card } from '../ui'
import { useToast } from '../ui/toast'
import { IdentityFields, MismatchPrompt } from './IdentityFields'

/** Profile card: accounts created before identity details were required can add them here, and anyone can update them. */
export function IdentityCard({ userId, displayName, readOnly }: { userId: string; displayName: string; readOnly: boolean }) {
  const toast = useToast()
  const q = useQuery({ queryKey: ['my-identity', userId], queryFn: () => fetchMyIdentity(userId) })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<IdentityDraft>(EMPTY_IDENTITY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const change = (next: IdentityDraft, field: keyof IdentityDraft) => {
    setDraft(next)
    setErrors((e) => withoutError(e, field))
    setWarnings([])
  }

  async function save(confirmed: boolean) {
    const parsed = identitySchema.safeParse(draft)
    if (!parsed.success) {
      const fields = firstError(parsed.error)
      setErrors(fields)
      document.getElementById(Object.keys(fields)[0])?.focus()
      return
    }
    setErrors({})
    const found = identityWarnings({ displayName, legalName: parsed.data.legal_name, gender: parsed.data.gender, idNumber: parsed.data.id_number })
    if (found.length && !confirmed) return setWarnings(found)
    setBusy(true)
    try {
      await saveIdentity(userId, parsed.data)
      await q.refetch()
      setEditing(false)
      setDraft(EMPTY_IDENTITY)
      setWarnings([])
      toast.show('Identity details encrypted and saved.')
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saved = q.data
  return (
    <Card className="mt-6 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><IdCard className="size-4" aria-hidden /></span>
        <div>
          <h2 className="font-bold">Identity details (private)</h2>
          <p className="text-sm text-muted">Your SA ID number, legal name, gender and home address. Encrypted, and never shown on your profile.</p>
        </div>
      </div>
      {readOnly ? (
        <p className="mt-3 text-sm text-muted">Shared demo accounts don’t hold identity details.</p>
      ) : saved && !editing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">✅ Saved {formatDate(saved.created_at)} · Gender: {GENDER_LABEL[saved.gender]}</p>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Update details</Button>
        </div>
      ) : !editing && !q.isPending ? (
        <div className="mt-3 rounded-xl bg-sun-50 p-3 text-sm text-sun-700 ring-1 ring-inset ring-sun-100">
          New accounts add these at sign-up. Please add yours too.
          <Button size="sm" className="ml-3" onClick={() => setEditing(true)}>Add identity details</Button>
        </div>
      ) : editing ? (
        <form className="mt-4 space-y-4" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void save(false) }}>
          <IdentityFields value={draft} onChange={change} errors={errors} />
          {warnings.length > 0 && (
            <MismatchPrompt warnings={warnings} busy={busy} confirmLabel="My details are correct, save" onEdit={() => { setWarnings([]); document.getElementById('legal_name')?.focus() }} onConfirm={() => void save(true)} />
          )}
          <div className="flex gap-2">
            <Button type="submit" loading={busy && !warnings.length}>Save identity details</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setWarnings([]); setErrors({}) }}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </Card>
  )
}
