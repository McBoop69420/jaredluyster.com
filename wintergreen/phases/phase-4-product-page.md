# Phase 4 — Product Detail Page

## Goal

Build the individual product page: gallery, scale communication, and detail accordions.

## Read first

[DESIGN.md](../DESIGN.md) §11 (product page), §12 (scale communication — treat as a major
requirement, not an afterthought), §15 (image aspect ratios).

## Build

- Image gallery (left): clean product shot, product-in-environment shot, scale reference,
  alternate angle, detail shot. Placeholder images are fine but must be distinguishable
  from each other (don't reuse one image five times).
- Right column: category label, product name, price, short description, dimensions
  (width/depth/height), print material if applicable, full-width **Add to Cart** button.
  Per CLAUDE.md, this button is UI-only for now — no real cart/checkout exists — but it
  must look and behave like the real thing (Phase 7 wires up the actual cart UI it feeds).
- Scale communication block: dimension + a simple miniature-silhouette graphic for visual
  reference (DESIGN.md §12) — an SVG silhouette is enough, doesn't need to be photographic.
- Accordion sections: Description, Dimensions, Designer, Print Information, Shipping.
  Designer accordion links to that designer's page (stub URL until Phase 6).

## Don't build

Real cart state/checkout, location/collection/designer page content, search.

## Acceptance criteria

- Gallery, scale block, and all five accordions present and functional (accordions
  expand/collapse).
- Scale is understandable without mental unit conversion (dimension + silhouette shown
  together).
- Add to Cart button present and styled per DESIGN.md §16 but does not silently pretend to
  complete a purchase (e.g., a toast/confirmation is fine; a fake order confirmation is not).
- PLAN.md status updated; committed.
