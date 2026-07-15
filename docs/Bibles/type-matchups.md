# Type Matchups Bible

Reference for all weakness/resistance interactions — damage multipliers, class matchups, and enemy type coverage.

---

## How Type Effectiveness Works

Type effectiveness applies **only to spell damage**. It does not affect:
- Status effect stacks applied (e.g., Freeze stacks are always face-value)
- Block values granted
- Healing amounts

The multiplier is applied after Strength and Weak, before Amplify and Shock:

```
(base + Strength) × Weak(0.75?) × type effectiveness × Amplify × Shock
```

Labels shown in-game:
- **2×** → "⚡ Super effective!"
- **0.5×** → "🛡 Not very effective..."
- **1×** → (no label)

---

## Elemental Structure

The original six-type ring remains intact:

```
Fire → Grass → Ice → Rock → Arc → Water → Fire
```

The revised 8-type system gives every non-neutral type exactly:
- 3 types it is super effective against
- 3 types it is not very effective against
- 1 paired type it treats neutrally

Neutral pairs:
- Fire ↔ Light
- Water ↔ Ice
- Rock ↔ Shadow
- Grass ↔ Arc

Clean strength matrix:
- Fire > Grass, Ice, Shadow
- Water > Fire, Rock, Light
- Rock > Fire, Arc, Light
- Arc > Water, Fire, Shadow
- Ice > Rock, Arc, Shadow
- Grass > Water, Ice, Rock
- Shadow > Water, Grass, Light
- Light > Grass, Arc, Ice

---

## Full Effectiveness Matrix

Rows = attacker type. Columns = defender type.

| Attacker ↓ / Defender → | 🔥 Fire | 🌊 Water | 🪨 Rock | ⚡ Arc | ❄️ Ice | 🌑 Shadow | ☀️ Light | 🌿 Grass |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🔥 **Fire** | 1× | 0.5× | 0.5× | 0.5× | **2×** | **2×** | 1× | **2×** |
| 🌊 **Water** | **2×** | 1× | **2×** | 0.5× | 1× | 0.5× | **2×** | 0.5× |
| 🪨 **Rock** | **2×** | 0.5× | 1× | **2×** | 0.5× | 1× | **2×** | 0.5× |
| ⚡ **Arc** | **2×** | **2×** | 0.5× | 1× | 0.5× | **2×** | 0.5× | 1× |
| ❄️ **Ice** | 0.5× | 1× | **2×** | **2×** | 1× | **2×** | 0.5× | 0.5× |
| 🌑 **Shadow** | 0.5× | **2×** | 1× | 0.5× | 0.5× | 1× | **2×** | **2×** |
| ☀️ **Light** | 1× | 0.5× | 0.5× | **2×** | **2×** | 0.5× | 1× | **2×** |
| 🌿 **Grass** | 0.5× | **2×** | **2×** | 1× | **2×** | 0.5× | 0.5× | 1× |

---

## Per-Type Breakdown

### 🔥 Fire
- **Super effective vs:** 🌿 Grass, ❄️ Ice, 🌑 Shadow
- **Not very effective vs:** 🌊 Water, ⚡ Arc, 🪨 Rock
- **Neutral vs:** ☀️ Light
- **Design note:** Fire burns Grass, melts Ice, and illuminates Shadow. Water extinguishes it, Arc destabilizes it, and Rock contains it. Fire and Light coexist as adjacent radiant forces.

### 🌊 Water
- **Super effective vs:** 🔥 Fire, 🪨 Rock, ☀️ Light
- **Not very effective vs:** ⚡ Arc, 🌿 Grass, 🌑 Shadow
- **Neutral vs:** ❄️ Ice
- **Design note:** Water extinguishes Fire, erodes Rock, and diffuses Light. Arc conducts through it, Grass absorbs it, and Shadow corrupts stagnant water. Water and Ice are different states of the same element.

### 🪨 Rock
- **Super effective vs:** 🔥 Fire, ⚡ Arc, ☀️ Light
- **Not very effective vs:** 🌊 Water, 🌿 Grass, ❄️ Ice
- **Neutral vs:** 🌑 Shadow
- **Design note:** Stone suppresses Fire, grounds Arc, and blocks Light. Water erodes it, roots split it, and Ice fractures it. Shadow may cover or corrupt stone, but does not inherently overcome it.

### ⚡ Arc
- **Super effective vs:** 🌊 Water, 🔥 Fire, 🌑 Shadow
- **Not very effective vs:** 🪨 Rock, ☀️ Light, ❄️ Ice
- **Neutral vs:** 🌿 Grass
- **Design note:** Arc conducts through Water, destabilizes Fire, and disrupts Shadow. Rock grounds it, Light orders it, and Ice insulates against it. Grass and Arc stay neutral to avoid hard-countering biological systems with raw energy.

