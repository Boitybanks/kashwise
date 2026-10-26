import { AlertTriangle, CircleCheck, Lock } from 'lucide-react'
import { formatDate } from '../../lib/format'
import { GENDER_LABEL, type Gender, type IdentityDraft } from '../../lib/identity'
import { validateSaId } from '../../lib/sa-id'
import { Button, Field } from '../ui'

/** Legal name, SA ID number, gender and home address, with the privacy notice. Controlled by the parent form. */
export function IdentityFields({ value, onChange, errors }: {
  value: IdentityDraft
  /** `field` lets the parent clear that field's error as soon as it is edited. */
  onChange: (next: IdentityDraft, field: keyof IdentityDraft) => void
  errors: Record<string, string>
}) {
  const set = <K extends keyof IdentityDraft>(key: K, v: IdentityDraft[K]) => onChange({ ...value, [key]: v }, key)
  const err = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {})
  const idCheck = value.id_number.replace(/[\s-]/g, '').length === 13 ? validateSaId(value.id_number) : null

  return (
    <fieldset className="space-y-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">Your identity (private)</legend>
      <p className="flex gap-2 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Your ID number, legal name and home address are encrypted on this device before they’re saved, and are never shown on your
        profile. KashWise checks that the ID number is correctly formed; it can’t confirm it with Home Affairs.
      </p>
      <Field label="Full name as it appears on your ID" htmlFor="legal_name" error={errors.legal_name}>
        <input id="legal_name" autoComplete="name" className="input" value={value.legal_name} onChange={(e) => set('legal_name', e.target.value)} {...err('legal_name')} />
      </Field>
      <Field
        label="SA ID number"
        htmlFor="id_number"
        error={errors.id_number}
        hint={idCheck?.ok ? <span className="inline-flex items-center gap-1 text-brand-700"><CircleCheck className="size-3.5" aria-hidden /> Valid ID number format · born {formatDate(`${idCheck.details.dateOfBirth}T12:00:00`)}</span> : '13 digits, from your green ID book or smart ID card.'}
      >
        <input id="id_number" inputMode="numeric" autoComplete="off" spellCheck={false} className="input font-mono tracking-[0.12em]" value={value.id_number}
          onChange={(e) => set('id_number', e.target.value)} {...(errors.id_number ? err('id_number') : { 'aria-describedby': 'id_number-hint' })} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Gender</legend>
        <div className="grid grid-cols-2 gap-2" id="gender" tabIndex={-1}>
          {(['male', 'female'] as Gender[]).map((g) => (
            <label key={g} className={`flex cursor-pointer items-center justify-center rounded-xl border p-3 font-semibold transition focus-within:ring-2 focus-within:ring-brand-600 ${value.gender === g ? 'border-brand-600 bg-brand-50 text-brand-500' : 'border-line bg-surface text-ink-soft hover:border-brand-500'}`}>
              <input type="radio" name="gender" value={g} checked={value.gender === g} onChange={() => set('gender', g)} className="sr-only" />
              {GENDER_LABEL[g]}
            </label>
          ))}
        </div>
        {errors.gender && <p id="gender-error" className="mt-1 text-sm font-medium text-clay-700">{errors.gender}</p>}
      </fieldset>
      <Field label="Home address" htmlFor="home_address" error={errors.home_address} hint="Street, suburb, city and postal code. Never shown to anyone on KashWise.">
        <textarea id="home_address" rows={3} autoComplete="street-address" className="input" value={value.home_address} onChange={(e) => set('home_address', e.target.value)} {...err('home_address')} />
      </Field>
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input id="consent" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={value.consent} onChange={(e) => set('consent', e.target.checked)} {...err('consent')} />
          <span>I confirm this is my own ID number and that my name matches my ID.</span>
        </label>
        {errors.consent && <p id="consent-error" className="mt-1 text-sm font-medium text-clay-700">{errors.consent}</p>}
      </div>
    </fieldset>
  )
}

/** Shown when the details don't line up. The person either fixes them or confirms they are correct. */
export function MismatchPrompt({ warnings, busy, confirmLabel, onEdit, onConfirm }: {
  warnings: string[]
  busy?: boolean
  confirmLabel: string
  onEdit: () => void
  onConfirm: () => void
}) {
  return (
    <div role="alert" className="rounded-xl bg-sun-50 p-4 text-sm ring-1 ring-inset ring-sun-100">
      <p className="flex items-center gap-2 font-bold text-sun-700"><AlertTriangle className="size-4 shrink-0" aria-hidden /> Please check your details</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit} disabled={busy}>Edit my details</Button>
        <Button size="sm" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  )
}
