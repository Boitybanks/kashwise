# SideGigs

**Find work. Get it done. Build your name.**
A trusted local work marketplace for South Africa that turns real-world skills into income and completed work into a portable digital reputation.

Built by team **CodeCraft** — Boitumelo, Mthandeki, Musa and Zanele.

- **Live app:** https://sidegigs-codecraft.netlify.app
- **Demo logins:** tap “Try as Thandi” (customer) or “Try as Sipho” (worker) on the home page, or sign in with
  `demo.customer@sidegigs.app` / `demo.worker@sidegigs.app`, password `SideGigsDemo2026`. Demo data is labelled everywhere.

## What it does
- Customers post a local gig (category, description, area, date, price) and **each side sees its own number**: the customer pays R500 with nothing added, and workers are shown **R450, what they receive** after SideGigs’ 10% fee — the only deduction. No VAT is withheld from workers.
- Workers can also **list a priced service** by the amount they want to take home (R450); clients see and pay R500 and can book it directly, which matches the job at once.
- **My Wallet** shows what a worker has earned and lets them cash out to a bank account or as an SMS cash voucher collected at shops like Boxer, Shoprite and spaza shops — no bank account needed. One cash-out a week is free (payments are simulated).
- Workers discover nearby gigs (sorted by distance, filter by skill), apply, get chosen, start and finish the job.
- The customer confirms completion → a **verified record** is added to the worker’s public portfolio automatically, then the customer’s rating and review attach to it.
- Workers share their portfolio link or download a **quantum-resistant signed work record** (ML-DSA-65) that anyone can verify at `/verify`.
- As an experimental defence-in-depth layer, private addresses and phone numbers are encrypted in the browser with the X-Wing hybrid construction (ML-KEM-768 + X25519 → AES-256-GCM) and revealed only to the matched pair. Core security remains HTTPS, Supabase Auth, RLS, protected server secrets and audit logging; this is not a claim that the database itself is “quantum encrypted”.
- Opening the app shows a **splash screen** that asks you to register or sign in (demo logins stay one tap away); the full story is at `/welcome`.
- Each worker has a **Work Passport** (`/w/:id`): proven skills counted from customer-confirmed gigs, rating, completion rate, recent experience and a QR code that opens the passport.
- Workers and customers can add a **profile photo** and upload **PDF documents** (qualifications, ID, other). Documents are never checked by SideGigs; ID documents always stay private.
- When a customer accepts a worker, both get a private **Work ID** (e.g. `SG-7KQ4-M2XP`) to quote when they call or message each other.
- **Forgot password** emails a reset link; the new password works on the next sign-in.
- Jobs **start and finish with a QR code**: the customer shows a one-time start code and later a finish code, and the worker scans each one on site (or types the 6-character code).
- **Sign-up asks for an SA ID number, the name on the ID, gender (male or female) and home address.** The ID number is format- and checksum-checked (not a Home Affairs check), encrypted in the browser, and limited to one account per ID number. People are told if their gender or profile name doesn’t match their ID.
- Live impact dashboard: people who earned, income earned, match rate, time to match, ratings, repeat work.

Payments are a clearly labelled **simulation** in this version.

## Run locally
```bash
npm install
cp .env.example .env            # fill in the Supabase URL + publishable key
npm run keys:generate           # only if you need your own PQ keys (then set the seeds in Netlify)
npm run dev                     # or `netlify dev` to include the functions
```

## Quality gates
`npm run typecheck && npm run lint && npm test && npm run build`, plus `npm run test:journey` (live end-to-end journey).

Docs: `docs/product-brief.md`, `docs/architecture.md`, `docs/implementation-plan.md`, `.pipeline/`.
