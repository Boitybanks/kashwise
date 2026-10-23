# Implementation Plan: SideGigs MVP

**Branch**: `001-sidegigs-mvp` · **Spec**: `./spec.md`

## Summary
Mobile-first React SPA on Netlify backed by Supabase (Postgres + RLS + Auth + Storage), with two Netlify Functions for post-quantum decryption and signing. Full design: `docs/architecture.md`; task order: `docs/implementation-plan.md`.

## Technical Context
- **Language**: TypeScript 6, React 19, Node 22 (functions)
- **Dependencies**: Vite 8, Tailwind 4, React Router 7, TanStack Query 5, Zod 4, supabase-js 2, @noble/post-quantum
- **Storage**: Supabase Postgres 17 + Storage bucket `work-evidence`
- **Testing**: Vitest (unit), Node journey script against live DB, Playwright smoke on production
- **Target**: evergreen mobile browsers; Netlify CDN + Functions
- **Performance goals**: first load < 250 KB gzipped JS; discovery page ≤ 20 gigs per request
- **Constraints**: no service-role key anywhere; no real payments
- **Scale**: hackathon → tens of thousands of users (architecture §9)

## Constitution Check
| Principle | Plan compliance |
|---|---|
| I Real users | Journeys from spec US1/US2 drive every screen |
| II Mobile-first | Bottom tab nav, 360 px baseline |
| III No fake functionality | Payment labelled "Simulation"; demo data badged |
| IV Security | RLS + definer RPCs + PQ-encrypted contacts |
| V Accessibility | Labelled inputs, focus rings, text status labels |
| VI Low friction | `create_account` → instant sign-in; demo buttons |
| VII End-to-end | `npm run test:journey` |
| VIII Portfolio credibility | Records created only in `confirm_completion` |
| IX Protected trust | Column grants; no direct writes; unique review per gig |
| X Deploy = done | Netlify production + smoke test |
**Result: PASS** (no violations to justify).

## Project Structure
```
supabase/migrations/        schema, RLS, RPCs, storage, seed
netlify/functions/          reveal-contact.mts, work-credential.mts
src/lib/                    supabase client, domain rules, pq crypto
src/pages/                  route screens
src/components/             layout, gig, portfolio, ui
scripts/                    key generation, journey test
tests/                      vitest unit tests
```

## Complexity Tracking
Post-quantum crypto adds two functions and one dependency; justified by the explicit team requirement (idea.md) and by protecting residential addresses of workers/customers.
