# Spells Bible

Full spell reference organized by type. All values sourced from `Assets/Editor/CreateGameData.cs` (`CreateSpells`, `CreateSpellTierVariants`, `LinkSpellTiers`) in the Wizard Battle game project.

**Conventions:**
- *(S)* = **Starter rarity** tier. Note this is a rarity, not deck membership: not every Starter-rarity card is in a deck (e.g. Inferno Core), and one deck card is Common rarity (Rock Throw−, the Minus-tier variant of the Common-rarity Rock Throw). Actual starting-deck contents live in [starting-decks.md](starting-decks.md).
- *Fade* = Exhaust after use for the current combat
- *On hit* = Reactive effect that triggers when the enemy's attack deals damage through your block
- Multi-hit spells list each hit separately (e.g. "Twice" = effects listed once, apply twice)

---

## Spell Tiers

Every **colored** spell exists in three handcrafted versions. Tier is shown as a suffix on the card name:

| Tier | Suffix | Description |
|---|---|---|
| Minus | `SpellName−` | Weaker starting version. All colored **starter** cards begin at this tier. |
| Regular | `SpellName` | Standard version. All **reward and shop** spells are this tier. |
| Plus | `SpellName+` | Upgraded version. Capped — cannot be upgraded further. |

Each tier is a separate ScriptableObject with its own explicit values (no formula). The minus/plus variants of a spell cross-reference each other via `downgradedVersion` / `upgradedVersion` fields on `SpellData`.

**Neutral/Fade starters** (Focus, Guard, Amplify, Mana Petal) are tier-less and never change.

---

## Fire 🔥

**Class status:** Char — DoT equal to stacks, ticks after the player ends their turn and before the enemy acts, decays -1 after ticking.

**Signature buff:** Inferno Core — doubles all Char applied this turn. Single-turn only.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Firebolt *(S)* | 1 | Starter | Deal 5 damage. Apply 1 Char. |
| Ignite *(S)* | 1 | Starter | Deal 4 damage. Apply 2 Char. |
| Flame Burst *(S)* | 2 | Starter | Deal 5 damage and apply 2 Char. Twice. |
| Cauterize *(S)* | 2 | Starter | Gain 10 Block. Apply 3 Char. |
| Inferno Core *(S)* | 2 | Starter | Char applied this turn is doubled. |
| Ember Shot | 1 | Common | Deal 8 damage. |
| Kindle | 0 | Common | Apply 2 Char. Draw 1. |
| Fireball | 2 | Common | Deal 14 damage. Apply 2 Char. |
| Flame Shield | 1 | Common | Gain 8 Block. On hit: apply 1 Char to attacker. |
| Heat Wave | 2 | Uncommon | Deal 10 damage. Apply 3 Char. Draw 1 next turn. |
| Inferno | 3 | Uncommon | Deal 22 damage. Apply 4 Char. |
| Magma Form | 2 | Rare | Gain 12 Block. |

---

## Water 🌊

**Class status:** Drown — DoT equal to stacks, ticks after the player ends their turn and before the enemy acts. No decay (permanent).

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Wavecrash *(S)* | 1 | Starter | Deal 5 damage. Apply 1 Drown. |
| Soothing Wave *(S)* | 1 | Starter | Heal 4 HP. Apply 2 Drown. |
| Drown Surge *(S)* | 2 | Starter | Deal 8 damage. Apply 5 Drown. |
| Riptide *(S)* | 2 | Starter | Deal 4 damage. Apply 2 Drown. +1 mana next turn. |
| Water Bolt | 1 | Common | Deal 7 damage. |
| Tidal Shield | 1 | Common | Gain 10 Block. |
| Tidal Wave | 2 | Common | Deal 12 damage. |
| Tidal Flow | 2 | Common | Deal 4 damage. Draw 1. +1 mana next turn. |
| Healing Rain | 2 | Common | Heal 12 HP. |
| Mana Spring | 0 | Uncommon | Gain 1 mana. Draw 1. |
| Whirlpool | 2 | Uncommon | Deal 14 damage. Apply 3 Drown. |
| Deep Current | 3 | Rare | Deal 20 damage. Heal 8 HP. |

---

## Rock 🪨

