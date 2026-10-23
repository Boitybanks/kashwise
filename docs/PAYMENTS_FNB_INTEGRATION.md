# Payments: provider abstraction and FNB-oriented design

**Status: no live FNB integration exists.** Every payment in KashWise today comes from a labelled simulator.
KashWise never holds customer funds; a licensed provider collects, settles and pays out, and KashWise records the
lifecycle from the provider's signed events.

## What FNB publicly offers (researched 8 Oct 2026)

| Service | Public facts | KashWise role |
|---|---|---|
| [FNB eCommerce Gateway](https://www.fnb.co.za/business-banking/merchant-services/eCommerce.html) | FNB's own switch for online card acceptance; integrates with third-party providers | Client payments (authorise → settle) |
| [FNB eWallet](https://www.fnb.co.za/send-money/eWallet/index.html) | Send to any SA cellphone number; recipient needs no bank account; cash at FNB ATMs; public consumer limits ~R3 000 per send (app/online), R5 000 max balance | Worker payouts without a bank account |
| [FNB PayShap](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/PayShap.htm) | Instant account/ShapID payments; eWallet can receive PayShap | Instant payouts |
| eWallet Bulk Payments | Pay many eWallets from business banking (documented publicly for [FNB Namibia](https://www.fnbnamibia.com.na/for-my-business/eWallet-bulk-payments/); confirm SA availability) | Batched payouts |
| [FNB Integration Channel](https://www.fnb.co.za/integration-channel/index.html) | API or Host-to-Host access to FNB services, including electronic payments | Payment status and reconciliation |

API specifications, webhook formats, sandbox access and pricing are **not public**; they come with FNB onboarding.
Nothing in this repository invents them.

## Code

- `src/lib/payments/providers.ts` — provider registry (browser-safe): capabilities, payout methods, status
  (`simulated` | `not_configured` | `live`), masked destinations, payout limits.
- `netlify/lib/payments/adapters.ts` — `PaymentProviderAdapter`; `SandboxProvider` (simulator, server-side fee from the
  DB price, platform-funded processor cost recorded separately, labelled illustrative, *not FNB pricing*);
  `FnbAdapter` for each FNB service, which **always throws `ProviderNotEnabledError`**.
- `netlify/functions/payments-webhook.mts` — the only entry for provider events (signature + contract).
- `netlify/functions/payments-sandbox.mts` — simulator actions; enabled only with `PAYMENTS_MODE=sandbox`.

## Lifecycle (each step separate, each from its own source)

1. **Authorisation** — client chooses a worker; payment held (`transactions.status = 'held'`).
2. **Completion approval** — client confirms in KashWise; creates the verified record, **moves no money**.
3. **Settlement** — provider's signed `payment_settled` → ledger `net_earned`; only now is money earned.
4. **Payout request** — worker picks bank account, PayShap or eWallet; KashWise records `payout_requested`.
5. **Payout confirmation** — provider's signed `payout_settled` or `payout_failed`. Never assumed.

## Going live with an FNB service — all required, in order

1. Signed agreement and approved API access for that service.
2. Credentials stored only in server environment variables, never in apps.
3. Implement the adapter against FNB's actual specification; map FNB webhooks into the event contract with a new
   `source`; add the source to the SQL allow-list in a reviewed migration.
4. Verified test results in FNB's test environment, recorded here with date and reference.
5. Set `<SERVICE>_API_ACCESS_APPROVED`, `_AGREEMENT_REF`, `_VERIFIED_TEST_RUN`, `_CLIENT_ID`, then remove the
   "contract not implemented" guard in a reviewed change. Until then the adapter refuses.
