export type Role = 'worker' | 'customer'
export type GigStatus = 'open' | 'matched' | 'in_progress' | 'completed' | 'cancelled'
export type ApplicationStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'
export type TxnStatus = 'held' | 'released' | 'refunded'
export type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'flexible'

export interface Area {
  slug: string
  name: string
  city: string
  province: string
  lat: number
  lng: number
}

export interface Profile {
  id: string
  display_name: string
  role: Role
  area_slug: string
  headline: string | null
  bio: string | null
  skills: string[]
  is_demo: boolean
  avatar_path: string | null
  created_at: string
}

export type DocumentKind = 'qualification' | 'id_document' | 'other'

export interface ProfileDocument {
  id: string
  owner_id: string
  kind: DocumentKind
  title: string
  storage_path: string
  size_bytes: number
  is_public: boolean
  created_at: string
}

export interface Gig {
  id: string
  customer_id: string
  title: string
  category: string
  description: string
  area_slug: string
  scheduled_date: string
  time_window: TimeWindow
  payout_cents: number
  fee_cents: number
  total_cents: number
  worker_net_cents: number
  service_id: string | null
  status: GigStatus
  assigned_worker_id: string | null
  is_demo: boolean
  created_at: string
  matched_at: string | null
  started_at: string | null
  worker_done_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

export interface DiscoverGig {
  id: string
  title: string
  category: string
  description: string
  area_slug: string
  area_name: string
  city: string
  scheduled_date: string
  time_window: TimeWindow
  payout_cents: number
  created_at: string
  is_demo: boolean
  customer_id: string
  customer_name: string
  customer_is_demo: boolean
  applicant_count: number
  distance_km: number | null
}

/** A provider's own listing: they priced it by what they take home. Only the owner reads take_home_cents. */
export interface Service {
  id: string
  worker_id: string
  title: string
  category: string
  description: string
  area_slug: string
  take_home_cents: number
  price_cents: number
  is_active: boolean
  is_demo: boolean
  created_at: string
}

/** What clients browse: the price they pay, never the provider's take-home. */
export interface DiscoverService {
  id: string
  title: string
  category: string
  description: string
  area_slug: string
  area_name: string
  city: string
  price_cents: number
  created_at: string
  is_demo: boolean
  worker_id: string
  worker_name: string
  worker_headline: string | null
  worker_avatar_path: string | null
  worker_is_demo: boolean
  completed: number
  avg_rating: number | null
  review_count: number
  distance_km: number | null
}

/** A payout from My Wallet. Payments are simulated: in production a licensed banking partner sends it. */
export interface Cashout {
  id: string
  method: 'bank' | 'cash' | 'payshap' | 'ewallet'
  amount_cents: number
  fee_cents: number
  destination: string
  reference: string
  /** After the iBanks migration payouts start 'processing' and only the payment provider makes them 'paid' or 'failed'. */
  status: 'processing' | 'paid' | 'failed'
  created_at: string
  settled_at?: string | null
  failure_reason?: string | null
}

/** The provider's wallet: released earnings minus cash-outs. Only the provider can read it. */
export interface WalletSummary {
  available_cents: number
  held_cents: number
  earned_cents: number
  cashed_out_cents: number
  free_cashout_available: boolean
  cash_today_cents: number
  cashouts: Cashout[]
  /** Present only once the iBanks ledger migration is applied (balances then come from the ledger). */
  payout_pending_cents?: number
}

export interface Application {
  id: string
  gig_id: string
  worker_id: string
  message: string | null
  status: ApplicationStatus
  created_at: string
}

export interface Transaction {
  id: string
  gig_id: string
  payout_cents: number
  fee_cents: number
  total_cents: number
  status: TxnStatus
  mode: 'simulation'
  created_at: string
  settled_at: string | null
}

export interface GigEvent {
  id: number
  gig_id: string
  actor_id: string | null
  kind: string
  detail: string | null
  created_at: string
}

export interface Review {
  id: string
  gig_id: string
  reviewer_id: string
  worker_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface PortfolioItem {
  id: string
  worker_id: string
  gig_id: string
  title: string
  category: string
  area_slug: string
  completed_at: string
  customer_label: string
  rating: number | null
  review: string | null
  evidence_paths: string[]
  worker_note: string | null
  record_code: string
  is_demo: boolean
  /** KashWise Proof level, added by fetchPortfolio: every record is client-confirmed; settled payment upgrades it. */
  proof_level?: ProofLevel
}

export type ProofLevel = 'client_confirmed' | 'payment_confirmed'

export interface WorkerStats {
  completed: number
  active: number
  cancelled_after_match: number
  review_count: number
  avg_rating: number | null
  repeat_customers: number
  categories: { category: string; count: number }[]
  earned_cents: number | null
}

export interface DiscoverWorker {
  id: string
  display_name: string
  headline: string | null
  area_slug: string
  area_name: string
  skills: string[]
  is_demo: boolean
  completed: number
  avg_rating: number | null
  review_count: number
  distance_km: number | null
  avatar_path: string | null
}

export interface ImpactMetrics {
  gigs_posted: number
  gigs_matched: number
  gigs_completed: number
  gigs_open: number
  match_rate: number | null
  completion_rate: number | null
  median_hours_to_match: number | null
  income_earned_cents: number
  fees_cents: number
  people_earned: number
  avg_rating: number | null
  reviews: number
  portfolio_records: number
  repeat_customers: number
  workers_with_repeat_work: number
  workers: number
  customers: number
  top_categories: { category: string; count: number }[]
}

export interface RevealedContact {
  address: string | null
  access_notes: string | null
  counterpart_name: string | null
  counterpart_phone: string | null
}
