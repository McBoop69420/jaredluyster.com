# Phase 5 — Cube Directory

## Goal

The Cubes section: a directory of the group's cubes driven by `data/cubes.json`, each with
name, community context, optional thumbnail, and a link to CubeCobra. Reference area, not
the site's identity.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §18 (cubes), §23 (not uniform cards).
Then [data/cubes.json](../data/cubes.json). The old implementation (git history of
index.html, commit `f435068` and later) has working CubeCobra API usage worth referencing:
`https://cubecobra.com/cube/api/cubejson/<id>` for name/mainboard; links go to
`https://cubecobra.com/cube/list/<id>`.

## Build

- **Cubes section** reachable from the "Cubes" nav item. Each entry: display name
  (`nameOverride` wins over the CubeCobra name), the hand-curated `strategy` note when
  present, and a link out to CubeCobra. `pinned` cubes first, then alphabetical — same
  ordering the old site had.
- **Thumbnails:** use `thumbnail` path when set; otherwise try cube art from the CubeCobra
  API response (e.g. the cube's image/overview art field — inspect the cubejson response);
  otherwise a plain typographic entry is fine. Community art is the goal; don't generate
  placeholder art.
- **Presentation:** entries pinned to the board like a reference sheet or a row of small
  posted notices — varied and typography-led, not a uniform card grid.
- Handle CubeCobra API failure gracefully: the directory must still render from local
  JSON (names may fall back to overrides/IDs) with links intact.
- **Cleanup:** delete `cube.html` if nothing references it (nothing should — cards link
  straight to CubeCobra since commit `bc6c912`).

## Don't build

Local cube list viewers, card composition stats (the old computed summaries are retired
unless Jared asks for them back), cube detail pages, admin.

## Acceptance criteria

- All 9 cubes from `data/cubes.json` render; Bluegrass Cube first; nickname overrides
  ("Commander Cube", "Bangers Only Cube (Legacy+)", "Live the Dream Cube") shown.
- Every entry links to its CubeCobra list page in a new tab.
- With network blocked (simulate offline), the directory still renders with working links.
- `cube.html` removed.
- PLAN.md status updated; committed and pushed.
