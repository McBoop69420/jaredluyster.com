# Wintergreen — Phase Tracker

Rules of engagement: one phase per session, in order. Read [CLAUDE.md](CLAUDE.md) and
[DESIGN.md](DESIGN.md) first, then the phase brief. A phase is done when its acceptance
criteria pass in a real browser AND Jared has inspected it. Update the status column here
when a phase's build work is complete.

| Phase | Brief | Scope | Status |
|-------|-------|-------|--------|
| 1 | [phases/phase-1-foundations.md](phases/phase-1-foundations.md) | Design tokens, fonts, site shell (header/nav/footer, mobile menu), data schema, bare hero | done |
| 2 | [phases/phase-2-homepage.md](phases/phase-2-homepage.md) | Full homepage: hero, shop-by-environment, featured location, featured designers | done |
| 3 | [phases/phase-3-shop.md](phases/phase-3-shop.md) | Product listing page: filters (desktop sidebar + mobile drawer), product grid | done |
| 4 | [phases/phase-4-product-page.md](phases/phase-4-product-page.md) | Product detail page: gallery, scale communication, accordions | done |
| 5 | [phases/phase-5-location-page.md](phases/phase-5-location-page.md) | Location detail page: hero, story, included terrain, three purchase tiers | done |
| 6 | [phases/phase-6-collections-designers.md](phases/phase-6-collections-designers.md) | Collection pages, designer pages | done |
| 7 | [phases/phase-7-cart-mobile.md](phases/phase-7-cart-mobile.md) | Cart UI (static, no checkout), full mobile pass | in progress |

## Current state of this directory

- `index.html` / `styles.css` / `app.js` — Phase 1 site shell: header (desktop nav +
  Shop mega-dropdown by environment/type/scale), mobile menu, footer, and a bare hero
  proving the color/type tokens. Verified at 360px/375px/1280px/1440px — no horizontal
  scroll at any width, dropdown and mobile menu toggle correctly. Hero media is a plain
  dark gradient placeholder (no real terrain photography yet — Phase 2 needs real
  photography for shop-by-environment cards and the featured location, so that's likely
  where placeholder image sourcing/generation actually starts in earnest).
- `data/README.md` — documents the schema; `designers.json` (now 3 records, all
  `featured: true`) / `products.json` / `collections.json` / `locations.json` (1 record,
  `featured: true`) prove the many-to-many shape (a product's `collectionIds`/
  `locationIds` are arrays) and now also the `featured` flag Phase 2 added to both
  designers and locations.
- `home.js` (new, Phase 2) — renders Shop by Environment (static 6-item list matching the
  nav dropdown, DESIGN.md §6), Featured Location, and Featured Designers by fetching the
  JSON data files client-side. No build step, so this is plain `fetch` + template strings,
  same pattern bluegrasscube uses for its data-driven sections.
- `images/` — still empty. Environment/location/designer/product cards currently use flat
  tinted placeholder colors (see `styles.css` `.env-card[data-env=...]` and
  `.product-card-media[data-env=...]`) instead of real photography — DESIGN.md §3 bans
  AI-generated fantasy backgrounds, so these stay abstract placeholders rather than faked
  photos until real terrain photography exists.
- `shop/index.html`, `shop.js` (new, Phase 3) — product listing page. Filters (Environment,
  Product Type, Scale, Designer, Price) are checkboxes/radios, ANDed across facets and ORed
  within a facet; Designer options render dynamically from `data/designers.json` so a new
  designer needs no page edit. Reads `?environment=`/`?type=`/`?scale=` from the URL on
  load (matching the nav dropdown and homepage links built in Phases 1–2) to pre-check a
  filter and retitle the page, but doesn't write filter state back to the URL — acceptable
  for now per the phase brief, revisit if shareable filtered links become a real need.
  Product URLs are `/wintergreen/products/{id}/` (Phase 4 builds that page). Catalog grew
  from 1 to 11 placeholder products in this phase specifically to prove filtering and the
  many-to-many model against real variety (all 6 environments, all 6 product types, all 4
  scales, all 3 designers each represented).