**Class status:** Daze — 50% chance the enemy repeats its previous action instead. Decays -1/turn.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Stoneskin *(S)* | 1 | Starter | Gain 8 Block. Apply 2 Daze. |
| Erode *(S)* | 2 | Starter | Deal 8 damage. Apply 4 Daze. |
| On Guard *(S)* | 2 | Starter | Gain 20 Block. Apply 2 Daze. |
| Rock Throw | 1 | Common | Deal 5 damage. Apply 1 Daze. |
| Stone Wall | 1 | Common | Gain 12 Block. |
| Tremor | 0 | Common | Deal 4 damage. Gain 4 Block. |
| Quake | 2 | Common | Deal 14 damage. Apply 2 Daze. |
| Boulder Crash | 3 | Uncommon | Deal 28 damage. Apply 3 Daze. |
| Earthen Skin | 2 | Uncommon | Gain 16 Block. |
| Fissure | 2 | Rare | Deal 12 damage. Draw 2. |

---

## Arc ⚡

**Class status:** Shock — multiplies Arc damage by ×1.25 per stack. Decays -1/turn.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Spark Strike *(S)* | 1 | Starter | Deal 5 damage. Apply 1 Shock. |
| Static Charge *(S)* | 1 | Starter | Deal 4 damage. Apply 2 Shock. |
| Chain Lightning *(S)* | 2 | Starter | Deal 4 damage and apply 2 Shock. Three times. |
| Surge Engine *(S)* | 2 | Starter | Apply 3 Shock. +2 mana next turn. |
| Spark | 1 | Common | Deal 7 damage. Apply 1 Shock. |
| Arc Surge | 1 | Common | Deal 6 damage. Draw 1. |
| Chain Bolt | 2 | Common | Deal 10 damage. Apply 2 Shock. |
| Static Field | 1 | Common | Gain 6 Block. On hit: apply 1 Shock to attacker. |
| Overcharge | 0 | Uncommon | Gain 2 mana. Discard 1 card. |
| Thunderstrike | 2 | Uncommon | Deal 18 damage. |
| Storm Call | 3 | Rare | Deal 10 damage three times. |

---

## Ice ❄️

**Class status:** Freeze — at 5+ stacks, the enemy's action is skipped and all Freeze is consumed.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Shardsicle *(S)* | 1 | Starter | Deal 5 damage. Apply 1 Freeze. |
| Ice Cube *(S)* | 1 | Starter | Gain 8 Block. Apply 2 Freeze. |
| Blizzard Strike *(S)* | 2 | Starter | Deal 5 damage and apply 2 Freeze. Twice. |
| Frost Armor *(S)* | 2 | Starter | Gain 10 Block. Apply 3 Freeze. |
| Absolute Zero *(S)* | 2 | Starter | Apply 3 Freeze. Fade. |
| Chill | 0 | Common | Apply 1 Freeze. Gain 4 Block. |
| Frost Bolt | 1 | Common | Deal 7 damage. Apply 1 Freeze. |
| Ice Armor | 1 | Common | Gain 10 Block. |
| Blizzard | 2 | Common | Deal 12 damage. Apply 2 Freeze. |
| Crystallize | 1 | Uncommon | Gain 16 Block. |
| Glacial Spike | 2 | Uncommon | Deal 18 damage. |
| Absolute Zero | 3 | Rare | Apply 3 Freeze. Deal 20 damage. |

---

## Shadow 🌑

**Class status:** Lifesteal — drains enemy HP and heals player at end of enemy turn. Fully consumed each tick.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Shadow Strike *(S)* | 1 | Starter | Deal 5 damage. Lifesteal 2. |
| Curse Touch *(S)* | 1 | Starter | Lifesteal 3. |
| Soul Drain *(S)* | 2 | Starter | Deal 8 damage. Lifesteal 5. |
| Shadow Pact *(S)* | 2 | Starter | Lose 6 HP. Lifesteal 8. |
| Shadow Bolt | 1 | Common | Deal 9 damage. |
| Shadow Step | 1 | Common | Gain 8 Block. |
| Curse | 1 | Common | Lifesteal 6. |
| Drain Life | 2 | Common | Deal 10 damage. Heal 5 HP. |
| Dark Pact | 0 | Uncommon | Lose 4 HP. Draw 2 cards. |
| Void Tear | 2 | Uncommon | Deal 16 damage. |
| Soul Rend | 3 | Rare | Deal 24 damage. Apply 12 Lifesteal. |

