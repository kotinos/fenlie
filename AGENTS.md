# SPLITCHECK — Verified AI Project Context

## Purpose

This file is the verified context for AI coding assistants working on SplitCheck.
Use it to understand architecture, product behavior, conventions, and safe change patterns.
Only facts represented in the repository are included.

## Project Snapshot

- Product: SplitCheck (mobile-first bill splitting app)
- Framework: Next.js App Router + React
- UI: Tailwind CSS + local Shadcn-style primitives under `src/components/ui`
- State: Zustand store in `src/lib/store.ts`
- Backend/data: Supabase (DB + realtime subscriptions)
- Receipt parsing: Gemini-backed API routes (`src/app/api/extract-receipt/route.ts`, `src/app/api/parse-receipt/route.ts`)
- Offline/cache: Service worker (`public/sw.js`) + IndexedDB cache via Dexie (`src/lib/cache/*`)

## Route Map (Current)

- `/` -> home page (`src/app/page.tsx`)
- `/join/[code]` -> join session page (`src/app/join/[code]/page.tsx`)
- `/session/[id]` -> session page (`src/app/session/[id]/page.tsx`)
- `/session/[id]/receipt/[rid]` -> receipt detail page (`src/app/session/[id]/receipt/[rid]/page.tsx`)
- `/session/[id]/dashboard` -> settlement dashboard (`src/app/session/[id]/dashboard/page.tsx`)
- `/settings` -> settings page (`src/app/settings/page.tsx`)
- API: `/api/extract-receipt`, `/api/parse-receipt`

Important: route prefix is `session` (singular), not `sessions`.

## Core User Flows

1. User creates a session or joins by share code.
2. User uploads receipt image and extracts line items.
3. User reviews parsed data and saves receipt.
4. Participants claim item quantities.
5. App computes person totals and session settlement transfers.

## Source-of-Truth Architecture

### State and persistence

- Main app state lives in Zustand (`src/lib/store.ts`).
- Store mutations are optimistic in many write paths and synced to Supabase APIs (`sessionsApi`, `participantsApi`, `receiptsApi`, `lineItemsApi`).
- Realtime updates are applied through `useRealtimeSession` (`src/hooks/use-realtime-session.ts`) and store `_apply*` reducers.
- Presence updates and online indicators are handled by `usePresence` (`src/hooks/use-presence.ts`).

### Cache/offline

- Service worker is registered in `src/components/service-worker-registrar.tsx` and caches app shell/static assets (`public/sw.js`).
- IndexedDB cache database is defined in `src/lib/cache/db.ts`; cache orchestration lives in `src/lib/cache/use-cached-session.ts`.

### Calculation layer

- Cost sharing + settlement logic is in `src/lib/calculations.ts`.
- Receipt subtotal/total recalculation also occurs in store (`recalcReceipt` in `src/lib/store.ts`).

## Data Model (Operational)

Canonical persisted types are in `src/lib/supabase.ts`:

- `DbSession`: session metadata including `share_code`
- `DbParticipant`: participant `name`, `color`, online fields
- `DbReceipt`: receipt metadata + tax/tip/fees/subtotal/total
- `DbLineItem`: `description`, `quantity`, `unit_price`, `total_price`, `claimed_by`, `is_edited`

Assistant note: store-level app types differ slightly from DB wire types and include mapped names (`lineItems`, `restaurantName`, etc.).

## Claim Semantics (Do Not Change Lightly)

Claim behavior is quantity-dependent and implemented in `src/lib/store.ts` and `src/lib/calculations.ts`:

- For quantity <= 1 (or non-integer), `claimedBy` behaves like unique claimers sharing an item.
- For quantity > 1 integer, duplicate names in `claimedBy` represent multiple claimed units.
- Person share math:
  - qty <= 1: split equally among unique claimers with cent remainder adjustment.
  - qty > 1: proportional by claimed unit counts, also with cent remainder handling.

Any changes here affect settlement math, warnings, and dashboard totals.

## UI and Interaction Conventions

- Use existing UI primitives from `src/components/ui/*` (Button/Input/Drawer/AlertDialog).
- Keep touch targets mobile-friendly (`min-h-[44px]` pattern is common).
- Destructive actions use explicit confirmation patterns:
  - Item delete uses AlertDialog in receipt detail page.
  - Receipt delete uses Drawer confirmation in receipt detail page.
- Keep feedback patterns consistent with existing local toast/announcement usage in each page (no global toast system currently).

## Z-Index Reality (Observed)

Current code uses these ranges:

- `z-30`: sticky bars/sync indicator
- `z-40`: sidebar/bottom nav
- `z-50`: Drawer and AlertDialog overlays/content
- `z-[70]` and `z-[80]`: some overlays/toasts/menus

Do not introduce new arbitrary layers unless needed; prefer existing local conventions in the touched area.

## API Integration Notes

### `/api/extract-receipt`

- Server-side Gemini extraction endpoint.
- Validates image file types and max size 10MB.
- Has request timeout, in-memory rate limiting, retry/backoff behavior, and response-shape validation.
- Uses `GEMINI_API_KEY` and optional `GEMINI_RECEIPT_MODEL`.

### `/api/parse-receipt`

- Additional Gemini parsing endpoint with schema validation and retry loop.

Assistant guidance: prefer following existing endpoint used by the current upload flow before introducing new parsing paths.

## Verified Constraints and Cautions

- Supabase env vars are required at startup (`src/lib/supabase.ts` throws on placeholders/missing values).
- Dialog positioning differs by component:
  - Drawer implementation uses flexbox centering wrapper to avoid focus-shift issues (`src/components/ui/drawer.tsx`).
  - AlertDialog currently uses centered transform positioning (`src/components/ui/alert-dialog.tsx`).
- Cache layer models are not identical to Supabase types; respect existing mapping utilities.

## Assistant Working Rules for This Repo

1. Confirm behavior in code before asserting product rules.
2. Preserve claim semantics and settlement invariants unless explicitly requested.
3. Prefer updating existing patterns over introducing parallel abstractions.
4. For data mutations:
   - update local state/store path,
   - ensure Supabase sync path is preserved,
   - verify recalculation effects (subtotal/total and per-person totals).
5. For destructive UX, include confirmation + clear feedback.
6. Validate with `npm run lint` after substantive edits.

## Quick File Landmarks

- Home/session creation: `src/app/page.tsx`
- Session page: `src/app/session/[id]/page.tsx`
- Receipt detail: `src/app/session/[id]/receipt/[rid]/page.tsx`
- Dashboard: `src/app/session/[id]/dashboard/page.tsx`
- Store: `src/lib/store.ts`
- Calculations: `src/lib/calculations.ts`
- Realtime hook: `src/hooks/use-realtime-session.ts`
- Presence hook: `src/hooks/use-presence.ts`
- Supabase client + APIs: `src/lib/supabase.ts`
- Cache: `src/lib/cache/*`
- Service worker: `public/sw.js`

---

Last verified against repository state in this workspace.
