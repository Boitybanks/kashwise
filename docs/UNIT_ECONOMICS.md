# KashWise unit economics — scenarios, not results

Code: `src/lib/unit-economics.ts` (integer cents, fee identical to the database rule). Screen: `/economics`.
Tests: `tests/unit-economics.test.ts`. KashWise has no live payments or revenue; every number below is an assumption.

## Model (per month)

- Revenue = 10% fee × jobs (the fee comes from the provider's pay; the client pays the job price, nothing added).
- Variable costs per job: payment processing (bps of price, paid by KashWise), KashWise's share of payout cost,
  optional AI explanation cost.
- Contribution = revenue − variable costs. Operating result = contribution − fixed costs (hosting, support, moderation).
- Break-even jobs = ⌈fixed ÷ contribution per job⌉. Minimum viable job price = smallest price whose fee covers its own
  variable costs (small-ticket risk).

## Starting scenarios

| Scenario | Jobs / month | Avg job | Processing | Payout cost / job | AI / job | Fixed / month | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Cautious pilot | 200 | R350 | 1.5% | R3 | R0 | R15 000 | −R9 650 / month; break-even at 561 jobs |
| One metro, steady | 1 500 | R500 | 1.5% | R3 | R0.50 | R40 000 | +R18 500 / month; break-even at 1 026 jobs; jobs under R41.25 lose money |
| Gauteng-wide | 12 000 | R600 | 1.5% | R3 | R0.50 | R150 000 | see `/economics` |

The 1.5% processing cost mirrors the simulator's assumption, not a quoted partner price. Real provider pricing, tax
treatment and support costs must replace these before any claim is made.
