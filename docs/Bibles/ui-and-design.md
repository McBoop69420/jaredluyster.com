# UI & Design Bible

## Type Colors

Each wizard type has a single authoritative color used for: spell card borders, type labels, map node indicators, status effect icons (where matching type), and any type-tagged UI element.

| Type | Color | Hex | Notes |
|---|---|---|---|
| Fire | Red-orange | `#ff4422` | — |
| Water | Blue | `#2277ff` | — |
| Rock | Brown-gold | `#a87832` | Earthy, not bright |
| Arc | Orange | `#f97316` | — |
| Ice | Light blue | `#88ddff` | Pale, cool |
| Shadow | Berry | `#8c2a5e` | Deep red-plum; reads on dark, off the warm cluster |
| Light | Bright yellow | `#ffe234` | Vivid; distinct from Arc's orange |
| Grass | Green | `#22c55e` | — |
| Neutral | Tan-gray | `#c7bba4` | Universal cards |

---

## Status Effect Colors

Each status effect has its own color, distinct from but related to its source type. Used for status icons and status text in the battle log.

| Status | Color | Hex | Source Type |
|---|---|---|---|
| Char | Fire red-orange | `#ff6633` | Fire |
| Drown | Water blue | `#4488ff` | Water |
| Daze | Rock gold | `#cc9944` | Rock |
| Shock | Lightning yellow | `#ffdd00` | Arc |
| Freeze | Ice blue | `#66ddff` | Ice |
| Weak | Dull red | `#cc6666` | Neutral/shared |
| Root | Grass green | `#44cc66` | Grass |
| Blind | Pale white | `#f2f2f2` | Light |
| Lifesteal | Shadow purple | `#cc66ff` | Shadow |
| Strength | Empowerment gold | `#d4af37` | Neutral/shared (enemy) |

> Status colors intentionally differ slightly from type colors for contrast — do not swap them.

---

## Icons

Each elemental type uses its transparent PNG sigil as its primary visual identifier. Icons are used in: wizard selection, spell cards, enemy display, map nodes, and status effect chips. Emoji remain acceptable as fallback labels in plain-text bibles and places where image assets cannot render.

**Type Icons:**
| Type | Asset | Fallback |
|---|---|---|
| Fire | `Assets/Resources/Sprites/TypeIcons/icon_fire.png` | 🔥 |
| Water | `Assets/Resources/Sprites/TypeIcons/icon_water.png` | 🌊 |
| Rock | `Assets/Resources/Sprites/TypeIcons/icon_rock.png` | 🪨 |
| Arc | `Assets/Resources/Sprites/TypeIcons/icon_arc.png` | ⚡ |
| Ice | `Assets/Resources/Sprites/TypeIcons/icon_ice.png` | ❄️ |
| Shadow | `Assets/Resources/Sprites/TypeIcons/icon_shadow.png` | 🌑 |
| Light | `Assets/Resources/Sprites/TypeIcons/icon_light.png` | ☀️ |
| Grass | `Assets/Resources/Sprites/TypeIcons/icon_grass.png` | 🌿 |
| Neutral | none | ⬡ |

**Map Node Icons** (emoji fallbacks; in-game nodes use PNG sprites from `Sprites/NodeIcons/`):
| Node | Icon |
|---|---|
| Combat | ⚔ |
| Elite | 💀 |
| Rest | 🔥 |
| Shop | 💰 |
| Event | ? |
| Boss | ☠ |

**Shop Items:**
| Item | Icon |
|---|---|
| Minor Potion | 🧪 |
| Major Potion | ⚗️ |
| Vial of Vigor | 💖 |
| Ink of Erasure | 🗑 |

---

## Map Node Colors

Node fills are near-black (so PNG icon backgrounds blend in); the **stroke/accent color** is the identifying color. Values below are converted from `Assets/Scripts/UI/MapNodeElement.cs`.

| Node Type | Accent Color | Hex |
|---|---|---|
| Combat | Red-orange | `#dc5a3c` |
| Elite | Purple | `#aa50ff` |
| Rest | Green | `#32c864` |
| Shop | Gold | `#f0b932` |
| Event | Blue | `#50a0f0` |
| Boss | Bright red | `#e62828` |

State strokes (applied over the type color): current = `#22dd66`, available = `#f0be63`, hover = `#ffd97a`.

> There is no dedicated Start node type — floor 0 is a Combat node.

---

## Card Rarity

| Rarity | Visual Treatment |
|---|---|
| Common | Standard border |
| Uncommon | Slightly elevated border/glow |
| Rare | Premium treatment |

Rarity currently affects: shop price, reward pool weighting (rares appear less). No explicit visual color-coding of rarity is standardized yet — treat this as TBD.

---

## Design Principles

**Clarity first.** Every UI element should communicate its function immediately. Status effect chips show count + icon. Intent previews show what the enemy will do next.

**Functional naming over flavor.** See World & Lore Bible. Spell names describe their effect (Rock Throw, Healing Rain) rather than mythological references.

**No high-fantasy aesthetics.** The visual language should feel improvised and grounded — not an established arcane system. Avoid ornate frames, rune patterns, or "ancient" visual motifs.

**Color consistency is non-negotiable.** Type and status colors are defined above and must not drift across screens. Any new UI element that references a type or status must use the authoritative color.

**Mobile-first sizing.** The app targets phones. Touch targets should be large. Text should be readable at arm's length. Avoid hover-dependent interactions.

---

## Shared Theme

The shared CSS theme (`shared-theme.css`) is the source of truth for global styles shared between the app and the website. If it changes at the root level, also update `website/shared-theme.css` to keep the website in sync.

Do not override shared-theme values within screen-specific styles unless there is a justified reason — prefer extending rather than overriding.
