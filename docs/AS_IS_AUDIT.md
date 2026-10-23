# KashWise — as-is audit (8 October 2026)

Labels: **Verified** (seen in code and checked by a command or test) · **Broken** · **Planned** (described, not built) ·
**Unknown** (not checkable from this machine).

## 1. Repositories and Git

| Finding | Label | Evidence / action |
|---|---|---|
| `kashwise-main` had no code, only briefing documents | Verified | Directory listing before import |
| `kashwise-main` was **not its own repo**: it sat inside a Git repo rooted at `C:\Users\mrsbo` (your home folder, remote `Boitybanks/storyteller`) with ~10 600 changes, including staged Cursor program files | Verified | `git rev-parse --show-toplevel`, `git status` | 
| `kashwise-main` now has its own Git repo (`git init -b main`, no commits yet) so nothing here can be committed into the home-folder repo by accident | Verified | `.git` created on 8 Oct |
| Home-folder repo still has staged Cursor binaries. **Not touched.** Recommend unstaging or deleting that repo (`git -C ~ reset`) yourself | Unknown intent | — |
| Original code: `GK_SideGIGS` (remote `Boitybanks/GK_SideGIGS`), 17 commits, all authored as "Boity", credits team CodeCraft | Verified | `git log` |
| `GK_SideGIGS` has **uncommitted** work from an earlier session (21 modified, ~30 new files: the iBanks ledger, pipeline, Money page, tests) | Verified | `git status`. Left as is; copied into KashWise |
| Founder confirmed authority to reuse SideGigs code in KashWise; attribution in `NOTICE.md` | Verified (decision recorded) | 8 Oct answer. Contributor consent itself is not provable from the repo |

## 2. Stack (actual, not the README's proposal)

| Item | Label | Note |
|---|---|---|
| React 19 + TypeScript + Vite 8 + Tailwind 4 web app | Verified | `package.json`, typecheck passes |
| Supabase Postgres/Auth/Storage, RLS, `security definer` RPCs (15 migrations) | Verified locally | Migrations run in PGlite in tests |
| Netlify hosting + Functions | Verified in code | Functions not exercised over HTTP (`netlify dev` not run) |
| Firebase / Expo (proposed in the old KashWise README) | Planned — not used | No reason to add Firebase; Expo app not started |
| Live site `sidegigs-codecraft.netlify.app` | Unknown today | Not opened in this session; it predates the iBanks work |

## 3. Features

| Feature | Label | Evidence |
|---|---|---|
| Post / discover / apply / select / QR start-finish / confirm job | Verified (pre-existing) | Existing unit tests; live journey test exists but writes to the live DB, so not run |
| Client confirmation creates a portfolio record, not income | Verified | `tests/ibanks-pipeline.test.ts` |
| Signed sandbox settlement → append-only ledger, exactly-once | Verified (local DB) | `tests/ibanks-sql.test.ts`, pipeline test |
| iBanks dispatcher, rules R001–R006, policy gate, insights, audit | Verified (local DB) | core + pipeline tests |
| Income outlook (7/30-day ranges, backtest, confidence), earning patterns | Verified (new, 8 Oct) | `tests/ibanks-intelligence.test.ts` |
| Worker-visible audit trail ("How iBanks decided") | Verified (local DB) | pipeline test; UI not seen against a migrated DB |
| Proof level "payment confirmed" on portfolio records | Verified (local DB) | pipeline test |
| iBanks migrations on the **live** Supabase project | Planned — needs your approval | Not applied |
| Optional Claude re-phrasing in Ask iBanks | Code only | No API key used; grounding check unit-tested |
| Android / iOS (Expo) | Planned — not started | — |
| Unit economics, pitch, demo script, Q&A | Planned | — |

## 4. Secrets

| Finding | Label |
|---|---|
| `.env`, `.env.pq` exist in `GK_SideGIGS`, are git-ignored and untracked; **not copied** to KashWise | Verified |
| No secret values found in tracked files (`.env.example` holds placeholders and the public project URL) | Verified by filename/pattern check only — no dedicated secret scanner run |
| Demo password `SideGigsDemo2026` is public by design (fictional accounts only) | Verified |

## 5. Environment risks

| Risk | Label | Effect |
|---|---|---|
| Repo and `node_modules` live in OneDrive | Verified | `npm ci` took 10 min; Vitest *thread* workers time out while starting. Use `npm run test:serial` (forks, one file at a time). Moving the repo outside OneDrive is recommended |
| Official FNB/Sonke rules document | Unknown | Not present locally; only the seven criteria headings from the brief. Whether pre-existing code is allowed must be checked with the organisers |
