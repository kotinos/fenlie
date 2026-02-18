## SplitCheck

SplitCheck is a [Next.js](https://nextjs.org) app built with React, Shadcn UI, and Tailwind CSS.
Participants claim receipt line items to indicate what they ordered, and costs are split based on those claims.
## How it works

1. Create or join a shared session.
2. Upload a receipt image and parse line items with Gemini.
3. Participants claim items (including quantity-aware claims).
4. SplitCheck calculates each person's owed amount, including shared costs like tax/tip/fees.
5. Settlement views show net balances and simplified transfers.

## Key features

- Realtime multi-user collaboration with presence.
- Receipt image upload from camera, file picker, drag-and-drop, or paste.
- Quantity-aware claiming and automatic per-person share calculation.
- Session dashboard with balances, transfers, and export tools.
- Optimistic state updates with Supabase-backed persistence.

## Tech stack

- Next.js 14 (App Router) + React 18
- Tailwind CSS + Shadcn-style UI primitives
- Zustand for app state
- Supabase (database + realtime)
- Google Gemini for receipt extraction
- Dexie (IndexedDB) local cache utilities

## Local development

### Prerequisites

- Node.js 18+ (Node.js 20 recommended)
- npm
- Supabase project (URL + anon key)
- Gemini API key

### Setup

```bash
npm install
cp .env.example .env.local
```

Fill in values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GEMINI_API_KEY` (dev/prototyping)
- `GEMINI_API_KEY` (server-side `/api/extract-receipt`)

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` - start local development server
- `npm run build` - build production bundle
- `npm run start` - run production server
- `npm run lint` - run ESLint checks

## Architecture at a glance

- UI routes and product flows live in `src/app/*`.
- Shared state and persistence logic live in `src/lib/store.ts`.
- Realtime sync hooks live in `src/hooks/use-realtime-session.ts` and `src/hooks/use-presence.ts`.
- Split math and settlement logic live in `src/lib/calculations.ts`.
- Receipt extraction pipeline is handled by `src/components/receipt/ReceiptUploader.tsx` and `src/app/api/extract-receipt/route.ts`.

## Data model summary

- A **session** contains participants and receipts.
- A **receipt** contains line items, payer, subtotal/total, and shared costs.
- A **line item** includes `description`, `quantity`, `unitPrice`, `totalPrice`, and `claimedBy`.
- Claims are represented by participant names in `claimedBy`:
  - For qty `<= 1`, unique claimers split item cost evenly.
  - For qty `> 1`, claim counts determine proportional shares.

## Core user flow

- Home (`/`): create session or open an existing one.
- Join (`/join/[code]`): join by share code.
- Session pages (`/session/[id]`): manage receipts and participants.
- Receipt detail (`/session/[id]/receipt/[rid]`): claim, edit, and delete items.
- Dashboard (`/session/[id]/dashboard`): review totals and settlement transfers.

## Troubleshooting

- **Gemini errors or rate limits**: verify `GEMINI_API_KEY`, then retry after cooldown.
- **No realtime updates**: check Supabase credentials and realtime table subscriptions.
- **Parsing quality is poor**: retake image with better lighting, framing, and focus.
- **Sync issues**: confirm network access and Supabase project status.

## Known limitations

- OCR quality depends on image clarity and receipt formatting.
- No automated test suite is currently configured in this repository.
- Complex or ambiguous receipt layouts may still need manual edits.

## Roadmap ideas

- Add automated integration/e2e tests for core claim/split flows.
- Improve OCR fallback handling for noisy receipts.
- Expand export and settlement reporting options.
- Add stronger offline-first conflict handling UX.

## Contributing

Please open an issue or PR with a clear description of the bug/feature and repro steps where possible.
