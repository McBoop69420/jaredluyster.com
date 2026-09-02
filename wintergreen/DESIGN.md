# Wintergreen — Design Brief

Source of truth for what this site is and looks like. Read this before doing any work in
this directory. Original brief supplied by Jared 2026-09-02; reorganized here for reference,
content unchanged.

## 1. Project Goal

Build a premium e-commerce website for a business selling commercially licensed,
professionally 3D-printed tabletop terrain.

The site should **not** feel like:

- An STL marketplace
- An Etsy storefront
- A generic 3D-printing service
- A cluttered hobby catalog

It should feel like a **premium tabletop world-building company**.

The primary differentiator is the ability to show customers complete, playable
environments assembled from the products: temples, harbors, desert settlements, dungeons,
medieval towns, and similar locations.

Visual hierarchy, in order: **finished world → playable location → collection →
individual terrain pieces.** Individual products matter, but complete environments are the
primary marketing asset.

## 2. Brand Positioning

**Core concept:** *Bring your tabletop world to life.*

The company professionally prints commercially licensed designs from established terrain
creators and curates them into usable tabletop environments.

The brand should communicate: quality, scale, creativity, craftsmanship, discovery,
immersion.

Avoid language or visual choices that make the company feel like it merely resells files
or operates a collection of printers.

## 3. Overall Visual Direction

Combine: premium specialty retail, modern editorial photography, tabletop fantasy, subtle
workshop/craftsmanship, clean contemporary e-commerce.

Dark and atmospheric, but not difficult to navigate.

**Reference feeling:** high-end gaming product company, boutique tabletop retailer,
cinematic photography portfolio.

**Avoid:** fake parchment UI, excessive medieval fonts, wood-texture backgrounds, faux
fantasy game interfaces, heavy gradients, excessive decorative borders, cartoonish icons,
AI-generated fantasy backgrounds.

The terrain photography should provide almost all of the fantasy atmosphere.

## 4. Color System

| Token | Name | Hex | Use |
|---|---|---|---|
| `--bg` | Near Black | `#121416` | Primary site background |
| `--surface` | Charcoal | `#1C2024` | Cards, nav surfaces, product info panels, footer |
| `--surface-elevated` | Slate | `#272C31` | Hover states, elevated UI elements |
| `--text` | (warm off-white) | `#F2F0EA` | Primary text. Avoid pure white anywhere. |
| `--text-secondary` | — | `#A8AFB5` | Descriptions, supporting info |
| `--accent` | Muted Gold | `#C79B45` | Primary buttons, small highlights, selected filters, important links, small UI indicators |

Do not use gold as a large background color. Terrain photography stays visually dominant —
one restrained accent color only.

## 5. Typography

Clean modern sans-serif for nearly all interface text.

**Headlines:** a distinctive but highly legible serif or display font, used sparingly for
large hero statements, collection titles, editorial headings. Character: slightly
classical, sophisticated, cinematic. Avoid fonts that resemble stereotypical fantasy game
logos.

**UI and body:** clean sans-serif. Excellent readability, strong numeric rendering, clear
product names, good mobile performance. Limited type scale — do not create many competing
heading styles.

## 6. Primary Navigation

Desktop:

```text
[LOGO]

SHOP
LOCATIONS
COLLECTIONS
DESIGNERS
ABOUT

                        SEARCH  ACCOUNT  CART
```

**Shop dropdown** exposes multiple ways to browse:

- **By Environment:** Desert · Harbor & Coastal · Medieval Town · Temples & Ruins ·
  Dungeons · Wilderness
- **By Product Type:** Buildings · Terrain · Scatter · Modular Tiles · Centerpieces ·
  Encounter Sets
- **By Scale:** Small Terrain · Medium Terrain · Large Terrain · Table Centerpieces

## 7. Homepage Structure

### Section 1: Hero

Full-width photograph of a complete terrain environment, dominating the viewport. Overlay
only if necessary for text readability.

```text
PROFESSIONALLY PRINTED TABLETOP TERRAIN

BUILD A WORLD
WORTH PLAYING IN.

Commercially licensed tabletop terrain,
professionally printed and curated for your table.

[ SHOP LOCATIONS ]   [ SHOP TERRAIN ]
```

Primary CTA ("Shop Locations") visually dominant over the secondary.

