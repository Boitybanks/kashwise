# iBANKS — INTELLIGENCE ENGINEERING SPECIFICATION FOR KASHWISE

**Version:** 1.0 | **Date:** 8 October 2026  
**Audience:** Claude Opus 5.5 in VS Code / software engineering team  
**Owner/product direction:** KashWise founder  
**Status:** Implementation brief; design goals are not claims of already implemented functionality.

> **Read this document IN FULL before implementing KashWise Money.** This is the missing engineering specification for the iBanks intelligence layer. It complements `docs/KASHWISE_MASTER_PROMPT.md`. Inspect the actual `GK_SideGiGS` repository, data model, functions, RLS, and tests before selecting code locations or changing architecture. Preserve working functions and collaborator attribution. Implement a working, testable vertical slice first; do not replace this with a chatbot mockup.

---

## 1. The non-negotiable definition of iBanks

**iBanks is an event-driven, autonomous financial intelligence and protection layer.** It detects relevant financial activity, understands it in the context of transaction history and customer circumstances, identifies risk or opportunity, explains it, and can orchestrate a narrowly authorised protective or helpful action via policy-controlled tools. It retains an auditable record and uses verified outcomes to improve future decisions.

Core loop:

`OBSERVE → VALIDATE → CONTEXTUALISE → DETECT → REASON → EXPLAIN → REQUEST CONSENT IF NEEDED → POLICY CHECK → ACT → AUDIT → FOLLOW UP → LEARN`

What iBanks **is not**:
- Not merely a banking-themed chatbot, static dashboard, or a single fraud scoring model.
- Not a digital bank, money custodian, payment processor, or unlicensed financial adviser.
- Not an LLM with unrestricted access to transfer money, approve payouts or edit accounting records.
- Not a surveillance agent that is continuously running a large model. **Events wake up targeted intelligence workflows**; scheduled reconciliation/check-ins are separate, bounded jobs.

**Guiding principle:** *The AI may reason and explain. Only authorised, deterministic policy and trusted provider/bank APIs may perform financial actions.*

### 1.1 Two integration scopes; do not confuse them

**Scope A — HACKATHON / KashWise (build now):**
- iBanks operates on **KashWise-owned, trustworthy marketplace and payout events** and user-supplied goals/obligations with consent.
- Tracks jobs completed, gross value, marketplace fees, actual provider-confirmed payment settlements, net money earned/payable, actual provider-confirmed payouts, reversals, refunds, disputes, ratings/proof records and irregular income patterns.
- Provides financial guidance, anomalies, notices, opt-in savings simulations and verified proof-of-income exports.
- It cannot see unrelated bank accounts, debit orders or merchants **unless** a separate authorised integration or consented statement import exists. Must label scope: `Based on your KashWise activity`.
- Any payment holds/releases, cash-out vouchers, retirement contributions and bank-side protections are **mocked or disabled** absent contracted provider rails. Never tell judges they are live.

**Scope B — FUTURE enterprise iBanks for banks (architect for, do not build fully now):**
- A bank-side intelligence platform consuming bank-authorised real-time transaction events, merchant descriptors, fraud and dispute outcomes, customer profiles, contractual authorisations, optional multi-product data, verified transaction history.
- Bank-approved tools can, after policy and appropriate authentication, initiate hold, review, card controls, dispute, consented savings transfers or beneficiary checks.
- Future bank-side integrations are separate adapters with different trust, audit and regulatory boundaries. Do NOT fake a bank connection in KashWise.

Build the engine around **ports/adapters and a normalized financial-event contract** so the core decision pipeline could later integrate with a regulated bank independently of KashWise.

## 2. Product intent: financial inclusion, not just analytics

KashWise creates opportunities for informal workers. iBanks transforms platform-verified economic activity into financial confidence without assuming a fixed salary, existing bank access or a conventional credit history.

For a worker:
1. **Know what was earned:** daily / weekly / monthly gross, fees, net amount earned, amount pending and amount actually paid out, clearly different.
2. **See patterns:** irregular income, concentration by client/category, best-paying gigs, weeks without platform income, dispute and payout trends.
3. **Understand risks:** repeated payout failures, unusual payout destination changes, inconsistent deductions, disputes, duplicated provider events, suspicious access changes.
4. **Plan responsibly:** conservative cash-flow scenarios using only valid history, known upcoming obligations the user actually supplied and optional personal savings targets.
5. **Prove credibility:** a permission-controlled report showing authenticated job completion, proof level, payout evidence and earning patterns; do NOT imply a bank has approved a loan or verified other employment.
6. **Build toward the future:** selectable **simulated** savings and retirement allocation goals. When live, use appropriately authorised institutions and user consent; no hidden deduction, no invented investment returns.
7. **Understand in plain language:** AI explains confirmed figures and their source; responds to questions and supports accessible low-data experiences.

