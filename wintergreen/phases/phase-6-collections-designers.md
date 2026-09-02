# Phase 6 — Collection Pages & Designer Pages

## Goal

Build the two remaining catalog page types.

## Read first

[DESIGN.md](../DESIGN.md) §9 (collections), §13 (designer pages).

## Build

- **Collection page:** heading + short supporting copy, then a clean product grid (reuse
  the Phase 3 grid/card components — don't rebuild them).
- **Designer page:** name, short description, logo (if a placeholder logo exists), product
  categories, terrain gallery, the designer's products, and a "Shop [Designer] Terrain"
  link into a pre-filtered Phase 3 listing. Must visually distinguish "Designed by
  [Designer]" from "Professionally printed and sold by [Store]" per DESIGN.md §13 — this is
  a legal/trust distinction, not just copy styling.

## Don't build

Cart, search, account pages.

## Acceptance criteria

- Both page types render from real `data/collections.json` / `data/designers.json`
  records, reusing Phase 3's grid rather than duplicating it.
- Designer page's designed-by vs. sold-by distinction is visually clear, not just implied
  by word order.
- PLAN.md status updated; committed.
