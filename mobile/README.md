# KashWise mobile (Android and iOS, Expo SDK 57)

Same Supabase project, auth, RLS and iBanks engine as the web app: the screens import `../src/lib/ibanks`
(see `metro.config.js`), so web, server and phone compute identical figures. Publishable key only.

Screens: sign in (incl. *Try as Sipho / Thandi*, fictional accounts) · worker: Money (earned / available / payout
pending / paid out, 7- and 30-day outlook, savings simulation, insights, Ask iBanks) · Find work · ProofScript
(client-confirmed / payment-confirmed records) · client: My jobs, Open jobs. Applying for and posting jobs still
happens on the web app.

```bash
cd mobile
npm install
cp .env.example .env        # public values only
npx expo start              # scan the QR with Expo Go (Android or iOS)
npx tsc --noEmit            # typecheck
```

Status (9 Oct 2026): typecheck passes; `npx expo export --platform android` bundled successfully (741 modules).
**Not yet run on a device or emulator, and no iOS bundle/build has been made.** iOS builds need EAS
(`npx eas-cli@latest build -p ios`) or a Mac.
