// All data access in one place. Trust-bearing writes go through RPCs; reads rely on RLS.
import { supabase, AVATAR_BUCKET, DOCUMENT_BUCKET, EVIDENCE_BUCKET } from './supabase'
import { gigAad, homeAddressAad, identityAad, phoneAad } from './pq/aad'
import type { SignedCredential, SignedDocument } from './pq/credential'
import type { IncomeStatement } from './income-statement'
import type { SkillsProfile } from './skills-profile'
import type {
  Application,
  Area,
  Cashout,
  DiscoverGig,
  DiscoverService,
  DiscoverWorker,
  Gig,
  GigEvent,
  ImpactMetrics,
  DocumentKind,
  PortfolioItem,
  Profile,
  ProfileDocument,
  RevealedContact,
  Review,
  Service,
  Transaction,
  WalletSummary,
  WorkerStats,
} from './types'
import type { BookingInput, GigInput, ServiceInput, SignupInput } from './validation'
import type { Gender, IdentityInput } from './identity'
import type { HandshakeStep } from './qr-scan'
import { validateEvidenceFile, validatePdf } from './validation'
import { toSquareJpeg } from './image'
import type { RecoveryLink } from './recovery'
import type { LedgerEntry } from './ibanks/contracts'
import type { Insight } from './ibanks/orchestrator'
import type { JobInfo } from './ibanks/analytics'
import type { AgentOutput, ProofFacts } from './ibanks/agent'
import type { SavingsScenario } from './ibanks/savings'
import { toEntries, type LedgerRow } from './ibanks/facts'

const PUBLIC_PROFILE = 'id, display_name, role, area_slug, headline, bio, skills, is_demo, avatar_path, created_at'

