KashWise

Earn it. Prove it. Grow it.

KashWise is a mobile-first platform connecting South Africans with local earning opportunities while turning completed work into verified work history, documented earnings, and practical financial insight.

It combines a community gig marketplace with iBanks-powered income intelligence to help people earn, understand their money, and plan for the future—especially when income is irregular.

Our mission: Turn everyday work into verified income, economic credibility, and greater financial confidence.

The problem

Millions of people earn through informal, freelance, and short-term work, but finding reliable customers is only one challenge. Workers may also lack proof of experience, consistent income records, and financial tools designed for variable earnings.

KashWise connects the opportunity to the outcome: find work, complete it, document it, receive payment through a regulated provider, and learn from your earnings.

How KashWise works

Find work: Customers post local jobs; workers discover and apply for opportunities.

Complete the job: Both sides confirm the agreed scope and completion; supporting evidence can be uploaded.

Get paid: An authorised payment provider processes and settles payments. KashWise does not hold customer or worker funds.

Build proof: Completed, verified work contributes to a portable portfolio of experience, ratings, and platform-recorded earnings.

Grow financial confidence: The iBanks intelligence layer explains earnings trends, flags unusual activity, and supports opt-in savings goals.

Product pillars

Pillar

Purpose

KashWise Work

Discover local jobs, apply, hire, and complete gigs.

KashWise Proof

Build a verified record of completed work and a portfolio of evidence.

KashWise Intelligence

Understand weekly/monthly earnings, variable income, and financial patterns with an AI assistant powered by iBanks.

KashWise Future

Explore voluntary savings goals and, later, retirement options through appropriately authorised providers.

Hackathon MVP scope

This repository is in development. The items below describe our initial targets, not features already shipped.

Worker and customer onboarding

Local job posting, discovery, and application flow

Job acceptance, completion, and customer confirmation

Portfolio of evidence, ratings, and work-history timeline

Simulated payment lifecycle and auditable earnings ledger

Weekly and monthly income dashboard

iBanks-powered earnings summaries and plain-language financial insights

Opt-in savings and retirement-contribution simulations (no real transfers)

Mobile usability, accessibility, and end-to-end demo tests

Example demo journey

A customer posts a painting job → a worker applies and completes it → completion is verified → the payment provider's simulated settlement event updates the worker's earnings record → KashWise Proof records the experience → KashWise Intelligence explains what was earned and suggests an optional savings goal.

Proposed technology

Layer

Planned technology

Android and iOS

React Native, Expo, TypeScript

Backend

Firebase / TypeScript services

Authentication and data

Firebase Authentication and Firestore, with security rules

Evidence storage

Access-controlled cloud storage

Financial intelligence

iBanks agent, deterministic calculations, and grounded AI explanations

Payments

Regulated third-party payment integration (simulated in the MVP)

Testing

Automated tests for jobs, ledger events, permissions, and critical user journeys

Implementation details may change as the MVP is validated.

Safety, privacy, and responsible finance

No platform custody: KashWise does not operate a wallet, hold escrow balances, or directly custody customer funds. Payment protection and payouts require a suitable authorised payment partner.

Accurate financial records: Earnings are derived from validated server-side payment events; pending, settled, refunded, and disputed amounts are kept distinct.

Consent and control: Savings and retirement contributions are strictly opt-in; MVP calculators are illustrative and do not move money.

Responsible AI: AI explains patterns and suggestions but does not independently authorise payments or provide unlicensed regulated investment advice.

Privacy by design: Access controls, minimal data collection, auditable actions, and applicable South African privacy requirements—including POPIA—guide development.

Verified, not overstated: KashWise verifies activity recorded on its own platform; that is not a guarantee of creditworthiness or a complete picture of someone’s income.

Development

The repository is being set up. Installation instructions and working scripts will be documented after the application scaffold is committed.

Target platforms: Android and iOS.
Initial focus: South Africa.
Hackathon track: FNB App of the Year 2026 — Financial Inclusion and Money Confidence.

Project status

Early-stage / hackathon MVP development. This README describes the intended product and build scope. It does not imply that the platform, payment rails, AI agent, or financial-provider partnerships are production-ready.

Intellectual property and licensing

Copyright © 2026 KashWise contributors. All rights reserved unless a licence is explicitly added to this repository. Public visibility does not grant permission to copy, redistribute, or commercially reuse the code.
