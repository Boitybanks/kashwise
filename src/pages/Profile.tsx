import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, LogOut } from 'lucide-react'
import { createProfile, hasSavedPhone, removePhone, savePhone, updateProfile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES } from '../lib/categories'
import { friendlyError } from '../lib/errors'
import type { Role } from '../lib/types'
import { firstError, phoneSchema, profileSchema } from '../lib/validation'
import { Button, ButtonLink, Card, Field, PageHeader } from '../components/ui'
import { AreaSelect } from '../components/AreaSelect'
import { CategoryIcon } from '../components/CategoryIcon'
import { DictatePanel } from '../components/DictatePanel'
import { useToast } from '../components/ui/toast'
import { ProfilePhoto } from '../components/profile/ProfilePhoto'
import { DocumentsManager } from '../components/profile/Documents'
import { IdentityCard } from '../components/identity/IdentityCard'
import { safeNext } from '../lib/navigation'

export default function Profile() {
  const { profile } = useAuth()
  // Re-mount the form when the signed-in profile changes (e.g. demo account switch).
  return <ProfileForm key={profile?.id ?? 'setup'} />
}

function ProfileForm() {
  const { userId, profile, refreshProfile, signOut, session } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isSetup = !profile
  const readOnly = Boolean(profile?.is_demo)
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? (session?.user.user_metadata?.display_name as string | undefined) ?? '',
    role: (profile?.role ?? 'worker') as Role,
    area_slug: profile?.area_slug ?? '',
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    skills: profile?.skills ?? [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)
  const phoneQ = useQuery({ queryKey: ['has-phone', userId], queryFn: () => hasSavedPhone(userId!), enabled: Boolean(userId) && !isSetup })

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const toggleSkill = (slug: string) => set('skills', form.skills.includes(slug) ? form.skills.filter((s) => s !== slug) : [...form.skills, slug])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = profileSchema.safeParse(form)
    if (!parsed.success) {
      const fields = firstError(parsed.error)
      setErrors(fields)
      document.getElementById(Object.keys(fields)[0])?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    const data = { ...parsed.data, headline: parsed.data.headline || null, bio: parsed.data.bio || null }
    try {
      if (isSetup) await createProfile({ id: userId!, ...data })
      else await updateProfile(userId!, data)
      await refreshProfile()
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] })
      toast.show('Profile saved.')
      if (isSetup || params.get('welcome')) navigate(next ?? (data.role === 'worker' ? '/discover' : '/gigs/new'))
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleOpen() {
    try {
      await updateProfile(userId!, { open_to_work: profile?.open_to_work === false })
      await refreshProfile()
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    }
  }

  async function onSavePhone(e: FormEvent) {
    e.preventDefault()
    const parsed = phoneSchema.safeParse(phone)
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0].message)
      return
    }
    setPhoneError('')
    setPhoneBusy(true)
    try {
      await savePhone(userId!, parsed.data)
      setPhone('')
      await phoneQ.refetch()
      toast.show('Phone number encrypted and saved.')
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setPhoneBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {params.get('welcome') && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-brand-300 ring-1 ring-brand-100">
          <p className="text-sm"><strong>Your account is ready.</strong></p>
        </div>
      )}
      {readOnly && (
        <p className="mb-5 rounded-2xl bg-sun-50 p-4 text-sm text-sun-700 ring-1 ring-sun-100">
          Editing is off on this shared account.</p>
      )}
      <PageHeader title={isSetup ? 'Set up your profile' : 'Your profile'} action={!isSetup && userId ? <ButtonLink to={`/w/${userId}`} variant="secondary" size="sm">View ProofScript</ButtonLink> : undefined} />
      {profile && <ProfilePhoto profile={profile} readOnly={readOnly} onChanged={refreshProfile} />}
      <DictatePanel
        kind="bio"
        title="Say who you are and what you do"
        placeholder="I paint houses in Soweto. I have been doing it for six years, I am never late and I clean up after."
        action="Write my profile"
        onDraft={(draft) => {
          const before = form
          setForm((f) => ({ ...f, headline: draft.headline || f.headline, bio: draft.bio, skills: f.skills.length ? f.skills : draft.skills }))
          return () => setForm(before)
        }}
        readBack={(draft) => `${draft.headline}. ${draft.bio}`}
      />
      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-5">
        <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
        <Card className="space-y-4 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">I mostly want to…</legend>
            <div className="grid grid-cols-2 gap-2">
              {([['worker', 'Find work'], ['customer', 'Hire help']] as [Role, string][]).map(([r, label]) => (
                <button key={r} type="button" className="chip justify-center" aria-pressed={form.role === r} onClick={() => set('role', r)}>{label}</button>
              ))}
            </div>
          </fieldset>
          <Field label="Name" htmlFor="display_name" error={errors.display_name}>
            <input id="display_name" className="input" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} aria-invalid={Boolean(errors.display_name) || undefined} />
          </Field>
          <Field label="Area" htmlFor="area_slug" error={errors.area_slug} hint="Only your area is public.">
            <AreaSelect id="area_slug" value={form.area_slug} onChange={(v) => set('area_slug', v)} invalid={Boolean(errors.area_slug)} />
          </Field>
          <Field label="Headline" htmlFor="headline" error={errors.headline} optional>
            <input id="headline" className="input" maxLength={80} value={form.headline} onChange={(e) => set('headline', e.target.value)} />
          </Field>
          <Field label="About you" htmlFor="bio" error={errors.bio} optional>
            <textarea id="bio" rows={3} maxLength={500} className="input" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          </Field>
        </Card>

        {form.role === 'worker' && !isSetup && (
          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-semibold">Open to work</p>
              <p className="text-sm text-muted">{profile?.open_to_work === false ? 'Clients won’t find you in the workers list.' : 'Clients can find you in the workers list.'}</p>
            </div>
            <button type="button" role="switch" aria-checked={profile?.open_to_work !== false} aria-label="Open to work" onClick={toggleOpen}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${profile?.open_to_work === false ? 'bg-surface-elevated ring-1 ring-line' : 'bg-brand-600'}`}>
              <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${profile?.open_to_work === false ? 'left-1' : 'left-6'}`} />
            </button>
          </Card>
        )}

        <Card className="p-5">
          <fieldset>
            <legend className="font-semibold">Your skills</legend>
            <div className="mb-3" />
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c.slug} type="button" className="chip" aria-pressed={form.skills.includes(c.slug)} onClick={() => toggleSkill(c.slug)}>
                  <CategoryIcon category={c.slug} className="size-4" /> {c.label}
                </button>
              ))}
            </div>
          </fieldset>
        </Card>
        <Button type="submit" size="lg" block loading={busy}>{isSetup || params.get('welcome') ? next ? 'Save and return to your task' : form.role === 'worker' ? 'Save and find work' : 'Save and post a gig' : 'Save profile'}</Button>
        </fieldset>
      </form>

      {!isSetup && !readOnly && (
        <Card className="mt-6 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500"><Lock className="size-4" aria-hidden /></span>
            <div>
              <h2 className="font-semibold">Phone number (private)</h2>
              <p className="text-sm text-muted">
                Stored encrypted and shared through the gig’s contact panel only after you are matched. Your phone number is never shown on your public profile.
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold">{phoneQ.data ? 'A phone number is saved (encrypted).' : 'No phone number saved yet.'}</p>
          <form onSubmit={onSavePhone} noValidate className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label htmlFor="phone" className="sr-only">Phone number</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" className="input" placeholder="071 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(phoneError) || undefined} aria-describedby={phoneError ? 'phone-error' : undefined} />
              {phoneError && <p id="phone-error" className="mt-1 text-sm font-medium text-clay-700">{phoneError}</p>}
            </div>
            <Button type="submit" variant="secondary" loading={phoneBusy}>{phoneQ.data ? 'Replace' : 'Save'}</Button>
            {phoneQ.data && (
              <Button variant="danger" disabled={phoneBusy} onClick={async () => {
                setPhoneBusy(true)
                try { await removePhone(userId!); await phoneQ.refetch(); toast.show('Phone number removed.') }
                catch (err) { toast.show(friendlyError(err), 'error') }
                finally { setPhoneBusy(false) }
              }}>Remove</Button>
            )}
          </form>
        </Card>
      )}

      {!isSetup && userId && profile && <IdentityCard userId={userId} displayName={profile.display_name} readOnly={readOnly} />}
      {!isSetup && userId && <DocumentsManager userId={userId} readOnly={readOnly} />}
      <div className="mt-6 flex justify-center">
        <Button variant="ghost" onClick={async () => { await signOut(); navigate('/') }}><LogOut className="size-4" aria-hidden /> Sign out</Button>
      </div>
    </div>
  )
}
