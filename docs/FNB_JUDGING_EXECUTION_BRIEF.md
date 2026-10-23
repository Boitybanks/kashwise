# KASHWISE — FNB APP OF THE YEAR 2026
## Claude Opus 5.5: Judge-Ready Engineering Execution Brief
### Mission: Pursue 10/10 in each of seven published categories (70/70 total)

**Brand:** KashWise — *Earn it. Prove it. Grow it.*  
**Team:** MissBanks  
**Challenge:** Financial Inclusion and Money Confidence  
**Platforms:** Android, iOS, responsive web  
**User-facing AI:** KashWise Money, powered by the **iBanks** event-driven intelligence engine.  
**Competition window shown in organiser workspace:** 23–25 October 2026. Verify any updates in official instructions.

> **Scoring integrity:** This is a 70/70 **target**, not a promise of a judge's score. No fabricated users, integration partners, traction, production credentials, test passes, testimonials, benchmarks, security certificates or projected-impact figures masquerading as achieved results.

---

# THE EXACT CLAUDE CODE TASK

You are **Claude Opus 5.5**, acting as principal product engineer, mobile/web lead, backend architect, security engineer, applied AI engineer, product designer, QA lead and launch lead for KashWise. You have access to my actual VS Code multi-root workspace. **Write working code, run verifications, fix regressions and prepare judge evidence.** Do not stop at analysis, wireframes, documentation, or a static proof of concept.

## 0. Read the authoritative source material and audit the code FIRST

1. Inspect BOTH workspace folders. The current workspace includes a new `kashwise-main` repository and the original Geekulcha `GK_SideGiGS` project. **All new KashWise implementation must live in the KashWise repository.** Treat the original project as read-only reference unless I explicitly approve edits. Confirm physical locations, Git roots, authorisation and licensing before copying jointly authored files. Do not erase existing contributor credits.
2. Locate and **read in full**, where present:
   - `docs/KASHWISE_MASTER_PROMPT_V2.md` (or `docs/KASHWISE_MASTER_PROMPT.md`);
   - `docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md`;
   - `docs/KASHWISE_CLAUDE_START_HERE.md`;
   - root/nested `README.md`, `CLAUDE.md`, package manifests, database migrations, tests and deployment configurations.
   If a document is not present, report the missing path. **Never claim you read a missing file.** The iBanks specification defines the authoritative financial-event, ledger, risk, reasoning and policy architecture.
3. Determine the real frameworks, current functionality, authentication, roles, data model, security policies, tests, deployment and running environment. Preserve working code and optimise for a fast, safe migration; do not rewrite just because a new architecture looks elegant. Prefer reusing an existing proven React/Supabase web backend and building an Expo/React Native native client using the same authorised services, if the audit supports it.
4. Run a clean baseline of available checks. Make a short `AS_IS_AUDIT.md` with **Verified / Broken / Planned / Unknown** labels, evidence and P0 dependencies. Check `.gitignore`, tracked secrets, CI, nested Git history and production configuration. Never print or commit secrets; advise rotation if exposed.
5. Read the exact FNB/Sonke hackathon instructions and seven published criteria below. Do not invent additional official requirements. Note whether existing/prebuilt code is permitted before reusing prior hackathon implementation in the submission.
6. Produce a brief prioritised plan, **then start implementing immediately**. Ask me only about genuine external blockers: IP rights, destructive migrations, live money, unavailable proprietary credentials, legal authorisation or public deployment/push. Preserve uncommitted user changes.

---

# 1. THE USER PROBLEM AND IRREDUCIBLE PRODUCT

**FNB challenge fit:** People with irregular income, limited financial knowledge or restricted formal access need simpler, safer, more useful financial tools. KashWise tackles the problem at the income source: it helps people earn, generates verifiable evidence of *platform* activity, and supplies financial intelligence designed around irregular earnings rather than salaried assumptions.

**One-sentence proposition:** *KashWise turns local work into earnings, verified professional proof and usable financial intelligence, empowering overlooked workers to earn today and plan for tomorrow.*

**The unique integrated loop:**

`Discover work → Agree terms → Perform/verify job → Provider-verified sandbox payment → Immutable earnings entry → AI-assisted work portfolio → iBanks forecasts/insights → Voluntary financial goals`

