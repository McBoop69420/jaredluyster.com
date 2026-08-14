# Phase 1 — Basic Site Shell

## Goal

Replace the old `index.html` with the skeleton of the bulletin-board site: header, nav,
cork surface, responsive basics. No event content yet — this phase is about getting the
surface and frame right so everything later has a home.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) — especially §5–6 (organized DIY),
§11–13 (cork surface, subtle realism, loose grid), §15–17 (header, branding, nav).

## Build

- New `index.html` (replace the old one entirely — its data is already saved in `data/`).
- Shared stylesheet `board.css` (later phases will reuse it; keep it in this directory).
- **Header:** conventional, clean, stable. Circle placeholder for the logo (no logo file
  exists), "Bluegrass Cube" as the identity, no tagline. Nav: **This Week · Calendar ·
  Cubes · Discord**. Discord links out to the invite (`data/cubes.json` → `discord.invite`);
  the other three can be in-page anchors or stub sections for now. The header should feel
  connected to the board below it — same world, not a separate corporate bar.
- **Cork surface:** edge-to-edge warm cork as the page background. Subtle texture — CSS
  (layered gradients/noise) is fine; a small tiled image is fine; heavy photorealistic cork
  is not. No frame around it, no "board inside a website section."
- **Placeholder board area:** an empty or lightly-stubbed region where Phase 2/3 content
  will pin. A simple "board coming together" note pinned like a small paper slip is fine —
  one, not a decoration system.
- **Responsive basics:** the shell must not break from 360px to 1440px wide. Fine-tuning
  is Phase 7; not-broken is required now.

## Don't build

Events, posters, calendar, cube directory, admin, any additional nav items, any decorative
pushpin/tape system. Don't delete `cube.html` yet.

## Acceptance criteria

- Old dark SaaS page is gone; cork-surfaced shell loads with header + 4 nav items.
- Discord nav item opens the invite in a new tab.
- Circle logo placeholder + "Bluegrass Cube" wordmark in header.
- No horizontal scrollbar at 360px, 768px, 1280px widths.
- Nothing on the page violates the DESIGN.md §23–24 bans (no gradient-heavy panels, pills,
  hero sections, fake tape/pushpins everywhere).
- PLAN.md status updated; committed and pushed.