For KashWise business: reliable reconciliation, fewer avoidable disputes, better worker retention, credible aggregate marketplace analytics (privacy-preserving), and a differentiator that makes jobs create ongoing financial value.

## 3. Architecture: build the hybrid intelligence engine

### 3.1 Concrete, recommended 48-hour architecture (assuming audit confirms existing Supabase)

```
KashWise Web / Expo Android / Expo iOS
       | HTTPS + authenticated user session
       v
App backend / Supabase Postgres + RLS
  - jobs, offers, proof events, user consents
  - financial ledger, provider-event inbox, outbox
       |
       | signed sandbox/provider webhook OR validated business event
       v
SERVER-SIDE EVENT INGESTION (TypeScript)
  signature verification / auth / idempotency / schemas
       |
       v
TRANSACTION STATE MACHINE + RECONCILIATION (TypeScript + DB transaction)
  payment settled != worker payout settled
  append-only journal, exact integer-cents arithmetic
       |
       v
DOMAIN OUTBOX → iBanks Event Dispatcher / Worker
       |
       +--> Deterministic Analytics Engine (SQL + TypeScript)
       |       weekly aggregates, fees, trends, forecasts, savings simulation
       |
       +--> Rules/Anomaly Engine (TypeScript; explainable)
       |       duplicate events, payout failure, destination changes, disputes
       |
       +--> Context Builder (purpose-limited, authenticated)
       |       structured facts, provenance, timestamps, safe descriptions
       |
       +--> LLM Explanation/Orchestration (optional, server only)
       |       strict typed tool read APIs; schema-validated output
       |       NO privileged writes, ledger edits, or payment tools
       |
       +--> Deterministic Policy Gate / Approval Workflow
       |       permits notice, escalation, support case; never blind payment action
       |
       v
INSIGHTS + ALERTS + AUDIT LOG (private, worker scoped)
       |
       v
KashWise Money UI / iBanks AI assistant / portfolio dashboard
```

Do not bolt AI onto a button that is the only way insights appear. Financial events should automatically trigger cheap rules + updated insights, and the UI should reflect the change. LLM inference may be asynchronous and should not block payment settlement or customer journeys.

If the repository uses another backend, adapt using the same **security/invariant requirements**; do not add Firebase or AWS solely to make an architecture diagram look impressive.

### 3.2 Technology by concern: NOW vs LATER

| Concern | KashWise MVP — practical implementation | Future enterprise iBanks / AWS-ready adapter |
|---|---|---|
| Web | Existing React/Vite/TS web app, retain if functional | Any bank's embedded web/mobile surface |
| Native | Expo + React Native + TypeScript; shared backend | Bank SDK/component or separate app integrations |
| Source of truth | Existing Supabase Postgres / RLS, SQL migrations and transactions | Bank-ledger/core banking integration, owned event contracts |
| Event ingestion | Supabase Edge Function / TypeScript server endpoint; signed provider sandbox events; outbox | EventBridge/Kinesis/Kafka by bank choice |
| Durable workflow | DB-backed outbox with retries and idempotent handler | Step Functions or event-driven orchestrators |
| Deterministic math | SQL + audited TypeScript service, integer cents | Independent audited finance feature service |
| Risk detection | Explainable rules and calibrated statistical heuristics | Specialist fraud models deployed in SageMaker + bank rules |
| Reasoning | One server-side LLM adapter with structured output, optional; deterministic fallback always | Claude via Amazon Bedrock with AgentCore or alternative governed model runtime |
| AI tool framework | Explicit typed read-only tools, gateway and allowlist | AgentCore Gateway/Policy/Identity/Observability, bank controls |
| Confidential data | Row-level protection, encryption at rest, short-lived evidence links | IAM/KMS, VPC/PrivateLink, secrets, detailed enterprise governance |
| Observability | OpenTelemetry-compatible structured traces/logs, redaction | CloudTrail/CloudWatch/security monitoring and model-risk processes |
| Payments | Simulated non-custodial provider; real partner later | Bank-owned API gateways with real permissions |
| Alerts | In-app, accessible & consent-aware | Push/SMS/email provider subject to user permission |

**Separate coding tool from runtime AI:** Claude Opus 5.5 is the **engineering agent writing code**. The **KashWise runtime financial agent** requires a separately configured server-side model/API, which might be a smaller/cheaper model. The app must not depend on the coding-agent session or a locally installed Claude extension at runtime. All AI model secrets belong on the server.

### 3.3 Performance guardrails

