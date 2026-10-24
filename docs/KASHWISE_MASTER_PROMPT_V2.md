# KASHWISE — MASTER IMPLEMENTATION PROMPT FOR CLAUDE CODE (OPUS 5.5)

> Paste everything below the horizontal rule into Claude Code while VS Code is open at the `kashwise-main` repository root. This is an engineering execution brief, not a request for a speculative design document.

---

> ## Mandatory companion: iBanks engine specification
>
> **BEFORE YOU WRITE CODE, read `docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md` in full.** The earlier master brief describes iBanks goals but not the event pipeline, trusted financial data, rule engine, analytics, policy gate, agent tool contracts, security boundary, or detailed implementation. The companion document is the **normative** iBanks technical definition; its more specific financial-engine requirements take precedence over this brief wherever an implementation detail differs.
>
> Claude Opus 5.5 (your coding agent) is **not** itself the installed runtime iBanks assistant. Implement a server-side AI provider adapter with a fully functional deterministic fallback, and leave external bank/payment actions disabled unless actually integrated and authorised.
>
> Start with the audited and testable **job → trusted sandbox settlement → immutable ledger → iBanks event → earnings insight → worker UI/Proof** vertical slice; preserve strict separation of money earned/payable and payout confirmed.

---

You are Claude Opus 5.5 working as the principal software architect, senior full-stack/mobile engineer, security engineer, product designer, data engineer, and QA lead for **KashWise**. You have access to the **actual local repository in VS Code** and should inspect the code before making architectural decisions. **Implement, test, and integrate the product**. Do not stop after generating a plan or mockup.

## A. Context and non-negotiable mission

**Product name:** KashWise (case-sensitive brand), stylised **KashWise**.  
**Tagline:** **Earn it. Prove it. Grow it.**  
**Market:** South Africa, launching around township and suburban informal/gig labour.  
**Competition:** FNB App of the Year Hackathon 2026, **Financial Inclusion and Money Confidence** track, scheduled 23–25 October 2026 per organiser workspace screenshot; confirm any updated rules from provided organiser documents.  
**Delivery target:** a strong **48-hour implementation sprint** producing a demonstrably working, polished, secure MVP; use remaining time before the hackathon for validation and polish.  
**Platforms:** **responsive web**, **Android**, and **iOS**. Native builds must be technically viable and testable; do not falsely claim App Store or Play Store approval.  
**Business purpose:** Connect people to local paying work, make it easier to hire local talent, and convert completed jobs into verified work history, evidence portfolios, documented earnings, accessible financial intelligence, and pathways to voluntary savings.

KashWise is NOT just a job-listings board and NOT just an AI chatbot. It is **economic participation + proof + money confidence**, joined by actual verified marketplace events.

**Brand story:** “Kash” is accessible income, hustle, and earning; “Wise” is informed choices, financial intelligence, and financial resilience. The experience should resonate with everyday South Africans, including people with irregular income, limited data, and little formal work experience. The platform should help previously overlooked workers become visible in the labour marketplace without claiming that platform work records automatically constitute formal creditworthiness.

**iBanks** is the AI-powered financial-intelligence and protection engine **inside KashWise**, not a separate end-user bank app. The user-facing area can be called **KashWise Money / Intelligence, powered by iBanks**. iBanks only knows what the platform has validly recorded or what a user explicitly and lawfully supplies. It is not connected to a real bank unless explicitly integrated through an authorised provider.

## B. First instruction: audit the real repository and preserve its value

The current VS Code workspace appears to have a top-level `kashwise-main/README.md` and a nested existing Geekulcha project `kashwise-main/GK_SideGiGS/` containing a pre-existing web app, `src/`, `supabase/`, `netlify/`, `tests/`, `e2e/`, `public/`, `package.json`, `package-lock.json`, `CLAUDE.md`, `.env.example`, and possibly local `.env` files, build outputs, and dependencies. **Confirm everything rather than trusting this screenshot description.** There may be another `.git` directory, working deployment, or established database schema.

Before edits:

