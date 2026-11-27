import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, BadgeCheck, Briefcase, FileUp, Lock, LogOut, RotateCcw, Sparkles, TrendingUp } from 'lucide-react'
import { createProfile, discoverGigs, fetchWorkerStats, hasSavedPhone, removePhone, savePhone, updateProfile, uploadDocument } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CATEGORIES, categoryLabel } from '../lib/categories'
import {
  extractTextFromCvFile,
  formatCleanBio,
  loadStoredCvDraft,
  mergeCompletedJobSkills,
  parseCvText,
  saveStoredCvDraft,
  suggestJobsFromCv,
} from '../lib/cv-parser'
import { friendlyError } from '../lib/errors'
import { formatDay } from '../lib/format'
import { useAreaLookup, useAreas } from '../lib/hooks'
import { formatRand, workerNetCents } from '../lib/money'
import type { Role } from '../lib/types'
import { firstError, phoneSchema, profileSchema, validatePdf } from '../lib/validation'
import { Badge, Button, ButtonLink, Card, Field, PageHeader } from '../components/ui'
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
  const { data: areas } = useAreas()
  const areaOf = useAreaLookup()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isSetup = !profile
  const readOnly = Boolean(profile?.is_demo)
  const initialCleanBio = profile?.bio
    ? formatCleanBio(profile.bio, {
        skills: profile.skills,
        headline: profile.headline,
        areaName: areaOf(profile.area_slug)?.name ?? null,
      })
    : ''
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? (session?.user.user_metadata?.display_name as string | undefined) ?? '',
    role: (profile?.role ?? 'worker') as Role,
    area_slug: profile?.area_slug ?? '',
    headline: profile?.headline ?? '',
    bio: initialCleanBio,
    skills: profile?.skills ?? [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)

  // CV upload state
  const cvInputRef = useRef<HTMLInputElement>(null)
  const [cvBusy, setCvBusy] = useState(false)
  const storedCv = useMemo(() => loadStoredCvDraft(userId), [userId])
  const [cvFileName, setCvFileName] = useState<string | null>(storedCv?.file_name ?? null)
  const [cvSummaryNote, setCvSummaryNote] = useState<string | null>(null)
  const [cvUndoState, setCvUndoState] = useState<typeof form | null>(null)
  const [saveCvToDocs, setSaveCvToDocs] = useState(true)
  const [rawCvText, setRawCvText] = useState<string>('')

  const phoneQ = useQuery({ queryKey: ['has-phone', userId], queryFn: () => hasSavedPhone(userId!), enabled: Boolean(userId) && !isSetup })
  const statsQ = useQuery({
    queryKey: ['worker-stats', userId],
    queryFn: () => fetchWorkerStats(userId!),
    enabled: Boolean(userId) && !isSetup,
  })

  const completedCategories = useMemo(
    () => (statsQ.data?.categories ?? []).filter((c) => c.count > 0).map((c) => c.category),
    [statsQ.data?.categories],
  )
  const displayedSkills = useMemo(
    () => mergeCompletedJobSkills(form.skills, completedCategories),
    [form.skills, completedCategories],
  )

  const cvSuggestedJobs = useMemo(
    () => suggestJobsFromCv(rawCvText || `${form.headline} ${form.bio}`, displayedSkills),
    [rawCvText, form.headline, form.bio, displayedSkills],
  )

  const matchingGigsQ = useQuery({
    queryKey: ['discover-gigs', 0],
    queryFn: () => discoverGigs({ area: null, category: null, skills: null, page: 0, limit: 50 }),
    staleTime: 60_000,
    enabled: form.role === 'worker' && displayedSkills.length > 0,
  })
  const matchingOpenGigs = useMemo(
    () => (matchingGigsQ.data ?? []).filter((g) => displayedSkills.includes(g.category)).slice(0, 3),
    [matchingGigsQ.data, displayedSkills],
  )

  // Automatically persist any new skills earned from completed jobs or auto-healed CV bio to the worker's profile
  useEffect(() => {
    if (!userId || isSetup || readOnly) return
    const currentSkills = profile?.skills ?? []
    const merged = mergeCompletedJobSkills(currentSkills, completedCategories)
    const skillsChanged = merged.length > currentSkills.length
    const bioHealed = Boolean(profile?.bio && initialCleanBio && initialCleanBio !== profile.bio)
    if (skillsChanged || bioHealed) {
      updateProfile(userId, {
        ...(skillsChanged ? { skills: merged } : {}),
        ...(bioHealed ? { bio: initialCleanBio } : {}),
      })
        .then(() => refreshProfile())
        .catch(() => {})
    }
  }, [userId, isSetup, readOnly, profile?.skills, profile?.bio, initialCleanBio, completedCategories, refreshProfile])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const toggleSkill = (slug: string) =>
    set('skills', displayedSkills.includes(slug) ? displayedSkills.filter((s) => s !== slug) : [...displayedSkills, slug])

  function onPolishBio() {
    const areaName = areaOf(form.area_slug)?.name ?? null
    const polished = formatCleanBio(form.bio, {
      skills: displayedSkills,
      headline: form.headline,
      areaName,
    })
    if (polished) {
      set('bio', polished)
      toast.show('About you bio tidied up.')
    }
  }

  async function onCvFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCvBusy(true)
    setCvSummaryNote(null)
    try {
      const rawText = await extractTextFromCvFile(file)
      setRawCvText(rawText)
      const draft = parseCvText(rawText || file.name.replace(/\.[^.]+$/, ''), form.skills, areas ?? [])
      const snapshot = { ...form }
      const nextSkills = mergeCompletedJobSkills(draft.skills, completedCategories)
      const nextArea = form.area_slug || draft.area_slug || ''
      const nextHeadline = draft.headline || form.headline
      const nextBio =
        draft.bio ||
        formatCleanBio(form.bio, {
          skills: nextSkills,
          headline: nextHeadline,
          areaName: areaOf(nextArea)?.name ?? null,
        })
      const nextForm = {
        ...form,
        display_name: form.display_name || draft.display_name || '',
        area_slug: nextArea,
        headline: nextHeadline,
        bio: nextBio,
        skills: nextSkills,
      }
      setCvUndoState(snapshot)
      setForm(nextForm)
      setCvFileName(file.name)
      if (userId) {
        saveStoredCvDraft(
          userId,
          {
            ...draft,
            headline: nextHeadline,
            bio: nextBio,
            skills: nextSkills,
            suggested_jobs: suggestJobsFromCv(rawText || `${nextHeadline} ${nextBio}`, nextSkills),
          },
          file.name,
        )
      }

      // If profile already exists and isn't read-only, save the updated profile right away
      let savedToProfile = false
      if (!isSetup && !readOnly && userId && nextForm.display_name && nextForm.area_slug) {
        try {
          await updateProfile(userId, {
            headline: nextForm.headline || null,
            bio: nextForm.bio || null,
            skills: nextForm.skills,
          })
          await refreshProfile()
          await queryClient.invalidateQueries({ queryKey: ['profile', userId] })
          savedToProfile = true
        } catch {
          // Form is still updated for manual review & save
        }
      }

      // Optionally also upload the CV PDF to the user's Documents if it's a valid PDF
      let uploadedDoc = false
      if (!isSetup && !readOnly && userId && saveCvToDocs && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        const pdfProblem = await validatePdf(file)
        if (!pdfProblem) {
          try {
            await uploadDocument(userId, { file, kind: 'qualification', title: 'CV / Resume', isPublic: true })
            await queryClient.invalidateQueries({ queryKey: ['documents', userId] })
            uploadedDoc = true
          } catch {
            // Ignore if document limit reached
          }
        }
      }

      const addedLabels = draft.added_skills.map(categoryLabel)
      const skillMsg = addedLabels.length > 0 ? `Added skills: ${addedLabels.join(', ')}.` : `Matched ${nextForm.skills.length} skill${nextForm.skills.length === 1 ? '' : 's'}.`
      setCvSummaryNote(
        `${savedToProfile ? 'Profile updated from your CV.' : 'Drafted profile from your CV.'} ${skillMsg} Suggested ${draft.suggested_jobs.length} job type${draft.suggested_jobs.length === 1 ? '' : 's'} you can do.${uploadedDoc ? ' CV PDF also saved to your documents.' : ''}`,
      )
      toast.show(savedToProfile ? 'CV uploaded and profile updated!' : 'CV read! Review and save your profile.')
    } catch (err) {
      toast.show(friendlyError(err), 'error')
    } finally {
      setCvBusy(false)
      if (cvInputRef.current) cvInputRef.current.value = ''
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const mergedSkills = mergeCompletedJobSkills(form.skills, completedCategories)
    const cleanBio = form.bio
      ? formatCleanBio(form.bio, {
          skills: mergedSkills,
          headline: form.headline,
          areaName: areaOf(form.area_slug)?.name ?? null,
        })
      : ''
    const parsed = profileSchema.safeParse({ ...form, bio: cleanBio, skills: mergedSkills })
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
      if (userId) {
        saveStoredCvDraft(
          userId,
          {
            display_name: data.display_name,
            area_slug: data.area_slug,
            headline: data.headline ?? '',
            bio: data.bio ?? '',
            skills: data.skills,
            added_skills: [],
            suggested_jobs: suggestJobsFromCv(rawCvText || `${data.headline ?? ''} ${data.bio ?? ''}`, data.skills),
          },
          cvFileName,
        )
      }
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

      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">
              <FileUp className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Upload your CV to update your profile</h2>
              <p className="text-sm text-muted">
                Upload a PDF or text CV and KashWise will extract a clean About Me bio, headline, skills and suggested jobs you can do.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label
              htmlFor="cv-upload-input"
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-50 px-4 py-2.5 text-xs font-semibold text-brand-400 transition hover:bg-brand-100 ${
                cvBusy ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <FileUp className="size-4" aria-hidden />
              {cvBusy ? 'Reading CV…' : cvFileName ? 'Upload another CV' : 'Upload CV'}
              <input
                id="cv-upload-input"
                ref={cvInputRef}
                type="file"
                accept="application/pdf,.pdf,.txt,text/plain"
                className="sr-only"
                disabled={cvBusy}
                onChange={onCvFileChange}
              />
            </label>
            {cvUndoState && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(cvUndoState)
                  setCvUndoState(null)
                  setCvSummaryNote(null)
                  setCvFileName(null)
                }}
              >
                <RotateCcw className="size-3.5" aria-hidden /> Undo
              </Button>
            )}
          </div>
        </div>
        {!isSetup && !readOnly && (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              className="size-3.5 accent-brand-600"
              checked={saveCvToDocs}
              onChange={(e) => setSaveCvToDocs(e.target.checked)}
            />
            Also save uploaded PDF CV to my profile documents
          </label>
        )}
        {cvSummaryNote && (
          <p role="status" className="mt-3 rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-xs font-medium text-brand-300 ring-1 ring-brand-200">
            {cvSummaryNote}
          </p>
        )}
      </Card>

      {form.role === 'worker' && cvSuggestedJobs.length > 0 && (
        <Card className="mb-5 space-y-4 border-brand-500/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">
                <Briefcase className="size-4" aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Jobs you can do based on your CV &amp; skills</h2>
                  <Badge tone="brand">{cvSuggestedJobs.length} job {cvSuggestedJobs.length === 1 ? 'type' : 'types'}</Badge>
                </div>
                <p className="text-xs text-muted">
                  Extracted from your CV profile and skills. iBanks uses these to match open jobs and help you meet your earning goal.
                </p>
              </div>
            </div>
            <ButtonLink to="/money/earn-goal" variant="secondary" size="sm">
              <TrendingUp className="size-4 text-brand-500" aria-hidden /> Match with iBanks Goal
            </ButtonLink>
          </div>

          <ul className="grid gap-2.5 sm:grid-cols-2" aria-label="Suggested job types from your CV">
            {cvSuggestedJobs.slice(0, 6).map((job) => (
              <li key={job.category} className="flex flex-col justify-between rounded-xl border border-line bg-canvas p-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400">
                      <CategoryIcon category={job.category} className="size-4" />
                      {job.category_label}
                    </span>
                    <span className="text-xs font-semibold text-ink">
                      ~{formatRand(job.typical_net_cents)} <span className="font-normal text-muted">net/job</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-ink">{job.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{job.description}</p>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line/60 pt-2">
                  <span className="truncate text-[11px] text-muted">
                    Matched: {job.matched_terms.join(', ')}
                  </span>
                  <Link
                    to={`/discover?category=${encodeURIComponent(job.category)}`}
                    className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-500 hover:underline"
                  >
                    See jobs <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {matchingOpenGigs.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">
                  Live open jobs matching your CV right now
                </p>
                <Link to="/discover" className="text-xs font-semibold text-brand-500 hover:underline">
                  View all
                </Link>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {matchingOpenGigs.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link to={`/gigs/${g.id}`} className="block truncate font-semibold text-ink hover:text-brand-400">
                        {g.title}
                      </Link>
                      <p className="text-xs text-muted">
                        {categoryLabel(g.category)} · {g.area_name} · {formatDay(g.scheduled_date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block font-semibold text-brand-400">{formatRand(workerNetCents(g.payout_cents))}</span>
                      <span className="text-[11px] text-muted">you receive</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <DictatePanel
        kind="bio"
        title="Say who you are and what you do"
        placeholder="I paint houses in Soweto. I have been doing it for six years, I am never late and I clean up after."
        action="Write my profile"
        onDraft={(draft) => {
          const before = form
          setForm((f) => ({ ...f, headline: draft.headline || f.headline, bio: draft.bio, skills: f.skills.length ? mergeCompletedJobSkills(f.skills, draft.skills) : draft.skills }))
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="bio" className="block text-sm font-semibold text-ink">
                About you <span className="font-normal text-muted">(optional)</span>
              </label>
              {(form.bio.length > 0 || displayedSkills.length > 0) && (
                <button
                  type="button"
                  onClick={onPolishBio}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-400 transition hover:bg-brand-100"
                >
                  <Sparkles className="size-3.5" aria-hidden /> Polish bio from CV &amp; skills
                </button>
              )}
            </div>
            <textarea
              id="bio"
              rows={4}
              maxLength={500}
              className="input leading-relaxed"
              placeholder="A clean, friendly summary of your experience and the work you do best."
              value={form.bio}
              onChange={(e) => set('bio', e.target.value)}
            />
            {errors.bio && (
              <p id="bio-error" className="text-sm font-medium text-clay-700">
                {errors.bio}
              </p>
            )}
          </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="font-semibold">Your skills</legend>
              <span className="text-xs text-muted">New skills are appended automatically when you complete jobs.</span>
            </div>
            <div className="mb-3" />
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const isProven = completedCategories.includes(c.slug)
                return (
                  <button key={c.slug} type="button" className="chip" aria-pressed={displayedSkills.includes(c.slug)} onClick={() => toggleSkill(c.slug)}>
                    <CategoryIcon category={c.slug} className="size-4" /> {c.label}
                    {isProven && <BadgeCheck className="size-3.5 text-gold-500" aria-label="Earned from completed job" />}
                  </button>
                )
              })}
            </div>
            {completedCategories.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <Badge tone="sun">
                  <BadgeCheck className="size-3" aria-hidden /> Proven in completed jobs:
                </Badge>
                <span>{completedCategories.map(categoryLabel).join(' · ')}</span>
              </p>
            )}
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
                Private. Shared only with your match.
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
