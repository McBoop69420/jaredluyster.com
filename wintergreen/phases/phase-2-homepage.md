# Phase 2 — Full Homepage

## Goal

Build out the complete homepage on top of Phase 1's shell: shop-by-environment, featured
location, and featured designers sections.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §7 (homepage structure in full), §14–15
(photography rules, image behavior), §16–18 (buttons, cards, spacing).

## Build

- **Shop by Environment** (DESIGN.md §7 Section 2): heading "WHERE WILL YOUR ADVENTURE
  BEGIN?", six image-driven category cards (Desert, Harbor, Medieval Town, Temples & Ruins,
  Dungeons, Wilderness). Subtle zoom + arrow reveal on hover.
- **Featured Location** (Section 3): one editorial, cinematic callout — not a product card.
  Needs at least one real (placeholder) `locations.json` record with a name, description,
  and stat line (buildings/pieces/expandable).
- **Featured Designers** (Section 4): 2–4 designer cards from `designers.json` — logo,
  representative image, one-sentence description, "Shop [Designer] Terrain" link. Seed at
  least 2 placeholder designers if only 1 exists from Phase 1.
- Extend `data/locations.json` / `data/designers.json` with enough placeholder records to
  fill these sections believably (per CLAUDE.md: realistic placeholder content, not jokey).

## Don't build

Shop/PLP, product pages, location detail pages, collection pages, designer detail pages,
cart, search. Homepage links to these can point at their eventual URLs.

## Acceptance criteria

- All four homepage sections from DESIGN.md §7 present, in order, on one page.
- Featured Location reads as editorial/cinematic, not a generic product card.
- No section degrades into a plain product grid (DESIGN.md §24).
- Responsive from 360px to 1440px, hover states work on desktop, tap-friendly on mobile.
- PLAN.md status updated; committed.