**Core profiles:**
- **Sipho — worker:** informal painter/handyman, irregular earnings, no traditional CV, limited data; wants work near him, credible proof, payout choice and money clarity.
- **Thandi — customer:** needs a local service provider quickly; wants transparent proposals, trust signals, safe confirmation and clear dispute paths.
- **Business client:** wants searchable, evidenced local talent, job history and repeat bookings.

**Do NOT conflate:** job marked complete ≠ payment settled ≠ worker paid; platform earnings ≠ all household income; verified in-platform history ≠ formal employment or creditworthiness; simulated FNB payouts ≠ live FNB integration.

---

# 2. THE EXACT OFFICIAL JUDGING RUBRIC: SEVEN TIMES TEN

The organiser screenshot lists these seven headings: **Product, Creativity, Usability, Sustainability, Impact, Presentation, Intelligence**, each scored **0–10**. Use the questions beneath each heading as acceptance criteria. Build, test and collect evidence for EVERY one.

## A. PRODUCT — TARGET 10/10

**What judges ask:** Is it complete or far from completion? Is it polished and reliable? Does it meet the challenge? Is there a market? Does it have traction?

**Implement:**
- One coherent product on mobile and web, not disconnected mock screens: customer registration → job post → worker matching/search → proposal/acceptance → job status/evidence → verified demo payment event → earnings → iBanks insight → professional portfolio.
- Real persistent records and server-authorised operations. Two distinct roles; one account may switch roles only within correct access control. Beautiful responsive web plus functioning native Android and iOS experiences sharing business logic/data.
- Clear availability states, input validation, loading/empty/offline/error/denied states, retries and graceful recovery. Stable demo seed data labelled **Fictional / Sandbox**.
- Search and filters by skill, locality, budget and availability; worker and employer profiles; honest trust signals.
- Preserve demo entry points for **Try as Thandi / Try as Sipho**, sandbox-only with proper isolation. Provide genuine test accounts if needed.
- Instrument privacy-respecting events: registered workers/customers, search→application, completed jobs, time-to-match, payouts verified, returning customers, insight engagement. Make an internal, not publicly exposed, metrics view. **Zero real traction must be reported as zero.** Collect actual tester notes and recordings/consent if feasible.

**Pass evidence:** Web deployment URL if authorised, Android build and iOS build/test report, tests for full journey, screenshots of actual screens, demo run from clean state, and a real usability/traction evidence note.

## B. CREATIVITY — TARGET 10/10

**What judges ask:** New application? Innovative approach? Improvement to society/business? Commercial and social relevance? Fresh, more effective solution?

**Implement the novelty, don't merely claim it:**
- **Work-to-proof-to-money intelligence**: a single authoritative verified job event updates a worker's evidence-backed career profile AND permitted financial records AND the event-driven iBanks engine.
- Generate AI-assisted portfolio narratives and CV-ready summaries from actual job categories, dates, evidence and consented reviews. Never fabricate qualifications, certifications, reviews, hours or employers. Highlight provenance per claim.
- Add an intuitive **Earning Power** panel: what services generate the worker's most confirmed earnings, completed-job rate, repeat customers, category strengths and *transparent* next-action recommendations. Distinguish correlation from causation.
- The worker can export a privacy-controlled proof-of-work profile and income report, showing what is *platform verified* versus user-entered.
- Build a side-by-side competitor/capability comparison only from substantiated claims; focus on a differentiated **integrated outcome**, not an unsupported “nobody has done this” claim.

**Pass evidence:** One actual validated job causes three distinct measurable outputs—portfolio update, financial ledger update and triggered iBanks insight—without manually patching the UI.

## C. USABILITY — TARGET 10/10

**What judges ask:** Is it easy? Does it have clarity, simplicity, intuitive navigation and obvious next steps?

**Implement:**
- Two crystal-clear role journeys with contextual navigation, big accessible tap targets, plain-language South African English and familiar payment labels. Avoid financial jargon or provide short explanations.
- Worker entry points: **Find Work / My Jobs / Money / My Proof**. Customer entry points: **Find Talent / Post a Job / Bookings**. A persistent clearly labelled way to get help and report a problem.
- Consistent design system and cohesive KashWise rebrand, polished headings, readable contrasts, success/error states, trust indicators, responsive typography and spacing; web layouts should look intentional on 360px, 768px and 1440px.
- Reduce friction: helpful defaults, location permission optional, manual location alternative, progressive disclosure; never force bank details to browse gigs.
- Build for slow networks/low-end phones: appropriate asset sizing, skeletons, network timeouts, cached public browse where safe, reduced-motion preference, resilient retry/offline messaging. Avoid making sensitive write actions appear successful while offline.
- Support keyboard navigation, forms with labels, focus states, screen-reader semantics and readable financial charts (tables/text alternatives). First-language support should be accurately scoped; translate only if checked by fluent reviewers.
- Run at least 5 observational usability sessions **if participants and consent are available**; otherwise explicitly record that testing is pending. Measure and fix blockers. Do not fabricate results.

