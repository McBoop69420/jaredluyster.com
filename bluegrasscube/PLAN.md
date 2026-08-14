# Bluegrass Cube Redesign — Phase Tracker

Rules of engagement: one phase per session, in order. Read [CLAUDE.md](CLAUDE.md) and
[DESIGN.md](DESIGN.md) first, then the phase brief. A phase is done when its acceptance
criteria pass in a real browser AND Jared has inspected it. Update the status column here
when a phase's build work is complete.

| Phase | Brief | Scope | Status |
|-------|-------|-------|--------|
| 1 | [phases/phase-1-shell.md](phases/phase-1-shell.md) | Site shell: header, logo placeholder, nav, cork surface, responsive basics | done |
| 2 | [phases/phase-2-this-week.md](phases/phase-2-this-week.md) | This Week: recurring events, overrides, posters, WHAT/WHEN/WHERE | not started |
| 3 | [phases/phase-3-board.md](phases/phase-3-board.md) | Community board: announcements, recent flyers, loose grid, recency fade | not started |
| 4 | [phases/phase-4-calendar.md](phases/phase-4-calendar.md) | Calendar view from shared event data | not started |
| 5 | [phases/phase-5-cubes.md](phases/phase-5-cubes.md) | Cube directory: CubeCobra links, thumbnails, community context | not started |
| 6 | [phases/phase-6-admin.md](phases/phase-6-admin.md) | Admin interface: events, posters, cubes, announcements (KV + R2) | not started |
| 7 | [phases/phase-7-mobile.md](phases/phase-7-mobile.md) | Mobile tuning: this-week-first hierarchy | not started |

## Current state of this directory

- `index.html` — the Phase 1 bulletin-board shell (header, nav, cork surface, placeholder
  board). Content-empty by design; Phases 2–5 pin real content into `.board`.
- `board.css` — shared stylesheet for the shell, reused by later phases.
- `cube.html` — old local cube viewer, no longer linked from index.html (cards now link
  straight to CubeCobra). Delete it during Phase 5 unless something still uses it.
- `data/events.json` — seed event data: recurring rules + empty overrides/specials.
- `data/cubes.json` — cube directory data migrated from old index.html inline JS
  (IDs, name overrides, strategy notes, pinned flag).
- `posters/` — created in Phase 2; community poster images live here until Phase 6 moves
  uploads to R2.

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
