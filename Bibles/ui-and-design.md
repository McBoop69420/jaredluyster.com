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
| Shadow | Purple | `#bb33ee` | — |
| Light | Bright yellow | `#facc15` | Distinct from Arc |
| Grass | Green | `#22c55e` | — |
| Neutral | Gray | `#888888` | Universal cards |

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
| Root | Grass green | `#44cc66` | Grass |
| Blind | Pale white | `#f2f2f2` | Light |
| Lifesteal | Shadow purple | `#cc66ff` | Shadow |

> Status colors intentionally differ slightly from type colors for contrast — do not swap them.

---

## Icons

Each type and status uses an emoji icon as its primary visual identifier. Icons are used in: wizard selection, spell cards, enemy display, map nodes, status effect chips.

**Type Icons:**
| Type | Icon |
|---|---|
| Fire | 🔥 |
| Water | 🌊 |
| Rock | 🪨 |
| Arc | ⚡ |
| Ice | ❄️ |
| Shadow | 🌑 |
| Light | ☀️ |
| Grass | 🌿 |
| Neutral | ⬡ |

**Map Node Icons:**
| Node | Icon |
|---|---|
| Start | ⚑ |
| Battle | ⚔ |
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

| Node Type | Color | Hex |
|---|---|---|
| Start | Green | `#19c37d` |
| Battle | Red | `#cc3333` |
| Elite | Dark red | `#aa2222` |
| Rest | Orange | `#cc7722` |
| Shop | Teal-green | `#22aa66` |
| Event | Purple | `#7744aa` |
| Boss | Bright red | `#ff2222` |

---

## Card Rarity

| Rarity | Visual Treatment |
|---|---|
| Starter | Distinct marker (e.g. "STARTER DECK" badge); not part of draft/shop pool |
| Common | Standard border |
| Uncommon | Slightly elevated border/glow |
| Rare | Premium treatment |

Rarity currently affects: shop price, reward pool weighting (rares appear less). No explicit visual color-coding of rarity is standardized yet — treat this as TBD.

**Starter** cards are not a shop or reward rarity — they are a fixed deck membership flag. They do not appear in draft rewards or shop inventory. Every class has exactly 4 Starter cards forming its starting deck. Starter is separate from Common/Uncommon/Rare and should never be treated as a tier above or below them.

---

## Shop UI

- **Buy button:** Each item displays a pill-style "Buy 💰 X" button in place of a plain price tag, making the purchase action immediately obvious.
- **Sold Out state:** Purchased items remain visible but are dimmed (50% opacity, muted text) so the player can see what they've already bought without cluttering the layout.
- **Purchase toast:** On every successful purchase, a "[Card name] added to deck!" or "[Item name] purchased!" notification slides up from the bottom of the screen and fades out after 2 seconds.

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