- Never invoke a large LLM for every UI view, page refresh, heartbeat or repetitive transaction retry.
- Ingest events and compute facts/rules cheaply; only call an LLM for materially new insights or user questions, with deduplication, caching, per-worker rate limits, token budgets and timeouts.
- Detect and debounce bursts without losing actual events. Use exponential retry + dead-letter/replay tooling for failed jobs.
- Ensure functional baseline, risk alerts and savings calculations if model API unavailable. No invented AI analysis on outage.

## 4. Financial-event pipeline: exact semantics

### 4.1 An event must not become income merely because an app screen says so

Implement or adapt provider-event ingestion with these distinct facts:

- `job_completed` — evidence submitted; **not payment**.
- `client_completion_confirmed` — client acknowledged; **not payment**.
- `payment_authorised` — processor authorised customer payment; **not earned cash and not a payout**.
- `payment_settled` — trusted provider confirms customer payment settled/received per provider contract; establishes confirmed platform transaction revenue and worker **net payable/earned** (subject to reversals and accounting policy).
- `payout_requested` / `payout_pending` — worker payout requested/sent; **not received**.
- `payout_settled` — provider confirms worker payout settled; classify `paid_out` as distinct from `net_earned`.
- `payout_failed` — funds not paid out; no silent success.
- `refund_settled` / `chargeback_confirmed` — create new compensating entries; do not mutate or erase original journal.
- `payment_disputed` — conditional funds status; explain factually; do not treat contested/held funds as guaranteed available.

Each event must have `event_id`, `schema_version`, `event_type`, `occurred_at`, `received_at`, `source`, `worker_id`, `job_id`, optional `payment_id`, `provider_ref`, `currency`, typed money fields, and status/version metadata. Store internal trace IDs, and reject untrusted server-writes from mobile/web clients.

Example NORMALIZED envelope (synthetic values):

```json
{
  "event_id": "evt_demo_0001",
  "schema_version": 1,
  "event_type": "payment_settled",
  "occurred_at": "2026-10-08T08:30:00Z",
  "source": "sandbox_payment_provider",
  "worker_id": "worker_sipho_demo",
  "job_id": "job_paint_001",
  "payment_id": "pay_demo_001",
  "provider_ref": "provider_settle_001",
  "currency": "ZAR",
  "gross_cents": 100000,
  "marketplace_fee_cents": 10000,
  "processor_fee_cents": 0,
  "worker_net_cents": 90000,
  "simulation": true
}
```

Provider payloads must be authenticated and normalized on the **server**, not submitted as arbitrary events from the UI. For this example the transaction is R1,000.00, platform fee R100.00, net payable R900.00, **payout still pending** until an independent `payout_settled` event arrives. No actual financial transfer occurs in sandbox.

### 4.2 Ledger, idempotency and reconciliation

- Store money as INTEGER MINOR UNITS (cents), never floating currency approximations.
- Require a durable journal / ledger that is append-only for accounting effects, with reversal entries rather than destructive edits.
- Enforce uniqueness on `(provider, provider_event_id)` and/or an equivalent verified unique event key. Reject or no-op duplicates inside a single DB transaction.
- Implement replay protection, event-order handling, state-transition validation, transactional event→ledger→outbox persistence, worker ownership checks.
- Reconcile confirmed provider transactions to posted journal entries; track mismatches and provider uncertainty without hiding them.
- Make gross/fees/net explicit and test `gross = platform_fee + processor_fee + net` **only when the contract defines fees as worker-borne**. If processor fee is funded by the platform, keep it separate; do not silently subtract twice.
- Reversals must affect net balances transparently. Do not net away provenance or history.
- Refund and payout failure affect different quantities; design the columns accordingly.

### 4.3 Minimal contract / entity suggestions

Inspect existing schema before migrations. Adapt/extend instead of creating conflicting tables. Suggested concepts:

```
financial_provider_events: id, provider, provider_event_id UNIQUE,
  signature_status, payload_hash, schema_version, received_at, processed_at,
  event_type, reference, status

financial_ledger_entries: id, worker_id, job_id, payment_id,
  event_ref, amount_cents (signed), account_type, currency,
  timestamp, reversal_of, posted_at, metadata (restricted)

ibanks_event_outbox: id, aggregate_id, type, payload_minimal,
  dedupe_key UNIQUE, state, attempts, available_at, last_error_redacted

ibanks_insights: id, worker_id, type, severity, title, explanation,
  fact_snapshot, source_event_ids, data_as_of, model_info,
  status, created_at, expires_at

ibanks_decision_audit: id, worker_id, trigger_event_id,
  rule_version, risk_factors_redacted, proposed_action,
  policy_outcome, actor_type, outcome, timestamp

ibanks_worker_preferences: worker_id, language, opt_in_notifications,
  savings_target (optional), emergency_goal, retirement_simulation_opt_in,
  consent_version, updated_at

ibanks_worker_obligations: id, worker_id, label, due_date,
  amount_cents, currency, source='user_declared', active
```