/** Post-quantum encrypt in the browser. Crypto code is loaded on demand to keep first load light. */
async function encryptForVault(plaintext: unknown, aad: string) {
  const [{ encryptEnvelope }, { fromBase64 }, keys] = await Promise.all([
    import('./pq/envelope'),
    import('./pq/bytes'),
    import('./pq-public-keys'),
  ])
  return encryptEnvelope(plaintext, aad, { publicKey: fromBase64(keys.KEM_PUBLIC_KEY_B64), kid: keys.KEM_KID })
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

// ── Reference data ─────────────────────────────────────────────────────────
export async function fetchAreas(): Promise<Area[]> {
  return must(await supabase.from('areas').select('*').order('province').order('city').order('name'))
}

// ── Discovery ──────────────────────────────────────────────────────────────
export const PAGE_SIZE = 12

export async function discoverGigs(params: {
  area?: string | null
  category?: string | null
  skills?: string[] | null
  page: number
}): Promise<DiscoverGig[]> {
  return rpc<DiscoverGig[]>('discover_gigs', {
    p_area: params.area ?? null,
    p_category: params.category ?? null,
    p_skills: params.skills?.length ? params.skills : null,
    p_limit: PAGE_SIZE,
    p_offset: params.page * PAGE_SIZE,
  })
}

export async function discoverWorkers(params: { area?: string | null; skill?: string | null; page: number }): Promise<DiscoverWorker[]> {
  return rpc<DiscoverWorker[]>('discover_workers', {
    p_area: params.area ?? null,
    p_skill: params.skill ?? null,
    p_limit: PAGE_SIZE,
    p_offset: params.page * PAGE_SIZE,
  })
}

// ── Profiles & portfolio ───────────────────────────────────────────────────
export async function fetchProfile(id: string): Promise<Profile | null> {
  return must(await supabase.from('profiles').select(PUBLIC_PROFILE).eq('id', id).maybeSingle())
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'display_name' | 'role' | 'area_slug' | 'headline' | 'bio' | 'skills'>>) {
  must(await supabase.from('profiles').update(patch).eq('id', id).select('id').single())
}

export async function createProfile(p: Pick<Profile, 'id' | 'display_name' | 'role' | 'area_slug' | 'headline' | 'bio' | 'skills'>) {
  must(await supabase.from('profiles').insert(p).select('id').single())
}

export async function fetchWorkerStats(id: string): Promise<WorkerStats> {
  return rpc<WorkerStats>('worker_stats', { p_worker: id })
}

export async function fetchPortfolio(workerId: string): Promise<PortfolioItem[]> {
  const [items, paid] = await Promise.all([
    supabase.from('portfolio_items').select('*').eq('worker_id', workerId).order('completed_at', { ascending: false }),
    supabase.rpc('portfolio_payment_confirmed', { p_worker: workerId }),
  ])
  // Before the iBanks migration the RPC does not exist: every record is still truthfully client-confirmed.
  const settled = new Set(paid.error ? [] : ((paid.data ?? []) as string[]))
  return (must(items) as PortfolioItem[]).map((i) => ({ ...i, proof_level: settled.has(i.gig_id) ? 'payment_confirmed' : 'client_confirmed' }))
}

export async function hasSavedPhone(userId: string): Promise<boolean> {
  const row = must(await supabase.from('profile_private').select('id').eq('id', userId).maybeSingle())
  return Boolean(row)
}

/** Phone numbers are post-quantum encrypted in the browser; the database only ever sees ciphertext. */
export async function savePhone(userId: string, phone: string) {
  const envelope = await encryptForVault({ phone }, phoneAad(userId))
  must(await supabase.from('profile_private').upsert({ id: userId, phone_envelope: envelope }).select('id').single())
}

export async function removePhone(userId: string) {
  must(await supabase.from('profile_private').delete().eq('id', userId))
}

// ── Gigs ───────────────────────────────────────────────────────────────────
export type GigWithPeople = Gig & {
  customer: Pick<Profile, 'id' | 'display_name' | 'area_slug' | 'is_demo' | 'headline' | 'avatar_path'> | null
  worker: Pick<Profile, 'id' | 'display_name' | 'area_slug' | 'is_demo' | 'headline' | 'avatar_path'> | null
}

export async function fetchGig(id: string): Promise<GigWithPeople | null> {
  return must(
    await supabase
      .from('gigs')
      .select(
        '*, customer:profiles!gigs_customer_id_fkey(id, display_name, area_slug, is_demo, headline, avatar_path), worker:profiles!gigs_assigned_worker_id_fkey(id, display_name, area_slug, is_demo, headline, avatar_path)',
      )
      .eq('id', id)
      .maybeSingle(),
  )
}

/** The street address and access notes are encrypted in the browser, bound to the gig id. */
async function encryptGigPrivate(gigId: string, input: { address?: string; access_notes?: string }) {
  const address = input.address?.trim()
  const notes = input.access_notes?.trim()
  return address || notes ? await encryptForVault({ address: address || null, access_notes: notes || null }, gigAad(gigId)) : null
}

export async function createGig(input: GigInput): Promise<string> {
  const id = crypto.randomUUID()
  const envelope = await encryptGigPrivate(id, input)
  return rpc<string>('create_gig', {
    p_id: id,
    p_title: input.title,
    p_category: input.category,
    p_description: input.description,
    p_area: input.area_slug,
    p_date: input.scheduled_date,
    p_time_window: input.time_window,
    p_payout_cents: input.payout_cents,
    p_envelope: envelope,
  })
}

export type ApplicationWithWorker = Application & {
  worker: Pick<Profile, 'id' | 'display_name' | 'headline' | 'skills' | 'area_slug' | 'is_demo' | 'avatar_path'> | null
}

export async function fetchApplications(gigId: string): Promise<ApplicationWithWorker[]> {
  return must(
    await supabase
      .from('gig_applications')
      .select('*, worker:profiles(id, display_name, headline, skills, area_slug, is_demo, avatar_path)')
      .eq('gig_id', gigId)
      .order('created_at'),
  )
}

export async function fetchMyApplication(gigId: string, userId: string): Promise<Application | null> {
  return must(
    await supabase.from('gig_applications').select('*').eq('gig_id', gigId).eq('worker_id', userId).maybeSingle(),
  )
}

export async function fetchEvents(gigId: string): Promise<GigEvent[]> {
  return must(await supabase.from('gig_events').select('*').eq('gig_id', gigId).order('created_at').order('id'))
}

export async function fetchTransaction(gigId: string): Promise<Transaction | null> {
  return must(await supabase.from('transactions').select('*').eq('gig_id', gigId).maybeSingle())
}

export async function fetchReview(gigId: string): Promise<Review | null> {
  return must(await supabase.from('reviews').select('*').eq('gig_id', gigId).maybeSingle())
}

export async function fetchPortfolioItemForGig(gigId: string): Promise<PortfolioItem | null> {
  return must(await supabase.from('portfolio_items').select('*').eq('gig_id', gigId).maybeSingle())
}

export async function fetchPostedGigs(userId: string): Promise<(Gig & { applicant_count: number })[]> {
  const gigs = must(
    await supabase
      .from('gigs')
      .select('*, gig_applications(status)')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false }),
  ) as (Gig & { gig_applications: { status: string }[] })[]
  return gigs.map(({ gig_applications, ...g }) => ({
    ...g,
    applicant_count: gig_applications.filter((a) => a.status === 'pending').length,
  }))
}

