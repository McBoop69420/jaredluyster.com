# Status Effects Bible

All status effects are tracked as integer stacks on `statusEffects` in the battle state.

---

## Quick Reference

| Effect | Color | Type | Source | Mechanic Summary |
|---|---|---|---|---|
| Char | `#ff6633` | DoT | Fire | Deals damage = stacks after player turn, before enemy action; decays -1/turn |
| Drown | `#4488ff` | DoT | Water | Deals damage = stacks after player turn, before enemy action; **no decay** |
| Shock | `#ffdd00` | Amplifier | Arc | Arc attacks deal ×1.25 per stack; decays -1/turn |
| Root | `#44cc66` | Trap | Grass | On next damage hit: bursts for 2× stacks as bonus damage, all stacks consumed |
| Freeze | `#66ddff` | Skip | Ice | At 5+ stacks: skip action, consume all stacks |
| Daze | `#cc9944` | Disruption | Rock | 50% chance enemy repeats previous action; decays -1/turn |
| Blind | `#f2f2f2` | Miss | Light | 50% chance enemy attack misses entirely; decays -1/turn |
| Weak | `#cc6666` | Debuff | Enemy intents | Reduces all damage dealt by 25% (flat, any stack); decays -1/turn |
| Strength | `#d4af37` | Buff | Enemy buffs | Adds flat bonus to all attacks |
| Lifesteal | `#cc66ff` | Drain | Shadow | After enemy acts: drains HP from enemy, heals player |

---

## Detailed Mechanics

### Char (Fire) `#ff6633`
- **Applied by:** Fire spells (e.g. Fireball, Inferno, Kindle)
- **Ticks:** After the player ends their turn, before the enemy takes an action
- **Effect:** Enemy takes damage equal to current Char stacks
- **Decay:** Decreases by 1 stack after dealing damage each turn
- **Clears at:** 0 stacks
- **Special:** *Inferno Core* doubles all Char applied this turn

### Drown (Water) `#4488ff`
- **Applied by:** Water spells (e.g. Drown Surge)
- **Ticks:** After the player ends their turn, before the enemy takes an action
- **Effect:** Target takes damage equal to current Drown stacks
- **Decay:** **None** — stacks persist indefinitely
- **Clears at:** Only via Purify/cleanse
- **Note:** Most dangerous late-fight; stacks become lethal over time

### Shock (Arc) `#ffdd00`
- **Applied by:** Arc spells (e.g. Spark, Chain Bolt, Static Charge)
- **Ticks:** Decays at end of turn
- **Effect:** Arc damage dealt to a Shocked target is multiplied by ×1.25 per stack (exponential: ×1.25^N)
- **Decay:** -1 per turn
- **Clears at:** 0 stacks
- **Note:** Enables burst combos — stack Shock first, then land a heavy Arc hit

### Root (Grass) `#44cc66`
- **Applied by:** Grass spells (e.g. Entangle, Overgrowth)
- **Ticks:** On damage (detonation trigger, not turn-based)
- **Effect:** When the rooted target takes any damage, Root detonates — deals 2× current Root stacks as bonus damage, then all stacks are consumed
- **Decay:** None until detonation
- **Clears at:** On detonation only
- **Special:** *Verdant Surge* doubles all Root applied this turn

### Freeze (Ice) `#66ddff`
- **Applied by:** Ice spells (e.g. Frost Bolt, Blizzard, Chill)
- **Ticks:** Checked at start of enemy turn
- **Effect:** At 5+ stacks, the target's action is skipped entirely and all Freeze stacks are consumed
- **Decay:** No passive decay — accumulates until threshold or cleanse
- **Note:** Requires multiple cards to trigger; valuable against high-damage enemies

### Daze (Rock) `#cc9944`
- **Applied by:** Rock spells (e.g. Quake, Erode)
- **Ticks:** Each enemy turn
- **Effect:** 50% chance the enemy repeats their *previous* action instead of the current intended one
- **Decay:** -1 per turn
- **Clears at:** 0 stacks
- **Note:** Disrupts enemy patterns; most impactful when enemy just defended

### Blind (Light) `#f2f2f2`
- **Applied by:** Light spells (e.g. Radiant Bolt)
- **Ticks:** Each enemy attack
- **Effect:** If the enemy has any Blind, a single 50% roll decides whether the attack misses entirely (no damage). The chance is flat 50% — it does **not** scale with stack count.
- **Decay:** -1 per enemy attack (consumed whether the attack hits or misses), so N stacks covers the next N attacks
- **Clears at:** 0 stacks
- **Note:** Probabilistic — does not guarantee safety, but averages well over multiple attacks

### Weak `#cc6666`
- **Applied by:** Enemy intents only (Shade Wraith, Tide Witch, Shadow Stalker, Abyssal Leviathan, Shadow Sovereign). No player spell currently applies Weak.
- **Ticks:** Each turn
- **Effect:** All damage dealt by the affected target is multiplied by ×0.75 (floored). This is **flat** — any Weak stack applies the full ×0.75; it does not scale with stack count.
- **Decay:** -1 per turn
- **Clears at:** 0 stacks
- **Note:** Neutral/shared status — the stack count only controls how many turns it lasts, not the size of the reduction.

### Strength `#d4af37`
- **Applied by:** Enemy buff intents; some player spells (Magma Form, Earthen Skin)
- **Effect:** Adds flat bonus damage to every attack
- **Decay:** None — permanent until battle ends or cleansed
- **Note:** One of the most dangerous enemy buffs; prioritize kills before Strength stacks build

### Lifesteal (Shadow) `#cc66ff`
- **Applied by:** Shadow spells (e.g. Drain Life, Soul Rend, Shadow Strike)
- **Ticks:** After the enemy acts
- **Effect:** Drains HP from enemy equal to stacks, heals player by that amount
- **Decay:** Consumed after triggering (single-trigger per application)
- **Note:** Healing pays out after surviving the enemy's action

---

## Purify / Cleanse

The spell *Purify* (Dawnmage) cleanses this exact set of status effects from the player:
`Char, Drown, Shock, Root, Freeze, Daze, Weak`

**Blind, Lifesteal, and Strength are NOT removed.** Despite the starter card reading "Cleanse all debuffs," the implementation (`CleansePlayer`) only clears the seven effects above. Strength is a buff that currently appears only on enemies; Blind and Lifesteal are simply outside the cleanse set.

---

## Status Effect Interactions

| Combo | Result |
|---|---|
| Stack Shock → cast Arc | Exponential damage spike |
| Stack Root → cast any damage | Detonation burst |
| Stack Char via Inferno Core | Double stacks this turn, then burn over time |
| Stack Freeze to 5 → enemy skips | Full turn wasted for enemy |
| Apply Weak + any damage | 25% reduction on all enemy attacks that turn |
| Apply Daze after enemy attacks | Next turn: 50% chance they repeat the attack (instead of defending/buffing) |
