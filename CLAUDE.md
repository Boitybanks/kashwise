# KashWise — guidance for Claude Code

KashWise (Earn it. Prove it. Grow it.) is built on SideGigs by team CodeCraft (see `NOTICE.md`): a hyperlocal South
African work marketplace where every customer-confirmed gig becomes a verified portfolio record, plus KashWise Money,
powered by the iBanks event-driven intelligence engine (`docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md` is normative).
Status and evidence: `docs/IMPLEMENTATION_STATUS.md`, `docs/FNB_JUDGING_SCORECARD.md`.
Keep historical identifiers listed in `NOTICE.md` (signed-document types, `sidegigs/envelope/v1`, demo emails).
Source of truth: `.pipeline/idea.md` (brief), `docs/architecture.md` (design), `.pipeline/assumptions.md` (decisions).

## Stack
React 19 + TypeScript + Vite + Tailwind v4 (`src/`), Supabase Postgres/Auth/Storage (project ref `plzbbfoteevfpqxspyxi`),
Netlify hosting + Functions (`netlify/functions`, site `sidegigs-codecraft`).

## Commands
- `npm run dev` — Vite dev server (functions need `netlify dev`)
- `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` — all must pass before commit
- `npm run test:serial` — same tests, one file at a time in forked workers (use this on OneDrive, where thread workers time out)
- `npm run test:journey` — full P0 journey against the LIVE database using demo accounts (creates demo-flagged data)
- `npm run keys:generate` — post-quantum keys (public → `src/lib/pq-public-keys.ts`, secrets → `.env.pq`, never commit)

## Rules that matter
- Trust-bearing writes (gigs status, applications, reviews, portfolio, transactions, events) go ONLY through
  `security definer` RPCs in `supabase/migrations/*_rpc_functions.sql`. Never add direct table write grants for them.
- Pricing: the client pays the job price, nothing added (`total_cents` = `payout_cents`). SideGigs' 10% fee (`fee_cents`)
  is the only deduction from the provider's pay; the provider receives `worker_net_cents` (90%). **No VAT is withheld**
  from providers (independent, mostly non-VAT-registered). All generated columns; `src/lib/money.ts` only mirrors them.
  Each side sees its own number: clients what they pay, providers what they receive. Clients type the price when posting
  a gig; providers type their take-home when listing a service (`services.take_home_cents` → generated `price_cents`).
- My Wallet (`/wallet`): released earnings minus `wallet_cashouts`, read and written only via `wallet_summary` /
  `request_cashout`. Cash-out to a bank account or an SMS cash voucher collected at shops; first cash-out each week free,
  then R3 (bank) / R20 (cash voucher). Simulated: SideGigs must never hold the money itself — only banks (or SARB-authorised
  payment institutions) may issue e-money, so production payouts go through a licensed partner.
- Providers are independent contractors: they set their own prices, choose or decline work and use their own tools.
  Don't add features that control their hours or prices (that points to employment, LRA s200A).
- Proof of income (`/wallet/statement`): `income_statement` RPC (released payments only) → `netlify/functions/income-statement.mts`
  signs it with ML-DSA-65. While payments are simulated every statement says "not valid proof of income"; never remove that.
- Skills profile (Work Passport): `netlify/functions/skills-profile.mts` writes it from customer-confirmed records only, signs it,
  saves it via `save_skills_profile`. Pages show it only if the signature verifies. With the worker's consent and
  `ANTHROPIC_API_KEY`, Claude (`claude-opus-5`) phrases it; `bindToEvidence` drops any skill without record codes and any
  quote that isn't a review verbatim. No consent or key → a factual summary labelled "Summarised by SideGigs", never "AI".
- Portfolio records are created only by `confirm_completion`. "Verified" means customer-confirmed, never ID-verified.
- Addresses/phones are X-Wing (ML-KEM-768+X25519) → AES-256-GCM envelopes encrypted in the browser; decrypted only in
  `netlify/functions/reveal-contact.mts` using the caller's JWT so RLS decides access. No service-role key anywhere.
- Payments are a labelled simulation. Demo data is `is_demo = true` and badged in the UI.
- Mobile-first: test at 360 px; bottom tab nav on mobile.
- New migrations: add a file under `supabase/migrations/` and apply it to the project; re-run Supabase security advisors.