1. Determine the true Git root(s), current branch, uncommitted changes, app entry points, scripts, actual frameworks/versions, deployment setup, database schema/migrations, authentication, existing profiles/jobs/payments, tests, CI, and app's current working state.
2. Read root README, nested `CLAUDE.md`, architecture and existing tests; treat code and passing tests as the source of truth. Identify planned versus actually working features.
3. Run the project's relevant install/type-check/lint/test/build commands when feasible and record baseline results. Avoid breaking an existing live demo.
4. Identify hidden credentials or sensitive files. **Do not display secrets, paste their values into chat, embed them in apps, commit them, or print them in logs.** Check that `.env`, service-role keys, signing credentials, tokens, build outputs and `node_modules` are ignored appropriately. Report suspected exposure and required rotation rather than copying values.
5. Identify code/assets contributed by the former CodeCraft team. Flag any ownership/licensing uncertainty; do not invent permission, delete attribution, or assert exclusive ownership. Before transferring jointly owned material outside an authorised context, require founder approval.
6. Inspect the organiser's actual challenge, seven judging criteria and submission conditions **if supplied locally**. Do not fabricate criteria or the event's rules.
7. Return a short **AS-IS AUDIT** with what works, what is broken, the selected architecture and why, and the immediate P0 tasks. **Then implement immediately**; don't wait for approval on routine engineering choices. Ask only if blocked by a genuinely consequential unknown (e.g., production funds, legal rights, missing external credentials).

**Migration requirement:** Rebrand SideGigs/SideGeeks/Sidekicks to **KashWise** consistently in screens, navigation, application metadata, favicon/icon placeholders, SEO, manifest, notifications, user-facing copy, docs, social previews, demo personas, Android/iOS display names and package/bundle identifiers (where appropriate). **Do not blindly rename legal/third-party references, audit history, database migrations, environment variables or external identifiers that would break integrations.** Preserve working user journeys and tests. Use migration mappings where needed. Existing Geekulcha evidence can remain referenced accurately as historical attribution where legally appropriate.

## C. Technology decisions: audit-driven, not rewrite-driven

The screenshot suggests an existing React/TypeScript web app backed by Supabase and deployed to Netlify, while the new KashWise README proposes Expo/React Native/Firebase. **Do not introduce Firebase solely because the proposed README mentions it.** Verify the real backend and favour the shortest defensible path to a working three-platform product.

Recommended decision tree:

- **Preferred for the 48-hour sprint when existing web is solid:** retain/refactor the proven web app (e.g. React/Vite + Supabase), build an **Expo + React Native + TypeScript** Android/iOS client sharing typed domain contracts, validation schemas, API/service adapters and design tokens where practical. Organise as a clean monorepo only if the migration will not derail delivery. Target `apps/web`, `apps/mobile`, `packages/shared`, plus server/db locations when feasible; an incremental equivalent layout is acceptable.
- **Alternative:** a single universal Expo Router + React Native Web application, **only if** a measured technical spike proves that the existing web flows, desktop responsiveness, payment-provider interfaces, accessibility, and deployment can migrate without major regressions. Don't rewrite everything for conceptual elegance.
- Use the **existing verified Supabase backend** and Postgres/RLS/Edge Functions if already present. If not, choose a similarly auditable backend after inspection; document the rationale.
- Make development reproducible on Windows 11 + WSL/VS Code; provide `npm` commands, `.env.example`, installation instructions, and Expo development/EAS build instructions for both native platforms.
- Native and web should use the **same authorised backend/data model** with real authentication, not three disconnected local-storage demos.
- Preserve or improve the existing Netlify web deployment. Do not deploy/push publicly, change remote production configuration, or run destructive migrations without explicit user consent.
- Use TypeScript strictness and runtime schemas (e.g. Zod), accessible components, React Query/TanStack Query or equivalent, bounded caching, and sane dependency hygiene. Prefer simple, inspectable technologies over unnecessary microservices.

## D. Core roles and real end-to-end product journeys

There are TWO primary user roles, with the possibility that one verified account can switch contexts safely: **Worker** and **Client**. Admin/moderation is a restricted third role. Enforce permissions server-side, not only with hidden buttons.

### D1 — KashWise Work (marketplace)

**Worker journey:** register/log in; choose skills and approximate operating area; create trust-building profile; browse/search/filter nearby opportunities by category, distance, budget and status; submit an application or offer; negotiate/accept mutually agreed scope and price; manage milestones/status; attach appropriate evidence of completed work; request completion confirmation; view payout state and earnings; receive eligible rating; display completed work in portfolio; see financial dashboard.

**Client journey:** register/log in; post an opportunity with title, details, rough location, category, price or budget, date, and clear scope; search worker profiles by skills, location, verified jobs and ratings; review applicants and choose worker; agree to a fixed price or explicit variation; complete a **simulated provider payment authorisation** for the MVP; review documented completion; confirm work, dispute, or report an issue; pay via validated simulated provider settlement; leave a review after genuine verified completion.

