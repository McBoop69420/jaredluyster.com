# Phase 7 — Cart UI & Mobile Pass

## Goal

Build the cart UI (static, no real checkout) and do a full responsive/mobile pass across
every page built in Phases 1–6.

## Read first

[DESIGN.md](../DESIGN.md) §19 (mobile), §20 (cart experience — including the 2026-09-02
"current build note" that this stays static-catalog only).

## Build

- **Cart page/drawer:** line items (image, name, size/variant, quantity, price), order
  summary visible on desktop, primary CTA "Checkout". Client-side state only (e.g.
  `localStorage`) — no real order submission. A small "Compatible Terrain" section is
  allowed but optional.
- Wire Phase 4's Add to Cart button into this real (client-side) cart state.
- Mobile pass: re-check every page from Phases 1–6 at 360–430px widths specifically —
  filter drawer, accordions, image galleries, nav menu, cart drawer. Fix anything that
  breaks the priority order from DESIGN.md §19 (photo → title → price/CTA → supporting
  info).

## Don't build

Any real payment integration, order persistence, or account system — those require the
backend decision this build explicitly deferred (see CLAUDE.md).

## Acceptance criteria

- Adding a product from its product page actually appears in the cart, persists across a
  page reload (localStorage), and can be removed/quantity-adjusted.
- Checkout button is present but clearly does not process a real payment (e.g., a "coming
  soon" state) — must not look like a broken real checkout.
- Every page from Phases 1–6 has no horizontal scroll and preserves the mobile priority
  order at 360px width.
- PLAN.md status updated; committed.
