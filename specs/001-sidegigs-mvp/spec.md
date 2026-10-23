# Feature Specification: SideGigs MVP

**Feature Branch**: `001-sidegigs-mvp` · **Created**: 2026-09-26 · **Status**: Clarified
**Input**: `.pipeline/idea.md` · product brief `docs/product-brief.md`

## User Scenarios & Testing

### User Story 1 — Customer hires a nearby worker (P1)
A customer posts a gig (category, description, area, date, time window, payout), sees the fee breakdown, reviews applicants' portfolios, selects one, confirms completion and leaves a review.
**Independent test**: with one worker account applying, the customer can take a gig from OPEN to COMPLETED and review it.
**Acceptance**:
1. Given payout R500, when posting, then the customer sees Gig R500 · SideGigs protection fee R75 · Total R575 and the worker sees "You earn R500".
2. Given an applicant, when the customer opens the applicant, then they see skills, completed-gig count, average rating and reviews.
3. Given a selected worker, when the customer confirms completion, then status is COMPLETED and simulated payment is "released".
4. Given a completed gig, when the customer reviews, then only one review is accepted.

### User Story 2 — Worker finds work and builds a portfolio (P1)
A worker creates a skills profile, discovers nearby relevant gigs, applies, is selected, starts and completes the work, gets rated, and sees the job appear automatically in their portfolio.
**Acceptance**:
1. Discover lists open gigs sorted by distance from the worker's area, filterable by category and "matches my skills".
2. After customer confirmation, a verified portfolio record (title, category, area, date, record code) exists without any worker action; after review it shows rating and comment.
3. The worker's public profile `/w/:id` is viewable without login and shareable.

### User Story 3 — Private details stay private (P1)
Exact address and phone numbers are encrypted in the browser with post-quantum hybrid encryption; only the customer and the matched worker can reveal them; reveals are logged.

### User Story 4 — Portable proof of work (P2)
A worker downloads an ML-DSA-signed work record; anyone verifies it at `/verify`.

### User Story 5 — Impact visibility (P2)
Anyone can see live impact metrics (people who earned, income earned, match rate, etc.) with demo data separated.

### Edge Cases
Applying to own gig (rejected) · applying twice (rejected) · selecting on a non-open gig (rejected) · review before completion (rejected) · cancel after start (rejected) · payout outside R50–R50 000 (rejected) · date in the past (rejected) · non-image or > 5 MB evidence (rejected) · reveal by non-participant (403).

## Requirements
- **FR-001** Users create an account with email + password and a display name, mode (worker/customer) and area, and can sign in immediately.
- **FR-002** Workers set skills (from the category list), headline and bio; anyone can set an encrypted phone number.
- **FR-003** Customers post gigs; fee = round(15% × payout) computed by the database.
- **FR-004** Discovery is paginated, distance-sorted, filterable.
- **FR-005** Workers apply with an optional message and can withdraw while pending.
- **FR-006** Customers select exactly one applicant; other pending applications are declined.
- **FR-007** Lifecycle OPEN → MATCHED → IN_PROGRESS → COMPLETED; customers may cancel only while OPEN or MATCHED.
- **FR-008** Completion is confirmed by the customer; this creates the verified portfolio record and releases the simulated payment.
- **FR-009** One 1–5 star review per completed gig, by its customer, attached to the portfolio record.
- **FR-010** Workers can attach up to 6 evidence photos to their own portfolio records.
- **FR-011** Every state change appends to a gig timeline visible to participants.
- **FR-012** Users can report a gig or a user.
- **FR-013** Payments are simulated and labelled as such wherever money status appears.
- **FR-014** Demo accounts/data are flagged and badged.

### Key Entities
Profile, Area, Gig, GigApplication, Transaction (simulated), GigEvent, Review, PortfolioItem, Report, encrypted envelopes (GigPrivate, ProfilePrivate). See `docs/architecture.md` §3.

## Success Criteria
- **SC-001** A new judge completes sign-up → first gig posted in < 2 minutes on a phone.
- **SC-002** Automated journey test passes against production data (post → apply → select → start → done → confirm → review → portfolio).
- **SC-003** Zero direct client writes to protected columns (verified by RLS/grant review and advisors).
- **SC-004** Portfolio record appears within one page refresh of completion confirmation.

## Clarifications (resolved autonomously — see `.pipeline/assumptions.md`)
Marketplace model: apply → customer selects (A1). Payment: simulation (A3). Location: curated areas, no exact public addresses (A4). Sign-up without email confirmation (A5). "Quantum encryption" = post-quantum cryptography (A8).