export async function fetchAssignedGigs(userId: string): Promise<Gig[]> {
  return must(
    await supabase.from('gigs').select('*').eq('assigned_worker_id', userId).order('scheduled_date', { ascending: false }),
  )
}

export type ApplicationWithGig = Application & { gig: Gig | null }

export async function fetchMyApplications(userId: string): Promise<ApplicationWithGig[]> {
  return must(
    await supabase
      .from('gig_applications')
      .select('*, gig:gigs(*)')
      .eq('worker_id', userId)
      .in('status', ['pending', 'declined', 'withdrawn'])
      .order('created_at', { ascending: false }),
  )
}

// ── Services (a provider prices by what they take home; clients see what they pay) ──
export async function discoverServices(params: {
  area?: string | null
  category?: string | null
  worker?: string | null
  page: number
}): Promise<DiscoverService[]> {
  return rpc<DiscoverService[]>('discover_services', {
    p_area: params.area ?? null,
    p_category: params.category ?? null,
    p_worker: params.worker ?? null,
    p_limit: PAGE_SIZE,
    p_offset: params.page * PAGE_SIZE,
  })
}

export type ServiceWithWorker = Omit<Service, 'take_home_cents'> & {
  worker: Pick<Profile, 'id' | 'display_name' | 'headline' | 'avatar_path' | 'is_demo' | 'area_slug'> | null
}

/** Client view of one service: the price they pay, not the provider's take-home. */
export async function fetchService(id: string): Promise<ServiceWithWorker | null> {
  return must(
    await supabase
      .from('services')
      .select('id, worker_id, title, category, description, area_slug, price_cents, is_active, is_demo, created_at, worker:profiles(id, display_name, headline, avatar_path, is_demo, area_slug)')
      .eq('id', id)
      .maybeSingle(),
  )
}

/** The provider's own listings, paused ones included, with what they take home. */
export async function fetchMyServices(userId: string): Promise<Service[]> {
  return must(await supabase.from('services').select('*').eq('worker_id', userId).order('created_at', { ascending: false }))
}

export async function fetchMyService(id: string, userId: string): Promise<Service | null> {
  return must(await supabase.from('services').select('*').eq('id', id).eq('worker_id', userId).maybeSingle())
}

/** Creates the service when `id` is null, otherwise edits it. */
export const saveService = (id: string | null, input: ServiceInput) =>
  rpc<string>('save_service', {
    p_id: id,
    p_title: input.title,
    p_category: input.category,
    p_description: input.description,
    p_area: input.area_slug,
    p_take_home_cents: input.take_home_cents,
  })
export const setServiceActive = (id: string, active: boolean) => rpc<void>('set_service_active', { p_service: id, p_active: active })

/** Booking matches the provider straight away and holds the simulated payment. Returns the new gig id. */
export async function bookService(serviceId: string, input: BookingInput): Promise<string> {
  const id = crypto.randomUUID()
  const envelope = await encryptGigPrivate(id, input)
  return rpc<string>('book_service', {
    p_id: id,
    p_service: serviceId,
    p_area: input.area_slug,
    p_date: input.scheduled_date,
    p_time_window: input.time_window,
    p_envelope: envelope,
  })
}
export const declineBooking = (gigId: string) => rpc<void>('decline_booking', { p_gig: gigId })

// ── My Wallet (RPCs enforce the balance, weekly free cash-out and cash limits) ──
export const fetchWallet = () => rpc<WalletSummary>('wallet_summary')

// After the iBanks migration, every method needs the last 4 digits (account, ShapID or cellphone) and payouts start
// 'processing' until the payment provider confirms them. 'cash' is the pre-iBanks name for an eWallet payout.
export const requestCashout = (input: { method: 'bank' | 'cash' | 'payshap' | 'ewallet'; amountCents: number; bankName?: string; accountLast4?: string }) =>
  rpc<Cashout>('request_cashout', {
    p_method: input.method,
    p_amount_cents: input.amountCents,
    p_bank_name: input.method === 'bank' ? input.bankName ?? null : null,
    p_account_last4: input.accountLast4 ?? null,
  })

