# Release report

**PRODUCT:** SideGigs — team CodeCraft (Boitumelo, Mthandeki, Musa, Zanele)
**STATUS:** DEPLOYED — optional identity-demo browser flow and public smoke passed. Full customer/worker end-to-end re-test remains outstanding.
**PREVIEW URL:** http://127.0.0.1:5175
**TARGET PUBLIC URL:** https://sidegigs-codecraft.netlify.app

**APPROVED DESIGN:** https://sidegigs-codecraft.netlify.app/welcome (also accessible while signed in)
**DEPLOY ID:** `6ab747096c3922689f5e9575`
**DEPLOY PERMALINK:** https://6ab747096c3922689f5e9575--sidegigs-codecraft.netlify.app
**SOURCE COMMIT:** `3096f52` (pushed to GitHub main)
**PUBLISHED:** 26 September 2026, 04:16:39 UTC / 06:16:39 SAST

## Current identity-demo release gates — 26 September 2026

- Typecheck, lint, production build and whitespace checks: PASS.
- Unit tests: PASS, 44 tests across 9 files. Command: `node --experimental-strip-types node_modules/vitest/vitest.mjs run --configLoader native --pool threads --maxWorkers 1 --no-file-parallelism --no-isolate`. An earlier isolated-worker run had startup timeouts; the completed reused-worker run passed all tests.
- Local browser: sample ID → optional camera step (off until explicit action) → skip selfie → clearly simulated processing → completed with “selfie skipped” → job board: PASS.
- Camera permissions, missing video-frame handling and stream cleanup have mocked unit coverage. Actual camera hardware capture has not been retested in this release.
- Targeted local secret-pattern scan found no matches; no environment files or dependency caches included in source archive.
- Deployment: PASS, Netlify production state `ready`; both existing functions retained. Clean committed-source archive deployed with existing backend environment unchanged.
- Live HTTP smoke: PASS at 04:17:20 UTC, seven routes, all three approved campaign image hashes, approved hero, honest identity-demo bundle, CSP, same-origin camera/microphone-blocked policy, unauthenticated contact reveal 401 and invalid credential request 400.
- Live browser: sample → optional selfie skipped → simulated processing → “Demo completed / selfie skipped” → `/discover`: PASS. Reviewed completion at 390px viewport (375px content width including scrollbar); no horizontal overflow. No real personal details entered or camera permission granted during this check.

Optional `/identity-demo` is linked from Profile and Trust. It checks format/checksum locally; full birth date is self-declared to disambiguate the century. This is not proof of issuance, ownership, citizenship or age. It offers a real browser camera only after an explicit click, with a truthful skip path. ID/birth-date inputs are cleared before the camera step; no personal details or image are passed to the parent, stored or uploaded. Completion creates no identity badge, saved record or privilege. A10 and Trust remain explicit that no profile is ID verified. Camera policy allows same-origin browser requests; microphone remains blocked. The existing earning/hiring journey and approved design are preserved.

## Previous design deployment verification (historical)

Netlify built a clean archive of committed files (no local environment file, dependency folders or caches). Existing backend configuration and keys were retained. Both `reveal-contact` and `work-credential` functions are present. Netlify scanned 139 files and reported no secret matches.

Read-only public smoke passed at 03:30:48 UTC using `node scripts/release-smoke.mjs`: six routes returned HTTP 200 and the approved font configuration; all three new campaign image hashes matched local approved assets; the entry bundle contains the new hero; unauthenticated contact reveal returned 401; an invalid credential request returned 400. CSP headers are present. Nine direct authentication-return-path assertions also passed.

These are HTTP/asset/security-response checks, not a complete browser journey or proof of RLS coverage. In-app browser access was unavailable during post-deployment verification, and the full automated test runner remains blocked by Windows `spawn EPERM`. The complete customer/worker lifecycle was validated on the previous version, but has not been repeated on this release. No real payments are enabled.

## Previous redesign gates — 26 September 2026 (superseded by current gates above)

Second design iteration: photography, tutoring and beauty replace the trades-led campaign. Eight visible categories cover creative, knowledge, technical and everyday work. DM Sans / Instrument Serif pairing and a three-panel editorial gallery replace the initial split hero. Typecheck, lint and production build passed again; production deployment is now complete.

- Typecheck: PASS (`npm run typecheck`).
- Lint: PASS (`npm run lint`).
- Production build: PASS using Vite's native config loader (Windows process restrictions prevent the default config bundler).
- Whitespace/diff check: PASS.
- Browser review: desktop and 390px phone layout inspected; no horizontal overflow; category link selects Gardening; calculator verifies R1,000 + R150 = R1,150; demo customer login returns to `/gigs/new`; posting form verifies R500 + R75 = R575. No job published during design review.
- Automated tests: NOT PASSED for this revision. Playwright worker creation blocked by Windows `spawn EPERM`; native-loader Vitest thread run did not finish and was stopped. New navigation tests and local design-review tests are present. Full lifecycle must be rerun before release.
- Deployment/public smoke test: PASS for production deployment and read-only HTTP smoke as detailed above. Historical full journey results below apply to the previous version, not this redesign.

