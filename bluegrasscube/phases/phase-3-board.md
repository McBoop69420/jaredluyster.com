# Phase 3 — Community Board

## Goal

Grow the This Week section into the full bulletin-board composition: announcements and
recent flyers arranged in a loose grid, with current material prominent and older material
visually quieter.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §9 (desktop composition), §13 (loose
grid), §14 (time and history).

## Build

- **`data/announcements.json`** (new): curated items with `date`, `title`, optional `body`,
  optional `poster`/image, optional `link`. Same `_example` convention as events.json.
- **Board composition (desktop):** one large composition visible immediately — This Week
  events (most prominent) plus announcements and recent flyers around them. Loose grid:
  CSS grid/columns with varied spans and slight, deterministic variation (e.g. small
  rotation/offset seeded from item id — NOT random per page load). Different sizes and
  orientations coexist; items are not uniform cards.
- **Recency fade:** items older than a few weeks get visually quieter (smaller, lower
  contrast, less prominent placement) but stay on the board. Pick simple thresholds
  (e.g. current week / last month / older) and document them in a comment.
- **Mobile:** for now, linearize in priority order (This Week first). Real mobile tuning
  is Phase 7.

## Don't build

Calendar, cube directory, admin. No pagination/archive page yet — quiet old items are
enough. No decoration systems (pushpins/tape).

## Acceptance criteria

- Board renders This Week + at least two seeded announcements as one composition; the
  first desktop viewport is community activity, not marketing structure.
- Variation is subtle and stable across reloads (same item always sits the same way).
- An announcement dated months ago renders visibly quieter than a current one.
- No horizontal scroll at 360px; mobile order puts This Week first.
- PLAN.md status updated; committed and pushed.
