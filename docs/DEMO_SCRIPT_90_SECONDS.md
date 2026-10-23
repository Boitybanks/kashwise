# KashWise — 90-second live demo

**Precondition (not yet met on 9 Oct 2026):** the iBanks migrations (`20261008000100`, `20261009000100`) are applied
to a demo Supabase project, `IBANKS_PROVIDER_WEBHOOK_SECRET` is set in Netlify and Vault, and `PAYMENTS_MODE=sandbox`.
Until then, steps 5–9 can only be shown from the automated test run (`tests/ibanks-pipeline.test.ts`).
Everything below is fictional sandbox data, labelled in the app.

Two windows: phone-sized browser (Sipho, worker) and desktop browser (Thandi, client). Optional: the Expo app on an
Android phone signed in as Sipho.

| Time | Who / screen | Do | Say |
|---|---|---|---|
| 0:00 | Splash | Show "KashWise — Earn it. Prove it. Grow it." | "Sipho paints houses in Soweto. Good work, no payslip, money that comes and goes." |
| 0:08 | Thandi → Post a gig | R1 000 lounge painting job | "Thandi pays R1 000. Nothing added." |
| 0:18 | Sipho → Find work | Apply; Thandi chooses him | "Sipho sees what *he* receives: R900 after the 10% fee." |
| 0:28 | On site | QR start code, then finish code | "The job starts and ends with a code only the two of them have." |
| 0:38 | Thandi | Confirm completion (this also asks the simulated provider to settle) | "Confirmation creates a verified record. Money only counts once the payment provider's signed settlement arrives — simulated, clearly labelled." |
| 0:55 | Sipho → Money (refreshes) | R900 earned, payout pending; new insight + outlook card | "iBanks woke up on that event: ledger entry, insight, and a forecast that says honestly whether there is enough history." |
| 1:05 | Thandi → gig page | *Replay the settlement event (simulation test)* | "The provider sends the same event again: recognised as a duplicate, no double money, and the replay is audited." |
| 1:10 | Money → Insights → *How iBanks decided* | Show rule F001 v1, policy `allow`, event id | "Every decision is traceable: which event, which rule version, which policy check." |
| 1:15 | Ask iBanks | "How much did I make this week?" | "The answer is built from the ledger, not invented. AI may rephrase; it cannot add a number." |
| 1:22 | Goals | 5% / 2% of R900 → R45 / R18 / R837 | "A simulation. No money moves; retirement annuities need a licensed provider." |
| 1:27 | Sipho → Profile | Record shows *Client-confirmed* and *Payment confirmed (simulated provider)* | "Earn it. Prove it. Grow it." |

Backup if the network fails: run `npm run test:serial -- tests/ibanks-pipeline.test.ts` and show the passing output.
