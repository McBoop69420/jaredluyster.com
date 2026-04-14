# Type Matchups Bible

Reference for all weakness/resistance interactions — damage multipliers, class matchups, and enemy type coverage.

---

## How Type Effectiveness Works

Type effectiveness applies **only to keyword damage** (damage dealt by typed elemental spells). It does not affect:
- Status effect stacks applied (e.g., Freeze stacks are always face-value)
- Block values granted
- Healing amounts

**Weakness** — the target is weak to your spell's type: keyword damage is **doubled (2×)**.

**Resistance** — the target resists your spell's type: keyword damage is **halved, rounded down (floor ÷ 2)**.

The multiplier is applied after Strength and Weak, before Amplify and Shock:

```
(base + Strength) × Weak(0.75) × type effectiveness × Amplify × Shock
```

Where `type effectiveness` = 2 (weakness), 0.5 floored (resistance), or 1 (neutral).

Labels shown in-game:
- **2×** → "⚡ Super effective!"
- **0.5×** → "🛡 Not very effective..."
- **1×** → (no label)

---

## The Elemental Cycles

Six types are arranged in a hexagon and form two interlocking triangles. Each type beats one and loses to one.

**Triangle 1 — Fire / Ice / Arc:**
```
Fire → Ice → Arc → Fire
```
- 🔥 Fire beats ❄️ Ice
- ❄️ Ice beats ⚡ Arc
- ⚡ Arc beats 🔥 Fire

**Triangle 2 — Grass / Rock / Water:**
```
Grass → Rock → Water → Grass
```
- 🌿 Grass beats 🪨 Rock
- 🪨 Rock beats 🌊 Water
- 🌊 Water beats 🌿 Grass

**Pair — Shadow / Light:**
- 🌑 Shadow beats ☀️ Light (2×), resists itself (0.5×)
- ☀️ Light beats 🌑 Shadow (2×), resists itself (0.5×)

Types from different triangles are always neutral (1×) against each other. The two triangles share the same hexagonal node layout in the type chart.

---

## Full Effectiveness Matrix

Rows = attacker type. Columns = defender type.

| Attacker ↓ / Defender → | 🔥 Fire | 🌊 Water | 🪨 Rock | ⚡ Arc | ❄️ Ice | 🌑 Shadow | ☀️ Light | 🌿 Grass |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🔥 **Fire** | 1× | 1× | 1× | 0.5× | **2×** | 1× | 1× | 1× |
| 🌊 **Water** | 1× | 1× | 0.5× | 1× | 1× | 1× | 1× | **2×** |
| 🪨 **Rock** | 1× | **2×** | 1× | 1× | 1× | 1× | 1× | 0.5× |
| ⚡ **Arc** | **2×** | 1× | 1× | 1× | 0.5× | 1× | 1× | 1× |
| ❄️ **Ice** | 0.5× | 1× | 1× | **2×** | 1× | 1× | 1× | 1× |
| 🌑 **Shadow** | 1× | 1× | 1× | 1× | 1× | 0.5× | **2×** | 1× |
| ☀️ **Light** | 1× | 1× | 1× | 1× | 1× | **2×** | 0.5× | 1× |
| 🌿 **Grass** | 1× | 0.5× | **2×** | 1× | 1× | 1× | 1× | 1× |

---

## Per-Type Breakdown

### 🔥 Fire
- **Super effective vs:** ❄️ Ice (2×)
- **Not very effective vs:** ⚡ Arc (0.5×)
- **Neutral vs:** Water, Rock, Shadow, Light, Grass
- **Design note:** Fire melts Ice directly. Arc's electrical disruption short-circuits sustained flame, making Arc enemies the primary threat for a Pyromancer.

---

### 🌊 Water
- **Super effective vs:** 🌿 Grass (2×)
- **Not very effective vs:** 🪨 Rock (0.5×)
- **Neutral vs:** Fire, Arc, Ice, Shadow, Light
- **Design note:** Water drowns and uproots Grass. Rock absorbs and redirects water — stone enemies shrug off flood damage.

---

### 🪨 Rock
- **Super effective vs:** 🌊 Water (2×)
- **Not very effective vs:** 🌿 Grass (0.5×)
- **Neutral vs:** Fire, Arc, Ice, Shadow, Light
- **Design note:** Rock dams and redirects water flow. Grass roots find purchase in stone, slowly breaking it apart.

---