### Section 2: Shop by Environment

Heading: **"WHERE WILL YOUR ADVENTURE BEGIN?"**

Large image-driven category cards: Desert, Harbor, Medieval Town, Temples & Ruins,
Dungeons, Wilderness.

Card design: large photography, minimal UI, category name, subtle arrow reveal + slight
image zoom on hover. No excessive overlay description.

```text
┌──────────────────────────┐
│        [ IMAGE ]         │
│  DESERT              →   │
└──────────────────────────┘
```

### Section 3: Featured Location

One of the most important sections — the site sells complete locations, not just
individual products. Large cinematic image on one side, content on the other. Editorial
and cinematic, not a standard product card.

```text
FEATURED LOCATION

THE DESERT CARAVANSERAI

A fortified desert outpost built for
markets, intrigue, ambushes, and adventure.

[ EXPLORE THE LOCATION ]

12 BUILDINGS · 34 TERRAIN PIECES · FULLY EXPANDABLE
```

### Section 4: Featured Designers

```text
FEATURED DESIGNERS
```

2–4 designer cards, each with logo, one representative terrain image, one-sentence
description, and a "SHOP [DESIGNER] TERRAIN" link.

## 8. Location Detail Page

A location is a curated environment containing multiple purchasable products. Hero
photography shows the complete assembled environment.

```text
THE DESERT CARAVANSERAI
A complete tabletop location.

[ SHOP THE COMPLETE SET ]   [ EXPLORE THE PIECES ]
```

- **Story / use case:** brief explanation of what the environment supports (social
  encounters, combat, exploration, markets, inns, ambushes).
- **Included terrain:** the individual pieces that make up the location, each linking to
  its own product page.
- **Build your own — three price/commitment tiers:** Complete Set · Building Bundle ·
  Individual Pieces.

## 9. Collections

Smaller groupings than a complete location — e.g. "Desert Settlements" (compatible
buildings), "Harbor Essentials" (docks/boats/warehouses/cranes/scatter), "Dungeon
Foundations" (walls/floors/doors/corridors/accessories).

```text
DESERT SETTLEMENTS

Everything you need to begin building
a desert settlement or expand an existing table.
```

Followed by a clean product grid.

## 10. Product Listing Page (Shop)

Header + short description, e.g. "SHOP DESERT TERRAIN".

**Filtering:** desktop sidebar, mobile filter drawer. Filters: Environment, Product Type,
Scale, Designer, Price. Don't overwhelm with dozens of filters initially.

**Grid:** 4 columns large desktop, 3 columns standard desktop, 2 columns tablet, 2 columns
mobile.

**Product card:** image ~75% of the card area, then:

```text
DESERT TERRAIN
Sandstone Watchtower
$XX.XX
```

Optional small metadata line (e.g. "Large Terrain"). No long descriptions, designer bios,
large badges, or multiple buttons. The entire card is clickable.

## 11. Product Page

Emphasize photography and scale.

**Left:** large image gallery — clean product shot, product in a complete environment,
scale reference, alternate angle, detail shot.

**Right:**

```text
DESERT TERRAIN
SANDSTONE WATCHTOWER
$XX.XX
```

Short description, then dimensions (width/depth/height), print material if applicable,
and a large full-width **ADD TO CART** button.

**Secondary info as accordions:** Description, Dimensions, Designer, Print Information,
Shipping.

## 12. Scale Communication

Major design consideration — customers need to understand physical size without mentally
converting dimensions. Use dimensions + a standard miniature silhouette + in-environment
photography together.

```text
HEIGHT
7.5"
[ MINIATURE SILHOUETTE ]  ← scale reference
```

## 13. Designer Pages

Commercially licensed designers are visible as part of the store's ecosystem.

```text
AETHER STUDIOS
Fantasy environments built for exploration.
```

Include: short description, designer logo (if licensing permits), product categories,
terrain gallery, products available from that designer, then a "SHOP [DESIGNER] TERRAIN"
link.

Clearly distinguish **Designed by [Designer]** vs. **Professionally printed and sold by
[Store]** — never imply the store created the original digital designs.

## 14. Photography Rules

The most important visual asset. Prefer real photographs of finished terrain: full table
environments, cinematic compositions, visible depth, miniatures interacting with terrain,
multiple pieces together, natural or controlled soft lighting.

