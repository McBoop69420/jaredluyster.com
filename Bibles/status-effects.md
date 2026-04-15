# Status Effects Bible

All status effects are tracked as integer stacks on `statusEffects` in the battle state.

---

## Quick Reference

| Effect | Color | Type | Source | Mechanic Summary |
|---|---|---|---|---|
| Char | `#ff6633` | DoT | Fire | Deals damage = stacks at end of enemy turn, decays -1/turn |
| Drown | `#4488ff` | DoT | Water | Deals damage = stacks at end of enemy turn, **no decay** |
| Shock | `#ffdd00` | Amplifier | Arc | Arc attacks deal ×1.25 per stack; decays -1/turn |
| Root | `#44cc66` | Trap | Grass | On next damage hit: bursts for 2× stacks as bonus damage, all stacks consumed |
| Freeze | `#66ddff` | Skip | Ice | At 3+ stacks: skip action, consume all stacks |
| Daze | `#cc9944` | Disruption | Rock | 50% chance enemy repeats previous action; decays -1/turn |
| Blind | `#f2f2f2` | Miss | Light | If target has ≥1 stack: 50% chance next attack misses entirely; Blind -1 per attack |
| Weak | `#cc6666` | Debuff | Shadow/various | Reduces all damage dealt by 25%; decays -1/turn |
| Strength | `#d4af37` | Buff | Enemy buffs | Adds flat bonus to all attacks |
| Lifesteal | `#cc66ff` | Drain | Shadow | At end of enemy turn: drains HP from enemy, heals player |

---

## Detailed Mechanics

### Char (Fire) `#ff6633`
- **Applied by:** Fire spells (e.g. Fireball, Inferno, Kindle)
- **Ticks:** End of enemy turn
- **Effect:** Enemy takes damage equal to current Char stacks
- **Decay:** Decreases by 1 stack after dealing damage each turn
- **Clears at:** 0 stacks
- **Special:** *Inferno Core* doubles all Char applied this turn

### Drown (Water) `#4488ff`
- **Applied by:** Water spells (e.g. Drown Surge)
- **Ticks:** End of enemy turn (same phase as Char and Lifesteal)
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
- **Effect:** At 3+ stacks, the target's action is skipped entirely and all Freeze stacks are consumed
- **Decay:** No passive decay — accumulates until threshold or cleanse
- **Note:** Requires investment to trigger; valuable against high-damage enemies

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
- **Effect:** If the target has ≥1 Blind stack, their next attack has a 50% chance to miss entirely (no damage). One stack is consumed per attack regardless of hit or miss.
- **Decay:** -1 per attack (not per turn — stacks represent number of attacks affected, not duration)
- **Clears at:** 0 stacks
- **Note:** Additional stacks extend how many attacks can miss, not the miss probability. 1 stack = 50% on the next attack. 3 stacks = 50% on each of the next 3 attacks.

### Weak `#cc6666`
- **Applied by:** Multiple types (Shadow, Water, Rock)
- **Ticks:** Each turn
- **Effect:** Each stack multiplies all damage dealt by the affected target by ×0.75. Total multiplier = 0.75^N (floor at the end). 2 stacks = ×0.5625, 3 stacks = ×0.422, etc.
- **Decay:** -1 per turn
- **Clears at:** 0 stacks
- **Note:** Neutral/shared status — crosses type boundaries. Stacks multiplicatively, not additively — additional stacks have diminishing but meaningful returns.

### Strength `#d4af37`
- **Applied by:** Enemy buff intents; some player spells (Magma Form, Earthen Skin)
- **Effect:** Adds flat bonus damage to every attack
- **Decay:** None — permanent until battle ends or cleansed
- **Note:** One of the most dangerous enemy buffs; prioritize kills before Strength stacks build

### Lifesteal (Shadow) `#cc66ff`
- **Applied by:** Shadow spells (e.g. Drain Life, Soul Rend, Shadow Strike)
- **Ticks:** End of enemy turn
- **Effect:** Drains HP from enemy equal to stacks, heals player by that amount
- **Decay:** Consumed after triggering (single-trigger per application)
- **Note:** In `battle.js` this is tracked as a status but behaves like a queued heal

---

## Purify / Cleanse

The spell *Purify* (Dawnmage) removes all negative status effects from the player:
`Char, Freeze, Shock, Drown, Weak, Root, Daze`

**Not** cleansed by Purify:
- **Strength** — a buff, not a debuff; currently only appears on enemies
- **Blind** — a debuff the player applies *to enemies* (makes enemy attacks miss); the player cannot be Blinded under current rules
- **Lifesteal** — a beneficial effect (heals the player); removing it would be self-defeating and conflicts with Shadowblade's sustain identity

---

## Status Effect Interactions

| Combo | Result |
|---|---|
| Stack Shock → cast Arc | Exponential damage spike |
| Stack Root → cast any damage | Detonation burst |
| Stack Char via Inferno Core | Double stacks this turn, then burn over time |
| Stack Freeze to 3 → enemy skips | Full turn wasted for enemy |
| Apply Weak + any damage | 25% reduction on all enemy attacks that turn |
| Apply Daze after enemy attacks | Next turn: 50% chance they repeat the attack (instead of defending/buffing) |
