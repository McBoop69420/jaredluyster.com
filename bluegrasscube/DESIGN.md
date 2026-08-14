# Bluegrass Cube Redesign — Design Brief

This is the agreed design direction, distilled from the planning conversation. It is the
source of truth. If an implementation choice conflicts with this document, this document wins.

## 1. Core concept

The site is **not** a website about one cube. It is a **digital community bulletin board**
for a Lexington, Kentucky gaming group, primarily focused on Magic: The Gathering. The
individual cubes are things the community plays and maintains — they are not the identity
of the site. The site should feel like a college/community bulletin board that happens to
exist online.

## 2. Primary purpose

The primary question the site answers: **"What's happening this week?"**

- Primary audience: existing members of the group (not first-time discovery).
- The site does not replace Discord. The relationship:
  - **Discord** — ongoing conversation/community
  - **In-person events** — the actual community activity
  - **Website** — shared bulletin board connecting the two

## 3. Community facts

- Location: Lexington, Kentucky. Primary comms: Discord. Primary activity: in-person events.
- Regular schedule (typically the only 1–2 events per week):
  - **Thursday** — Cube Night, 6:30–10:00 PM, Tabletop Tavern
  - **Saturday** — Cube Night, Noon–4:00 PM, Tabletop Tavern

## 4. Event philosophy

Recurring Thursday/Saturday events are **built into the system automatically**, but must be
**overridable**: cancel a Thursday, change a Saturday, add a special event, replace the
normal activity. Model: **automatic recurring schedule + manual overrides.**

Essential event information is deliberately simple: **WHAT / WHEN / WHERE.** Do not require
more unless it is actually useful.

## 5–6. Visual concept: "organized DIY"

Target: a real community corkboard translated into a website. Organized, DIY,
community-created, slightly imperfect, varied, information-rich, practical. Not polished,
corporate, startup, SaaS, or AI-generated-looking. It should feel maintained because the
community uses it.

**DIY comes from real community content, not fake decoration.** Explicitly banned:
cartoon pushpins everywhere, fake tape everywhere, excessive torn-paper effects, realistic
corkboard simulation, deliberately messy design, random visual noise. Community-made flyers
(polished, amateur, weird, minimal — all fine) provide the variation; the website provides
the common environment where they coexist.

## 7. Posters/flyers

Community members create posters → posters go on the physical bulletin board → the same
posters get uploaded to the website. The site encourages that physical activity; it does
**not** design posters or provide a poster system.

Poster behavior:
- Posters vary substantially; portrait and landscape both work; different dimensions supported.
- Posters are not forced into identical website cards.
- Posters get subtle physical depth.
- The poster is always secondary to the event information.

## 8. Information-first

The essential info must be immediately readable; the flyer adds personality. Conceptually:

> THURSDAY CUBE NIGHT / 6:30–10:00 PM / Tabletop Tavern / [community flyer]

Flyer + info read as one bulletin-board announcement, not two unrelated UI components.

## 9–10. Desktop vs. mobile

- **Desktop:** one large bulletin-board composition visible immediately. The first viewport
  is a collection of community activity — never hero/feature-cards/CTA/marketing sections.
- **Mobile:** prioritize "what's happening this week" first, then the rest of the board,
  linearized — not a shrunken desktop board.

## 11–12. Board surface & physical realism

- Cork is the site's primary surface: edge-to-edge, natural warm cork, moderately visible
  around content, no frame, not inside a conventional website section. **The browser becomes
  the bulletin board.**
- Physical effects are very subtle: slight shadows, slight sense flyers sit on cork, maybe
  minor positional variation. No heavy 3D, exaggerated shadows, or object simulation.
- Desired reaction: "this feels like a bulletin board" — not "this website is pretending
  to be a bulletin board."

## 13. Layout

A **loose grid** — not rigid, not freeform. Enough structure to feel organized, while
allowing different flyer sizes, orientations, visual weights, slight positional variation.
This is the visual expression of "organized DIY."

## 14. Time and history

Current activity gets the most prominence; recent activity stays on the board; older
material becomes **visually quieter** rather than disappearing. **Recency affects visual
prominence, not existence.** The community's history accumulates on the board.

## 15–16. Header, logo, branding

- Keep a conventional website header: clean, stable, predictable, branded, easy to navigate —
  but visually connected to the board, not a separate-looking site. Hybrid: header + board.
- Keep existing Bluegrass Cube branding; we're redesigning presentation, not the brand.
- **No logo file exists yet — use a circle placeholder.** No tagline. Identity is simply
  "Bluegrass Cube."

## 17. Navigation (initial, do not invent more)

**This Week · Calendar · Cubes · Discord**

## 18. Cubes

A directory/reference area, not the site's identity. Each cube gets: community-created
thumbnail/art (ideally pulled from CubeCobra), name, a small amount of community context,
and a link to its CubeCobra page. Detailed cube info stays on CubeCobra — don't duplicate it.

## 19. Content that must be preserved

Only two hard requirements from the current site: **the Discord link** and **the cube
options list.** Everything else can be reconsidered.

## 20. Maintenance

Jared is the sole curator. Community creates posters/art; Jared controls what appears.
Target: **low maintenance** via a simple admin interface (Add Event: what, date, start,
end, where, poster, publish) — same principle for cubes, announcements, calendar items.
No community submission system.

## 21. Technical approach

Experience first, technology second. Build the real functional website (not a static visual
prototype), but **incrementally** so the real site can be inspected after each stage.

## 22. Build progression

See [PLAN.md](PLAN.md) — Phases 1–7 (shell → this week → community board → calendar →
cubes → admin → mobile tuning).

## 23. The major design rule

**Do not make the website more "designed." Make it more authored.**

Avoid: card grids, generic rounded cards, SaaS layouts, excessive shadows, gradients, pills,
floating UI panels, giant hero sections, uniform component blocks, excessive symmetry,
generic AI-generated layouts.

Instead: let community content create variation; let typography establish hierarchy; let
cork provide the common surface; let flyers provide personality; keep underlying structure
organized; keep essential information extremely clear.

## 24. Hard "NOT doing" list

- No Theros theme (Greek aesthetic, mythology, marble, columns, parchment, fantasy styling,
  Theros palette, Magic-card framing).
- No single-cube identity.
- No card-based website design (flyers are not cards).
- No poster-design project.
- No heavy physical-board simulation (subtle cork + subtle depth only).
- No community CMS/submission system.
- No unnecessary features yet.

## 25. Hosting decision

**Decided (2026-08-14): everything stays on the current URL,
bluegrasscube.jaredluyster.com**, on the Cloudflare Pages project rooted at
`bluegrasscube/` (see repo-root INFRASTRUCTURE.md §1b). Static-first through Phase 5;
Phase 6 adds Pages Functions + Cloudflare KV (event/cube data) + R2 (poster uploads).

The site **might migrate later** (different domain and/or host). Keep it portable:
no hardcoded absolute URLs to the current domain, and keep Cloudflare-specific coupling
confined to Phase 6's thin function layer (data shapes stay the same JSON the static
files use, so the storage backend can be swapped without touching the pages).
