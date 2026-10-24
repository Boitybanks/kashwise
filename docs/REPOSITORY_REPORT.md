# KashWise repository report

Reviewed 23 October 2026. This is a source and local tooling review, not a production security audit. Live services were not changed.

## Overall assessment

KashWise is a substantial hackathon MVP for a South African local-work marketplace, verified work records, and earnings intelligence. It is suitable for version control and continued demo development. Production readiness is not established: payments are simulated, the documented backend rollout is incomplete, and device and live integration verification remain outstanding.

## Product and architecture

- **Work:** customer job posting, worker discovery and applications, assignment, QR start/finish handshakes, services and reviews.
- **Proof:** client-confirmed portfolio records, ProofScript, signed work history, income statements and skills profiles; browser verification of signed records.
- **Money / iBanks:** signed provider events, an append-only ledger, settlement and payout separation, outbox processing, risk rules, forecasts, earning patterns, insights and diagnostics. Ask iBanks has deterministic answers and optional Anthropic rephrasing. Savings and retirement are simulations.
- **Business model:** a scenario calculator models a 10% success fee. These are assumptions rather than measured commercial results.
- **Web:** React 19, TypeScript, Vite, Tailwind and React Query; pages in `src/pages`, shared domain logic in `src/lib`.
- **Backend:** Supabase Auth, Postgres, storage and row-level security; 15 SQL migration files. Eight Netlify function entry points provide signing, contact access, money intelligence and payment simulation/webhooks.
- **Mobile:** Expo / React Native app in `mobile`, sharing backend and iBanks logic. Separate package manifest and lockfile.
- **Verification:** 21 unit/component/database test files, PGlite migration tests, Playwright browser journeys and a separate live-database journey configuration.

## Strengths observed in source

- Financial values use integer cents and explicit distinctions between earned, held and paid-out amounts.
- Provider webhook signatures are checked before processing; event contracts use schema validation.
- Caller-scoped Supabase access delegates authorization to database policies rather than using a browser service-role key.
- Optional AI output is constrained by computed facts and a rules fallback.
- Environment templates, attribution, architecture, event contracts, implementation status and demo material are present.
- Git ignore rules exclude local environment files, dependency folders, build output and test artifacts. A targeted scan found no common GitHub/Anthropic/OpenAI private-token or PEM private-key patterns in the scanned files. This does not certify that all sensitive content is absent.

## Findings and next steps

1. **Backend deployment remains unverified.** `IMPLEMENTATION_STATUS.md` dated 9 October records two iBanks migrations not applied, missing webhook-secret configuration and new functions not deployed. Recheck the current environment and exercise the full pipeline in a dedicated demo environment before claiming end-to-end availability.
2. **Payments remain simulated.** No live bank/payment integration is established. Keep simulation labels and avoid presenting simulated income documents as proof of actual paid income.
3. **Browser/device coverage is incomplete.** Existing documentation records no mobile device/emulator run and no iOS build. Current review does not establish visual quality, accessibility or device behavior.
4. **Routine browser tests can mutate a live service.** `playwright.config.ts` defaults to the existing SideGigs production URL, and `e2e/smoke.spec.ts` creates jobs and reviews. The separate journey suite also writes to a live database. Use an explicit disposable test environment before running these suites.
5. **No GitHub Actions workflow is present.** After publishing, add CI for clean dependency installation, typechecking, lint, isolated tests and build. Keep tests that write to live services out of routine CI.
6. **Documentation includes historical state.** The implementation status includes dated results and the statement that no commits exist. Use this report's current verification separately from those historical claims.
7. **Attribution and licensing are explicit.** `NOTICE.md` preserves SideGigs / CodeCraft attribution and records founder reuse authority. No open-source licence is granted; README and notice reserve rights.

## Local verification

| Check | Result on 23 October 2026 |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; 2,191 modules transformed |
| `npm run typecheck --prefix mobile` | Passed |
| `npm run test:serial` | Inconclusive: runner started but produced no individual test results after several minutes; stopped rather than claiming success |

Browser/live database suites are intentionally excluded because they mutate connected services. No deployment, live migrations or API-provider calls are part of this review. A clean dependency installation and mobile bundle were not repeated.

The repository's earlier status document records OneDrive-related worker startup failures. That is a possible explanation for this run, not a confirmed diagnosis. Repeat the isolated suite in a checkout outside OneDrive or CI before treating test health as verified. The staged whitespace check also flags existing trailing whitespace and blank lines, including Markdown hard breaks; these were retained during the initial source import.

## GitHub status at review start

The local repository was initialized on `main`, with no commits and no remote. About 250 nonignored files were present. GitHub CLI was authenticated as `Boitybanks`. Contrary to the initial assumption that no repository existed, `Boitybanks/kashwise` already existed publicly with a README and a `main` branch. The owner selected this existing public repository as the upload destination. Its existing history is retained, with the local application and this report added in a new commit.
