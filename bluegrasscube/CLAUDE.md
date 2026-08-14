# Bluegrass Cube — Working Rules

This directory is the Bluegrass Cube community site (`bluegrasscube.jaredluyster.com`),
being rebuilt phase-by-phase. **Before doing any work here, read:**

1. [DESIGN.md](DESIGN.md) — the design brief. It is the source of truth for what this site is.
2. [PLAN.md](PLAN.md) — the phase tracker. Work on exactly one phase at a time.
3. The current phase's brief in [phases/](phases/).

## What this site is

A digital community bulletin board for a Lexington, KY gaming group (primarily MTG cube).
The #1 question it answers: **"What's happening this week?"** The audience is existing
members. It complements Discord and in-person events; it replaces neither.

## Hard constraints (never violate)

- **No Theros/fantasy theming.** No Greek motifs, marble, columns, parchment, Magic-card framing.
- **No single-cube identity.** "Bluegrass Cube" is the community, not one cube.
- **No SaaS/startup look.** No card grids, generic rounded cards, pills, gradients, floating
  panels, giant heroes, marketing copy, or uniform component blocks.
- **No fake DIY decoration.** No cartoon pushpins, fake tape everywhere, torn-paper effects,
  or realistic corkboard simulation. Cork surface and physical depth stay *subtle*.
- **No poster-design system.** The community makes posters; the site just displays them well.
- **No community CMS/submissions.** Jared is the sole curator.
- **No features beyond the current phase.** Do not build ahead.

The governing rule: **don't make it more designed — make it more authored.** Variation comes
from community content (posters, cube art), hierarchy from typography, cohesion from the cork
surface. Essential info (WHAT / WHEN / WHERE) is always readable before any flyer art.

## Tech rules

- Static-first: plain HTML/CSS/JS, no framework, no build step. Data lives in `data/*.json`
  until Phase 6 (admin) moves it to Cloudflare KV/R2 behind Pages Functions.
- Hosting: Cloudflare Pages project rooted at this directory (`bluegrasscube/`), custom
  domain `bluegrasscube.jaredluyster.com` (decided — but a later migration is possible,
  so use relative URLs only and keep Cloudflare-specific code confined to the Phase 6
  function layer). Functions go in `bluegrasscube/functions/`.
- Local preview: `wrangler pages dev bluegrasscube` from the repo root (or open files directly
  while the site is still pure static).
- Times are US Eastern (Lexington, KY). Recurring events are computed client-side from
  `data/events.json` rules + overrides — never hardcode dates into markup.

## Workflow per phase

1. Read the phase brief fully; read DESIGN.md sections it references.
2. Build only what the brief lists. Its acceptance criteria define "done."
3. Verify in a browser (desktop and narrow viewport) before declaring done.
4. Update PLAN.md status for the phase, commit with a descriptive message, push.
5. Stop. The next phase starts only after Jared has inspected the result.

## Existing content that must survive every phase

- Discord invite link: `https://discord.com/invite/dFCXg6QdJW`
- The cube options list (now seeded in [data/cubes.json](data/cubes.json))
