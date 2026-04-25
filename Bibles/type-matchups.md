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

The multiplier is applied before Amplify and Shock:

```
base × type effectiveness × Amplify × Shock
```

Where `type effectiveness` = 2 (weakness), 0.5 floored (resistance), or 1 (neutral).

Labels shown in-game:
- **2×** → "⚡ Super effective!"
- **0.5×** → "🛡 Not very effective..."
- **1×** → (no label)

---

## The Elemental Cycles

Six types are arranged in a hexagon. Each type beats the **two types directly ahead of it** in the rotation and loses to the **two types directly behind it**:

```
Fire → Grass → Ice → Rock → Arc → Water → Fire
```

This single rule creates both cycles simultaneously:

**Inner triangles** (every other step):
- 🔥 Fire → ❄️ Ice → ⚡ Arc → 🔥 Fire
- 🌿 Grass → 🪨 Rock → 🌊 Water → 🌿 Grass

**Outer hex chain** (adjacent steps):
- 🔥 Fire → 🌿 Grass → ❄️ Ice → 🪨 Rock → ⚡ Arc → 🌊 Water → 🔥 Fire

**Combined result — each cycle type beats 2, loses to 2:**

| Type | Beats (2×) | Loses to (0.5×) |
|---|---|---|
| 🔥 Fire | ❄️ Ice, 🌿 Grass | ⚡ Arc, 🌊 Water |
| 🌿 Grass | 🪨 Rock, ❄️ Ice | 🌊 Water, 🔥 Fire |
| ❄️ Ice | ⚡ Arc, 🪨 Rock | 🔥 Fire, 🌿 Grass |
| 🪨 Rock | 🌊 Water, ⚡ Arc | ❄️ Ice, 🌿 Grass |
| ⚡ Arc | 🔥 Fire, 🌊 Water | 🪨 Rock, ❄️ Ice |
| 🌊 Water | 🌿 Grass, 🔥 Fire | ⚡ Arc, 🪨 Rock |

**Pair — Shadow / Light:**
- 🌑 Shadow beats ☀️ Light (2×), resists itself (0.5×)
- ☀️ Light beats 🌑 Shadow (2×), resists itself (0.5×)

Shadow and Light have no interactions with the six cycle types (always 1×).

---

## Full Effectiveness Matrix

Rows = attacker type. Columns = defender type.

| Attacker ↓ / Defender → | 🔥 Fire | 🌊 Water | 🪨 Rock | ⚡ Arc | ❄️ Ice | 🌑 Shadow | ☀️ Light | 🌿 Grass |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🔥 **Fire** | 1× | 0.5× | 1× | 0.5× | **2×** | 1× | 1× | **2×** |
| 🌊 **Water** | **2×** | 1× | 0.5× | 0.5× | 1× | 1× | 1× | **2×** |
| 🪨 **Rock** | 1× | **2×** | 1× | **2×** | 0.5× | 1× | 1× | 0.5× |
| ⚡ **Arc** | **2×** | **2×** | 0.5× | 1× | 0.5× | 1× | 1× | 1× |
| ❄️ **Ice** | 0.5× | 1× | **2×** | **2×** | 1× | 1× | 1× | 0.5× |
| 🌑 **Shadow** | 1× | 1× | 1× | 1× | 1× | 0.5× | **2×** | 1× |
| ☀️ **Light** | 1× | 1× | 1× | 1× | 1× | **2×** | 0.5× | 1× |
| 🌿 **Grass** | 0.5× | 0.5× | **2×** | 1× | **2×** | 1× | 1× | 1× |

---

## Per-Type Breakdown

### 🔥 Fire
- **Super effective vs:** ❄️ Ice (2×), 🌿 Grass (2×)
- **Not very effective vs:** ⚡ Arc (0.5×), 🌊 Water (0.5×)
- **Neutral vs:** Rock, Shadow, Light
- **Design note:** Fire melts Ice and scorches Grass. Arc's electrical disruption short-circuits sustained flame; Water smothers it outright — making Arc and Water enemies the twin threats for a Pyromancer.

---

### 🌊 Water
- **Super effective vs:** 🌿 Grass (2×), 🔥 Fire (2×)
- **Not very effective vs:** 🪨 Rock (0.5×), ⚡ Arc (0.5×)
- **Neutral vs:** Ice, Shadow, Light
- **Design note:** Water drowns Grass and extinguishes Fire. Rock absorbs and redirects water; Arc ionizes it — both shrug off flood damage and give Stormcallers a hard time.

---

### 🪨 Rock
- **Super effective vs:** 🌊 Water (2×), ⚡ Arc (2×)
- **Not very effective vs:** 🌿 Grass (0.5×), ❄️ Ice (0.5×)
- **Neutral vs:** Fire, Shadow, Light
- **Design note:** Rock dams water and grounds electrical charge. Grass roots find purchase in stone and break it apart; Ice freezes and fractures it — both deny the Earthwarden their momentum.

---