---

## Light ☀️

**Class status:** Blind — a flat 50% miss chance on each enemy attack (does not scale with stacks), consuming 1 stack per attack whether it hits or misses.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Radiant Bolt *(S)* | 1 | Starter | Deal 5 damage. Apply 1 Blind. |
| Shielding Light *(S)* | 1 | Starter | Gain 8 Block. Apply 2 Blind. |
| Purify *(S)* | 2 | Starter | Cleanse all debuffs. Heal 20 HP. Apply 2 Blind. |
| Divine Barrier *(S)* | 2 | Starter | Gain 20 Block. Apply 3 Blind. |
| Radiant Bolt | 1 | Common | Deal 7 damage. |
| Holy Shield | 1 | Common | Gain 12 Block. |
| Divine Smite | 2 | Common | Deal 14 damage. Apply 2 Blind. |
| Blessing | 1 | Uncommon | Heal 8 HP. Draw 1. |
| Purify | 0 | Uncommon | Remove all negative statuses. Draw 1. |
| Radiance | 2 | Uncommon | Heal 14 HP. |
| Sunburst | 3 | Rare | Deal 20 damage. Heal 10 HP. Gain 8 Block. |

---

## Plant 🌿

**Class status:** Root — detonates on any damage: deals 2× stacks as bonus damage, then all Root is consumed.

**Signature buff:** Verdant Surge — doubles all Root applied this turn. Single-turn only.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Vine Lash *(S)* | 1 | Starter | Deal 5 damage. Apply 1 Root. |
| Entangle *(S)* | 1 | Starter | Gain 4 Block. Apply 2 Root. |
| Overgrowth *(S)* | 2 | Starter | Deal 8 damage. Apply 4 Root. |
| Verdant Surge *(S)* | 2 | Starter | Root applied this turn is doubled. Fade. |
| Vine Whip | 1 | Common | Deal 5 damage. Apply 1 Root. |
| Seed Shot | 0 | Common | Apply 1 Root. Draw 1. |
| Spore Cloud | 1 | Common | Apply 2 Root. Gain 4 Block. |
| Thorn Armor | 1 | Common | Gain 8 Block. On hit: apply 1 Root to attacker. |
| Thicket | 2 | Uncommon | Apply 4 Root. Deal 6 damage. |
| Root Bind | 2 | Uncommon | Apply 4 Root. |
| Verdant Bloom | 3 | Rare | Apply 6 Root. Heal 10 HP. |

---

## Neutral (Universal Starters — All Classes)

All four universal starters are normal Neutral cards in the starting deck. They are drawn, played, discarded, and exhausted by Fade like other cards. They match the wizard's element color in-game but are Neutral type for damage purposes.

| Name | Cost | Rarity | Effect |
|---|---|---|---|
| Focus | 1 | Starter | Draw 2 cards. Fade. |
| Guard | 1 | Starter | Gain 8 Block. Fade. |
| Amplify | 1 | Starter | The next spell you cast gains +50% effect. Fade. |
| Mana Petal | 0 | Starter | Gain 1 mana. Fade. |

---

## Mechanic Notes

**Multi-hit spells:** Each hit resolves independently — type effectiveness applies per hit, and Root detonates on the first hit. Spells with "Twice" or "three times" in the description repeat all listed effects. Examples: Flame Burst (2 hits of 5 dmg + 2 Char), Chain Lightning (3 hits of 4 dmg), Blizzard Strike (2 hits of 5 dmg + 2 Freeze), Storm Call (3 hits of 10 dmg).

**Lifesteal:** Applied as a status on the enemy. At the end of the enemy's turn, the enemy loses that many HP and the player heals the same amount (capped at max HP). Then all Lifesteal stacks are consumed. Multiple Lifesteal effects played in one turn stack.

**On-hit effects** (Flame Shield, Static Field, Thorn Armor): The reactive effect only triggers if the enemy's attack deals damage through your block. The effect is cleared at the start of your next turn.

**Cleanse** (both Purify cards): Removes Char, Drown, Shock, Root, Freeze, Daze, and Weak from the player. Does **not** remove Blind or Lifesteal (despite the starter card text "Cleanse all debuffs").

**Mana effects:** `gainMana` grants mana immediately. `gainManaNextTurn` queues bonus mana for the next player turn.
