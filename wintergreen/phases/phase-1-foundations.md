# Phase 1 — Design Foundations & Site Shell

## Goal

Establish the design system (colors, type, spacing, buttons, cards) and the site shell
(header/nav/footer, mobile menu) that every later phase builds on. Define the data schema
for designers/products/collections/locations. No real page content yet beyond a bare hero
— this phase is about getting the frame and tokens right.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) — especially §4–6 (color, type, nav),
§16–19 (buttons, cards, spacing, mobile), §21 (data relationships).

## Build

- Replace the placeholder `index.html` with the real shell.
- New stylesheet (`styles.css` or similar) defining CSS custom properties for every token
  in DESIGN.md §4 (`--bg`, `--surface`, `--surface-elevated`, `--text`, `--text-secondary`,
  `--accent`), plus a font stack: one serif/display font for sparing headline use, one
  sans-serif for UI/body (Google Fonts is fine, matching this repo's existing pattern of
  `@import` in stylesheets — see `shared-theme.css` for precedent, though this is a fully
  separate brand and does not need to match it).
- **Header:** logo (text wordmark placeholder is fine — no real logo file exists yet), nav
  items **Shop · Locations · Collections · Designers · About**, search/account/cart icons
  right-aligned (DESIGN.md §6). The Shop item's dropdown (By Environment / By Product Type
  / By Scale) can be stubbed with real link targets even before those pages exist.
- **Mobile nav:** logo + cart visible, hamburger menu exposing the same five top-level
  items, no nested hover menus (DESIGN.md §19).
- **Footer:** minimal, `--surface` background — company name, a few link columns is enough
  for now (not specified in detail by DESIGN.md; keep it restrained, no scope creep).
- **Bare hero:** one full-width section proving the hero pattern works — placeholder
  photography (a solid/gradient-free dark panel is acceptable if no terrain photo exists
  yet; do not fake terrain photography with an AI-generated image per DESIGN.md §3's ban)
  with the eyebrow/headline/subhead/two-button layout from DESIGN.md §7. Full homepage
  content (shop-by-environment, featured location, featured designers) is Phase 2, not now.
- **Data schema:** create `data/README.md` (or inline schema comments) documenting the
  shape of `designers.json`, `products.json`, `collections.json`, `locations.json` —
  products reference collection/location IDs as arrays, not a single parent, per
  DESIGN.md §21. Seed exactly one placeholder record per file so the shape is provable, but
  don't build out a full catalog yet — that happens incrementally as each phase needs it.

## Don't build

Shop-by-environment cards, featured location section, featured designers section, product
listing/detail pages, location/collection/designer pages, cart, search functionality,
account functionality. Buttons/links to these can point at their eventual URLs and 404 for
now — do not stub fake content pages.

## Acceptance criteria

- Header, nav (desktop + mobile), and footer render correctly from 360px to 1440px wide,
  no horizontal scrollbar at any width.
- Color tokens match DESIGN.md §4 exactly; no pure white (`#fff`) or pure black (`#000`)
  anywhere in the UI.
- Exactly one accent color (`--accent`) in use; not used as a large background fill.
- Headline font is used only for the hero headline, nothing else yet.
- Mobile menu opens/closes and exposes all five nav items without nested hover menus.
- `data/*.json` files exist with one placeholder record each, structured so a product can
  reference multiple collection/location IDs.
- Nothing violates DESIGN.md §24 (no fantasy decoration, parchment, gradients-everywhere,
  excessive gold, purposeless animation).
- PLAN.md status updated to "done"; committed.
