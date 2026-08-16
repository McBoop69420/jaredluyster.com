# Bluegrass Cube Redesign — Phase Tracker

Rules of engagement: one phase per session, in order. Read [CLAUDE.md](CLAUDE.md) and
[DESIGN.md](DESIGN.md) first, then the phase brief. A phase is done when its acceptance
criteria pass in a real browser AND Jared has inspected it. Update the status column here
when a phase's build work is complete.

| Phase | Brief | Scope | Status |
|-------|-------|-------|--------|
| 1 | [phases/phase-1-shell.md](phases/phase-1-shell.md) | Site shell: header, logo placeholder, nav, cork surface, responsive basics | done |
| 2 | [phases/phase-2-this-week.md](phases/phase-2-this-week.md) | This Week: recurring events, overrides, posters, WHAT/WHEN/WHERE | done |
| 3 | [phases/phase-3-board.md](phases/phase-3-board.md) | Community board: announcements, recent flyers, loose grid, recency fade | done |
| 4 | [phases/phase-4-calendar.md](phases/phase-4-calendar.md) | Calendar view from shared event data | done |
| 5 | [phases/phase-5-cubes.md](phases/phase-5-cubes.md) | Cube directory: CubeCobra links, thumbnails, community context | not started |
| 6 | [phases/phase-6-admin.md](phases/phase-6-admin.md) | Admin interface: events, posters, cubes, announcements (KV + R2) | not started |
| 7 | [phases/phase-7-mobile.md](phases/phase-7-mobile.md) | Mobile tuning: this-week-first hierarchy | not started |

## Current state of this directory

- `index.html` — the site shell (header, nav, cork surface) plus `#upcoming-events`,
  populated at runtime by `board.js`. Phase 5 pins more content into `.board`.
- `calendar.html` (new in Phase 4) — separate page, same header/nav/cork treatment,
  reachable from the "Calendar" nav item. Month-grid view styled as a printed schedule
  sheet pinned to the board (thick border, hard offset shadow, hairline grid — not a
  SaaS calendar widget), with prev/next navigation.
- `events.js` (new in Phase 4) — shared event engine, no DOM. Extracted out of `board.js`
  per the Phase 4 brief so `calendar.html` and `index.html` compute the schedule
  identically from the same data and can never disagree. Exposes the date/time helpers
  plus `resolveRecurringInRange`/`resolveSpecialsInRange` (raw resolved instances for an
  arbitrary date range, cancelled ones included with a `cancelled` flag rather than
  dropped) and `buildUpcomingEvents` (the near-term list, cancelled omitted). Loaded
  before `board.js`/`calendar.js` on their respective pages.
- `board.css` — shared stylesheet (shell + event-card + announcement-card +
  calendar-sheet styles), reused by later phases.
- `board.js` — index.html rendering only now (DOM/fetch), built on top of `events.js`.
  Upcoming Events: fetches `data/events.json`, calls `buildUpcomingEvents`, dims passed
  events, shows a fallback when there's nothing upcoming. Announcements: reads
  `data/announcements.json`, sorts newest-first, buckets each into current/recent/old
  by age (`RECENCY_CURRENT_DAYS`/`RECENCY_RECENT_DAYS` — 14/60 days) for the recency-fade
  look, gives current items with a poster a wider "featured" grid span. **Currently
  disabled** (2026-08-16, Jared: "doesn't make sense yet") — the function is fully built
  and the CSS is in place, but nothing in `index.html` calls it or hooks into it. To
  re-enable: re-add the `#announcements-section` markup (see the Phase 3 commit) and
  call `renderAnnouncements()` in the `DOMContentLoaded` handler. Rotation on both event
  and announcement cards is deterministic (hashed from date+title), not random per
  reload. Both fetches use `cache: "no-store"` so edits to the JSON files show up
  immediately.
- `calendar.js` (new in Phase 4) — index.html-analog for calendar.html: builds a
  6-week month grid (including adjacent-month padding days, which correctly show any
  real events landing on those visible dates — e.g. the Sept 5 override shows as a
  muted padding-day cell in August's grid), groups events by date, marks past days and
  today, and renders cancelled recurring instances **struck-through** (chosen over
  disappearing per the phase brief — "pick one, be consistent" — since Upcoming Events
  already omits cancelled ones and the calendar benefits from showing "this would
  normally happen but doesn't" transparently).
- `cube.html` — old local cube viewer, no longer linked from index.html (cards now link
  straight to CubeCobra). Delete it during Phase 5 unless something still uses it.
- `data/events.json` — recurring rules + `_example` override/special (left in place as
  format documentation) + one real override: 2026-09-05 Saturday Cube Night is replaced
  by Jared's birthday roto draft. Add real overrides/specials by editing this file
  directly until Phase 6's admin UI exists.
- `data/announcements.json` (new in Phase 3) — curated board posts: `_example` entry +
  two real ones (the roto-draft heads-up, linking to Discord; the site-launch post).
  Same manual-edit-for-now workflow as events.json.
- `data/cubes.json` — cube directory data migrated from old index.html inline JS
  (IDs, name overrides, strategy notes, pinned flag).
- `posters/` — created in Phase 2, currently just a `.gitkeep`. Drop a poster image here
  and reference its path (`posters/filename.ext`) from an event's or announcement's
  `poster` field.

## Deployment

Cloudflare Pages project rooted at `bluegrasscube/`, custom domain
`bluegrasscube.jaredluyster.com`. INFRASTRUCTURE.md (repo root, §1b) has the setup steps if
the Pages project isn't connected yet. Pure static through Phase 5 — deploy is just a push.
Local preview: `wrangler pages dev bluegrasscube` from repo root.

## Decisions log

- 2026-08-14 — Scaffolded. Static JSON data through Phase 5; KV + R2 + Pages Functions
  in Phase 6.
- 2026-08-14 — Hosting decided: everything stays at bluegrasscube.jaredluyster.com on the
  existing Cloudflare Pages project. A later migration is possible, so keep the site
  portable (relative URLs only; Cloudflare coupling confined to Phase 6's function layer).
- 2026-08-16 — "This Week" renamed to "Upcoming Events" and its window broadened
  (this week's recurring instances + future replace-overrides + all upcoming specials,
  not just the current Sun–Sat week) after Jared asked to see a birthday roto draft
  scheduled weeks out. Announcements section turned off — built, but "doesn't make sense
  yet" with only a couple of posts; revisit once there's more to show.
