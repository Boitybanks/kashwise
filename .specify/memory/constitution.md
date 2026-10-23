# SideGigs Constitution

## Core Principles

### I. Build for real users
Every feature serves a real worker or customer task in the South African informal-work context. No feature exists only to impress.

### II. Mobile-first UX
Design for a small Android phone on mobile data first (≥ 360 px wide, large tap targets, light pages); desktop is an enhancement.

### III. No fake functionality disguised as real
Simulations (payments) and seeded data (demo accounts) are always labelled in the UI. No dead buttons, no placeholder screens, no "coming soon" on the primary path.

### IV. Security by default
RLS on every table; state changes only through validated `security definer` functions; no service-role key in the client or functions; private contact data is post-quantum encrypted before storage and revealed only to the matched pair.

### V. Accessibility
Semantic HTML, labelled inputs, visible focus, WCAG AA contrast, status never conveyed by colour alone.

### VI. Low-friction onboarding
Sign up to first useful action in under two minutes; no email-confirmation wait; one-tap demo accounts.

### VII. Demonstrable end-to-end journeys
The P0 customer and worker journeys must work end-to-end in production and are covered by an automated journey test.

### VIII. Portfolio credibility
Portfolio records and reviews are created only from customer-confirmed completed gigs — never self-reported. "Verified" means exactly that and nothing more.

### IX. Protected trust mechanisms
Ratings, reviews, fees, statuses and verification flags cannot be written directly by clients; one review per completed gig.

### X. Deployment is part of "done"
A task is done when it passes typecheck, lint, tests and build, and the change is live on Netlify.

## Constraints
Stack: React + TypeScript + Vite + Tailwind, Supabase, Netlify (see `docs/architecture.md`). Fee: 15% added to customer, computed in the database.

## Governance
This constitution overrides conflicting plans. Amend by editing this file with a version bump and a note in `.pipeline/run-log.md`.

**Version**: 1.0.0 | **Ratified**: 2026-09-26 | **Last Amended**: 2026-09-26