Scope every worker-specific SELECT/UPDATE with verified principal + RLS or equivalent; bank integrations must not inherit marketplace-user permissions.

## 5. Intelligence modules — what the engine must actually DO

### 5.1 Agent dispatcher / wakeup logic

Triggers include: `payment_settled`, `payout_settled`, `payout_failed`, `refund_settled`, `payment_disputed`, `payout_destination_changed`, `job_completed`, `client_completion_confirmed`, `evidence_verified`, `user_savings_preferences_changed`, `user_obligation_changed`, `weekly_summary_due`. Execute the relevant subset of modules per trigger, not the full LLM for every event.

For each valid event: persist → derive updated factual features → evaluate rules → select permitted actions → write auditable insights/notifications → optionally ask LLM to explain or plan within policies.

### 5.2 Earnings intelligence (P0)

For each worker calculate, with SQL/TypeScript tests:
- Gross value of **settled paid jobs** by period.
- Platform fees, processor fees (correct payer allocation), net payable/earned and actual settled payouts, separately.
- Pending payment value, pending payout value, refunds/reversals and disputed value, separately.
- Daily/weekly/monthly totals, trends, category earnings, repeat clients, completed job counts; locale Africa/Johannesburg, week start Monday; return explicit period/timezone in API.
- Median weekly net earnings, mean, zero-income weeks where data coverage is known, trailing 4/8 weeks as available, income volatility (e.g. coefficient of variation only when meaningful), changes versus earlier comparable period.
- Avoid implying incomplete history represents lifetime income. Show observation window and number of completed paid jobs.
- Prefer net proceeds for savings advice, never client gross invoice amount.

**Sample questions:**
- “What did I earn this week compared to last?”
- “Which kind of job made me the most money?”
- “How many confirmed jobs and verified reviews do I have?”
- “Why does my money balance not match my paid-out total?”

### 5.3 Irregular-income forecasts and responsible cash-flow (P0/P1)

- Use conservative, deterministic baseline first. Example: trailing 4/8 **complete** calendar weeks, median weekly net income, and quantile/range only with sufficient observations. Expose interval and assumptions.
- For sparse history (<4 complete weeks or too few jobs), say **insufficient history for a reliable projection**; show observed history instead of inventing a stable forecast.
- “Safe-to-save” depends on **both money expected/available and expenses or obligations**; KashWise platform earnings alone cannot tell a worker their complete affordability. If no expense data, call it a **savings allocation scenario**, not “you can afford R500.”
- Optional user-declared bills, external income, emergency reserves and planned expenses must remain explicit user inputs—not silently inferred from platform payouts.
- Flag likely cash-flow gaps against user-declared obligations; never imply credit eligibility.

**Simple MVP strategy:** `median_weekly_income` + time series, compare scheduled user-declared obligations; show broad conservative range with uncertainty and data provenance. No fancy ML needed before robust accounting.

### 5.4 Financial protection / anti-loss workflows (P0)

Implement actual, evidence-grounded detection of:
1. **Repeated provider webhooks:** dedupe, no double credit; make audit event. Usually an internal alert, not scary customer fraud warning.
2. **Payout failures:** count/rate, last attempt, worker guidance to verify payout method with secure UX.
3. **Payout destination changes:** reason about new payout detail or rapid changes; mark high-risk for re-verification using existing authentication and policy. Do **not** reveal full bank account details in notifications.
4. **Fee mismatch:** actual platform fee vs disclosed agreed contract or price version; open a review case, do not silently change money.
5. **Dispute + payout overlap:** warn that earnings/payout may be contested depending on provider contract.
6. **Unusual earnings event velocity or anomalous earnings source:** risk flag with explanation and manual review; avoid presuming fraud solely from large earnings.
7. **Account takeover indicators only when actual signals exist** (e.g. changes in session/device/contact data or repeated auth failures). Never invent device/IP certainty.

P0 actionable responses limited to **notify**, **show explanation**, **require step-up verification before sensitive settings changes**, **open support case**, **request human review**, or **block a KashWise-owned high-risk profile mutation** through deterministic policy where authorised. No bank card freeze or money transfer claims in KashWise.

Design broader bank-side detectors as typed extension points: unusual bank merchant, recurring debit charges, amount change, bank fee retry patterns, beneficiary anomaly, forced/pressured payment indicators, bank-approved hold/release. Those require authorised bank data and bank APIs and are **not** activated in the KashWise MVP. Never make facial emotion detection the sole basis for coercion/fraud or a financial hold.