### ❄️ Ice
- **Super effective vs:** 🪨 Rock, ⚡ Arc, 🌑 Shadow
- **Not very effective vs:** 🔥 Fire, 🌿 Grass, ☀️ Light
- **Neutral vs:** 🌊 Water
- **Design note:** Ice fractures Rock, disrupts Arc, and preserves against Shadow's entropy. Fire melts it, Grass overcomes cold with life, and Light melts and purifies it. Ice and Water remain neutral state-pairs.

### 🌿 Grass
- **Super effective vs:** 🌊 Water, ❄️ Ice, 🪨 Rock
- **Not very effective vs:** 🔥 Fire, ☀️ Light, 🌑 Shadow
- **Neutral vs:** ⚡ Arc
- **Design note:** Grass absorbs Water, overcomes cold, and splits Rock with roots. Fire burns it, cosmic Light can overexpose it, and Shadow decays it. Grass and Arc stay neutral to keep life and energy from dominating one another.

### 🌑 Shadow
- **Super effective vs:** 🌊 Water, 🌿 Grass, ☀️ Light
- **Not very effective vs:** 🔥 Fire, ⚡ Arc, ❄️ Ice
- **Neutral vs:** 🪨 Rock
- **Design note:** Shadow corrupts Water, decays living systems, and consumes Light. Fire illuminates it, Arc exposes it, and Ice halts entropy. Rock is stable enough that neither side inherently dominates.

### ☀️ Light
- **Super effective vs:** 🌿 Grass, ⚡ Arc, ❄️ Ice
- **Not very effective vs:** 🌊 Water, 🪨 Rock, 🌑 Shadow
- **Neutral vs:** 🔥 Fire
- **Design note:** Light overexposes life, orders volatile Arc, and melts Ice. Water refracts it, Rock blocks it, and Shadow consumes it. Light and Fire remain neutral adjacent radiant forces.

---

## Enemy Type Coverage

Each enemy's type determines what spell types hit it for 2× or 0.5×.

### Common Enemies

| Enemy | Type | Weak to | Resists |
|---|---|---|---|
| 👺 Fire Imp | 🔥 Fire | 🌊 Water, 🪨 Rock, ⚡ Arc | ❄️ Ice, 🌑 Shadow, 🌿 Grass |
| 🌋 Lava Golem | 🔥 Fire | 🌊 Water, 🪨 Rock, ⚡ Arc | ❄️ Ice, 🌑 Shadow, 🌿 Grass |
| 🧜 Sea Sprite | 🌊 Water | ⚡ Arc, 🌑 Shadow, 🌿 Grass | 🔥 Fire, 🪨 Rock, ☀️ Light |
| 🟤 Mud Elemental | 🪨 Rock | 🌊 Water, ❄️ Ice, 🌿 Grass | 🔥 Fire, ⚡ Arc, ☀️ Light |
| 🔵 Storm Wisp | ⚡ Arc | 🪨 Rock, ❄️ Ice, ☀️ Light | 🔥 Fire, 🌊 Water, 🌑 Shadow |
| 🐺 Frost Wolf | ❄️ Ice | 🔥 Fire, 🌿 Grass, ☀️ Light | 🪨 Rock, ⚡ Arc, 🌑 Shadow |
| 👻 Shade Wraith | 🌑 Shadow | 🔥 Fire, ⚡ Arc, ❄️ Ice | 🌊 Water, 🌿 Grass, ☀️ Light |
| 🛡 Holy Sentinel | ☀️ Light | 🌊 Water, 🪨 Rock, 🌑 Shadow | ⚡ Arc, ❄️ Ice, 🌿 Grass |
| 🌱 Vine Creeper | 🌿 Grass | 🔥 Fire, 🌑 Shadow, ☀️ Light | 🌊 Water, ❄️ Ice, 🪨 Rock |

### Elite Enemies

| Enemy | Type | Weak to | Resists |
|---|---|---|---|
| 🌞 Magma Lord | 🔥 Fire | 🌊 Water, 🪨 Rock, ⚡ Arc | ❄️ Ice, 🌑 Shadow, 🌿 Grass |
| 🧙 Tide Witch | 🌊 Water | ⚡ Arc, 🌑 Shadow, 🌿 Grass | 🔥 Fire, 🪨 Rock, ☀️ Light |
| 🗿 Stone Guardian | 🪨 Rock | 🌊 Water, ❄️ Ice, 🌿 Grass | 🔥 Fire, ⚡ Arc, ☀️ Light |
| 🧝 Thunder Mage | ⚡ Arc | 🪨 Rock, ❄️ Ice, ☀️ Light | 🔥 Fire, 🌊 Water, 🌑 Shadow |
| 💀 Frost Lich | ❄️ Ice | 🔥 Fire, 🌿 Grass, ☀️ Light | 🪨 Rock, ⚡ Arc, 🌑 Shadow |
| 🦇 Shadow Stalker | 🌑 Shadow | 🔥 Fire, ⚡ Arc, ❄️ Ice | 🌊 Water, 🌿 Grass, ☀️ Light |
| 🌳 Thornwood | 🌿 Grass | 🔥 Fire, 🌑 Shadow, ☀️ Light | 🌊 Water, ❄️ Ice, 🪨 Rock |
| ⚔️ Radiant Knight | ☀️ Light | 🌊 Water, 🪨 Rock, 🌑 Shadow | ⚡ Arc, ❄️ Ice, 🌿 Grass |