### ⚡ Arc
- **Super effective vs:** 🔥 Fire (2×)
- **Not very effective vs:** ❄️ Ice (0.5×)
- **Neutral vs:** Water, Rock, Shadow, Light, Grass
- **Design note:** Arc breaks continuity — electrical disruption snuffs out sustained flame. Ice insulates against Arc, dissipating the charge before it lands.

---

### ❄️ Ice
- **Super effective vs:** ⚡ Arc (2×)
- **Not very effective vs:** 🔥 Fire (0.5×)
- **Neutral vs:** Water, Rock, Shadow, Light, Grass
- **Design note:** Ice stops movement and grounds electrical charge completely. Fire melts through frozen attacks before they connect.

---

### 🌑 Shadow
- **Super effective vs:** ☀️ Light (2×)
- **Not very effective vs:** 🌑 Shadow (0.5×)
- **Neutral vs:** Fire, Water, Rock, Arc, Ice, Grass
- **Design note:** Shadow is off-cycle entirely. Its identity is tempo (Weak reduces enemy output, Lifesteal sustains HP), so type matchups are narrow by design — super strong vs Light, nearly immune to itself. Shadow vs Shadow mirrors are low-damage duels where status stacking decides the fight.

---

### ☀️ Light
- **Super effective vs:** 🌑 Shadow (2×)
- **Not very effective vs:** ☀️ Light (0.5×)
- **Neutral vs:** Fire, Water, Rock, Arc, Ice, Grass
- **Design note:** The mirror of Shadow. Light's identity is disruption (Blind) and defense, so its off-cycle positioning matches Shadow's. Light vs Light mirrors are similarly low-damage but even more defensive — Blind on both sides makes long fights likely.

---

### 🌿 Grass
- **Super effective vs:** 🪨 Rock (2×)
- **Not very effective vs:** 🌊 Water (0.5×)
- **Neutral vs:** Fire, Arc, Ice, Shadow, Light
- **Design note:** Roots find purchase in stone and break it apart over time. Water drowns root systems before they can spread, making water-type enemies a hard counter to Root-based strategies.

---

## Enemy Type Coverage

Each enemy's type determines both what class it is **and** what your class matchup is when facing it.

### Common Enemies

| Enemy | Type | Weak to | Resists |
|---|---|---|---|
| 👺 Fire Imp | 🔥 Fire | 🌊 Water (2×) | 🔥 Fire (0.5× vs Water) |
| 🌋 Lava Golem | 🔥 Fire | 🌊 Water (2×) | 🔥 Fire |
| 🧜 Sea Sprite | 🌊 Water | ⚡ Arc (2×) | 🌊 Water |
| 🟤 Mud Elemental | 🪨 Rock | ❄️ Ice (2×) | 🪨 Rock |
| 🔵 Storm Wisp | ⚡ Arc | 🪨 Rock (2×) | ⚡ Arc |
| 🐺 Frost Wolf | ❄️ Ice | 🌿 Grass (2×) | ❄️ Ice |
| 👻 Shade Wraith | 🌑 Shadow | ☀️ Light (2×) | 🌑 Shadow |
| 🛡 Holy Sentinel | ☀️ Light | 🌑 Shadow (2×) | ☀️ Light |
| 🌱 Vine Creeper | 🌿 Grass | 🔥 Fire (2×) | 🌿 Grass |

### Elite Enemies

| Enemy | Type | Weak to | Resists |
|---|---|---|---|
| 🌞 Magma Lord | 🔥 Fire | 🌊 Water (2×) | 🔥 Fire |
| 🧙 Tide Witch | 🌊 Water | ⚡ Arc (2×) | 🌊 Water |
| 🗿 Stone Guardian | 🪨 Rock | ❄️ Ice (2×) | 🪨 Rock |
| 🧝 Thunder Mage | ⚡ Arc | 🪨 Rock (2×) | ⚡ Arc |
| 💀 Frost Lich | ❄️ Ice | 🌿 Grass (2×) | ❄️ Ice |
| 🕷 Void Reaper | 🌑 Shadow | ☀️ Light (2×) | 🌑 Shadow |
| 🌳 Ancient Treant | 🌿 Grass | 🔥 Fire (2×) | 🌿 Grass |
| ⚔️ Radiant Paladin | ☀️ Light | 🌑 Shadow (2×) | ☀️ Light |

### Bosses

