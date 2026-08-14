# Phase 2 — This Week

## Goal

The real event system: the board answers "what's happening this week?" from
`data/events.json` — recurring Thursday/Saturday events computed automatically, with
overrides and one-off specials, each shown as WHAT / WHEN / WHERE plus an optional
community poster.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §2–4 (purpose, schedule, event
philosophy), §7–8 (posters, information-first). Then [data/events.json](../data/events.json).

## Build

- **Event engine (plain JS, client-side):** given today's date (US Eastern), produce the
  current week's events from `events.json`:
  1. Generate instances of each `recurring` rule for the current week.
  2. Apply `overrides` matching that date + `recurringId` (`cancel` removes it; `replace`
     merges the supplied fields over the recurring instance).
  3. Add `specials` falling in the week.
  4. Sort chronologically. Skip entries with `_example: true`.
- **This Week section** on the board: each event is one bulletin-board announcement —
  WHAT (big), WHEN (day + time range), WHERE. Typography does the hierarchy. A passed
  event this week can dim slightly (recency = prominence, DESIGN.md §14).
- **Poster display:** if an event has a `poster` path, show the image as part of the same
  announcement (not a separate card). Portrait and landscape must both look natural —
  don't force a crop or fixed aspect. Subtle shadow so it sits on the cork. Create the
  `posters/` directory (add a `.gitkeep`). Info stays readable with or without a poster.
- **Empty week handling:** if everything is cancelled, say so plainly ("Nothing on the
  board this week") rather than showing a blank region.

## Don't build

Announcements/general board content (Phase 3), calendar (Phase 4), admin (Phase 6). No
poster upload UI — posters are added by dropping files into `posters/` and referencing
them in `events.json` for now.

## Acceptance criteria

- With unmodified seed data, the current week shows Thursday Cube Night (6:30–10:00 PM)
  and Saturday Cube Night (Noon–4:00 PM) at Tabletop Tavern, and the `_example` entries
  do NOT appear.
- Manually adding a real `cancel` override removes that instance; a `replace` override
  changes only the supplied fields; a real special event appears on the right day.
  (Test all three locally, then remove the test entries before committing.)
- An event with a poster shows the image inside the announcement, both orientations OK.
- WHAT/WHEN/WHERE readable at a glance on desktop and at 360px.
- PLAN.md status updated; committed and pushed.