**Avoid:** isolated 3D render as primary imagery, printer-bed photography, workbench
clutter, inconsistent backgrounds, poorly lit phone photos. Raw process photography can
live in social content or an About page, not the store itself.

## 15. Image Behavior

- **Hover:** slight zoom, minimal transition, no aggressive animation.
- **Cards:** consistent aspect ratio within a grid.
- **Hero:** wider cinematic ratio (16:9 or wider).
- **Location cards:** 4:3. **Product images:** 1:1 or 4:5.

## 16. Buttons

- **Primary:** muted gold background, dark text — e.g. "SHOP LOCATIONS".
- **Secondary:** transparent, light border — e.g. "EXPLORE TERRAIN".
- **Hover:** subtle brightness/border transition only. No bounce, glow, or heavy shadows.

## 17. Cards

Minimal or no visible border, dark surface background, moderate corner radius, generous
image area, consistent spacing. The site should breathe — avoid making every section a
grid of floating rectangles.

## 18. Spacing

Generous. Don't compress the homepage — terrain photography needs room. Don't put multiple
unrelated components inside one visual block.

## 19. Mobile Design

Priority order: terrain photography → product/location title → price or CTA → supporting
information.

```text
[ LOGO ]                [ CART ]
[ MENU ]
```

Menu exposes: Shop · Locations · Collections · Designers · About. No complicated
multi-level hover navigation on mobile.

## 20. Cart Experience

Keep it visually simple.

```text
[ IMAGE ]
PRODUCT NAME
SIZE / VARIANT
QUANTITY
PRICE
```

Order summary stays visible on desktop. Primary CTA: **CHECKOUT**. No excessive upsells —
a small "COMPATIBLE TERRAIN" section is acceptable.

**Current build note (2026-09-02):** this is a static-catalog build with no real cart/
checkout backend yet (see [PLAN.md](PLAN.md)). The cart UI is built to this spec but does
not process real orders — see the phase brief for what "done" means at this stage.

## 21. Data Relationships

This is the most important structural constraint. The data model and UI must **not** force
a product into a single rigid category.

- **Designer** → creates many terrain designs.
- **Product** → belongs to one or more categories, may belong to an environment, may
  belong to a collection, may be part of one or more complete locations.
- **Collection** → contains multiple products.
- **Location** → contains collections and/or products.

The same watchtower might legitimately appear under Desert Terrain (category), Desert
Settlement (collection), The Desert Caravanserai (location), and the Aether Studios
designer page — simultaneously.

## 22. Information Architecture

```text
HOME
├── SHOP
│   ├── By Environment
│   ├── By Product Type
│   ├── By Scale
│   └── By Designer
├── LOCATIONS
│   ├── Desert Caravanserai
│   ├── Harbor District
│   ├── Ancient Temple
│   └── etc.
├── COLLECTIONS
│   ├── Desert Settlements
│   ├── Harbor Essentials
│   └── Dungeon Foundations
├── DESIGNERS
│   ├── Aether Studios
│   ├── MiniatureLand
│   └── etc.
└── ABOUT
```

## 23. Core UX Principle

The site must answer **"What can I build with this?"** before **"What individual object
can I buy?"**

```text
SEE THE HARBOR
     ↓
EXPLORE THE LOCATION
     ↓
BUY THE COMPLETE SET  or  BUY A COLLECTION  or  BUY INDIVIDUAL PIECES
```

This funnel, driven by finished-terrain photography, should shape the whole site.

## 24. Hard Constraints — Never Violate

Do not:

- Add fantasy-themed decorative UI elements by default
- Use parchment textures or fake medieval borders
- Add dragons, swords, shields, or dice as generic decoration
- Use gradients everywhere, or excessive gold
- Make every product card visually ornate
- Add animations without purpose
- Fill empty space with decorative graphics
- Treat this as an STL download marketplace
- Make the homepage a generic product grid

## 25. Final Design Test

Before considering any page complete:

- Does it look like a premium specialty retailer?
- Is the terrain photography the visual focus?
- Can a customer understand what kind of environment they can build?
- Can a customer browse by multiple mental models?
- Can someone buy a complete location, a collection, or an individual piece?
- Does the site clearly communicate scale?
- Does the design remain usable without relying on fantasy-themed decoration?

If yes to all, the page is aligned with the intended direction.
