# Wintergreen — Phase Tracker

Rules of engagement: one phase per session, in order. Read [CLAUDE.md](CLAUDE.md) and
[DESIGN.md](DESIGN.md) first, then the phase brief. A phase is done when its acceptance
criteria pass in a real browser AND Jared has inspected it. Update the status column here
when a phase's build work is complete.

| Phase | Brief | Scope | Status |
|-------|-------|-------|--------|
| 1 | [phases/phase-1-foundations.md](phases/phase-1-foundations.md) | Design tokens, fonts, site shell (header/nav/footer, mobile menu), data schema, bare hero | done |
| 2 | [phases/phase-2-homepage.md](phases/phase-2-homepage.md) | Full homepage: hero, shop-by-environment, featured location, featured designers | not started |
| 3 | [phases/phase-3-shop.md](phases/phase-3-shop.md) | Product listing page: filters (desktop sidebar + mobile drawer), product grid | not started |
| 4 | [phases/phase-4-product-page.md](phases/phase-4-product-page.md) | Product detail page: gallery, scale communication, accordions | not started |
| 5 | [phases/phase-5-location-page.md](phases/phase-5-location-page.md) | Location detail page: hero, story, included terrain, three purchase tiers | not started |
| 6 | [phases/phase-6-collections-designers.md](phases/phase-6-collections-designers.md) | Collection pages, designer pages | not started |
| 7 | [phases/phase-7-cart-mobile.md](phases/phase-7-cart-mobile.md) | Cart UI (static, no checkout), full mobile pass | not started |

## Current state of this directory

- `index.html` / `styles.css` / `app.js` — Phase 1 site shell: header (desktop nav +
  Shop mega-dropdown by environment/type/scale), mobile menu, footer, and a bare hero
  proving the color/type tokens. Verified at 360px/375px/1280px/1440px — no horizontal
  scroll at any width, dropdown and mobile menu toggle correctly. Hero media is a plain
  dark gradient placeholder (no real terrain photography yet — Phase 2 needs real
  photography for shop-by-environment cards and the featured location, so that's likely
  where placeholder image sourcing/generation actually starts in earnest).
- `data/README.md` — documents the schema; `designers.json` / `products.json` /
  `collections.json` / `locations.json` each seeded with exactly one placeholder record
  (Aether Studios / Sandstone Watchtower / Desert Settlements / The Desert Caravanserai)
  proving the many-to-many shape (a product's `collectionIds`/`locationIds` are arrays).
- `images/` — still empty. First real placeholder images are needed starting Phase 2.

## Deployment

Same Cloudflare Pages project as the rest of jaredluyster.com (no separate project).
Custom domain `wintergreen.jaredluyster.com` is configured; `functions/_middleware.ts`
rewrites that hostname to `/wintergreen`. Deploy is just a push to `main`. See repo-root
[DEPLOY.md](../DEPLOY.md) for the general tool-subdomain recipe.

## Decisions log

- 2026-09-02 — Scaffolded. Full design brief (28-section spec from Jared) captured in
  DESIGN.md. Decided: static catalog only for now, no cart/checkout backend; phased build
  like bluegrasscube; placeholder content/photography until real supplier data exists.
- 2026-09-02 — Phase 1 committed and pushed (`aa7c1d1`), live at
  wintergreen.jaredluyster.com. Root cause of an earlier "shows the main homepage instead"
  report: the custom domain was active on Cloudflare but the code had only ever been
  written locally, never committed/pushed — the Pages project auto-deploys on push to
  `main`, so nothing was live until that happened.
- 2026-09-02 — **Online-only, no physical location for now.** Jared: a physical location
  may happen later but isn't part of this build. See the CLAUDE.md note — affects About
  page, footer, and the Shipping accordion (Phase 4) once those are built.