// ── Lifecycle (RPCs enforce roles and states) ─────────────────────────────
export const applyToGig = (gigId: string, message: string) => rpc<string>('apply_to_gig', { p_gig: gigId, p_message: message })
export const withdrawApplication = (gigId: string) => rpc<void>('withdraw_application', { p_gig: gigId })
export const selectWorker = (gigId: string, applicationId: string) =>
  rpc<void>('select_worker', { p_gig: gigId, p_application: applicationId })
// The worker proves they were on site by scanning (or typing) the customer's one-time start / finish code.
export const startGig = (gigId: string, code: string) => rpc<void>('start_gig', { p_gig: gigId, p_code: code })
export const markGigDone = (gigId: string, code: string) => rpc<void>('mark_gig_done', { p_gig: gigId, p_code: code })

export interface Handshake {
  step: HandshakeStep
  code: string
  used_at: string | null
}

/** Only the gig's customer can read these (RLS); the worker has to scan them on site. */
export async function fetchHandshakes(gigId: string): Promise<Handshake[]> {
  return must(await supabase.from('gig_handshakes').select('step, code, used_at').eq('gig_id', gigId))
}
export const confirmCompletion = (gigId: string) => rpc<string>('confirm_completion', { p_gig: gigId })
export const submitReview = (gigId: string, rating: number, comment: string) =>
  rpc<void>('submit_review', { p_gig: gigId, p_rating: rating, p_comment: comment })
export const cancelGig = (gigId: string) => rpc<void>('cancel_gig', { p_gig: gigId })
export const reportContent = (params: { gigId?: string; userId?: string; reason: string; details: string }) =>
  rpc<string>('report_content', {
    p_gig: params.gigId ?? null,
    p_user: params.userId ?? null,
    p_reason: params.reason,
    p_details: params.details,
  })

// ── Metrics ────────────────────────────────────────────────────────────────
export const fetchImpact = (includeDemo: boolean) => rpc<ImpactMetrics>('impact_metrics', { p_include_demo: includeDemo })

// ── Evidence photos ────────────────────────────────────────────────────────
export async function uploadEvidence(itemId: string, userId: string, file: File) {
  const problem = validateEvidenceFile(file)
  if (problem) throw new Error(problem)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${itemId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  await rpc<void>('add_portfolio_evidence', { p_item: itemId, p_path: path })
  return path
}

export async function removeEvidence(itemId: string, path: string) {
  await rpc<void>('remove_portfolio_evidence', { p_item: itemId, p_path: path })
  await supabase.storage.from(EVIDENCE_BUCKET).remove([path])
}

// ── Profile photos ─────────────────────────────────────────────────────────
/** Uploads a cropped square JPEG, points the profile at it, then retires the previous photo. */
export async function setProfilePhoto(userId: string, file: File, previousPath: string | null): Promise<void> {
  const blob = await toSquareJpeg(file)
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  try {
    must(await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId).select('id').single())
  } catch (err) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path])
    throw err
  }
  if (previousPath) await supabase.storage.from(AVATAR_BUCKET).remove([previousPath])
}

export async function removeProfilePhoto(userId: string, path: string) {
  must(await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId).select('id').single())
  await supabase.storage.from(AVATAR_BUCKET).remove([path])
}

// ── Documents (PDF) ────────────────────────────────────────────────────────
export const MAX_DOCUMENTS = 20
export type DocumentWithLink = ProfileDocument & { url: string | null }

/** RLS returns all of the owner's documents to the owner and only shared ones to everyone else. Links last 10 minutes. */
export async function fetchDocuments(ownerId: string): Promise<DocumentWithLink[]> {
  const docs: ProfileDocument[] = must(
    await supabase
      .from('profile_documents')
      .select('id, owner_id, kind, title, storage_path, size_bytes, is_public, created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false }),
  )
  if (!docs.length) return []
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrls(docs.map((d) => d.storage_path), 600)
  if (error) throw error
  const links = new Map(data.map((l) => [l.path, l.signedUrl]))
  return docs.map((d) => ({ ...d, url: links.get(d.storage_path) ?? null }))
}

export async function uploadDocument(userId: string, input: { file: File; kind: DocumentKind; title: string; isPublic: boolean }) {
  const problem = await validatePdf(input.file)
  if (problem) throw new Error(problem)
  const path = `${userId}/${crypto.randomUUID()}.pdf`
  const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, input.file, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
  const { error: rowError } = await supabase.from('profile_documents').insert({
    kind: input.kind,
    title: input.title.trim(),
    storage_path: path,
    size_bytes: input.file.size,
    is_public: input.kind !== 'id_document' && input.isPublic,
  })
  if (rowError) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path])
    throw rowError
  }
}

