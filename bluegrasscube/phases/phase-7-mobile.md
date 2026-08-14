# Phase 7 — Mobile Tuning

## Goal

Make the mobile experience deliberately about "what's happening this week," rather than a
shrunken desktop board.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §10 (mobile composition), §8
(information-first).

## Build

- **Mobile hierarchy:** first screen = this week's events, immediately, with WHAT/WHEN/
  WHERE readable without scrolling past anything decorative. Then announcements/recent
  board content, then calendar/cubes access.
- Re-examine every section at 360–430px: type scale, tap targets, poster image sizing
  (posters should never dominate the viewport or force pinch-zoom), loose-grid variation
  (rotation/offset that charms on desktop may need reducing or removing on mobile).
- Header: compact but stable; nav must not collapse into anything fussy — four items can
  stay visible or become the simplest possible menu.
- Performance pass: posters/thumbnails get `loading="lazy"` and sane dimensions; no
  layout shift when images load.
- Verify real-device behavior via at least browser devtools device emulation (test iOS
  Safari quirks: viewport units, sticky positioning) — flag anything needing a real device
  for Jared to check.

## Don't build

New features, new nav items, an app-like bottom bar, PWA/service worker.

## Acceptance criteria

- At 390×844, the first viewport answers "what's happening this week" with zero scrolling.
- No horizontal scroll 360–430px anywhere (board, calendar, cubes, an event with a
  landscape poster and one with a portrait poster).
- Lighthouse mobile performance on the board page ≥ 90 (no massive images, lazy loading in
  place).
- Desktop composition unchanged (this phase is additive media-query work, not a redesign).
- PLAN.md status updated; committed and pushed.