**Pass evidence:** End-to-end walkthrough on a modest Android device, iOS simulator/device where possible, and web; no blocking UI defects; list of actual usability findings and fixes.

## D. SUSTAINABILITY — TARGET 10/10

**What judges ask:** Can the app/team grow? Can it scale? Is there a revenue path?

**Implement + substantiate:**
- Server-side **10% fee on eligible completed jobs**, configurable with clear receipt. Correct earnings ledger and real unit-economics calculator: gross job value, platform revenue, provider processing/payout costs, net platform contribution and worker payout. Use integer cents; tax assumptions explicit.
- Cost/revenue **scenario planning**, not fabricated actual financial results. Show three cases with editable monthly job count, average order value, provider costs and cloud/support costs. Show contribution margin and sensitivity. Identify small-ticket-payment risk; do not claim R10k jobs equals break-even unless evidenced by assumptions.
- Business onboarding and repeat-booking path; categories with repeat demand. Use referral mechanism only if not distracting P0. Implement instrumentation for retention and conversion.
- Clearly define commercial model: no upfront charges simply to browse/apply; 10% fee on success (specific fee incidence made clear); potential later optional business SaaS tools, NOT unapproved financial product commissions.
- Create concise founder-facing roadmap: first Gauteng launch, payment partner acquisition, fraud moderation, proof portability, wider rollout and performance/scalability capacity. Include realistic operating assumptions, legal/IP dependencies, POPIA procedures and continuity plan.
- Add load and failure-mode tests of representative core APIs and document bottlenecks; do not claim national production scalability based on local benchmark only.

**Pass evidence:** Interactive unit economics or accurately calculated scenario view, data-supported go-to-market roadmap, measurable cloud/AI cost assumptions and verified transaction fee mathematics.

## E. IMPACT — TARGET 10/10

**What judges ask:** How much impact? Big/small problem? How indispensable/important?

**Implement visible impact with integrity:**
- KashWise must visibly help an otherwise overlooked worker obtain an opportunity, record genuine proof of work, view verified earnings and make an informed financial decision, with clear outcomes that can be measured.
- Add opt-in **Impact** reporting using *actual platform records*: total paid jobs, net verified earnings to workers, completed portfolios, returning workers, average time to find a job, share of workers using financial insights, optional savings goals established. Disaggregate only when data/consent supports doing so.
- Low-barrier onboarding, manual-location mode, optional phone-based payout *simulation* for users without conventional bank accounts. Never claim every informal worker can cash out at any spaza; participating agent network and provider agreements are required.
- Explain trust/safety and dispute reporting. Show what happens when a worker doesn't get paid or the client disputes completion.
- Use published South African labour/inclusion facts only after checking source and date; cite statistics in pitch notes, not in app user earnings.
- A short **before/after story** must show the difference KashWise creates for the *same person*, backed by an actual demo trace rather than claims of national impact.

**Pass evidence:** One real transaction simulation with clear worker outcome, measurable dashboard data, opt-in financial actions, and a transparent boundary between pilot impact and projected scale.

## F. PRESENTATION — TARGET 10/10

**What judges ask:** How well does the team communicate the app? How effective is its story and societal relevance?

**Create materials that match the ACTUAL demo:**
- A 15-second attention hook about an informal worker with useful skills but no recognised record of work and inconsistent cash flow.
- A 45-second problem/solution explanation in ordinary human language.
- A compelling **90-second live-first demonstration** with deterministic demo fixtures: Thandi posts → Sipho accepts/completes → payment verified in sandbox → earnings dashboard → portfolio proof → iBanks recognises pattern, forecasts and helps simulate savings. Emphasise before/after.
- A **3-minute** and **5-minute** pitch with time-coded demo cues, slide titles, commercial model, differentiation, security honesty and impact. Check event's actual permitted pitch duration and revise accordingly.
- Produce a **judge-question playbook**: What is new? Is this just Snupit/Handy? Why is this financial inclusion? How is iBanks intelligent? Are payments really FNB? Does KashWise hold money? How are jobs verified? How does it make money? Is it built or planned? How could people without smartphones access it? What is the path to scale? Who owns original SideGigs code?
- Set up a stable fallback demo video captured from the real product, only if event rules permit. No fictional “live customer growth” overlays.
- Produce a one-page architecture diagram and concise **evidence pack** with working URLs/build instructions, screenshots, testing results, sourced metrics and declared integrations.