### 5.5 AI professional credibility (connected to KashWise Proof)

On *genuinely confirmed* job milestones, summarize verified facts into a worker-controlled portfolio draft:
- job category, scope, completion date, documented evidence, customer feedback, proof level, paid status;
- extract defensible skills and concise CV bullet suggestions from trusted records;
- prompt the worker to edit/approve the summary, and label speculative/worker-asserted facts;
- preserve work history independently of AI text so deleting AI text does not delete proof.

Export report can include **verified on-platform earnings** and job completion with `source=KashWise`, data interval, dispute/reversal status and a verifiable server reference. **Do not call it a government certificate, formal credit score, audited financial statement, or bank-verified employment record** without such verification.

### 5.6 Savings + retirement simulation (P0/P1)

- Accept worker's explicit choice: 0–20% of post-fee **net payable/settled earnings**, or fixed rand per period. Default opt-out, easy to change, no automatic debit.
- Calculate `allocation_cents = round_policy(net_earned_cents * percent / 100)` with integer-safe rational math; show available remainder, and round across multiple allocations deterministically. If money is pending payout, label it not yet received.
- Example R1,000 settled job, 10% marketplace fee → R900 net earned; chosen 5% savings = R45; chosen 2% retirement = R18; illustrative remainder R837. **No money moved.**
- Distinguish **emergency savings (liquid)** from a **retirement annuity (restricted, regulated)**. Display informational text; avoid personalised product selection, unsuitable return guarantees, or regulated financial advice.
- Future live contribution flow must use appropriately authorised provider, explicit consent, legal suitability/terms, reversals and receipts. NEVER have the LLM initiate a real savings or retirement transfer.

### 5.7 AI conversation and explanation (P0)

Agent must support grounded intents:
`get_earnings`, `compare_periods`, `explain_fee`, `get_payout_status`, `explain_alert`, `forecast_income`, `simulate_savings`, `show_work_proof`, `get_financial_education`, `contact_support`.

Use typed tools; example signatures:

```ts
type FinancialFactsToolset = {
  getWorkerEarnings(input: { workerId: string; from: string; to: string }): Promise<EarningsSummary>;
  getSettlementStatus(input: { workerId: string; paymentId: string }): Promise<PaymentSummary>;
  getWorkProof(input: { workerId: string; jobId: string }): Promise<ProofRecord>;
  getRiskAlerts(input: { workerId: string; activeOnly: boolean }): Promise<SafeRiskAlert[]>;
  calculateSavingsScenario(input: { netCents: number; savingsBps: number; retirementBps: number }): SavingsScenario;
};
```

**Never accept an arbitrary `workerId` from an unverified browser call**: the server derives/authorises subject and enforces scope; `workerId` in this interface is an internal server-side reference only. The model gets no direct SQL connection, no service-role key, no provider secret, and no ledger-write permission. It must not call privileged actions through frontend endpoints.

For conversational response define a validated output schema:

```json
{
  "answer": "You earned R900 net from one settled painting job this week. Your payout is still pending.",
  "intent": "get_earnings",
  "as_of": "2026-10-08T08:30:00Z",
  "source_refs": ["evt_demo_0001"],
  "assumptions": [],
  "limitations": ["Based only on KashWise income", "Sandbox demo"],
  "suggested_actions": [{"action": "view_payout_status", "requires_consent": false}],
  "safety": "informational"
}
```

The answer must be supported by `source_refs` or other structured facts; numbers are rendered from computed facts, not generated by the model's intuition. No sources → no quantitative claim. Validate against a schema; retry or fall back to a deterministic explanation on malformed output. User-visible explanations always include the data scope and “as of” time.

**Model selection:** abstract `LLMProvider` with no-code local fallback. Configure `IBANKS_LLM_PROVIDER=none|anthropic|bedrock|...` in server `.env.example`, avoid assuming Opus 5.5 subscription grants production API access, and never call the provider from the browser. If actual API keys unavailable, rules-based explanation remains fully functional and should not falsely claim live AI.

### 5.8 Feedback and learning: outcome flywheel (P1)

Store authorised user feedback and concrete resolved outcomes separately from raw transactions:
- alert helpful/not helpful; payout resolved; payout detail verified; dispute resolved; erroneous fee refunded; worker-corrected AI description; case outcome;
- preserve provenance, timestamps, label confidence, permissions, retention and data deletion requirements;
- **do not train a proprietary model from scratch for the hackathon**. Use deterministic rules + heuristic scoring first, then evaluate offline supervised models on appropriate consented/labelled data when enough examples exist.
- Be especially careful with biases affecting low-income or township workers; flags are for protection/review, not automated employment exclusion or credit decisions.

