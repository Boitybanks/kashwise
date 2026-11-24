import { AlertTriangle, CircleCheck, Lock } from 'lucide-react'
import { COMMON_COUNTRIES, countryName, otherCountries } from '../../lib/countries'
import { formatDate } from '../../lib/format'
import { DOCUMENT_LABEL, DOCUMENT_TYPES, GENDER_LABEL, type DocumentType, type Gender, type IdentityDraft } from '../../lib/identity'
import { validateSaId } from '../../lib/sa-id'
import { todayInSA } from '../../lib/validation'
import { Button, Field } from '../ui'

const NUMBER_LABEL: Record<DocumentType, string> = { sa_id: 'SA ID number', passport: 'Passport number', permit: 'Permit number' }
const NUMBER_HINT: Record<DocumentType, string> = {
  sa_id: '13 digits, from your green ID book or smart ID card.',
  passport: 'As printed on the photo page of your passport.',
  permit: 'From your Section 22 asylum-seeker permit or Section 24 refugee permit.',
}
const COUNTRY_LABEL: Record<Exclude<DocumentType, 'sa_id'>, string> = { passport: 'Country that issued your passport', permit: 'Your nationality' }

/** Legal name, ID document, gender and home address, with the privacy notice. Controlled by the parent form. */
export function IdentityFields({ value, onChange, errors }: {
  value: IdentityDraft
  /** `field` lets the parent clear that field's error as soon as it is edited. */
  onChange: (next: IdentityDraft, field: keyof IdentityDraft) => void
  errors: Record<string, string>
}) {
  const set = <K extends keyof IdentityDraft>(key: K, v: IdentityDraft[K]) => onChange({ ...value, [key]: v }, key)
  const err = (k: string) => (errors[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {})
  const type = value.document_type
  const idCheck = type === 'sa_id' && value.id_number.replace(/[\s-]/g, '').length === 13 ? validateSaId(value.id_number) : null
  // I clear the number when the document type changes, so an SA ID never gets sent as a passport number.
  const chooseType = (next: DocumentType) => {
    if (next !== type) onChange({ ...value, document_type: next, id_number: '', country: '', date_of_birth: '' }, 'document_type')
  }

  return (
    <fieldset className="space-y-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold">Your identity (private)</legend>
      <p className="flex gap-2 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Your document number, legal name and home address are encrypted on this device before they’re saved, and are never shown on
        your profile. KashWise checks that the number is correctly formed; it can’t confirm it with Home Affairs.
      </p>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">ID document</legend>
        <div className="grid grid-cols-3 gap-2" id="document_type" tabIndex={-1} role="radiogroup">
          {DOCUMENT_TYPES.map((t) => (
            <label key={t} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border p-2 text-center text-sm font-semibold leading-tight transition focus-within:ring-2 focus-within:ring-brand-600 ${type === t ? 'border-brand-600 bg-brand-50 text-brand-500' : 'border-line bg-surface text-ink-soft hover:border-brand-500'}`}>
              <input type="radio" name="document_type" value={t} checked={type === t} onChange={() => chooseType(t)} className="sr-only" />
              {DOCUMENT_LABEL[t]}
            </label>
          ))}
        </div>
        {type !== 'sa_id' && <p className="mt-2 text-xs text-muted">Everyone is welcome on KashWise. We don’t ask about visa or work-permit status.</p>}
        {errors.document_type && <p id="document_type-error" className="mt-1 text-sm font-medium text-clay-700">{errors.document_type}</p>}
      </fieldset>
      <Field label={`Full name as it appears on your ${type === 'sa_id' ? 'ID' : type === 'passport' ? 'passport' : 'permit'}`} htmlFor="legal_name" error={errors.legal_name}>
        <input id="legal_name" autoComplete="name" className="input" value={value.legal_name} onChange={(e) => set('legal_name', e.target.value)} {...err('legal_name')} />
      </Field>
      <Field
        label={NUMBER_LABEL[type]}
        htmlFor="id_number"
        error={errors.id_number}
        hint={idCheck?.ok ? <span className="inline-flex items-center gap-1 text-brand-500"><CircleCheck className="size-3.5" aria-hidden /> Valid ID number format · born {formatDate(`${idCheck.details.dateOfBirth}T12:00:00`)}</span> : NUMBER_HINT[type]}
      >
        <input id="id_number" inputMode={type === 'sa_id' ? 'numeric' : 'text'} autoCapitalize={type === 'sa_id' ? 'off' : 'characters'} autoComplete="off" spellCheck={false}
          className="input font-mono tracking-[0.12em]" value={value.id_number}
          onChange={(e) => set('id_number', e.target.value)} {...(errors.id_number ? err('id_number') : { 'aria-describedby': 'id_number-hint' })} />
      </Field>
      {type !== 'sa_id' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={COUNTRY_LABEL[type]} htmlFor="country" error={errors.country}>
            <select id="country" className="input" value={value.country} onChange={(e) => set('country', e.target.value)} {...err('country')}>
              <option value="">Choose a country</option>
              <optgroup label="Most common">
                {COMMON_COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </optgroup>
              <optgroup label="All countries">
                {otherCountries().map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Date of birth" htmlFor="date_of_birth" error={errors.date_of_birth}>
            <input id="date_of_birth" type="date" className="input" min="1900-01-01" max={todayInSA()} value={value.date_of_birth}
              onChange={(e) => set('date_of_birth', e.target.value)} {...err('date_of_birth')} />
          </Field>
        </div>
      )}
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
          <span>I confirm this is my own {type === 'sa_id' ? 'ID number' : type === 'passport' ? 'passport' : 'permit'} and that my name matches it.</span>
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
      <p className="flex items-center gap-2 font-semibold text-sun-700"><AlertTriangle className="size-4 shrink-0" aria-hidden /> Please check your details</p>
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
