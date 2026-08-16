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
| 5 | [phases/phase-5-cubes.md](phases/phase-5-cubes.md) | Cube directory: CubeCobra links, thumbnails, community context | done |
| 6 | [phases/phase-6-admin.md](phases/phase-6-admin.md) | Admin interface: events, posters, cubes, announcements (KV + R2) | **tabled** — see decisions log 2026-08-16 |
| 7 | [phases/phase-7-mobile.md](phases/phase-7-mobile.md) | Mobile tuning: this-week-first hierarchy | not started |

## Current state of this directory

- `index.html` — the site shell (header, nav, cork surface) plus `#upcoming-events` and
  `#cubes`, both populated at runtime (`board.js` and `cubes.js` respectively). Cubes
  moved here from its own page in Phase 5 (see decisions log, 2026-08-16) — Jared wanted
  it below Upcoming Events on the same page, not a separate nav destination. Directory
  of the group's cubes as a reference sheet, not a uniform card grid — reuses
  `.board-grid` (the loose grid from Announcements) so cards vary naturally by content
  (thumbnail or not, strategy note or not) rather than by any artificial size hierarchy.
  No cube, including the pinned one, is styled bigger/more prominent than the rest
  (DESIGN.md: no single-cube identity).
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
  normally happen but doesn't" transparently). Each event line also shows location
  (` · Tabletop Tavern`, de-emphasized) per 2026-08-16 community feedback — see
  decisions log.
- `cubes.js` (new in Phase 5, moved to run on index.html 2026-08-16) — fetches
  `data/cubes.json` (source of truth for id, pinned, nameOverride, thumbnail, strategy),
  then fetches each cube's CubeCobra API entry in parallel (`Promise.all`, each wrapped
  in its own try/catch) to fill in a display name and cover-art thumbnail (`image.uri`
  in the API response) when the local data doesn't already have one. Every card's
  CubeCobra link is built from the local `id` alone, so the directory always renders
  with working links even if CubeCobra is completely unreachable — verified by stubbing
  `fetch` to reject for cubecobra.com and confirming all 9 cards still render (falling
  back to `nameOverride` or the raw id) with correct links. Sort: pinned first, then
  alphabetical by whatever display name is known. Relies on `hashString`/
  `seededRotation` from `events.js` (loaded first on index.html) rather than defining
  its own copies now that both scripts run on the same page.
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
the Pages project isn't connected yet. Pure static, indefinitely (Phase 6/KV/R2/admin
tabled) — deploy is just a push. Local preview: `wrangler pages dev bluegrasscube` from
repo root.

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
- 2026-08-16 — **Phase 6 (admin interface) tabled.** Asked Jared to choose an auth
  approach and who'd provision the KV namespace/R2 bucket (wrangler isn't authenticated
  on this machine, so Cloudflare resource creation needs his account either way); his
  answer: "let's table admin access for now. I just want this to be a bulletin board
  that only we update." No auth, no KV, no R2, no Pages Functions — the manual
  edit-JSON-and-push workflow from Phases 2–5 stays as-is indefinitely. Don't re-propose
  Phase 6 unprompted; only pick it back up if Jared brings it up.
- 2026-08-16 — Cubes moved from its own page (`cubes.html`, Phase 5) into a section on
  `index.html` below Upcoming Events, and dropped from the nav entirely — Jared: "I want
  the cubes to be on this page below the upcoming events section. It doesn't need to be
  in the nav bar." `cubes.html` deleted (content relocated, not duplicated); nav is now
  just Upcoming Events · Calendar · Discord on every page.
- 2026-08-16 — Community feedback relayed via Jared (Discord, from "riahim"): asked
  about clicking an event for more detail (description/location) on Calendar or
  Upcoming Events, then self-resolved to "I guess you already have the location in the
  upcoming events. Maybe just add it to the calendar" — no click-to-expand UI built;
  each calendar day cell's event line now also shows location, de-emphasized after the
  what text (`6:30p Cube Night · Tabletop Tavern`).
- 2026-08-16 — Saturday recurring event renamed from "Cube Night" to
  "Saturday Drafternoon" (Jared). Only the recurring rule's `what` changed — the
  2026-09-05 birthday-draft override already sets its own `what` and is unaffected.
- 2026-08-16 — Location text (Upcoming Events + Calendar) is now a Google Maps search
  link (`events.js` → `mapsUrl()`), skipped for "TBD". A plain name search landed on a
  stale listing for Tabletop Tavern — Jared: "They are on southland drive now" — so
  `MAPS_QUERY_OVERRIDES` in `events.js` sends a more specific query for known venues
  while keeping the displayed text just the venue name. Add future venues to that map
  if a plain "<name>, Lexington, KY" search ever turns out wrong for them too.
