# Espressowe

A personal credit card portfolio manager built with React Native + Expo, deployed as a PWA at [espressowe.alyxcuiedio.com](https://espressowe.alyxcuiedio.com).

---

## Features

**Card Management**
- Add cards from a catalog of 23+ credit cards or create a custom card
- Track last 4 digits, credit limit, payment due day, and card open date
- Edit or delete cards at any time

**Plaid Integration**
- Connect real bank accounts via Plaid Link
- Automatically syncs current balance, available credit, minimum payment, and next payment due date
- Cursor-based transaction sync (handles added, modified, and removed transactions)
- Credit limit auto-populated from Plaid's balance data

**Dashboard (Home Tab)**
- Total available credit across all cards
- Total spent vs. total limit
- Upcoming payments within 15 days with urgency indicators
- Annual fee renewal countdowns
- Recent transactions list
- Payment and fee insight pills

**Cards Tab**
- Card image, last four digits, balance, and available credit
- Color-coded indicators: green (healthy) → amber (caution >30% used) → red (high >50% used)
- Statement end date badge with urgency coloring
- Minimum payment badge for Plaid-linked cards
- Mark Paid toggle per card
- Connect / Sync buttons for Plaid-linked cards

**Benefits Tab**
- Earn rate multipliers by spending category for every card in your wallet
- Rotating category tracking
- Filter by category

**Security**
- PIN gate on app open (4-digit PIN set via environment variable)
- Auto-locks after 15 minutes of inactivity
- `plaid_connections` table protected by Supabase RLS — blocks anon key, edge functions use service role
- `robots.txt` prevents search engine indexing

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81.5 + Expo ~54 (managed, New Architecture) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL, RLS off for cards/purchases, on for plaid_connections) |
| Plaid | Production environment — transactions + liabilities products |
| Edge Functions | Supabase Edge Functions (Deno runtime) |
| Deployment | Vercel — auto-deploy on push to main |
| Distribution | PWA — add to iPhone home screen via Safari |

---

## Project Structure

```
├── App.tsx                      # Main component — all UI and state
├── db/database.ts               # Supabase queries + Plaid edge function callers
├── lib/supabase.ts              # Supabase client
├── data/cards.ts                # Static card catalog (23 cards + custom) and benefit definitions
├── styles/
│   ├── card.ts                  # Card component styles
│   ├── dashboard.ts             # Home tab styles
│   ├── layout.ts                # Shared layout styles
│   └── modal.ts                 # Modal styles
├── supabase/functions/
│   ├── plaid-link-token/        # Creates Plaid link_token for client
│   ├── plaid-exchange-token/    # Exchanges public_token → access_token, stores in DB
│   ├── plaid-sync-liabilities/  # Fetches balance + credit card liabilities, updates card row
│   └── plaid-sync-transactions/ # Cursor-based transaction sync, upserts into purchases
├── web/
│   ├── index.html               # PWA HTML template with iOS meta tags
│   └── robots.txt               # Disallow all crawlers (copied to dist/ by post-build script)
├── assets/                      # Card images, app icon, splash screen
├── copy-pwa-assets.js           # Post-build: copies apple-touch-icon + robots.txt into dist/
└── vercel.json                  # Vercel build configuration
```

---

## Database

| Table | Purpose |
|---|---|
| `cards` | User's card portfolio including Plaid-synced fields |
| `purchases` | Manual and Plaid-synced transactions |
| `plaid_connections` | Plaid access tokens — never exposed to client (RLS enabled) |

Plaid columns on `cards`:
`plaid_account_id`, `plaid_item_id`, `current_balance`, `available_credit`, `last_statement_balance`, `minimum_payment`, `next_payment_due`, `last_synced_at`

---

## Environment Variables

**Local — `.env`**
```
EXPO_PUBLIC_APP_PIN=            # 4-digit PIN for the lock screen
EXPO_PUBLIC_SUPABASE_URL=       # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key
```

**Supabase Edge Function Secrets**
```
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV=production
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

**Vercel** — add `EXPO_PUBLIC_APP_PIN`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in project settings.

---

## Local Development

```bash
npm install
npm run web        # Start dev server in browser at localhost
```

---

## Deployment

Vercel auto-deploys on every push to `main`. The build runs:
```bash
npx expo export -p web && node copy-pwa-assets.js
```
This exports the web bundle to `dist/` then copies the PWA icon and `robots.txt` into the output.

**Deploy edge functions manually:**
```bash
npx supabase functions deploy plaid-link-token
npx supabase functions deploy plaid-exchange-token
npx supabase functions deploy plaid-sync-liabilities
npx supabase functions deploy plaid-sync-transactions
```

---

## Installing as PWA on iPhone

1. Open [espressowe.alyxcuiedio.com](https://espressowe.alyxcuiedio.com) in **Safari**
2. Tap the Share button → **Add to Home Screen**
3. Enter your PIN — the app locks after 15 minutes of inactivity