**Usability rules:** minimal clicks to post/apply; fast search; meaningful empty states; prevent double-booking and invalid transitions; accessible on low-end Android; permission-based geolocation rather than forced precise location; no exposure of private residential addresses. Use South African rand (ZAR), local vocabulary without stereotypes, readable microcopy. Optimize networks/bundles using compressed media, pagination, caching, and lazy loading. Optional multilingual architecture (English + structured translations ready for isiZulu/isiXhosa/Sesotho) without shipping misleading auto-translations.

### D2 — KashWise ProofScript (evidence and portable credibility)

For each legitimately completed job, save:
- job scope/category, price and dates;
- worker, client and server-tracked completion status;
- evidence attachments with secure access;
- client confirmation (or appropriately labelled dispute state);
- actual trusted payment status (simulated for hackathon);
- post-completion review, with anti-self-review checks;
- proof level: **platform-recorded**, **client-confirmed**, **payment-confirmed** (do not label unverified uploads as independently verified).

Build a clear work-history timeline and professional portfolio suitable for workers without conventional CVs. AI may draft a professional summary, skill descriptions and portfolio text **only from user-provided/verified facts**, and must never invent credentials, employment durations, ratings or completed jobs. Workers approve editable AI text. Offer a controlled shareable portfolio or downloadable summary if time permits, respecting privacy settings and revocation.

### D3 — KashWise Money, powered by iBanks

This is the competition differentiator. Do not bolt a generic LLM chatbot onto the homepage. Implement a financial-intelligence service whose calculations are deterministic and traceable to trusted **settled earnings ledger events**.

**Required MVP capabilities:**
1. **My Money dashboard:** gross completed-job value, platform fee, worker net earnings, pending payouts, settled payouts, refunds/chargebacks where relevant, job counts, weekly/monthly totals, rolling income trend and separate overdue/pending events. Default numbers must be driven by database events, not hardcoded screen text.
2. **Irregular-income intelligence:** rolling weekly averages, median, highest/lowest week, earnings volatility (computed transparently), near-term cash-flow estimate using conservative assumptions, and a prominently labelled **estimate, not a guarantee**; avoid invented forecasts with insufficient history.
3. **Safe-to-save scenarios:** worker chooses goals and a voluntary percentage or fixed amount from **net settled proceeds**. Calculate after platform fees, and show take-home remaining. Warn if the proposed amount exceeds available money or if forecast confidence is low. Use illustrative scenarios; do not silently transfer money.
4. **Retirement-readiness education:** clearly separate short-term emergency savings from long-term retirement products. Implement an optional retirement contribution **simulator only** (percentage, amount, projected totals clearly labelled hypothetical). Actual RA selection, suitability assessment and contributions require appropriately authorised regulated partners, user consent and compliant controls. Do not claim to be a licensed financial adviser or offer a real retirement product.
5. **Protection intelligence:** flag duplicate payment events, inconsistent fee calculations, disputed jobs, repeated failed payout attempts, suspicious changes to payout details, unusual account access, and anomalous platform earnings activity. Emit transparent warnings with safe next steps; do not claim to detect external bank/card fraud without external bank event access.
6. **Agent explanation and conversation:** “What did I earn this week?”, “Which gigs pay me best?”, “How much might I save?”, “Why is my payout pending?”, “Show my proof of income”, “What if next week is slow?” Use validated structured calculations as grounding. Explain in plain English, optionally in requested supported languages. A rules-based fallback must work when LLM API credentials are missing, rate limits hit, or users are offline. Agent must not fabricate balances, account details, eligibility, earnings, transfers, or financial product advice.
7. **Accessible interface:** charts accompanied by text summaries, reasonable font sizes, helpful explanations of gross vs net, no jargon-only financial guidance, visible data-as-of timestamps and clear “demo mode” labels for simulations.

**Example judge demo:** Thandi posts a R1,000 painting job, Sipho applies and is chosen, Sipho uploads proof, Thandi approves, a sandbox server-side payment event confirms settlement, KashWise calculates a **10% illustrative marketplace fee = R100** and **R900 worker net** (the fee is a configurable hypothesis, not a mandate), Sipho's verified work portfolio updates, iBanks explains the change to weekly/monthly totals and the worker simulates opting to put 5% of net (R45) toward a savings goal and 2% (R18) toward a long-term retirement goal; **no real money is moved**. A second demo shows a duplicate payment webhook replay being safely ignored.

### D4 — Optional low-data and cash-out inclusivity

Preserve the long-term product vision: phone-number-linked cash-out vouchers/SMS for people without conventional banking access through an authorised payment partner, and eventual USSD/SMS fallbacks. For MVP, implement only a properly labelled **sandbox/mock adapter and experience** if no real provider integration is authorised. **Never assert that Telkom, a bank, or a spaza shop is integrated or can cash out vouchers without contractual and technical proof.** If these capabilities threaten P0 delivery, document them as Phase 2.

