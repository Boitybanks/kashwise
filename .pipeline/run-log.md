# Run log

## Stage 0 — Environment (2026-09-26)
- Repo: empty git repo on `main`, no prior work.
- Node v22.15.1, npm 10.9.2.
- **Supabase**: connector authenticated; created project `SideGigs` (ref `plzbbfoteevfpqxspyxi`, eu-west-2).
- **Netlify**: connector authenticated (team `boitybanks`, Free). `netlify-cli` 27.10.0 installed.
- **Pi**: installed `@earendil-works/pi-coding-agent` 0.74.2 (not needed — research facts verified directly via web search).
- **Spec Kit**: `specify` 0.7.2.dev0. First `init` hung (interactive prompt); re-run with `--integration claude --script sh` succeeded → `.specify/`, `.claude/skills/speckit-*`.
- **Beads**: `npm i -g @beads/bd` failed twice (postinstall binary download on Windows). **Fallback:** Spec Kit `tasks.md` + coordinator state. Broken global shim uninstalled.
- **BMAD**: not installed; installer is interactive. **Fallback:** native product brief/architecture.
- **Superpowers**: not installed as a Claude Code plugin in this environment. **Fallback:** native planning and review.

## Stage 1 — Research
- Verified QLFS Q2 2026 (33.6%, 8.5 m, youth 47.4%, released 11 Aug 2026) and SESE 2023 (1.9 m non-VAT businesses, 34.3% need marketing support). See research.md.

## Stages 2–5
- product-brief, architecture, implementation-plan, constitution, spec, plan, tasks, quality review written. Gate: PASS.

## Stages 6–7 — Build
- Team: coordinator built vertical slices A–M directly (single context kept architecture coherent); independent REVIEW agent run as a fresh read-only subagent. Beads unavailable → Spec Kit `tasks.md` as shared state.
- DB: 5 migrations applied (schema+RLS, RPCs, reference+demo seed, discover_workers, review hardening). Accounts created by `create_account` sign in normally (verified).
- PQ: keys generated locally; seeds stored as Netlify **secret** env vars (production context, builds/functions/runtime scopes — the connector silently drops secrets with context "all" or scope "functions" only; logged).
- Gates after each slice: typecheck, lint, 27 unit tests, build — all green.

## Stage 8 — Release
- Netlify site `sidegigs-codecraft` created; deployed 4× via Netlify MCP (local secret files moved aside during upload).
- Prod smoke: routes 200, security headers present, reveal-contact decrypts for both matched parties / 403 for strangers / 400 bad input; work-credential ML-DSA-65 signature verifies, tamper fails.
- Playwright (Pixel 7) full two-sided journey on production: PASS, zero console errors (CSP allows the Netlify HUD inline snippet by hash only).
- Live journey test (`npm run test:journey`): 12/12 PASS. Test-created demo rows deleted afterwards.
- Netlify injects its own dismissible "Powered by Netlify" HUD badge bottom-right, which overlaps the mobile tab bar; left as-is (host-owned) — owner can disable it in Netlify project settings.