export async function setDocumentShared(id: string, isPublic: boolean) {
  must(await supabase.from('profile_documents').update({ is_public: isPublic }).eq('id', id).select('id').single())
}

export async function deleteDocument(doc: Pick<ProfileDocument, 'id' | 'storage_path'>) {
  must(await supabase.from('profile_documents').delete().eq('id', doc.id).select('id').single())
  await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path])
}

// ── Work IDs ───────────────────────────────────────────────────────────────
/** Issued when the customer accepts a worker; RLS returns it only to that customer and worker. */
export async function fetchWorkId(gigId: string): Promise<string | null> {
  const row: { work_id: string } | null = must(await supabase.from('gig_work_ids').select('work_id').eq('gig_id', gigId).maybeSingle())
  return row?.work_id ?? null
}

// ── Identity (sign-up) ─────────────────────────────────────────────────────
async function encryptIdentity(userId: string, input: IdentityInput) {
  const [identity, address] = await Promise.all([
    encryptForVault({ legal_name: input.legal_name, id_number: input.id_number }, identityAad(userId)),
    encryptForVault({ address: input.home_address }, homeAddressAad(userId)),
  ])
  return { identity, address }
}

/** The ID number is also sent in the clear over TLS so the database can re-check it; only ciphertext is stored. */
export async function createAccount(input: SignupInput & IdentityInput) {
  const id = crypto.randomUUID()
  const envelopes = await encryptIdentity(id, input)
  await rpc<string>('create_account', {
    p_id: id,
    p_email: input.email,
    p_password: input.password,
    p_display_name: input.display_name,
    p_role: input.role,
    p_area: input.area_slug,
    p_id_number: input.id_number,
    p_gender: input.gender,
    p_identity_envelope: envelopes.identity,
    p_address_envelope: envelopes.address,
  })
}

export async function saveIdentity(userId: string, input: IdentityInput) {
  const envelopes = await encryptIdentity(userId, input)
  await rpc<void>('save_identity', {
    p_id_number: input.id_number,
    p_gender: input.gender,
    p_identity_envelope: envelopes.identity,
    p_address_envelope: envelopes.address,
  })
}

export async function fetchMyIdentity(userId: string): Promise<{ gender: Gender; created_at: string } | null> {
  return must(await supabase.from('profile_identity').select('gender, created_at').eq('id', userId).maybeSingle())
}

// ── Password reset ─────────────────────────────────────────────────────────
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
  if (error) throw error
}

export async function startPasswordRecovery(link: Extract<RecoveryLink, { kind: 'tokens' | 'token_hash' }>) {
  const { error } =
    link.kind === 'tokens'
      ? await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      : await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
  if (error) throw error
}

/** Sets the new password, then signs out everywhere so any other session has to use it. */
export async function finishPasswordReset(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  await supabase.auth.signOut({ scope: 'global' })
}

// ── Netlify Functions (post-quantum) ──────────────────────────────────────
async function callFunction<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'The secure service is unavailable. Please try again.')
  return body as T
}

export async function revealContact(gigId: string): Promise<RevealedContact> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in again.')
  return callFunction<RevealedContact>('/api/reveal-contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gigId }),
  })
}

export async function fetchWorkCredential(workerId: string): Promise<SignedCredential> {
  return callFunction<SignedCredential>(`/api/work-credential?worker=${encodeURIComponent(workerId)}`)
}

