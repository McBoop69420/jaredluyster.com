# Classes & Starting Decks Bible

Each wizard has a fixed starting deck of 10 cards: **6 class-specific spells** + **4 universal Fade cards** (Focus, Guard, Amplify, Mana Petal). The starting deck defines the class's identity and early strategy. All classes start at **70 HP**.

The term "class" in code is shorthand — in the UI, this is called a **Starting Deck**.

---

## Universal Fade Cards (All Classes)

These 4 cards are in every starting deck. They are removed from the game permanently after being played (Fade), so they naturally thin out of your deck over a run.

| Card | Cost | Effect |
|---|---|---|
| Focus | 1 | Draw 2 cards |
| Guard | 1 | Gain 8 Block |
| Amplify | 1 | Next spell this turn gains ×1.5 effect |
| Mana Petal | 0 | Gain 1 mana this turn |

**Design note:** These cards give every class a safety valve in the early game. They fade away and don't clog the deck later.

---

## Pyromancer 🔥

**Type:** Fire | **HP:** 70

**Identity:** Burn DoT stacker. Applies Char to steadily drain enemy HP. The deck rewards setup — Inferno Core unlocks burst Char turns.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Firebolt | 1 | ×2 | Deal 6 damage |
| Ignite | 1 | ×2 | Apply 3 Char |
| Flame Burst | 2 | ×1 | Deal 5 damage twice |
| Inferno Core | 2 | ×1 | Char applied this turn is doubled |

**Key combo:** Play Inferno Core → then Ignite in the same turn → 6 Char instead of 3. Char ticks at end of every enemy turn and decays by 1 after dealing damage.

**Type matchups:** Strong vs Grass (2×). Weak vs Water (0.5×).

**Early game:** Low immediate damage — you're setting up Char stacks. Play Ignite before attacking.

**Late game:** High sustained damage from stacked Char. Look for more Char spells (Kindle, Fireball) from rewards.

---

## Tidecaller 🌊

**Type:** Water | **HP:** 70

**Identity:** Healing, mana generation, and Drown DoT. The most survivable class. Wins long fights by healing through damage and stacking permanent Drown.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Wavecrash | 1 | ×2 | Deal 6 damage |
| Soothing Wave | 1 | ×2 | Heal 5 HP |
| Tidal Flow | 2 | ×1 | Deal 4 damage. Draw 1. Gain 1 mana next turn |
| Drown Surge | 2 | ×1 | Deal 4 damage. Apply 4 Drown |

**Key combo:** Tidal Flow sets up a 4-mana turn the next round. Use extra mana for a heavy damage + Drown stack turn.

**Key mechanic:** Drown never decays. Stack it early and it pays off every turn for the rest of the fight.

**Type matchups:** Strong vs Fire (2×). Weak vs Arc (0.5×).

**Early game:** Flexible — can heal, deal damage, or generate mana depending on the situation.

**Late game:** Passive Drown damage handles a lot of work. Pair with block spells if Drown has built up enough to be lethal without attacking.

---

## Stonewarden 🪨

**Type:** Rock | **HP:** 70

**Identity:** Maximum defense. Outlasts enemies through block accumulation and Daze disruption. Lowest raw damage, but nearly impossible to kill.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Rock Throw | 1 | ×2 | Deal 6 damage |
| Stoneskin | 1 | ×2 | Gain 10 Block |
| Erode | 2 | ×1 | Deal 4 damage. Apply 2 Daze |
| On Guard | 2 | ×1 | Gain 25 Block |

**Key combo:** Apply Daze after an enemy defends. 50% chance they repeat the defend action instead of attacking next turn — effectively wasting their turn while you keep blocking.

**Key mechanic:** On Guard (25 Block for 2 mana) is one of the most efficient block cards in the game. This deck can absorb enormous amounts of damage.

**Type matchups:** Strong vs Arc (2×). Weak vs Ice (0.5×).

**Early game:** Stack block constantly. Take minimal damage. Use Erode to disrupt attack patterns.

**Late game:** Needs damage to close out fights — prioritize attack or Daze spells from rewards. Boulder Crash (28 damage) is a key pickup.

---

## Stormseeker ⚡

**Type:** Arc | **HP:** 70

**Identity:** Fast chains and exponential burst. Stack Shock on the enemy, then land a heavy Arc hit for multiplied damage. Highest damage ceiling in the game.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Spark Strike | 1 | ×2 | Deal 6 damage |
| Static Charge | 1 | ×2 | Deal 3 damage. Apply 1 Shock |
| Chain Lightning | 2 | ×1 | Deal 4 damage 3 times |
| Surge Engine | 2 | ×1 | Gain 2 mana next turn |

**Key combo:** Surge Engine this turn → 5 mana next turn → Static Charge + Static Charge + Chain Lightning (2 Shock stacks → ×1.25² ≈ ×1.56 on each of 3 hits).

**Key mechanic:** Shock multiplies Arc damage by ×1.25 per stack, compounding (×1.25^N). Chain Lightning hits 3 times — each hit benefits from the full Shock multiplier.

**Type matchups:** Strong vs Water (2×). Weak vs Rock (0.5×).

**Early game:** Build Shock stacks first, then burst. Don't waste the multiplier on Spark Strike when Chain Lightning is in hand.

**Late game:** Storm Call (10 damage ×3) with Shock is devastating. Overcharge (free +2 mana) enables bigger burst turns.