## 6. Rule engine, orchestration, policy gate — implementation detail

Separate four interfaces:

1. `FinancialEventConsumer` — verifies event, ensures exactly-once **effect** through transactional idempotency, schedules downstream jobs.
2. `FactsAndFeaturesService` — returns verified balances/time-series and provenance with zero LLM arithmetic.
3. `RiskRuleEngine` — versioned and testable rules, emits `{rule_id, version, evidence, severity, proposed_action}`; no DB secrets passed to LLM.
4. `PolicyExecutor` — evaluates principal, consent, scope, provider contract, risk, step-up verification, and returns `allow | deny | require_confirmation | escalate`. Then a bounded server service executes only permitted actions and audits outcome.

Scoring model example (not a claim of fraud probability):

```
Payout destination changed within 24h + first payout to new destination
→ medium/high review requirement (policy defined)
→ block immediate self-service payout-setting changes IF application policy explicitly permits
→ request step-up auth; log audit; open human review if unsuccessful
```

Do not have the LLM choose raw risk thresholds, override an authorisation check, or infer permission from chat phrasing.

Suggested internal workflow: 

```
EVENT → normalized_facts → [cheap rules] → persisted InsightDraft
      → [policy checks] → alert/support case or required confirmation
      → [optional LLM plain-language explanation] → persisted validated Insight
      → UI push/subscription refresh → audit
```

## 7. Data security, privacy, ethics and compliance

**Required for the MVP:**
- Audit the existing Supabase RLS, storage buckets, Edge Functions, auth claims, SQL grants. Create tests showing a worker cannot query another worker's earnings, payouts, private evidence or iBanks conversation; client cannot read worker financial records.
- Trusted events and accounting math run server-side; anon clients cannot insert trusted financial records or update privileged statuses. Use minimal service-role scope and separate secrets per environment.
- POPIA-aware purpose limitation, minimisation, worker transparency, explicit opt-in for goals, statement upload, marketing, notifications or any external financial sharing; withdrawal and retention controls.
- Secure uploads (size/type/content restrictions), encrypted/private evidence, signed short-lived links, accessible user requests for export and deletion subject to lawful financial-record retention.
- Plain-language explanation of estimates vs facts; clear treatment of vulnerable users and no exploitative nudges to invest.
- Financial-product recommendation, RA enrolment and certain personalised financial advice require legal/licensing review with FSCA-authorised partners; prototype is educational and non-transactional.
- Model prompt injection resistance: job descriptions, uploaded documents, chat messages and payment metadata are untrusted. Sanitize, separate instruction vs data, enforce tool allowlists, validate output, and assume models can be manipulated.
- No facial-image emotional classification as a definitive coercion detector; no covert recording; no automated credit eligibility based solely on platform work history.
- Tests for replay attacks, forged webhook payload, integer overflow, fee rounding, SQL/RLS leakage, privilege escalation, AI hallucinated totals and duplicate settlement.

Threat model checklist:

| Attack/failure | Required control |
|---|---|
| Fake `payment_settled` from frontend | signed provider verification, server-only insert, least privilege |
| Replay/duplicate signed webhook | unique provider event + transactional idempotency |
| Worker sees another worker's income | auth-derived principal, RLS + integration test |
| LLM fabricates "R5,000 balance" | authoritative tools, source refs, output checks, no-data fallback |
| Prompt injection in customer job title | data/instruction separation, tool allowlist, policy boundary |
| A refund does not update totals | immutable reversal event and reconciliation test |
| Subscription/LLM credits expire | deterministic fact cards and limited assistant fallback |
| Payout-account change by impostor | step-up verification, server-side audit and optional review |
| API credentials appear in client | server-only keys, secret scanner, environment isolation |

## 8. UX: financial intelligence that feels like a private banker

**MVP navigation:** `Work | Talent | Proof | Money | Profile` (adjust existing navigation to minimize rework). Under Money, use `Overview | Earnings | Insights | Goals | History` with a visible “Powered by iBanks” identity.

The iBanks agent should behave like a proactive private banker:
- On a confirmed payout, non-intrusively update earned/paid figures and show a concise explanation of the week's earnings.
- On payout failure, explain the real provider status and help the user open a support or verification workflow.
- On savings selection, show opt-in impact only; avoid scarcity pressure and fake guarantees.
- On insufficient data, say so in accessible language, show what is known, offer to record real obligations.
- On request, explain gross/net, provider statuses, or how to build portfolio evidence without jargon.
- `Ask iBanks` offers grounded examples. UX must differentiate **System-verified**, **User-provided**, **Estimated**, and **Simulated** facts with subtle badges and accessible text, not only colours.