### Bosses

| Boss | Type | Weak to | Resists |
|---|---|---|---|
| 👁 The Drifter | 🔥 Fire | 🌊 Water, 🪨 Rock, ⚡ Arc | ❄️ Ice, 🌑 Shadow, 🌿 Grass |
| 🐉 Abyssal Leviathan | 🌊 Water | ⚡ Arc, 🌑 Shadow, 🌿 Grass | 🔥 Fire, 🪨 Rock, ☀️ Light |
| ⛰️ Mountain Titan | 🪨 Rock | 🌊 Water, ❄️ Ice, 🌿 Grass | 🔥 Fire, ⚡ Arc, ☀️ Light |
| 🌩️ Storm Sovereign | ⚡ Arc | 🪨 Rock, ❄️ Ice, ☀️ Light | 🔥 Fire, 🌊 Water, 🌑 Shadow |
| 🧊 Glacial Mass | ❄️ Ice | 🔥 Fire, 🌿 Grass, ☀️ Light | 🪨 Rock, ⚡ Arc, 🌑 Shadow |
| 🌑 Shadow Sovereign | 🌑 Shadow | 🔥 Fire, ⚡ Arc, ❄️ Ice | 🌊 Water, 🌿 Grass, ☀️ Light |
| ✨ Celestial Arbiter | ☀️ Light | 🌊 Water, 🪨 Rock, 🌑 Shadow | ⚡ Arc, ❄️ Ice, 🌿 Grass |
| 🌲 World Root | 🌿 Grass | 🔥 Fire, 🌑 Shadow, ☀️ Light | 🌊 Water, ❄️ Ice, 🪨 Rock |

---

## Class vs. Boss Matchup Quick Reference

Your class type determines your spell type. Bold = favorable (2×). Italic = unfavorable (0.5×).

| Class | 👁 Drifter (🔥) | 🐉 Leviathan (🌊) | ⛰️ Titan (🪨) | 🌩️ Sovereign (⚡) | 🧊 Glacial Mass (❄️) | 🌑 Shadow Sov (🌑) | ✨ Arbiter (☀️) | 🌲 World Root (🌿) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🔥 Pyromancer | 1× | *0.5×* | *0.5×* | *0.5×* | **2×** | **2×** | 1× | **2×** |
| 🌊 Tidecaller | **2×** | 1× | **2×** | *0.5×* | 1× | *0.5×* | **2×** | *0.5×* |
| 🪨 Stonewarden | **2×** | *0.5×* | 1× | **2×** | *0.5×* | 1× | **2×** | *0.5×* |
| ⚡ Stormseeker | **2×** | **2×** | *0.5×* | 1× | *0.5×* | **2×** | *0.5×* | 1× |
| ❄️ Frostweaver | *0.5×* | 1× | **2×** | **2×** | 1× | **2×** | *0.5×* | *0.5×* |
| 🌑 Shadowblade | *0.5×* | **2×** | 1× | *0.5×* | *0.5×* | 1× | **2×** | **2×** |
| ☀️ Dawnmage | 1× | *0.5×* | *0.5×* | **2×** | **2×** | *0.5×* | 1× | **2×** |
| 🌿 Verdantmaker | *0.5×* | **2×** | **2×** | 1× | **2×** | *0.5×* | *0.5×* | 1× |

> Note: Any boss can appear on floor 12. The matchup you draw is luck — but knowing it early lets you buy the right spells at the shop on floor 10.

---

## Neutral Spells and Type Effectiveness

Neutral spells (Focus, Guard, Amplify, Mana Petal) deal no elemental damage and are never subject to type effectiveness. They provide draw, block, mana, or damage amplification support that scales with your elemental spells — making them universally valuable regardless of matchup.

---

## Design Principles

**Three strengths, three weaknesses, one neutral pair:** Every non-neutral type has broad matchup identity while preserving a stable 3/3/1 balance.

**Reciprocity is mandatory:** If one type deals 2× to another, the reverse direction must be 0.5×. Neutral pairs are always mutual.

**The main ring remains readable:** Fire > Grass > Ice > Rock > Arc > Water > Fire is still the backbone players can learn first, with the added relationships creating richer cross-domain matchups.

**Status effects ignore type:** Status stacks never get the 2× or 0.5× treatment. Freeze is always face-value Freeze. This prevents stacking combinatorial complexity and keeps status effects as a second, independent axis of strategy.

**Effectiveness is a modifier, not a gate:** Bad matchups reduce spell damage to 0.5×, not 0×. You can still win through better deckbuilding, status play, and defensive timing.
