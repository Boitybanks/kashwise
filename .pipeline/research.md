# Research — evidence synthesis (Stage 1)

Labels: **FACT** (sourced) · **ASSUMPTION** (we build on it, unverified) · **HYPOTHESIS** (to test with users).
Scope: only what SideGigs build decisions need. Checked 2026-09-26.

## Sources (verified)
- S1 — Stats SA, *QLFS Q2 2026* (released 11 Aug 2026): https://www.statssa.gov.za/publications/P0211/P02112ndQuarter2026.pdf · summary: https://www.sanews.gov.za/south-africa/sa-official-unemployment-rate-rises-336
- S2 — Stats SA, *Survey of Employers and the Self-Employed (SESE) 2023*: https://www.statssa.gov.za/publications/P0276/P02762023.pdf · summary: https://www.statssa.gov.za/?p=18255

## 1. Who has this problem?
- **FACT (S1):** official unemployment 33.6% (up from 32.7% in Q1 2026); ~8.5 million unemployed people; youth (15–34) unemployment 47.4%.
- **FACT (S2):** ~1.9 million South Africans ran non-VAT-registered businesses in 2023 (up from ~1.5 million a decade earlier).
- **ASSUMPTION:** a meaningful share of the unemployed and the informally self-employed already have saleable practical skills (cleaning, gardening, repairs, hair, tutoring, etc.).

## 2. What exact problem exists?
- **HYPOTHESIS:** workers struggle to find the *next* paid job outside their personal network.
- **HYPOTHESIS:** completed informal work leaves no portable record, so experience cannot be proven to new customers or employers.
- **HYPOTHESIS:** customers cannot quickly answer "who nearby can do this, and can I trust them?"

## 3. What evidence supports it?
- **FACT (S2):** 34.3% of informal-sector businesses said they need marketing support (+6.8 pp since 2001) — evidence of a *visibility/discovery* gap for informal operators.
- **FACT (S1/S2):** scale of unemployment and informal self-employment means demand for side income is large.
- **Not proven by this evidence:** that people want a *platform*, that they will pay a fee, or that portfolios change hiring outcomes. These remain hypotheses (§8).

## 4. What are people doing currently?
- **ASSUMPTION:** word-of-mouth, WhatsApp/Facebook community groups, street/pavement advertising, church and stokvel networks. No ratings, no history, cash payments.

## 5. Primary gaps
| Gap | Today | SideGigs response |
|---|---|---|
| Discovery | Limited to personal networks | Area-based gig feed + skill matching |
| Trust | Hearsay | Ratings/reviews tied to completed, customer-confirmed gigs |
| Payment | Cash; disputes | Transparent fee + protection flow (**simulated** in MVP) |
| Work history | Disappears | Auto-generated verified portfolio + signed, portable work record |

## 6. Competing categories
Generic classifieds (Gumtree-type), social groups (WhatsApp/Facebook), global freelance platforms (online/remote work), home-services booking apps (pre-vetted professional providers), job boards/recruitment portals (formal CV-based hiring).

## 7. What SideGigs does differently
Hyperlocal, informal-work-first marketplace where **every completed gig automatically becomes a verified, shareable work record** — the portfolio is created by the platform from customer-confirmed completion, not self-reported. The worker keeps the full advertised payout; the customer pays a visible 15% protection fee.

## 8. Assumptions still needing validation (primary interviews)
H1 difficulty finding short-term work · H2 dependence on referrals/WhatsApp · H3 difficulty finding trusted workers · H4 payment concerns · H5 ratings matter to hiring · H6 workers value a verified portfolio · H7 willingness to use the platform and customers' willingness to pay 15%.
Suggested method: 10 workers + 10 customers, 10-minute structured interviews, then a live demo task.

## 9. Success metrics
North Star: **people who earned money through a SideGigs-completed gig** (distinct workers with ≥1 completed gig) and **income earned (R)**.
Supporting: gigs posted, match rate (matched/posted), median time to match, completion rate, average rating, verified portfolio items, repeat customers, workers with repeat opportunities (≥2 completed gigs). All computable from the MVP schema (see `docs/architecture.md` §5).

## 10. What the hackathon MVP must demonstrate
1. Customer posts a real local gig and sees the fee breakdown (R500 → R75 → R575).
2. Worker discovers it nearby, applies; customer reviews the worker's portfolio and selects them.
3. Lifecycle OPEN → MATCHED → IN_PROGRESS → COMPLETED with customer-confirmed completion.
4. Review → a verified portfolio record appears automatically on the worker's public profile.
5. Private contact details protected (post-quantum encryption) and revealed only to the matched pair.
6. Live impact metrics.