---

## Frostweaver ❄️

**Type:** Ice | **HP:** 70

**Identity:** Control. Accumulate Freeze stacks — at 3, the enemy skips their entire turn. Pairs solid block with turn denial.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Shardsicle | 1 | ×2 | Deal 6 damage |
| Ice Cube | 1 | ×2 | Gain 10 Block |
| Frost Armor | 2 | ×1 | Gain 10 Block. Apply 1 Freeze — Fade |
| Absolute Zero | 2 | ×1 | Apply 1 Freeze — Fade |

**Key mechanic:** Freeze doesn't decay on its own — stacks accumulate across turns. When the enemy hits 3 Freeze stacks, their next action is skipped and all stacks are consumed.

**Note:** Frost Armor and Absolute Zero are Fade in the starting deck — they leave after use. Non-Fade versions exist in the reward pool.

**Type matchups:** Strong vs Rock (2×). Weak vs Grass (0.5×).

**Early game:** Alternate block and Freeze application. The Fade cards provide Freeze setup early; replace them with non-Fade Freeze spells from rewards.

**Late game:** A skipped enemy turn at the right moment (before a big attack) can win fights. Blizzard (12 damage + 2 Freeze) and Absolute Zero (rare, 3 Freeze + 20 damage) are priority pickups.

---

## Shadowblade 🌑

**Type:** Shadow | **HP:** 70

**Identity:** Lifesteal and curses. Drains HP from enemies to sustain itself. Weak debuff cuts enemy damage by 25%. Self-sufficient — doesn't need healing from rest nodes as badly as others.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Shadow Strike | 1 | ×2 | Deal 4 damage. Lifesteal 2 |
| Curse Touch | 1 | ×2 | Apply 2 Weak |
| Soul Drain | 2 | ×1 | Deal 8 damage. Lifesteal 6 |
| Shadow Pact | 2 | ×1 | Lose 6 HP. Apply 12 Lifesteal |

**Key mechanic:** Lifesteal queues up as a drain — at the end of the enemy's next turn, that much HP is taken from them and given to you. It applies even if they die during your turn.

**Key combo:** Curse Touch (2 Weak) reduces all enemy attacks by 25%. With 2 stacks applied, enemy is dealing 50% less damage — effectively doubling your effective HP.

**Type matchups:** Strong vs Light (2×). Weak vs Shadow enemies (0.5×).

**Early game:** Lead with Curse Touch to reduce incoming damage immediately. Lifesteal provides consistent HP recovery without needing rest stops.

**Late game:** Dark Pact (draw 2 cards, lose 4 HP) and Soul Rend (24 damage + heal 12) are priority upgrades. The deck scales well with more Lifesteal and Weak stacking.

---

## Dawnmage ☀️

**Type:** Light | **HP:** 70

**Identity:** Shields, heals, and cleanses. The most defensive class. Purify hard-counters status-heavy enemies. Blind disrupts attacks on a per-stack basis.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Radiant Bolt | 1 | ×2 | Deal 6 damage. Apply 1 Blind |
| Shielding Light | 1 | ×2 | Gain 8 Block |
| Purify | 2 | ×1 | Cleanse all debuffs. Heal 20 HP |
| Divine Barrier | 2 | ×1 | Gain 30 Block |

**Key mechanic:** Purify removes all negative statuses from the player (Char, Drown, Freeze, Shock, Weak, Root, Daze) and heals 20 HP. Against Char/Drown-heavy enemies, this card is worth more than any attack.

**Key mechanic:** Blind gives a 50% miss chance on the enemy's next attack, then consumes 1 stack. Additional stacks extend how many attacks can miss, not the probability. Stack Radiant Bolt to protect against multiple consecutive attacks.

**Type matchups:** Strong vs Shadow (2×). Weak vs Light enemies (0.5×).

**Early game:** Block and heal to stay healthy. Apply Blind to disrupt the enemy's attack intent.

**Late game:** Holy Purify and Divine Barrier carry this class far. Sunburst (20 damage + 10 heal + 8 block) is a top-tier rare pickup for this class.

---

## Verdantmaker 🌿

**Type:** Grass | **HP:** 70

**Identity:** Root trap with exponential burst. Stacks Root on the enemy — which detonates as 2× stacks in bonus damage the next time they take any damage. Verdant Surge doubles Root applied this turn.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Vine Lash | 1 | ×2 | Deal 6 damage |
| Entangle | 1 | ×2 | Apply 2 Root |
| Overgrowth | 2 | ×1 | Gain 8 Block. Apply 2 Root |
| Verdant Surge | 2 | ×1 | Root applied this turn is doubled |

**Key combo:** Verdant Surge → Entangle → Entangle → Vine Lash. That's (2+2) ×2 = 8 Root stacks, then detonates on Vine Lash for 16 burst bonus damage + 6 damage = 22 damage total from one sequence.

**Key mechanic:** Root does nothing on its own until the enemy takes damage. Time the detonation — the bigger the Root stack before you trigger it, the more burst damage.

**Type matchups:** Strong vs Ice (2×). Weak vs Fire (0.5×).

**Early game:** Build Root stacks before dealing damage. Don't waste detonations on small hits — save trigger damage for when stacks are high.

**Late game:** Verdant Bloom (6 Root + 10 heal) is a top pickup. The deck rewards patience and setup over raw aggression.
