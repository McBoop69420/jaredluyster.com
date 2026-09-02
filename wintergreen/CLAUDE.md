# Wintergreen — Working Rules

This directory is a premium tabletop-terrain storefront (`wintergreen.jaredluyster.com`),
built phase-by-phase. **Before doing any work here, read:**

1. [DESIGN.md](DESIGN.md) — the design brief. It is the source of truth for what this site is.
2. [PLAN.md](PLAN.md) — the phase tracker. Work on exactly one phase at a time.
3. The current phase's brief in [phases/](phases/).

## What this site is

A premium e-commerce storefront selling commercially licensed, professionally 3D-printed
tabletop terrain. It sells **complete environments** (locations built from multiple
products) as the primary asset, not just individual terrain pieces. See DESIGN.md §1–3, 23.

**Online-only — decided 2026-09-02.** No physical storefront/showroom exists (a physical
location may come later, but isn't part of this build). Don't add a "Visit Us" section,
store hours, a physical address, or in-person pickup as a checkout/fulfillment option to
the About page, footer, or Shipping accordion (DESIGN.md §11) — shipping is the only
fulfillment path until this changes.

## Hard constraints (never violate)

See DESIGN.md §24 in full. In short: no fantasy-themed decorative UI by default, no
parchment/medieval borders, no dragons/swords/shields/dice as decoration, no gradient-heavy
or excessive-gold design, no ornate product cards, no purposeless animation, no decorative
filler graphics, never treat this as an STL download marketplace, and the homepage must
never degrade into a generic product grid. Terrain photography carries the atmosphere —
the UI stays restrained (DESIGN.md §3, 14).

## The data model, never simplify away

A product can belong to multiple categories, an environment, a collection, **and** one or
more locations, all at once (DESIGN.md §21). Never build a rigid single-parent category
system — the JSON schema and any future backend must support many-to-many relationships
between products, collections, and locations from the start.

## Record-detail page templates (products/, and locations/collections/designers later)

A detail page (e.g. `/wintergreen/products/<id>/`) is served by ONE template file per
entity type (`products/index.html`) via a rewrite in `functions/_middleware.ts`
(`DETAIL_PAGE_TEMPLATES`) — there's no per-record file. This means the browser's visible
URL always has one more path segment (the record id) than the template file's own real
location, so a normal relative path like `../styles.css` resolves one level too shallow —
confirmed live in Phase 4 (it broke `styles.css` entirely and made `app.js`/`product.js`
silently serve HTML content, since the rewrite matched those wrong paths too). **Every
`<link>`/`<script>` in a detail-page template, and every `fetch()` in its JS, must use an
absolute path (`/styles.css`, `/data/products.json`) instead of a relative one.** This
trades off path-form access (`jaredluyster.com/wintergreen/products/<id>/`) for that one
page type — absolute paths only resolve correctly through the subdomain's rewrite — which
is an accepted tradeoff, not a bug to fix later. When Phase 5/6 add their own detail
templates (`locations/index.html` etc.), copy this pattern, not the relative-path one used
by `shop/index.html` (which is fine there, since `/shop/` is a real directory, not a
synthetic id segment).

## Tech rules

- Static-first, no build step: plain HTML/CSS/JS. Data lives in `data/*.json`.
- **Cache-busting, required on every CSS/JS change.** Cloudflare Pages serves `styles.css`/
  `app.js`/`home.js` with `Cache-Control: public, max-age=86400` and does not purge
  browser or edge caches on redeploy (same gotcha `bluegrasscube` hit — see its
  INFRASTRUCTURE.md note). A browser that visited before your change can keep serving a
  stale stylesheet for up to 24h, and even a hard reload doesn't reliably bypass it.
  Whenever you edit `styles.css`, `app.js`, or `home.js`, bump the `?v=N` query string on
  every `<link>`/`<script>` tag that loads it in every HTML file that references it — that
  changes the cache key and forces a fresh fetch. Don't skip this "just to check" during a
  phase; it's cheap and the alternative is silently shipping stale styles.
- **No cart/checkout backend for now** — decided 2026-09-02. The catalog (homepage, shop,
  product/location/collection/designer pages) is the current scope. A cart UI may be built
  to spec but must not claim to process real orders until a backend exists. Don't add
  payment integration, inventory, or accounts speculatively.
- **Placeholder content, not real content** — decided 2026-09-02. Sample products,
  locations, designers, and photography are invented to match the spec's structure, not
  sourced from a real supplier yet. Keep placeholder text clearly generic/realistic rather
  than jokey, since it doubles as a preview of real content later.
- Hosting: same Cloudflare Pages project as the rest of jaredluyster.com
  (`functions/_middleware.ts` → `SUBDOMAIN_ROOTS.wintergreen = "/wintergreen"`), custom
  domain `wintergreen.jaredluyster.com` already configured. Deploys with every push to
  `main` — no separate Pages project.
- Local preview: serve the repo root (e.g. `python -m http.server` from the repo root, or
  `wrangler pages dev .`) and open `/wintergreen/`.

## Workflow per phase

1. Read the phase brief fully; read the DESIGN.md sections it references.
2. Build only what the brief lists. Its acceptance criteria define "done."
3. Verify in a browser (desktop and narrow viewport) before declaring done.
4. Update PLAN.md status for the phase, commit with a descriptive message.
5. Stop. The next phase starts only after Jared has inspected the result.
