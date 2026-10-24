# KashWise

**Earn it. Prove it. Grow it.**

KashWise connects South Africans with local paid work, turns each client-confirmed job into a verified work record,
and explains a worker's earnings with **iBanks**, an event-driven financial-intelligence engine built for irregular
income. Built for the FNB App of the Year 2026 hackathon (Financial Inclusion and Money Confidence). KashWise is built
on SideGigs by team CodeCraft — see [NOTICE.md](NOTICE.md).

> **Status: hackathon MVP in development.** Payments are a labelled **simulation**: no real money moves, KashWise holds
> no funds, and no bank (including FNB) is connected. What works and how it was tested:
> [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md). Judging self-assessment:
> [docs/FNB_JUDGING_SCORECARD.md](docs/FNB_JUDGING_SCORECARD.md).

## What is built

- **KashWise Work** — clients post local jobs; workers find them by distance and skill, apply, get chosen, and start and
  finish on site with a QR handshake. Workers can also list priced services.
- **KashWise ProofScript** — the client's confirmation creates a portfolio record ("client-confirmed"); when the payment
  provider's settlement is posted it also shows "payment confirmed". A living work transcript with skills, work photos
  and client reviews, plus signed work history (ML-DSA-65) and `/verify`.
- **KashWise Money, powered by iBanks** (`/money`) — a signed provider event is posted once to an append-only ledger
  (integer cents; earned ≠ paid out ≠ on hold), which wakes iBanks: protection rules, a 7- and 30-day income outlook
  with its backtest error and confidence, earning patterns, persisted insights and an audit trail the worker can open.
  Ask iBanks answers from those figures only, with a rules fallback when no AI is configured. Savings and retirement
  are opt-in simulations.
- **Unit economics** (`/economics`) — editable scenarios for the 10% success fee. Assumptions, not results.
- **Earn My Goal** (`/money/earn-goal`) — set an income target and shortlist compatible open jobs by skills,
  area and availability. Settled, booked and suggested income stay separate. Optional local preference memory
  uses the pinned [Graphiti fork](https://github.com/Boitybanks/graphiti) with Ollama; no OpenAI API key is needed.
  See [feature boundaries](docs/EARN_MY_GOAL.md) and [local service setup](docs/GRAPHITI_LOCAL.md).
- **Android / iOS** (`mobile/`, Expo) — sign-in, KashWise Money, Find work, ProofScript and client jobs against the
  same backend and the same iBanks engine. Bundles for Android; not yet run on a device. See `mobile/README.md`.

Not done yet: deployment of the iBanks and earnings-goal database changes and new functions, device testing,
live payment partner, and a verified end-to-end Graphiti ingestion on a running graph database.

## ProofScript — the evidence moat

**Your skills. Your work. Your proof.** ProofScript combines a worker’s skills/profile with a portfolio of evidence
built from client-confirmed jobs, work photos and reviews. Each completed, confirmed job adds to the record; signed
work history can be downloaded and verified. Payment confirmation remains a separate evidence level.

The intended moat is the growing depth and provenance of real work evidence, repeat-client relationships and local
marketplace participation. These benefits need pilot validation; traction and defensibility are not proven yet.
Workers can share and download their records. The product earns retention by making the record useful.
See [ProofScript and its boundaries](docs/PROOFSCRIPT.md) and the [20-second pitch](docs/HUSTLEWINDOW_20_SECONDS.md).

## Stack

React 19 + TypeScript + Vite + Tailwind 4 · Supabase (Postgres, RLS, Auth, Storage) · Netlify (hosting + Functions) ·
Vitest + PGlite (migrations tested in an in-process Postgres) · Playwright.

## Run locally

For Windows/macOS/Linux setup, full-stack development, mobile, environment variables and release instructions, see
[HOW_TO_RUN.md](HOW_TO_RUN.md).


```bash
npm ci
cp .env.example .env      # Supabase URL + publishable key; server secrets only in Netlify
npm run dev               # or `netlify dev` to include the functions
```

## Checks

```bash
npm run typecheck && npm run lint && npm run test:serial && npm run build
```

`npm run test:serial` runs one test file at a time; use it while the repo is inside OneDrive, where parallel workers
time out. `npm run test:journey` writes to the **live** database and is not part of the routine checks.

## Docs

`docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md` (normative iBanks spec) · `docs/IBANKS_ARCHITECTURE.md` ·
`docs/IBANKS_EVENT_CONTRACTS.md` · `docs/IBANKS_RISK_RULES.md` · `docs/AS_IS_AUDIT.md` ·
`docs/FNB_JUDGING_EXECUTION_BRIEF.md`.

Copyright © 2026 KashWise contributors and the SideGigs (CodeCraft) authors. All rights reserved unless a licence is
explicitly added.