async function bearer(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in again.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// ── Proof of income and skills profile (signed by KashWise) ────────────────
export async function fetchIncomeStatement(months: number): Promise<SignedDocument<IncomeStatement>> {
  return callFunction<SignedDocument<IncomeStatement>>('/api/income-statement', {
    method: 'POST',
    headers: await bearer(),
    body: JSON.stringify({ months }),
  })
}

export interface StoredSkillsProfile {
  signed: SignedDocument<SkillsProfile>
  created_at: string
}

export async function fetchSkillsProfile(workerId: string): Promise<StoredSkillsProfile | null> {
  const { data, error } = await supabase.from('skills_profiles').select('signed, created_at').eq('worker_id', workerId).maybeSingle()
  if (error) throw error
  return (data as StoredSkillsProfile | null) ?? null
}

export async function writeSkillsProfile(useAi: boolean) {
  return callFunction<{ signed: SignedDocument<SkillsProfile>; aiAvailable: boolean; aiUsed: boolean }>('/api/skills-profile', {
    method: 'POST',
    headers: await bearer(),
    body: JSON.stringify({ useAi }),
  })
}

export const deleteSkillsProfile = () => rpc<void>('delete_skills_profile')

// ── KashWise Money, powered by iBanks ──────────────────────────────────────
// The browser reads only the worker's own rows (RLS) and computes nothing it could not show from them; provider
// events are never sent from here. See docs/IBANKS_ARCHITECTURE.md.
export interface MoneyData {
  entries: LedgerEntry[]
  insights: Insight[]
  jobs: Map<string, JobInfo>
  proof: ProofFacts
  preferences: { savings_bps: number; retirement_bps: number; ai_explanations_opt_in: boolean } | null
  /** False until the iBanks migration is applied to the connected database. */
  enabled: boolean
}

export async function fetchMoney(userId: string): Promise<MoneyData> {
  const [ledger, insights, gigs, items, reviews, prefs] = await Promise.all([
    supabase.from('financial_ledger_entries').select('*').eq('worker_id', userId).order('id').limit(5000),
    supabase.from('ibanks_insights').select('*').eq('worker_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(20),
    supabase.from('gigs').select('id, title, category, completed_at, customer_id').eq('assigned_worker_id', userId).eq('status', 'completed').limit(1000),
    supabase.from('portfolio_items').select('record_code').eq('worker_id', userId).limit(1000),
    supabase.from('reviews').select('rating').eq('worker_id', userId).limit(1000),
    supabase.from('ibanks_worker_preferences').select('savings_bps, retirement_bps, ai_explanations_opt_in').eq('worker_id', userId).maybeSingle(),
  ])
  const ratings = (reviews.data ?? []).map((r) => r.rating as number)
  return {
    enabled: !ledger.error,
    entries: toEntries((ledger.data ?? []) as LedgerRow[]),
    insights: (insights.data ?? []) as Insight[],
    jobs: new Map((gigs.data ?? []).map((g) => [g.id as string, { title: g.title as string, category: g.category as string, completed_at: g.completed_at as string | null, client_key: g.customer_id as string }])),
    proof: {
      confirmed_jobs: items.data?.length ?? 0,
      reviews: ratings.length,
      average_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      record_codes: (items.data ?? []).map((i) => i.record_code as string),
    },
    preferences: prefs.error ? null : (prefs.data as MoneyData['preferences']),
  }
}

export type AskIbanksResponse = AgentOutput & { scenario: SavingsScenario | null; model: string | null; ai_available: boolean }

export async function askIbanks(question: string): Promise<AskIbanksResponse> {
  return callFunction<AskIbanksResponse>('/api/ibanks/ask', { method: 'POST', headers: await bearer(), body: JSON.stringify({ question }) })
}

export const saveIbanksPreferences = (savingsBps: number, retirementBps: number, aiOptIn: boolean) =>
  rpc<void>('ibanks_save_preferences', { p_savings_bps: savingsBps, p_retirement_bps: retirementBps, p_ai_opt_in: aiOptIn })

/** How iBanks reached its decisions about the signed-in worker's money (their rows only; see ibanks_my_diagnostics). */
export interface IbanksDiagnostics {
  decisions: {
    at: string
    trigger_event_id: string | null
    ingest_status: string | null
    rule_id: string | null
    rule_version: number | null
    proposed_action: string | null
    policy_outcome: string | null
    policy_version: string | null
    reason: string | null
    actor: string
  }[]
  events: { event_id: string; event_type: string; state: string; attempts: number; received_at: string }[]
  ledger_entries: number
  as_of: string
}
export const fetchIbanksDiagnostics = () => rpc<IbanksDiagnostics>('ibanks_my_diagnostics')

export const insightFeedback = (id: string, status: 'dismissed' | 'resolved' | null, helpful: boolean | null) =>
  rpc<void>('ibanks_insight_feedback', { p_insight: id, p_status: status, p_helpful: helpful })

/** Payment SIMULATOR (PAYMENTS_MODE=sandbox only): asks the stand-in provider to act, as a real one would. */
export type SandboxAction =
  | { action: 'settle' | 'dispute' | 'resolve_dispute' | 'refund'; gigId: string }
  | { action: 'payout_result'; reference: string; outcome: 'settled' | 'failed' }

export async function sandboxPayment(input: SandboxAction) {
  return callFunction<{ status: string; reason: string | null; event_id: string; simulation: true }>('/api/payments/sandbox', {
    method: 'POST',
    headers: await bearer(),
    body: JSON.stringify(input),
  })
}
