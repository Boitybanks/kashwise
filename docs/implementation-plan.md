# SideGigs — Implementation Plan (demo critical path)

Ordered by the judge journey. Every task is "done" only when `npm run typecheck && npm run lint && npm test` pass (and `npm run build` for UI tasks). Spec Kit mirror: `specs/001-sidegigs-mvp/tasks.md`.

| ID | Pri | Objective | Files | Acceptance criteria | Verify |
|---|---|---|---|---|---|
| T1 | P0 | Schema, RLS, RPCs, storage, seed | `supabase/migrations/*.sql` | All tables RLS-enabled; lifecycle RPCs enforce roles/states; fee generated (R500→R75→R575); advisors show no critical security issues | Supabase advisors + `npm run test:journey` |
| T2 | P0 | Domain logic library | `src/lib/{money,fees,geo,gig-rules,validation}.ts` | Fee maths, distance, allowed actions per role/status, Zod schemas | `npm test` |
| T3 | P0 | PQ crypto (X-Wing + AES-GCM envelope, ML-DSA credential) | `src/lib/pq/*`, `netlify/functions/*`, `scripts/generate-pq-keys.mjs` | Encrypt in browser, decrypt only in function with caller JWT; signed credential verifies in browser; tamper fails | `npm test` (round-trip + tamper) |
| T4 | P0 | Slice A — shell, identity, responsive nav | `src/App.tsx`, `src/components/layout/*`, `index.css` | Landing page, bottom tabs on mobile, top nav on desktop, no dead links | build + mobile screenshot |
| T5 | P0 | Slice B — auth + profile/onboarding | `src/pages/{Login,Signup,Onboarding,Profile}.tsx`, `src/lib/auth.tsx` | Sign up (no email wait), sign in, demo one-tap login, choose mode, skills, area, encrypted phone | journey test + manual |
| T6 | P0 | Slice C — post gig | `src/pages/PostGig.tsx` | Category, description, area, date, time, payout; live fee breakdown; address encrypted | manual + unit |
| T7 | P0 | Slice D — discover + detail | `src/pages/{Discover,GigDetail}.tsx` | Distance-sorted feed, category + "my skills" filters, pagination, empty/loading/error states | manual |
| T8 | P0 | Slices E–H — apply, select, lifecycle, completion | `src/pages/GigDetail.tsx`, `src/components/gig/*` | Worker applies/withdraws; customer sees applicants with portfolio link + stats, selects; start → done → confirm; timeline; simulated payment panel; contact reveal | journey test |
| T9 | P0 | Slices I–K — review, auto portfolio, public profile | `src/pages/{WorkerProfile,MyWork}.tsx` | Review once per gig; verified record appears automatically; public `/w/:id` shareable without login | journey test |
| T10 | P1 | Slice L — payment simulation surfaces | `src/components/gig/PaymentPanel.tsx` | "Simulation" labels everywhere money appears; held/released/refunded | manual |
| T11 | P1 | Slice M — impact dashboard | `src/pages/Impact.tsx` | Live vs demo-inclusive metrics; North Star highlighted | manual |
| T12 | P1 | Evidence photos + signed credential + verify page | `src/components/portfolio/*`, `src/pages/Verify.tsx` | Upload ≤5 MB image to own folder; download signed record; verify shows valid/invalid | manual + unit |
| T13 | P1 | Report pathway + trust page | `src/components/ReportButton.tsx`, `src/pages/Trust.tsx` | Report gig/user; explains safety & encryption honestly | manual |
| T14 | P0 | Netlify release + production smoke | `netlify.toml`, `.pipeline/release-report.md` | Prod URL passes smoke: home, auth, post, discover, profile, assign, complete, review, portfolio, mobile | Playwright smoke |
| T15 | P2 | Polish: skeletons, toasts, share sheet, favicon/OG tags | various | — | manual |
