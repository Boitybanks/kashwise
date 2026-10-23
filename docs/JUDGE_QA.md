# Judge questions — honest answers (state of the build on 9 Oct 2026)

**What is new?** One verified job drives three things at once: a client-confirmed work record, an append-only earnings
ledger fed only by signed payment-provider events, and iBanks insights and forecasts that wake on those events. Job
boards stop at the match; budgeting apps start from a bank feed the worker may not have.

**Isn't this Snupit / a jobs board?** The marketplace is the entry point. The differentiator is what happens after
the job: proof the worker can share and money intelligence built for irregular income. We have not done a formal
competitor teardown; we do not claim nobody else does parts of this.

**Why is this financial inclusion?** It starts at the income source for people without payslips: verified records
of paid work, plain-language earnings, a forecast that admits uncertainty, savings simulations from net income, and a
cash-voucher payout option (simulated) for people without a bank account.

**How is iBanks intelligent?** Events wake it, not chat. It posts money exactly once, runs versioned protection rules,
recomputes a recency-weighted 7/30-day outlook with a backtest of its own error, finds earning patterns with sample
sizes, passes every action through a deterministic policy gate and writes an audit trail the worker can read. The
language model is optional and can only rephrase; any amount not in the facts is rejected.

**How accurate is the forecast?** We do not know yet. It has only been tested on synthetic series. The app shows the
backtest error per worker and refuses to forecast with fewer than 4 complete weeks.

**Are payments really FNB?** No. Payments are a labelled simulation. FNB adapters exist as code that refuses to run
until there is an agreement, approved API access and tested credentials.

**Does KashWise hold money?** No. A licensed payment partner would hold and pay out funds. KashWise records events.

**How are jobs verified?** The paying client confirms completion after an on-site QR start/finish handshake. That is
"verified" — not an ID check, not a bank check.

**How does it make money?** A 10% fee on completed jobs, taken from the provider's pay, calculated in the database.
`/economics` shows editable scenarios — assumptions, not results. There is no revenue yet.

**Is it built or planned?** Built and tested locally: marketplace, ledger, iBanks, Money screen, unit economics, an
Expo app reading the same backend. Not yet live: the iBanks database changes and the new code are not deployed; the
mobile app has not been run on a device. See `IMPLEMENTATION_STATUS.md`.

**People without smartphones?** Not served yet. USSD/SMS is a later phase and needs a provider.

**Path to scale?** Postgres with row-level security and RPCs, serverless functions, and an outbox design that can move
to a queue. No load test has been run yet.

**Who owns the original SideGigs code?** SideGigs was built by team CodeCraft (Boitumelo, Mthandeki, Musa, Zanele).
The founder has confirmed authority to reuse it; attribution is in `NOTICE.md`.

**Traction?** Zero real users so far. Demo data is fictional and labelled.