### ⚡ Arc
- **Super effective vs:** 🔥 Fire (2×), 🌊 Water (2×)
- **Not very effective vs:** ❄️ Ice (0.5×), 🪨 Rock (0.5×)
- **Neutral vs:** Grass, Shadow, Light
- **Design note:** Arc snuffs sustained flame and electrifies water conductively. Ice insulates and dissipates the charge; Rock grounds it entirely — both neuter the Voltmage's output.

---

### ❄️ Ice
- **Super effective vs:** ⚡ Arc (2×), 🪨 Rock (2×)
- **Not very effective vs:** 🔥 Fire (0.5×), 🌿 Grass (0.5×)
- **Neutral vs:** Water, Shadow, Light
- **Design note:** Ice grounds electrical charge and fractures stone through freeze-expansion. Fire melts frozen attacks before they connect; Grass insulates against cold and pushes through it — both punish the Frostbinder.

---

### 🌑 Shadow
- **Super effective vs:** ☀️ Light (2×)
- **Not very effective vs:** 🌑 Shadow (0.5×)
- **Neutral vs:** Fire, Water, Rock, Arc, Ice, Grass
- **Design note:** Shadow is off-cycle entirely. Its identity is attrition (Lifesteal sustains HP through prolonged fights), so type matchups are narrow by design — super strong vs Light, nearly immune to itself. Shadow vs Shadow mirrors are low-damage duels where status stacking decides the fight.

---

### ☀️ Light
- **Super effective vs:** 🌑 Shadow (2×)
- **Not very effective vs:** ☀️ Light (0.5×)
- **Neutral vs:** Fire, Water, Rock, Arc, Ice, Grass
- **Design note:** The mirror of Shadow. Light's identity is disruption (Blind) and defense, so its off-cycle positioning matches Shadow's. Light vs Light mirrors are similarly low-damage but even more defensive — Blind on both sides makes long fights likely.

---

### 🌿 Grass
- **Super effective vs:** 🪨 Rock (2×), ❄️ Ice (2×)
- **Not very effective vs:** 🌊 Water (0.5×), 🔥 Fire (0.5×)
- **Neutral vs:** Arc, Shadow, Light
- **Design note:** Roots crack stone and insulate against cold. Water drowns root systems before they spread; Fire scorches them instantly — both hard-counter Root-stacking strategies and punish the Thornweaver for slow play.

---

## Enemy Type Coverage

Each enemy's type determines both what class it is **and** what your class matchup is when facing it.

### Common Enemies

| Enemy | Type | Weak to (2×) | Resists (0.5×) |
|---|---|---|---|
| 👺 Fire Imp | 🔥 Fire | ⚡ Arc, 🌊 Water | ❄️ Ice, 🌿 Grass |
| 🌋 Lava Golem | 🔥 Fire | ⚡ Arc, 🌊 Water | ❄️ Ice, 🌿 Grass |
| 🧜 Sea Sprite | 🌊 Water | ⚡ Arc, 🪨 Rock | 🌿 Grass, 🔥 Fire |
| 🟤 Mud Elemental | 🪨 Rock | ❄️ Ice, 🌿 Grass | 🌊 Water, ⚡ Arc |
| 🔵 Storm Wisp | ⚡ Arc | ❄️ Ice, 🪨 Rock | 🔥 Fire, 🌊 Water |
| 🐺 Frost Wolf | ❄️ Ice | 🔥 Fire, 🌿 Grass | ⚡ Arc, 🪨 Rock |
| 👻 Shade Wraith | 🌑 Shadow | ☀️ Light | 🌑 Shadow |
| 🛡 Holy Sentinel | ☀️ Light | 🌑 Shadow | ☀️ Light |
| 🌱 Vine Creeper | 🌿 Grass | 🔥 Fire, 🌊 Water | ❄️ Ice, 🪨 Rock |

### Elite Enemies

| Enemy | Type | Weak to (2×) | Resists (0.5×) |
|---|---|---|---|
| 🌞 Magma Lord | 🔥 Fire | ⚡ Arc, 🌊 Water | ❄️ Ice, 🌿 Grass |
| 🧙 Tide Witch | 🌊 Water | ⚡ Arc, 🪨 Rock | 🌿 Grass, 🔥 Fire |
| 🗿 Stone Guardian | 🪨 Rock | ❄️ Ice, 🌿 Grass | 🌊 Water, ⚡ Arc |
| 🧝 Thunder Mage | ⚡ Arc | ❄️ Ice, 🪨 Rock | 🔥 Fire, 🌊 Water |
| 💀 Frost Lich | ❄️ Ice | 🔥 Fire, 🌿 Grass | ⚡ Arc, 🪨 Rock |
| 🕷 Void Reaper | 🌑 Shadow | ☀️ Light | 🌑 Shadow |
| 🌳 Old-Growth | 🌿 Grass | 🔥 Fire, 🌊 Water | ❄️ Ice, 🪨 Rock |
| ⚔️ Radiant Paladin | ☀️ Light | 🌑 Shadow | ☀️ Light |

### Bosses

