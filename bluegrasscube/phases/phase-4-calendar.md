# Phase 4 — Calendar

## Goal

A calendar view of the longer-term schedule, driven by the exact same event data and
engine as This Week — recurring rules, overrides, and specials all appear correctly.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §4 (event philosophy), §14 (time).
Reuse the Phase 2 event engine — if it's embedded in index.html, extract it to a shared
`events.js` first rather than duplicating logic.

## Build

- **Calendar section/page** reachable from the "Calendar" nav item. A month view is the
  default; simple prev/next month navigation. Style it like something pinned to the board
  (a printed schedule sheet), not a SaaS calendar widget — typography-first, minimal chrome.
- Each day with an event shows WHAT + time compactly; cancelled recurring instances either
  disappear or show struck-through (pick one, be consistent).
- Past days render quieter than upcoming days.
- Decide single-page (calendar as a section of index.html) vs. separate `calendar.html`
  based on what keeps the board composition clean — either is acceptable; keep nav honest.

## Don't build

Event detail pages, ICS export, RSVPs, admin. Don't re-implement recurrence logic.

## Acceptance criteria

- Current month shows every Thursday and Saturday Cube Night generated from the recurring
  rules; a test override/special (added locally, removed before commit) appears correctly.
- Prev/next month navigation works, including across year boundaries.
- Calendar and This Week never disagree (shared engine, single data source).
- Usable at 360px width.
- PLAN.md status updated; committed and pushed.
