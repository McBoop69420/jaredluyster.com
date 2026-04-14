# Status Effects Bible

All status effects are tracked as integer stacks on `statusEffects` in the battle state.

---

## Quick Reference

| Effect | Color | Type | Source | Mechanic Summary |
|---|---|---|---|---|
| Char | `#ff6633` | DoT | Fire | Deals damage = stacks at end of enemy turn, decays -1/turn |
| Drown | `#4488ff` | DoT | Water | Deals damage = stacks each turn, **no decay** |
| Shock | `#ffdd00` | Amplifier | Arc | Arc attacks deal ×1.25 per stack; decays -1/turn |
| Root | `#44cc66` | Trap | Grass | On next damage hit: bursts for 2× stacks as bonus damage, all stacks consumed |
| Freeze | `#66ddff` | Skip | Ice | At 3+ stacks: skip action, consume all stacks |
| Daze | `#cc9944` | Disruption | Rock | 50% chance enemy repeats previous action; decays -1/turn |
| Blind | `#f2f2f2` | Miss | Light | 50% chance enemy attack misses entirely; decays -1/turn |
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
- **Ticks:** Each turn (player turn tick)
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
- **Effect:** 50% chance per Blind stack that the attack misses entirely (no damage)
- **Decay:** -1 per turn
- **Clears at:** 0 stacks
- **Note:** Probabilistic — does not guarantee safety, but averages well over multiple attacks

### Weak `#cc6666`
- **Applied by:** Multiple types (Shadow, Water, Rock)
- **Ticks:** Each turn
- **Effect:** All damage dealt by the affected target is reduced by 25% (floor division)
- **Decay:** -1 per turn
- **Clears at:** 0 stacks
- **Note:** Neutral/shared status — crosses type boundaries

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