- `data/designers.json` — Aether Studios' `categories` extended to include `wilderness`
  after Phase 3 gave them a wilderness product.
- `products/index.html`, `product.js` (new, Phase 4) — one shared template for every
  product detail page, routed by a new rule in `../functions/_middleware.ts`
  (`DETAIL_PAGE_TEMPLATES`) that rewrites `/wintergreen/products/<id>/` to this template's
  directory. Renders a 5-shot gallery (distinguishable placeholder panels, not one image
  reused), a scale block (comparative height bars: product vs. a 1.25" standard-miniature
  reference, drawn to the same px-per-inch scale — not just a printed dimension), and the
  5 required `<details>`/`<summary>` accordions (Description, Dimensions, Designer, Print
  Information, Shipping). Add to Cart is real UI (increments the header cart badge,
  in-memory only) but doesn't persist anything yet — Phase 7 wires up the actual cart
  state this button should write to, per CLAUDE.md.
  **Real bug found and fixed during this phase, documented in CLAUDE.md:** this template's
  visible URL always has one extra segment (the record id) versus its own file location,
  so it must use absolute paths (`/styles.css`, `/data/products.json`) everywhere — a
  relative path silently broke both the stylesheet and, worse, made `app.js`/`product.js`
  themselves get re-routed back to the HTML template by the same detail-page rewrite.
  Verified server-side via `wrangler pages dev` + `curl -H "Host: wintergreen..."` (correct
  content-types for every asset) since local testing has no real subdomain DNS to exercise
  client-side relative-path resolution the way production does.
- `locations/index.html`, `location.js` (new, Phase 5) — same shared-template pattern as
  products/, added to `../functions/_middleware.ts`'s `DETAIL_PAGE_TEMPLATES`. Hero is
  tinted by the location's new `environment` field (not derivable from its products alone,
  since a location can span more than one). Included Terrain reuses Phase 3's
  `.product-grid`/`.product-card` markup rather than duplicating it. Build Your Own renders
  the 3 tiers from `location.tiers`, Complete Set visually primary (accent border +
  "Recommended" badge) per DESIGN.md §23's funnel — each tier's button reuses the same
  increment-cart-badge-plus-fading-confirmation pattern as the Phase 4 product page.
  `data/locations.json` gained `environment` and `useCases` fields (documented in
  `data/README.md`); the existing tiers now bundle both seed products instead of just one,
  so Included Terrain has more than a single card to prove the grid.
  **Trigger for this phase:** Jared reported the homepage's "Explore the Location" link
  actually fell through to the *main* jaredluyster.com homepage (unstyled) rather than a
  clean 404 — Cloudflare Pages' fallback behavior for an unmatched path on this project,
  not something specific to wintergreen. Building the location page is the direct fix for
  that one link; other still-unbuilt links (Collections, Designers, About, Cart, Account)
  will show the same fallback until their own phases land — this is expected, not a
  regression, but worth remembering if it gets reported again before Phase 6/7 ship.
- `collections/index.html`, `collection.js`, `designers/index.html`, `designer.js` (new,
  Phase 6) — same shared-template pattern, both added to
  `../functions/_middleware.ts`'s `DETAIL_PAGE_TEMPLATES`. Both reuse Phase 3's
  `.product-grid`/`.product-card` markup and the `.shop-header` heading treatment rather
  than inventing new ones, per the phase brief's explicit reuse requirement. The designer
  page's "designed by X" vs. "printed & sold by Wintergreen" distinction (DESIGN.md §13)
  is a dedicated two-row `.attribution-box` component, not just prose word order, so it
  survives a skim. `designer.js` links "Shop [Designer] Terrain" to
  `/wintergreen/shop/?designer=<id>` — `shop.js` already supported that query param since
  Phase 3, no change needed there.

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
