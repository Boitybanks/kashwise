# SideGigs — Architecture

## 1. Overview
```
Browser (React SPA, mobile-first)
  ├── supabase-js ──TLS──► Supabase (Postgres + RLS, Auth, Storage)  [eu-west-2]
  └── fetch ──TLS──► Netlify Functions (/api/*)
                        ├── reveal-contact   (X-Wing decapsulation, uses caller's JWT → RLS)
                        └── work-credential  (ML-DSA-65 signed work history)
Netlify CDN serves the static build (stateless, SPA fallback).
```

## 2. Frontend
React 19 + TypeScript + Vite + Tailwind CSS v4, React Router, TanStack Query (caching, loading/error states), Zod (validation), lucide icons. Mobile-first layout with a bottom tab bar; desktop gets a top nav. Code in `src/` (`pages/`, `components/`, `lib/`).

## 3. Backend & database
Supabase Postgres. **All state transitions go through `security definer` RPC functions** with `set search_path = ''`; clients have no direct INSERT/UPDATE on gigs, applications, reviews, transactions or events. Migration: `supabase/migrations/`.

| Table | Purpose | Read access (RLS) |
|---|---|---|
| `areas` | SA areas + approx. centre lat/lng | public |
| `profiles` | public profile: name, mode, area, skills, headline, bio | public |
| `profile_private` | encrypted phone envelope | owner + matched counterpart |
| `gigs` | the task; `fee_cents` (10%, from the provider's pay), `total_cents`, `worker_net_cents` are generated columns; `service_id` when booked from a service | open gigs public; else participants/applicants |
| `wallet_cashouts` | simulated payouts from My Wallet (bank or cash voucher, fee, reference); written only by `request_cashout` | the provider only |
| `services` | a provider's priced listing: `take_home_cents` typed by the provider, generated `price_cents` shown to clients | active ones public; owner sees all of theirs |
| `gig_private` | encrypted exact address + access notes | customer + assigned worker (once matched) |
| `gig_applications` | worker interest | the worker + gig customer |
| `transactions` | **simulated** payment (held/released/refunded) | customer + worker |
| `gig_events` | audit timeline | gig participants |
| `reviews` | 1–5 rating + comment, one per gig | public |
| `portfolio_items` | verified work record, created only by `confirm_completion` | public |
| `reports` | safety reports | reporter |

Lifecycle: `open → matched → in_progress → completed` (`cancelled` from open/matched). Completion needs two parties: the worker marks done, then the customer confirms. RPCs: `create_account`, `create_gig`, `apply_to_gig`, `withdraw_application`, `select_worker`, `start_gig`, `mark_gig_done`, `confirm_completion`, `submit_review`, `cancel_gig`, `add_portfolio_evidence`, `report_content`, `log_contact_reveal`, `discover_gigs`, `worker_stats`, `impact_metrics`. RLS helper functions live in a non-exposed `private` schema (avoids policy recursion).

## 4. Auth, storage, permissions
- **Auth:** Supabase email + password. Accounts are created by `create_account` (validated, bcrypt-hashed, rate-limited), then the client signs in normally (see assumptions A5). Sessions/JWTs are standard Supabase.
- **Storage:** public bucket `work-evidence`, images only (JPEG/PNG/WebP) ≤ 5 MB, writes only to the caller's own `{uid}/` folder.
- **Permissions:** column-level grants (users cannot set `is_demo`, statuses, fees); RLS on every table; the service-role key is never used by the app or functions.

## 5. Analytics / metrics
`impact_metrics(include_demo)` aggregates gigs posted/matched/completed, match rate, median time-to-match, income earned by workers, SideGigs fees, average rating, verified records, repeat customers, workers with repeat work and **people who earned** (North Star). Only aggregates are exposed.

## 6. Error handling & testing
TanStack Query surfaces loading/error states; RPCs raise readable exceptions shown as toasts. Tests: Vitest unit tests (fees, distance, validation, lifecycle rules, crypto round-trips) + `npm run test:journey` (full P0 journey against the live database via RPCs) + Playwright smoke on production.

## 7. Security — core controls and experimental post-quantum protection
The core security boundary is standard, reviewed practice: HTTPS in transit, Supabase Auth, least-privilege RLS, narrowly scoped `security definer` RPCs, server-only secrets, input validation and audit events. The database is **not** described as “quantum encrypted”.

As an isolated defence-in-depth experiment, selected private fields also use post-quantum cryptography to reduce *harvest-now, decrypt-later* exposure:
- **Encryption at the application layer (FIPS 203):** exact gig address/access notes and phone numbers are encrypted **in the browser** before they reach the database using **X-Wing hybrid KEM (ML-KEM-768 + X25519)** → HKDF-SHA-256 → **AES-256-GCM**, with the gig/user id bound as associated data. The database stores only ciphertext envelopes; a database dump, backup leak or compromised DB credential reveals no addresses or phone numbers.
- **Decryption** happens only in the `reveal-contact` Netlify Function, which holds the 32-byte X-Wing secret key in an environment secret. It reads envelopes **with the caller's own JWT**, so Postgres RLS decides who may decrypt (customer and matched worker only); every reveal is written to the gig timeline.
- **Signed work records (FIPS 204):** `work-credential` signs a worker's verified history with **ML-DSA-65**; anyone can verify it at `/verify` in the browser with the published public key — a portable, quantum-resistant reference.
- Baseline: TLS in transit, Supabase AES-256 encryption at rest, RLS, security-definer RPCs, CSP and security headers (`netlify.toml`).
- Honest limits: X-Wing is a hybrid construction built from standardized ML-KEM plus X25519; this implementation has not had an independent cryptographic audit. It is not quantum key distribution, does not encrypt public marketplace data or the database as a whole, and the KEM secret is a single server key (rotation requires re-encryption under a new `kid`).

## 8. Deployment & configuration
Netlify: `npm run build` → `dist/`, functions in `netlify/functions`, SPA redirect, security headers. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public), `PQ_KEM_SECRET_SEED`, `PQ_SIGN_SEED` (secrets, functions only). Public keys are committed in `src/lib/pq-public-keys.ts`.

## 9. Scaling path (hackathon → tens of thousands of users)
Stateless CDN frontend and functions scale horizontally. Postgres: indexed queries (`status, created_at`, `area_slug`, `category`, FKs), paginated discovery (`discover_gigs` limit/offset), aggregates in SQL. Next steps as load grows: PostGIS + GiST index for radius search, materialised impact metrics refreshed on a schedule, keyset pagination, read replicas, image CDN transforms, Supabase connection pooling (already default).
