# Phase 3 — Shop / Product Listing Page

## Goal

Build the browsable product catalog: filtering and the product grid.

## Read first

[DESIGN.md](../DESIGN.md) §10 (product listing page in full), §21 (data relationships —
filters must work against the many-to-many model, not a single category field).

## Build

- Listing page with header + short description (e.g. "SHOP DESERT TERRAIN" when filtered
  by environment).
- Filters: Environment, Product Type, Scale, Designer, Price. Desktop: sidebar. Mobile:
  filter drawer. Keep the filter set to exactly these five — don't add more yet.
- Product grid: 4 columns large desktop, 3 standard desktop, 2 tablet, 2 mobile.
- Product card: image ~75% of card, then category label, product name, price, optional
  scale metadata line. Entire card clickable. No long descriptions, badges, or multiple
  buttons on the card.
- Expand `data/products.json` with enough placeholder products (across at least 3
  environments and a couple of designers) to make filtering demonstrable.

## Don't build

Product detail page content (cards can link to a URL that doesn't resolve yet, or a bare
stub), location/collection/designer pages, cart, search.

## Acceptance criteria

- Filtering by each of the five facets actually narrows the grid using the real data.
- A single product can satisfy more than one filter combination correctly (proves the
  many-to-many model isn't secretly a single category field).
- Grid column counts match the spec at each breakpoint.
- Mobile filter drawer opens/closes cleanly, no layout shift.
- PLAN.md status updated; committed.