## E. Payment, ledger and transaction-state correctness (CRITICAL)

KashWise **does not hold customers' money**, does not operate its own bank wallet, and does not claim a custodial escrow service. In production, an authorised payment-service partner will process customer funds, conditional releases, refunds and payouts subject to its product and contract; KashWise records the workflow. The hackathon must use simulated provider events unless real sanctioned sandbox credentials are available.

Implement a **server-authoritative payment state machine** with valid transitions such as `created -> pending_authorisation -> authorised -> pending_settlement -> settled`, plus `failed`, `cancelled`, `disputed`, `refunded` as appropriate. Design separately for job status. **Only validated provider callbacks or intentionally gated seed/demo events can create settlement and earned-income records.** A client's UI button alone must not mark money paid. Never confuse a *payment promise* with settled earnings.

Use:
- money in integer minor units (cents), ISO currency ZAR; no binary floating point for settlement amounts;
- a ledger with immutable append-only transaction events or suitably audit-safe equivalent, reconciliation, fee allocations and worker net;
- unique provider event IDs, event signature validation or mocked equivalent in sandbox, idempotency, replay protection, transactional updates, and safe handling of reordering/out-of-order webhook events;
- database constraints for state transitions and unique payout references where appropriate;
- refund/dispute reversals without erasing original history;
- proper server auth, least privilege, and never trusting client-supplied fees or worker earnings.

Create automated tests proving that duplicate webhook events do not double-credit the worker, unauthorised clients cannot settle jobs, refunds are accounted for, and financial dashboards reconcile exactly with ledger rows.

## F. Security, privacy, and responsible AI by design

This app processes sensitive identity, location, work evidence and financial activity; protect them from the first implementation.

**Mandatory:** secure authentication and session handling; database Row Level Security if Supabase is used; all sensitive mutations authorised at server boundary; role and record ownership tests; private file storage with short-lived authorised access; upload size/type limits and safe MIME/extension validation; validation of all inputs; protection against mass assignment, IDOR, rate abuse, automated spam, scraped identities, unsafe reviews and leaked precise locations; strict secret separation; no privileged API keys in browsers or mobile bundles; minimal logging of PII; structured audit events for jobs, payouts, approvals and disputes; account deletion/export plan; POPIA-aware privacy/consent/retention requirements; accessibility and appropriate content moderation/reporting.

**AI boundary:** iBanks can analyse, explain and suggest using the least data necessary; it **cannot directly authorise payouts, stop transfers, move savings, alter the ledger, grant work verification, or provide unlicensed regulated investment recommendations**. Tool calls must pass deterministic policy and user-permission checks. Financial numbers are calculated outside the LLM and passed in as validated facts. Protect prompts from malicious job descriptions and portfolio attachments (untrusted inputs); apply output validation; record model/provider metadata, decisions and action outcomes without exposing private data. If AI provider or credentials are missing, ship fully functional deterministic insight cards and a clearly marked limited assistant mode.

All seeded people, gigs, payouts, balances, testimonials and “AI outputs” used in demos must be marked **fictional/sandbox**. Never imply production integrations that are not real.

## G. Brand, UX and responsive behaviour

KashWise should feel like an ambitious, modern South African product—trustworthy enough for financial activity, warm enough for everyday township hustles, visually sophisticated but never intimidating. Avoid generic template design, infantilising copy, and luxury banking aesthetics that exclude the target worker.

Brand motifs: **KashWise**, “**Earn it. Prove it. Grow it.**”; clean, highly legible typography; rich neutral backgrounds with vibrant but accessible financial-growth accents; restrained motion and low-data alternatives; clear trust states; excellent empty/loading/error/offline states; polished dark mode only if accessible and easy to maintain. Provide a consistent responsive design system and reusable components. Do not depend on decorative animations for comprehension.

**Screens required:** responsive landing/sign-in, role onboarding, client job-post wizard, local jobs feed/search, job details and applications, worker skill/profile page, client talent search/profile evaluation, job lifecycle and evidence submission, simulated checkout/payment status, worker earnings/finance dashboard, iBanks insight cards and conversational help, ProofScript portfolio, savings and retirement simulation, trust/settings/privacy/support. Adapt layout to mobile portrait, tablet and desktop; no horizontal scrolling in typical screen widths; adequate hit targets and keyboard support. Web should be polished enough to demonstrate live on a projector; native mobile should be comfortable on a modest Android phone and credible on iOS.

Keep the original Thandi (client) / Sipho (worker) concept if present, and preserve a one-click **Try as Thandi / Try as Sipho** demo with access strictly limited to fictional accounts/data. Do not let a demo switcher bypass real-user authorisation.

