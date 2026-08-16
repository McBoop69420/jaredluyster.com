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
| 7 | [phases/phase-7-mobile.md](phases/phase-7-mobile.md) | Mobile tuning: this-week-first hierarchy | done |

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
- `fonts/` (new in Phase 7) — self-hosted Inter + Space Grotesk (Latin-subset variable
  woff2, one file per family covers the whole weight range used). Replaces the Google
  Fonts `<link>`; see decisions log for why.

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
- 2026-08-16 — **Phase 7 (mobile tuning) done.** Real findings, verified with actual
  Lighthouse CLI runs (`npx lighthouse`, works fine in this environment) rather than
  guessing:
  - Zero-scroll acceptance criterion was already met going in (header + 2 event cards
    comfortably fit at 390×844) — no structural change needed there.
  - **The real performance bug:** the Google Fonts `<link>` was a confirmed
    render-blocking request (Lighthouse's render-blocking-insight: ~900ms). Measured
    mobile performance before any Phase 7 fix (both locally and against the live
    production site): ~0.54–0.68. Fixed by self-hosting (`fonts/`) — both families
    turned out to be variable fonts, so despite requesting 6 weight combinations only
    2 files were actually needed (Latin subset covers everything the copy uses,
    including em dashes/curly quotes). LCP dropped from ~10s to 1.8s, FCP 2.6s→0.8s,
    Speed Index 4.2s→0.8s.
  - Second real bug found via Lighthouse network trace: the Cubes section's 9 parallel
    CubeCobra API calls each return the cube's *entire* card list (100–450KB each,
    ~2.6MB total) and were firing immediately on page load even though Cubes sits
    below the fold. First fix attempt was an `IntersectionObserver` alone — didn't
    actually help much, since with only 3 short Upcoming Events cards and no posters,
    `#cubes` sits close enough to Lighthouse's 412×823 mobile viewport that the
    observer fires almost immediately regardless of any real scrolling. The metric
    that actually mattered was **total blocking time** (main-thread cost of parsing
    9 large JSON payloads + building 9 DOM cards), not network timing — fixed with
    `fetch(url, { priority: "low" })` on the CubeCobra calls (helps bandwidth
    contention regardless of timing) plus wrapping the actual render in
    `requestIdleCallback(renderCubes, { timeout: 2000 })` so that work is explicitly
    scheduled off the critical path. TBT 340ms→0ms. Kept the `IntersectionObserver`
    too (50px rootMargin) — still worthwhile for a page with more content above Cubes,
    where it'll skip the fetch entirely for anyone who never scrolls that far.
  - CLS fixed to 0 via `.cube-thumb { aspect-ratio: 1.4; object-fit: cover; }`
    (CubeCobra art crops are consistently landscape, so this reserves space
    accurately) — was contributing to a 0.308 CLS before. Also batched the 9 card
    insertions into one `DocumentFragment` append instead of 9 separate ones.
  - **End result: Lighthouse mobile performance 1.00 (100/100) locally**, up from a
    ~0.54–0.68 baseline (measured both locally and against the live production site
    before any Phase 7 fix).
  - `.event-poster`/`.announcement-poster` capped at `max-height: 65vh` (verified with
    an intentionally extreme 300×1400 test SVG — capped correctly, no distortion,
    since `max-width/max-height` + `width/height: auto` preserves aspect ratio) so an
    unusually tall community poster can never dominate the viewport. No fixed
    aspect/crop forced — Phase 2's "posters must support any orientation" constraint
    still holds.
  - Tap targets bumped via a `@media (max-width: 480px)` block: nav pills 32px→40px
    tall, calendar prev/next 34px→39px, `.event-where` link given padding. Not fully
    44px (the brief's "compact but stable" header constraint and the calendar's
    deliberately tight cell layout limit how far this can go), but meaningfully
    better. Loose-grid tilt also halved on mobile (`calc(var(--tilt) * 0.5)`) per the
    brief's own suggestion — verified this doesn't reintroduce overflow risk even with
    a poster-bearing card at 360px width.
  - **Flagged for Jared, not fixed (needs his Cloudflare dashboard access):** the
    live site's network trace shows Cloudflare's own auto-injected Web Analytics
    beacon (`static.cloudflareinsights.com/beacon.min.js`) as part of the request
    chain. It's loaded async (not in Lighthouse's own render-blocking-resources list),
    so it's a secondary finding, not the main fix — but if he doesn't actively want
    that beacon, it'd need disabling in the Cloudflare zone's Web Analytics settings.
  - iOS Safari real-device check requested by the brief: nothing in this codebase uses
    `position: sticky`, and the only `vh` usage is `.board{min-height:60vh}` and the
    new `max-height:65vh` poster cap — neither is the classic full-`100vh` bug case,
    but flagging per the brief's ask since I can't test real iOS Safari from here.
  - Verification note: the Browser pane's screenshot tool and `loading="lazy"`/
    `IntersectionObserver` triggering were both unreliable this session (confirmed via
    manual override that the underlying code was correct both times — see memory).
    Relied on DOM assertions (`getBoundingClientRect`, `document.fonts`, etc.) instead,
    plus real Lighthouse CLI runs for the performance numbers.
  - Follow-up same day: first Phase 7 push only got live production to ~0.72, not the
    0.92 seen locally — root cause was total blocking time (main-thread cost of the
    Cubes fetch/parse/render), not network timing; the `IntersectionObserver` alone
    wasn't enough since `#cubes` sits close enough to Lighthouse's mobile viewport that
    it fired immediately anyway. Fixed with `fetch(..., {priority:"low"})` +
    `requestIdleCallback` around `renderCubes()` + batching the 9 card insertions into
    one `DocumentFragment`. **Final verified production score: 97/100**, TBT and CLS
    both perfect (0).
- 2026-08-16 — **Official brand palette adopted.** Jared shared the real Bluegrass Cube
  brand guide (logo + fonts + 4 Pantone swatches) and chose to shift the whole site's
  palette to match rather than keep the arbitrary neubrutalist terracotta scheme.
  `board.css` tokens updated: `--ink` → Pantone 286 navy `#071b2c` (this is also the
  logo's own background plate, so the header now reads as one continuous surface with
  the logo rather than a boxed placeholder once it's added), `--cork` → Pantone 7530
  taupe `#a59482`, `--accent` → Pantone 7505 brown `#83603f`, new `--muted` token for
  Pantone Cool Gray 4 `#bdbbbb` (used on the calendar's out-of-month day cells).
  `--paper` (`#f7f3ec`) and `--link` (unchanged blue) aren't official swatches — no
  light neutral exists in the brand guide, so `--paper` stays close to the family,
  picking up warmth from the logo's own cream lettering; `--link` is a functional
  "this is clickable" affordance, not a brand-identity color. All color usage was
  already tokenized (verified via grep — zero hardcoded hex outside `:root`), so this
  was a clean 4-value swap, not a file-by-file hunt. **Still pending:** Jared hasn't
  sent the actual logo image file yet — the header still uses the circle placeholder
  from Phase 1, just recolored. Swap it for the real logo once he sends an isolated
  asset (ideally transparent PNG or SVG).