Changes: editorial green/ivory visual identity, three rotating worker campaign scenes with pause/reduced-motion support, clearer earning/hiring paths, category browsing, accessible form guidance, preserved destinations through authentication, and clearer application/selection messaging. Campaign images are AI-generated illustrations, disclosed in the UI; income is earned through completed work, not passive or guaranteed.

Local preview uses the existing Supabase backend. Netlify-only contact reveal and credential-export functions are not hosted by the local Vite server. Do not treat the local preview as a fully isolated sandbox.

## Historical production gates (previous version)

| Check | Result |
|---|---|
| BUILD | PASS (`tsc -b` + `vite build`) |
| TYPECHECK / LINT | PASS / PASS (0 warnings) |
| TESTS | PASS — 27 unit tests (fees, lifecycle rules, validation, geo, PQ crypto round-trip/tamper/AAD, ML-DSA sign/verify/tamper, UI fee breakdown) + 12 live journey tests against production DB + 1 Playwright production journey (Pixel 7) |
| CRITICAL JOURNEY | PASS — post → discover → apply → choose → start → done → confirm → review → verified portfolio record → signed record verifies at `/verify`, zero console errors |
| DATABASE | Supabase `SideGigs` (eu-west-2), 5 migrations, RLS on all 11 tables, trust-bearing writes only via `security definer` RPCs; advisors: no errors |
| AUTH | Email + password; instant sign-up via validated `create_account` (no email-confirmation wait); demo logins protected (credentials immutable, profiles read-only) |
| NETLIFY | Site `sidegigs-codecraft`; SPA redirect, CSP/HSTS/X-Frame headers; functions `/api/reveal-contact`, `/api/work-credential` live; PQ seeds as secret env vars |

Revalidated on 26 September 2026: typecheck and lint pass; all 27 unit tests pass; a clean production build completes; and the public customer/worker journey passed through post → apply → select → private-address reveal → start → worker done → customer confirm → review → verified portfolio record, with no browser console warnings or errors.

**Security:** HTTPS, Supabase Auth, RLS, protected server secrets and audit events are the core controls. As an isolated experimental defence-in-depth layer, address and phone fields are encrypted in the browser with the X-Wing hybrid construction (ML-KEM-768 + X25519) → AES-256-GCM; only ciphertext for those fields is stored, and server-side reveal uses the caller's JWT so RLS decides access. Work-history exports use ML-DSA-65 signatures. The database is not claimed to be “quantum encrypted”, and this implementation has not had an independent cryptographic audit.

## Known limitations (real)
- Payments are a labelled **simulation** — no PSP/escrow integration.
- No identity/background verification; optional identity demo is device-only and grants no badge. "Verified" work history = worker marked done + customer confirmed.
- Two colluding accounts can still create records for each other (next: account-age weighting, distinct-customer signals, PSP-backed payments).
- Sign-up throttle is global (30/min), not per IP; no captcha. Supabase "leaked password protection" is a dashboard setting not yet enabled.
- Report pathway only — no user block list yet. Reports have no admin console (read via database).
- No notifications (SMS/WhatsApp/push); gig pages poll every 8 s.
- Location is area-level (36 SA areas) — no maps/geocoding.
- Netlify's own dismissible "Powered by Netlify" badge overlaps the mobile tab bar until turned off in Netlify project settings.

## Demo accounts
Home page buttons **Try as Thandi** (customer) / **Try as Sipho** (worker), or `demo.customer@sidegigs.app` / `demo.worker@sidegigs.app`, password `SideGigsDemo2026`. All demo data is badged "Demo"; `/impact` can show real users only.

## Demo script (≤ 8 steps)
1. Open `/identity-demo` → **Use sample details** → **Check ID format** → **Skip selfie** → observe simulation/no-verification notice → continue to job board. Then open `/welcome` → **Try as Thandi**.
2. **Post a gig**: pick a category, describe it, payout **R500** → see **R75 fee, R575 total**; add a street address (encrypted on-device) → **Publish**.
3. Tap **Switch to Sipho** → **Find work** shows it at the top ("In your area") → open → **Apply**.
4. **Switch to Thandi** → open the gig → see Sipho's verified gigs, rating and reviews → **Choose Sipho** (payment held — simulation) → **Decrypt and show** the address.
5. **Switch to Sipho** → **Start job** → **Mark as done**.
6. **Switch to Thandi** → **Confirm job is complete** → leave **5★** and a review.
7. Tap **Verified record SG-…** → Sipho's public portfolio shows the new record and review → **Share** or download the **Signed record** → check it at **/verify**.
8. Open **Impact**: people who earned, rand value earned, match rate, time to match.