**Pass evidence:** Founder can demonstrate the core loop without developer intervention, within allotted time, with working backup and truthful Q&A.

## G. INTELLIGENCE — TARGET 10/10 (THE DECISIVE CRITERION)

**Actual organiser question:** Can the app “think” for itself, forecast and predict the user's likely future behaviour by analysing patterns in data inputs?

**This must be a REAL implemented event-driven subsystem, NOT a generic chatbot.** Read and follow `IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md` in full.

**Implement the architecture:**

`Trusted event → Schema validation → Idempotent event consumer → Financial ledger / analytics features → Rules + forecast model → Policy gate → Grounded language explanation → Saved insight → Worker notification → Audit trail`

**Required AI/financial modules:**
1. **Trigger:** A validated sandbox-settlement event (not a client button) invokes an agent job automatically; output is persisted and appears in worker's Money experience. Retry safe; no duplicates.
2. **Income truth:** Weekly/monthly earned *versus settled versus paid out*; distinguish gross, 10% platform fee, net, provider costs, pending, disputed and refunded. Use integer cents and `Africa/Johannesburg` period boundaries; source all figures from authorised records.
3. **Irregular-income pattern detection:** Identify variability, rolling weekly totals, typical vs unusual weeks, high-earning services and repeat customer patterns, explicitly accounting for small samples.
4. **Defensible forecast:** Project a next-7-day and next-30-day earnings *range* from dated historical platform earnings using an inspectable statistical baseline (e.g. recency-weighted weekly average / median + robust spread). Show a **range, assumptions, uncertainty and data sufficiency** rather than confident invented precision. For insufficient history show “Not enough data to forecast reliably.” Predictions must be visibly different from confirmed earnings.
5. **Likelihood-aware suggestion:** Derive a plain-language next step from actual recent history (e.g. which category or weekday has historically produced paid work, with sample size). Avoid suggesting guaranteed bookings or causal claims.
6. **Financial protection:** Detect duplicate settlement events, unexpected fee changes, suspicious payout destination changes, unusual amounts and invalid state transitions through deterministic policy checks. Flag/review/hold in the **sandbox** and require appropriate authorised resolution. A language model can explain but cannot execute banking actions or override the policy gate.
7. **Savings and retirement scenario:** Worker optionally selects a **percentage** of eligible net earnings. Compute exact hypothetical contribution and remaining amount, show liquidity warning. No automatic money movement or regulated product recommendation. Retirement annuities are not liquid emergency savings.
8. **Conversation with evidence:** Backend AI adapter is server-side, prompts/data minimised, output grounded in allowed records, citations/links to worker's own transaction/job where possible, deterministic calculation tools called for numbers, refusal/clarification when data unavailable. Graceful deterministic insights without an LLM API key.
9. **Feedback loop:** A worker may mark a suggestion as useful/not useful or correct an assumed expense; log feedback without training on secret financial data automatically.
10. **Observable inference:** Add a read-only diagnostics/audit view for demo: event ID, input count/date range, model/rule version, calculations, output, policy outcome, and timestamps. No exposed secrets or other people's financial history.

**Forecast tests:**
- Known time series → expected baseline and bounded forecast; compare against simple holdout observations where available, report forecast error and uncertainty. Seed data is labelled synthetic; **do not claim high prediction accuracy from synthetic results**.
- One payment event processed twice → one ledger update and one logical insight sequence.
- Job complete without settled payment → no settled earnings or payout confirmed.
- Refund after settlement → net available earnings adjusted appropriately; insight recomputed or invalidated.
- Worker A cannot inspect worker B earnings or prompts.
- Prompt injection inside a job description cannot cause backend money movement or data leakage.
- Zero/one transaction → honest low-data message, not a hallucinated forecast.
- Same inputs → same financial amounts even when the LLM response changes.