| Boss | Type | Weak to (2×) | Resists (0.5×) | Notes |
|---|---|---|---|---|
| 👁 The Drifter | 🔥 Fire | ⚡ Arc, 🌊 Water | ❄️ Ice, 🌿 Grass | Stacks Char on intents 2 and 3; Arc and Water both counter its sustained output |
| 🐉 Abyssal Leviathan | 🌊 Water | ⚡ Arc, 🪨 Rock | 🌿 Grass, 🔥 Fire | Applies 5 permanent Drown; Rock and Arc deal 2× and can burst it before Drown compounds |
| ⛰️ Mountain Titan | 🪨 Rock | ❄️ Ice, 🌿 Grass | 🌊 Water, ⚡ Arc | Highest HP in the game (180); Ice Freeze control and Grass Root stacking both punish its slow kit |
| 🌩️ Storm Sovereign | ⚡ Arc | ❄️ Ice, 🪨 Rock | 🔥 Fire, 🌊 Water | Stacks Shock on itself before a 30-damage finish; Rock cuts the final hit and Ice negates the Shock |
| 🧊 Glacial Mass | ❄️ Ice | 🔥 Fire, 🌿 Grass | ⚡ Arc, 🪨 Rock | Opens with 3 Freeze stacks; Fire and Grass both ignore the freeze threat and punish the typing |
| 🌑 Shadow Sovereign | 🌑 Shadow | ☀️ Light | 🌑 Shadow | Pure escalating attacks; Light's 2× advantage and block/Blind combo are the best counter |
| ✨ Celestial Arbiter | ☀️ Light | 🌑 Shadow | ☀️ Light | Most defensive boss; applies Blind on intent 3 to disrupt your offense — Shadow's Lifesteal sustains through the long fight |
| 🌲 World Root | 🌿 Grass | 🔥 Fire, 🌊 Water | ❄️ Ice, 🪨 Rock | Massive Root application (up to 9 stacks); Fire and Water both deal 2× and clear the Root threat |

---

## Class vs. Boss Matchup Quick Reference

Your class type determines your spell type. Bold = favorable (2×). Italic = unfavorable (0.5×). Each cycle class now has two favorable and two unfavorable boss matchups.

| Class | 👁 Drifter (🔥) | 🐉 Leviathan (🌊) | ⛰️ Titan (🪨) | 🌩️ Sovereign (⚡) | 🧊 Glacial (❄️) | 🌑 Shadow Sov (🌑) | ✨ Arbiter (☀️) | 🌲 World Root (🌿) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🔥 Pyromancer | 1× | *0.5×* | 1× | *0.5×* | **2×** | 1× | 1× | **2×** |
| 🌊 Stormcaller | **2×** | 1× | *0.5×* | *0.5×* | 1× | 1× | 1× | **2×** |
| 🪨 Earthwarden | 1× | **2×** | 1× | **2×** | *0.5×* | 1× | 1× | *0.5×* |
| ⚡ Voltmage | **2×** | **2×** | *0.5×* | 1× | *0.5×* | 1× | 1× | 1× |
| ❄️ Frostbinder | *0.5×* | 1× | **2×** | **2×** | 1× | 1× | 1× | *0.5×* |
| 🌑 Voidwalker | 1× | 1× | 1× | 1× | 1× | *0.5×* | **2×** | 1× |
| ☀️ Dawnseeker | 1× | 1× | 1× | 1× | 1× | **2×** | *0.5×* | 1× |
| 🌿 Thornweaver | *0.5×* | *0.5×* | **2×** | 1× | **2×** | 1× | 1× | 1× |

> Note: Any boss can appear on floor 12. The matchup you draw is luck — but knowing it early lets you buy the right spells at the shop on floor 10.

---

## Neutral Spells and Type Effectiveness

Neutral spells (Focus, Guard, Amplify, Mana Petal) deal no elemental damage and are never subject to type effectiveness. They provide mana, block, or damage amplification that scales with your elemental spells — making them universally valuable regardless of matchup.

---

## Design Principles

**Two weaknesses, two resistances per cycle type:** Every cycle type beats two and loses to two. The relationships come from two overlapping cycles — the inner triangles (Fire/Ice/Arc and Grass/Rock/Water) and the outer hexagonal chain — both active simultaneously. This gives players two favorable and two unfavorable matchups per class, adding decision depth without needing to memorize a giant matrix.

**Off-cycle types stay off-cycle:** Shadow and Light have no interaction with the six cycle types. This is intentional — their identity is tempo and disruption, not raw damage cycling. Adding cycle interactions would dilute that identity.

**Status effects ignore type:** Status stacks never get the 2× or 0.5× treatment. Freeze is always face-value Freeze. This prevents stacking combinatorial complexity and keeps status effects as a second, independent axis of strategy.

**Resistance always floors:** When keyword damage is halved by resistance, the result is rounded down (floor division). A 3-damage spell hitting a resistant enemy deals 1, not 1.5.

**Effectiveness is a modifier, not a gate:** A Pyromancer fighting Water enemies doesn't become useless — they deal 0.5× damage, not 0×. You can still win; you just need more spells or better status play to compensate. No matchup is unwinnable.
