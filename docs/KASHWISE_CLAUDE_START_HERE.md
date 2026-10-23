# KashWise + iBanks — START CLAUDE CODE HERE

## Files in this bundle

- `docs/KASHWISE_MASTER_PROMPT.md` — overall KashWise transformation, rebrand, responsive web, Expo Android/iOS, marketplace, Proof, Money, security and acceptance.
- `docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md` — **authoritative** iBanks runtime definition, event-driven architecture, ledger invariants, financial intelligence, risk detection, tools, policy gates, AWS growth path, tests and full start instruction.

Place the `docs` folder inside the actual Git root of your KashWise repository, alongside `GK_SideGiGS` if that layout is still accurate. **Do not copy `.env` files or secrets into this bundle.** Open Claude Code at the correct repository root. If a `docs` folder already exists, merge these two markdown files into it without deleting other docs.

## Paste this FIRST into Claude Opus 5.5

```text
We are turning the existing Geekulcha SideGigs project into KashWise (Earn it. Prove it. Grow it.) for the FNB App of the Year Financial Inclusion and Money Confidence challenge.

Your previous brief did not fully explain iBanks. You must read BOTH:
- docs/KASHWISE_MASTER_PROMPT.md
- docs/IBANKS_INTELLIGENCE_ENGINEERING_SPEC.md

Read the FULL text, including the normative iBanks event model, deterministic financial calculations, risk workflow, runtime model adapter, policy-controlled actions and acceptance tests. The iBanks technical specification governs the intelligence layer.

Do not mistake Claude Code (your coding interface) for the iBanks runtime service. Implement the event-driven, server-side intelligence engine with a working non-LLM fallback and optional LLM integration; never use an LLM for ledger arithmetic or to grant payment privileges. iBanks is proactive: new trusted events trigger insights without waiting for chat.

First inspect all existing code, especially GK_SideGiGS (src/, supabase/, netlify/, tests/, e2e/, CLAUDE.md). Verify Git roots, build scripts, tested functionality and secrets. Do not rewrite working infrastructure needlessly. Keep any historical CodeCraft attribution accurate; flag IP uncertainty.

After a concise audit, IMPLEMENT immediately, in tested increments:
1. Harden the worker/client marketplace and sandbox payment state machine.
2. Implement signed/authorised sandbox settlement → append-only ledger → outbox → event-driven iBanks facts/rules and audit trail.
3. Show accurate net earnings, pending/paid-out states, weekly/monthly income, grounded financial alerts, and opt-in savings/retirement simulations.
4. Implement iBanks agent read-only tools, structured explanations with source IDs and timestamps, optional server-only LLM and offline/no-credential fallback.
5. Build/update KashWise Proof from authenticated work records; do not invent credentials.
6. Rebrand and ensure usable responsive web plus Android and iOS app clients sharing the same secure backend.
7. Run unit, integration and E2E tests; report exactly what is WORKING, SIMULATED, PARTIAL and BLOCKED.

You are authorised to edit local project files and run local tests. Do not push, change production services, transfer real funds, publish or deploy without asking.

Our showcase: Thandi posts R1,000 job → Sipho completes → provider sandbox confirms payment settlement → ledger records R100 platform fee and R900 worker net payable → iBanks wakes and explains figures → Proof updates → 5% savings and 2% retirement simulations (no real transfer) → independent payout event changes Paid Out. Duplicate webhook must not double-count.

Do not stop after generating plans. Build, test, fix and proceed to the next priority.
```