| Boss | Type | Weak to | Resists | Notes |
|---|---|---|---|---|
| 👁 Mysterious Stranger | 🔥 Fire | 🌊 Water (2×) | 🔥 Fire | Stacks Char + Strength; Water counters both its damage and yours |
| 🐉 Abyssal Leviathan | 🌊 Water | ⚡ Arc (2×) | 🌊 Water | Heavy Weak application; Arc's 2× helps offset -25% damage from Weak |
| ⛰️ Mountain Titan | 🪨 Rock | ❄️ Ice (2×) | 🪨 Rock | Highest HP in the game (180); Ice's Freeze control buys turns to stack damage |
| 🌩️ Storm Sovereign | ⚡ Arc | 🪨 Rock (2×) | ⚡ Arc | Gains Strength early; Rock cuts damage on its final 30-damage surge |
| 🧊 Glacier Ancient | ❄️ Ice | 🌿 Grass (2×) | ❄️ Ice | Opens with 3 Freeze stacks; Grass ignores the freeze threat and punishes ice typing |
| 🌑 Shadow Sovereign | 🌑 Shadow | ☀️ Light (2×) | 🌑 Shadow | 4 Weak stacks early; Light offsets this by dealing 2× against the Weak source |
| ✨ Celestial Arbiter | ☀️ Light | 🌑 Shadow (2×) | ☀️ Light | Most defensive boss (high block intents); Shadow's Weak/Lifesteal sustains through long fights |
| 🌲 World Root | 🌿 Grass | 🔥 Fire (2×) | 🌿 Grass | Massive Root application (up to 9 stacks); Fire negates Root detonation damage entirely via 2× advantage AND the roots can't detonate if the player resists |

---

## Class vs. Boss Matchup Quick Reference

Your class type determines your spell type. Bold = favorable (2×). Italic = unfavorable (0.5×).

| Class | 👁 Overlord (🔥) | 🐉 Leviathan (🌊) | ⛰️ Titan (🪨) | 🌩️ Sovereign (⚡) | 🧊 Glacier (❄️) | 🌑 Shadow Sov (🌑) | ✨ Arbiter (☀️) | 🌲 World Root (🌿) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🔥 Pyromancer | 1× | *0.5×* | 1× | 1× | 1× | 1× | 1× | **2×** |
| 🌊 Stormcaller | **2×** | 1× | 1× | *0.5×* | 1× | 1× | 1× | 1× |
| 🪨 Earthwarden | 1× | 1× | 1× | **2×** | *0.5×* | 1× | 1× | 1× |
| ⚡ Voltmage | 1× | **2×** | *0.5×* | 1× | 1× | 1× | 1× | 1× |
| ❄️ Frostbinder | 1× | 1× | **2×** | 1× | 1× | 1× | 1× | *0.5×* |
| 🌑 Voidwalker | 1× | 1× | 1× | 1× | 1× | *0.5×* | **2×** | 1× |
| ☀️ Dawnseeker | 1× | 1× | 1× | 1× | 1× | **2×** | *0.5×* | 1× |
| 🌿 Thornweaver | *0.5×* | 1× | 1× | 1× | **2×** | 1× | 1× | 1× |

> Note: Any boss can appear on floor 12. The matchup you draw is luck — but knowing it early lets you buy the right spells at the shop on floor 10.

---

## Neutral Spells and Type Effectiveness

Neutral spells (Focus, Guard, Amplify, Mana Petal) deal no elemental damage and are never subject to type effectiveness. They provide mana, block, or damage amplification that scales with your elemental spells — making them universally valuable regardless of matchup.

---

## Design Principles

**One weakness, one resistance per type (cycle types):** Every cycle type in a run will have exactly one type it fears and one it exploits. This keeps the system learnable without being overwhelming.

**Off-cycle types stay off-cycle:** Shadow and Light have no interaction with the six cycle types. This is intentional — their identity is tempo and disruption, not raw damage cycling. Adding cycle interactions would dilute that identity.

**Status effects ignore type:** Status stacks never get the 2× or 0.5× treatment. Freeze is always face-value Freeze. This prevents stacking combinatorial complexity and keeps status effects as a second, independent axis of strategy.

**Resistance always floors:** When keyword damage is halved by resistance, the result is rounded down (floor division). A 3-damage spell hitting a resistant enemy deals 1, not 1.5.

**Effectiveness is a modifier, not a gate:** A Pyromancer fighting Water enemies doesn't become useless — they deal 0.5× damage, not 0×. You can still win; you just need more spells or better status play to compensate. No matchup is unwinnable.
