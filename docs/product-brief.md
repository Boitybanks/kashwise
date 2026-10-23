# SideGigs — Product Brief

**Positioning:** a trusted local work marketplace that turns real-world skills into income and completed work into a portable digital reputation.
**Core message:** *Your work counts — even when it didn't happen behind a desk.* · *Find work. Get it done. Build your name.*
Evidence and hypotheses: `.pipeline/research.md`. Decisions: `.pipeline/assumptions.md`.

## Problem
South Africa has capable people but a **discovery, trust and proof-of-experience** problem. Informal work is found through personal networks and WhatsApp groups, and once finished it leaves no record. Customers can't easily find someone nearby they can trust.

## Users
- **Workers** — unemployed youth, students, informal workers, tradespeople, people between jobs, micro-entrepreneurs.
- **Customers** — households, spaza shops and informal traders, small businesses, community organisations.

## Jobs to be done
- Worker: "Help me find paid work near me, and make every job count toward my next one."
- Customer: "Help me find someone nearby who can do this, and show me they've done it well before."

## Value proposition
Income today, evidence of employability tomorrow. Every customer-confirmed gig automatically becomes a **verified portfolio record** (rating, review, evidence photos) on a shareable public profile, plus a **cryptographically signed work history** a worker can take anywhere.

## Primary user journey
Customer posts gig (category, description, area, date, price → sees: you pay R500, nothing added; workers are shown R450, what they receive after the 10% fee) → worker discovers nearby gig and applies → customer views applicant's portfolio and selects → simulated payment held → worker starts and marks done → customer confirms completion (payment released) → customer rates and reviews → verified record appears on worker's portfolio → worker shares profile / downloads signed record.

## MVP (hackathon)
Accounts + profiles (skills, area) · post gig with fee breakdown · discover (distance, category, skill match) · apply / select · lifecycle OPEN → MATCHED → IN_PROGRESS → COMPLETED (+ cancel) · completion confirmation · rating + review · automatic verified portfolio · public shareable profile · work-evidence photo upload · post-quantum-encrypted private contact details · report pathway · simulated payment · impact dashboard · one-tap demo accounts.

## Non-goals (MVP)
Real payments/escrow · ID/background verification · in-app chat · push/SMS notifications · maps/geocoding of addresses · dispute resolution workflow · native apps · multi-language UI.

## Business model
Workers join free. The customer pays the agreed price and SideGigs takes a **10% fee from the worker's pay**, the only deduction; no VAT is withheld (R500 job → R50 fee → worker receives R450). Workers cash out from My Wallet to a bank or as a cash voucher at shops; one cash-out a week is free. Each side sees its own number. Workers can also list priced services by what they want to take home; clients see the price that pays it. Future: business subscriptions, promoted gigs, premium verification, talent discovery for employers.

## Success metrics
North Star: **number of people who earned money through a SideGigs-completed gig** (and rand value earned). Supporting: gigs posted, match rate, time to match, completion rate, average rating, verified portfolio records, repeat customers, workers with repeat work. Shown live at `/impact`.

## Risks
| Risk | Mitigation |
|---|---|
| Safety of in-person work | Exact address & phone encrypted and revealed only to the matched pair; report pathway; public area only. |
| Fake reviews | Reviews only on completed, customer-confirmed gigs; one review per gig; enforced in database. |
| Payment trust without real escrow | Clearly labelled simulation; real PSP integration is the first post-hackathon item. |
| Cold start (two-sided) | Hyperlocal launch (one township/suburb cluster), community-organisation partners. |
| Fee resistance | Fee is transparent and customer-side; validate willingness to pay (H7). |