## H. Priorities, phases and execution protocol

Time is limited. **Prioritise functional truth over mock screen count.** You must actively implement as much as available tools/time allow.

**P0 — must work before polish:**
- existing app audit and clean baseline;
- coherent KashWise rebrand and responsive working web app;
- genuine worker/client authentication and role-protected core flows;
- post/search/apply/accept/complete/confirm job;
- secure evidence capture and verifiable work-history record;
- idempotent sandbox payment settlement and mathematically correct earnings ledger;
- weekly/monthly KashWise Money totals and at least three genuinely grounded iBanks insights;
- opt-in savings scenario with no live transfers;
- meaningful automated tests and reproducible setup;
- Android/iOS Expo app running against same backend, implementing the critical demo journey, or explicitly identify blockers before claiming completeness.

**P1 — if P0 is green:** polished talent discovery, accessible charts, portfolio export, richer AI chat, retirement simulation, secure notifications, localisation scaffolding, Android/iOS device QA, video-ready presentation mode.

**P2 — defer unless completed early:** live payouts/voucher redemption, USSD gateway, real RA provider, external bank account links, independent credit score, large ML training infrastructure, app-store approvals, multi-country expansion.

Work in **small, verifiable vertical slices**. After each slice, run relevant tests/build, fix regressions, and report the actual result. Never hide failures behind “done”. Prefer writing code and tests over lengthy commentary. Do not delete existing working features to simplify the demo. Do not make unsupported claims of performance/security certification.

Maintain a concise `docs/IMPLEMENTATION_STATUS.md` with done / partial / not started; `docs/ARCHITECTURE.md` with diagrams or Mermaid and data flow; `docs/SECURITY_AND_PAYMENTS.md` documenting non-custodial boundary and threats; `docs/DEMO_SCRIPT.md` with a 90-second and 3-minute route; and a precise root README for local web, Android, iOS, tests, environment, and any unavailable external services. Update the existing README to reflect what you actually implemented, not only plans.

**Code quality gates:** TypeScript checks; lint; unit tests for financial mathematics and state machines; integration tests for role authorisation, storage access and database/event reconciliation; web build; critical web E2E test (prefer existing Playwright if present); mobile compilation/Expo diagnostics; run smoke tests for actual Android/iOS where environment permits. If iOS simulator isn't available on Windows, document Expo Go / EAS cloud build approach and clearly distinguish buildable from device-tested.

Make demo reproducible with seeded fictional users/jobs/payment events in a segregated sandbox environment. Provide reset commands that cannot touch production data. Ensure sample data truly flows through business rules.

## I. Final acceptance criteria: demo must prove the concept

A judge should be able to observe, with no database edits and no hardcoded financial card pretending to update:

1. Open KashWise on a phone-sized screen or responsive web and understand its purpose in under 10 seconds.
2. View local gigs or qualified local talent, with useful filtering and truthful profile trust indicators.
3. Create a job as Thandi and apply/accept as Sipho.
4. Complete the job, attach evidence, confirm job, and settle through a clearly labelled provider simulation.
5. See **KashWise ProofScript** update from the verified lifecycle.
6. See **KashWise Money** reflect precise weekly/monthly **settled net earnings**.
7. Ask **iBanks** what changed, why, and what savings amount is feasible. The response must reconcile to the ledger.
8. Explore a **fully optional** savings or retirement contribution simulation, with no movement of real funds and no disguised financial advice.
9. Repeat a settlement event and observe idempotent processing/no double income.
10. Observe separate end-user permissions and a mobile-ready Android/iOS experience sharing the same backend.

## J. Your output and autonomy rules

**Start NOW** by examining the current files. First reply with a concise audit + chosen approach + next three implementation steps, then use available coding/editing tools immediately. Do not deliver only pseudocode, architectural diagrams, or suggested commands when you can implement. Do not make changes to production services, push commits, publish apps, purchase services, or connect real payment rails without explicit consent. For local code implementation and local test execution, proceed autonomously.

At major checkpoints, return a compact status:
- files/modules implemented;
- actual commands executed + their pass/fail results;
- what runs on web, Android and iOS **separately**;
- known limitations or missing credentials;
- the next highest-value action.

If the prompt is too large for one turn, maintain an implementation checklist in the repository, continue vertically, and prioritise reaching a working demo. Never call an unimplemented feature “working.”

**The North Star:** KashWise makes previously overlooked work visible, turns real platform-verified labour into credible evidence, and converts irregular earnings into understandable, actionable financial confidence. **Earn it. Prove it. Grow it.**