Proactive sample after sandbox settlement of R1,000 job:

> **iBanks noticed a new payment.** A R1,000 job payment has settled. After the R100 KashWise service fee, **R900 is recorded as earned and awaiting payout**. Your weekly total has increased by R900. This is based on KashWise activity only. [View earnings] [Review savings scenario]

Sample after provider confirms payout:

> **Your payout was confirmed.** R900 was marked as paid out by our payment provider. You can now find the transaction in your payout history. [View receipt]

**Never say** "R900 has reached your bank" unless provider status truly establishes that claim; settlement status and actual bank-credit timing may differ.

## 9. Cross-platform requirements

- Same backend and permission model for Android, iOS and web. No separate mock income on native.
- Optimise for data-poor devices and intermittent connection; show last-synced timestamp, avoid stale payment-success claims, cache non-sensitive summaries carefully, avoid storing raw bank statements or PII insecurely offline.
- Test for narrow portrait, common Android resolutions, iPhone safe areas, tablet and desktop; large touch targets, keyboard and screen-reader support; text explanations alongside charts.
- Scheduled notifications must be truthful, spam-limited and configurable.
- Good performance without a model; short-circuit repeated conversational queries to cached trusted facts when safe.

## 10. Data contracts and code organisation

Adapt to existing structure; a good modular target:

```
packages/shared/src/finance/
  money.ts              # Money minor-unit helpers and type guards
  contracts.ts          # Normalized events, statuses, Zod schemas
  analytics.ts          # Deterministic calculations
  policy.ts             # Action permissions / enum contracts

backend-or-existing-supabase/
  providerWebhook.ts    # Trust boundary / signature / schema
  ledger.ts             # Journal and reconciliation
  outboxWorker.ts       # Event subscriber / retries
  riskRules.ts          # Deterministic detection, versioned
  featureBuilder.ts     # Private worker facts and provenance
  aiProvider.ts         # Server-only LLM adapter + fallback
  agentOrchestrator.ts  # Read-only tools + policy checks
  insightsRepo.ts       # Persist worker-scoped insights

apps/web/ and apps/mobile/
  money/screens/...     # UI consuming same typed API
  proof/screens/...     # User-approved verified portfolio

tests/
  finance-invariants.*
  ledger-idempotency.*
  cross-user-access.*
  payout-state-machine.*
  agent-grounding.*
  finance-e2e.*
```

**Important:** The folder map is a suggestion, not an instruction to rewrite existing directories. Use actual repository conventions, report chosen paths and keep types tightly scoped.

## 11. Implementation order (48-hour critical path)

**Phase 0 — audit and freeze (1–3 hours):** Inspect existing SideGigs application and verify baseline tests and credentials. Map working payment flow, job state machine, Supabase schema, web deployment. Establish which modules already exist. Add this spec to repo, agree on phase gates. Do not write duplicate infrastructure.

**Phase 1 — provable financial truth (6–10 hours):** Harden existing payment lifecycle and idempotent sandbox provider event. Post immutable income journal and payout status with tests. Surface gross/fee/net/pending/paid statuses. Verify refund/dispute effects.

**Phase 2 — iBanks event intelligence (6–10 hours):** Outbox/consumer; worker-scoped facts/weekly and monthly analytics; three genuine risk/insight rules; auditable Insight cards that update automatically after events. Test end-to-end.

**Phase 3 — iBanks agent (4–7 hours):** Typed tools, consent/policy gating, simple structured LLM adapter when configured, fallback explanations, conversational UI grounded in facts. Test prompt injection resistance and arithmetic guardrails.

**Phase 4 — Proof + goals (4–6 hours):** Verified portfolio update and user-approved AI summary; savings + educational RA scenarios; user-declared obligations as optional if feasible; prove no live transfer is performed.

**Phase 5 — Android/iOS + quality (remaining time):** Mobile `Money`/`Work`/`Proof` flows against shared backend, responsive web; E2E demo; QA. Do not claim builds you haven't generated or tested. Timebox and record limitations transparently.

**Dependency policy:** If P0 finances are not accurate, DO NOT spend time making a pretend animated AI orb. If the LLM credential is unavailable, preserve the grounded deterministic engine and finish mobile integration first.

## 12. Acceptance tests — cannot be a simulated slideshow

Use fictional demo accounts (Thandi client, Sipho worker), isolated sandbox, deterministic reset seed:

1. Thandi posts a R1,000 job; Sipho applies; client accepts; Sipho completes and uploads evidence; Thandi confirms.
2. BEFORE provider settlement, earnings UI does not show R900 as received.
3. Send one *authenticated sandbox provider* `payment_settled` event. Worker sees R1,000 gross, R100 fee, R900 **net payable/earned**, payout still pending. All numbers trace to ledger.
4. Duplicate same provider event 10 times concurrently: ledger still credits exactly once. An internal anomaly/replay audit is recorded.
5. Send `payout_settled`; worker now sees R900 **paid out**; trace event ID and timestamp. Test no assertion it is a live bank credit.
6. Simulate provider payout failure on another job; display clear pending/failed state and appropriate action, never paid.
7. Refund or disputed event changes the relevant ledger view with compensating entries; prior audit history preserved.
8. Ask agent “How much did I make this week?” Agent returns exactly the server-derived ZAR values and appropriately describes payout status and data scope. Try malicious job description instructing the agent to inflate earnings; agent refuses and reports exact source-backed amounts.
9. Worker chooses 5% savings and 2% retirement scenario on R900: R45, R18, remainder R837; **no provider transfer** created. No claims of real RA membership.
10. Proof page shows verified job/amount/status with appropriate proof level and links to authorised evidence. AI-created text cannot invent extra skills/certifications.
11. Test auth: worker B cannot retrieve worker A's ledger, insights, prompts, savings goals, or evidence via forged IDs. Client cannot see worker financial data.
12. If runtime model is disabled or times out, deterministic analytics/risk cards and truthful rule-based chat remain operational.
13. Native Android/iOS clients and responsive web query the same server-backed figures; confirm separately which environment was actually run/tested.

**Definition of done for iBanks MVP:** verifiable event→journal→facts→risk/insights→UI→guided user action with policy checks, plus at least one fully grounded agent response. Not a static screen, not a free-form chatbot, not fake account balance.

## 13. Engineering outputs and communication

Claude must:
- Produce concise `docs/IBANKS_ARCHITECTURE.md` tied to ACTUAL repo file paths and actual chosen runtime vendor.
- Document `docs/IBANKS_EVENT_CONTRACTS.md` and `docs/IBANKS_RISK_RULES.md` with versions.
- Add and run tests, report exact commands and result; show DB migrations, RLS policies and rollback/backups where applicable.
- Update `docs/IMPLEMENTATION_STATUS.md` to mark each feature `WORKING`, `PARTIAL`, `SIMULATED`, `NOT STARTED`, or `BLOCKED`, with evidence (not confidence language).
- Avoid destructive production migrations, public deployment, pushing commits or using real bank/payment credentials without explicit approval.
- Preserve sidegigs attribution/IP as required by prior collaboration, and flag uncertainties rather than rewriting history.
- At each checkpoint give: files changed, unit/integration/E2E/build outcomes, actual Android/iOS/web state, missing credentials, next P0 task.

---

## 14. EXACT START COMMAND FOR CLAUDE OPUS 5.5

Paste the following in Claude Code after placing this document under `docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md`:

```text
You are the lead engineer implementing KashWise AND its iBanks intelligence engine.

READ BOTH DOCUMENTS IN FULL before modifying code:
1. docs/KASHWISE_MASTER_PROMPT.md
2. docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md

You previously did not have a sufficiently concrete definition of iBanks. Treat the second document as the NORMATIVE specification for how iBanks observes financial events, computes trusted facts, detects risk, reasons, applies policy gates, communicates with workers, audits actions, and supports verified work portfolios and opt-in savings simulation.

IMPORTANT DISTINCTION:
- KashWise is an earning marketplace + verified work + financial empowerment app for Android, iOS and responsive web.
- iBanks is its event-driven financial intelligence and protection engine. It is not a static dashboard or unconstrained chatbot.
- Scope all current finance claims to KashWise verified income and consented user data. Do not invent external bank integrations or pretend the app moves actual money.
- Payment captured/settled is NOT the same as worker payout settled. Preserve distinct states.

Audit existing GK_SideGiGS, repository Git roots, code, Supabase schema, tests, and deployment before editing. Preserve working code and attribution, and do not print secrets.

Then implement the first fully testable vertical slice:
Thandi posts a job → Sipho completes → trusted provider-sandbox payment event → exact journal posting → iBanks event wakes → financial facts and risk rules update → worker UI shows correct gross, fees, net payable, payout status → iBanks explains exact source-backed figures → verified work evidence is reflected in Proof.

Build in short, testable slices. Write tests and run them. Continue implementation after a concise audit; do not stop at a plan. Add savings/retirement scenarios, responsive cross-platform support, and optional server-side model integration after the authoritative ledger and core marketplace are passing.

Never say a feature works unless you demonstrate it through code/tests. Do not push or deploy without my approval. Summarize changed files and actual test results after each milestone.
```