**Pass evidence:** A LIVE on-screen demonstration of iBanks waking up on a new trusted financial event, updating a real persistent forecast from existing data, showing explicit uncertainty, suggesting an opt-in action and leaving a verifiable audit record.

---

# 3. FINANCIAL / PRIVACY / SAFETY BOUNDARIES (NON-NEGOTIABLE)

- **No custody:** KashWise does not itself hold customer or worker money. An appropriate authorised third party is required for production conditional funds and payouts.
- **FNB is not pre-integrated:** eWallet, PayShap and FNB merchant acceptance can be labelled *planned or sandbox adapter* unless authorised credentials, permitted APIs, test evidence and agreements exist. Don't counterfeit FNB logos, confirmation receipts, PINs, webhook signatures or “approved partner” claims. Simulate their expected user outcome neutrally.
- **No self-certified payment release:** A customer pressing `Confirm Completion` never causes an unconditional, unverified financial release. Completion may start review/payout eligibility only under a verified policy and payment-provider event chain.
- **Server authority:** calculate platform fees server-side; payment events idempotent; event state transitions validated; ledger append-only with corrections/reversals; authorise all reads/updates at the backend and DB layer.
- **POPIA:** use data minimisation, privacy controls, disclosure/consent, RLS, secure files, retention choices and worker control over shareable evidence. Never expose identity documents or precise home location publicly.
- **High-impact AI:** agent cannot create payouts, change payment destinations, select investments or issue regulated personalised product advice; savings/RA are opt-in calculators until authorised providers exist. Respect user autonomy.
- **No fake verification:** “Verified work” means tied to a confirmed in-app job and appropriately recorded evidence/review; identity verification and FNB settlement are separate claims that require their own evidence.
- **IP rights:** Check ownership and license terms of CodeCraft SideGigs materials before copying. Preserve author attributions and obtain consent where legally required. Don't submit jointly owned code as exclusively owned absent agreement.
- **No destructive actions without founder approval:** production migrations, public pushes/deployments, actual bank actions, real cash, personal-data extraction, paid AI service activation at scale.

---

# 4. IMPLEMENTATION ORDER — OPTIMISE FOR 70 POINTS, NOT FEATURE COUNT

**Phase 0 — Audit, truth and build baseline**
- Inspect both repos, dependencies, environments, test coverage, migrations and proven UI. Save one-page risk/feature inventory and initial category score baseline as **internal engineering estimates**, not official scores.

**Phase 1 — The unbreakable demo vertical slice**
- Fix/rebrand original marketplace as KashWise; get real role-based worker/client flow working on web; reliable persisted state and job lifecycle. Implement sandbox provider → verified event → ledger → portfolio → event-driven iBanks earnings insight. This phase is the highest priority; finish and test before expanding scope.

**Phase 2 — Intelligence that earns points**
- Implement time-series forecast with uncertainty and low-history behavior, income-pattern explanations, earnings-by-category, risk rules, optional saving scenarios and audit output. Record test fixtures, forecast performance limits and exact test results.

**Phase 3 — Excellent usability and multi-platform**
- Pixel-polish real flows, accessible responsive web, low-data optimisation; Expo Android and iOS clients using shared backend/data; validate builds and flows on actual available devices/emulators. Do not claim tested iOS simply because TypeScript compiles.

**Phase 4 — Market validation, economics, impact and proof**
- Complete price/cost scenario calculator, real instrumentation, useful business metrics, defensible market thesis, actual consented tester feedback where available, launch roadmap and evidence pack.

**Phase 5 — Judge rehearsal and hardening**
- Run full CI + acceptance tests, threat checklist, permission tests, demo rehearsal, recovery path and cut any unstable feature rather than sacrifice reliability. Prepare pitch and Q&A using only the state of implemented software.

**Prioritise P0** complete end-to-end verified loop + working iBanks + polished web + trustworthy financial records, **then P1** Android/iOS and forecasting depth, **then P2** extra integrations/advanced features. Cross-platform remains an explicit target, not a license to leave the flagship journey unfinished.

---

# 5. REQUIRED AUTOMATED QUALITY GATES

Create or reuse a repeatable `quality` script/CI that runs appropriate versions of:

- install/lockfile validation;
- static type check and lint;
- unit tests (money math, forecast, policies, fees, idempotency);
- API integration tests (auth/RLS, job states, sandbox settlement/ledger);
- end-to-end tests for Thandi→Sipho→payment→iBanks→Proof;
- build for responsive web;
- Android bundle/build check and iOS build/test check where environment allows (record exact status, don't pretend success);
- accessibility smoke test and selected real-device/manual checks;
- secret scan/dependency vulnerability assessment with prioritised remediation;
- performance checks on critical screens and backend query paths.

For EVERY failed or blocked test, record **what was attempted, exact error summary, current status and next action**. No hiding test failures, disabling checks to make green, or replacing real tests with assertions that simply match canned fixtures.

---

# 6. THE 70/70 EVIDENCE SCORECARD (UPDATE THROUGHOUT IMPLEMENTATION)

Create `docs/FNB_JUDGING_SCORECARD.md` with ONE row per category:

| Category | Official max | What exists now | Working proof | Failing/missing | Internal readiness (/10) | Next action |
|---|---:|---|---|---|---:|---|
| Product | 10 | ... | ... | ... | ... | ... |
| Creativity | 10 | ... | ... | ... | ... | ... |
| Usability | 10 | ... | ... | ... | ... | ... |
| Sustainability | 10 | ... | ... | ... | ... | ... |
| Impact | 10 | ... | ... | ... | ... | ... |
| Presentation | 10 | ... | ... | ... | ... | ... |
| Intelligence | 10 | ... | ... | ... | ... | ... |

**Rules for scoring:** An implementation idea without working evidence does not earn full internal readiness. Track actual test cases, screenshots, links and demo recordings. The final score belongs to FNB judges; this scorecard is a self-assessment used to prioritise engineering.

Also create:
- `docs/DEMO_SCRIPT_90_SECONDS.md` — scripted live user journey;
- `docs/PITCH_3_AND_5_MINUTES.md` — alternative timeboxed pitches;
- `docs/JUDGE_QA.md` — tough question responses without unsupported claims;
- `docs/SECURITY_AND_PAYMENT_EVIDENCE.md` — what security/payment assertions are proved;
- `docs/UNIT_ECONOMICS.md` — assumptions and scenario maths;
- `docs/WHAT_IS_BUILT_VS_PLANNED.md` — honest feature inventory;
- `docs/TEST_EVIDENCE.md` — commands, results, build/device coverage and known issues;
- `docs/ARCHITECTURE.md` — real modules, contracts and safety boundaries.

Write docs **after or alongside verified code**, never as a substitute for it.

---

# 7. NON-NEGOTIABLE DEFINITION OF DONE

The final handover must demonstrate that a judge can:

1. Open the responsive web app and independently navigate a clean, branded interface.
2. Log into sandbox customer and worker experiences safely.
3. Post, discover, accept and complete a real persisted demo job.
4. Trigger a **trusted simulated** payment-provider settlement, with correct deduplicated ledger and separate payout status.
5. See verified job evidence strengthen the worker's shareable portfolio.
6. See **iBanks automatically wake up** from that financial event, update real earned totals, compute an evidence-based forecast with clear confidence/limitations and present a relevant financial insight.
7. Change an opt-in savings percentage and see correct money math without executing a bank transfer.
8. Explore the app on Android and iOS test builds where successfully built/tested, with test status disclosed.
9. See exact evidence for safety, market purpose, commercial model, social value and business scalability.
10. Understand **why this is Financial Inclusion and Money Confidence**, not merely a jobs board.

**Final output format from you (Claude):**

1. **Implemented and proven** — feature + relevant files/tests/demo steps.
2. **Judge scorecard** — all seven categories, self-estimated evidence-based readiness and highest-impact gaps.
3. **Platforms** — real verified Web / Android / iOS statuses and how to run each.
4. **Security and payments** — simulated vs integrated, remaining risks, secrets status.
5. **KashWise intelligence demonstration** — exact events, computations, forecast method/limitations and audit evidence.
6. **Known issues / blocked tasks** — honest list, severity, next action.
7. **One exact action I need to take next** — e.g. approve a deployment, supply permitted sandbox access or test on a physical device.

## START NOW

Audit the real code, read the iBanks normative spec, score current readiness honestly against all seven criteria, then implement the highest-value failing end-to-end functionality. **Do not stop after documenting the work. Do not sacrifice financial integrity, privacy or truthfulness to chase visual polish or an imaginary 10/10. Make the product deserve a strong score by producing functioning, verifiable evidence.**
