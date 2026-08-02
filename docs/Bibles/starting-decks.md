# Classes & Starting Decks Bible

Each wizard has a fixed starting kit: **6 class-specific cards** + **4 universal Neutral starter cards** (Focus, Guard, Amplify, Mana Petal) = a **10-card** starting deck. All classes start at **70 HP**.

The term "class" in code is shorthand — in the UI, this is called a **Starting Deck**.

> **Source of truth:** deck contents and card values below are taken directly from `Assets/Editor/CreateGameData.cs` (`CreateClasses` + `CreateSpells`) in the Wizard Battle game project. If the game changes, update this file to match.

---

## Universal Neutral Starters (All Classes)

These 4 cards are shuffled into every class deck. They are drawn into hand, cost mana, and exhaust (Fade) after use.

| Card | Cost | Effect |
|---|---|---|
| Focus | 1 | Draw 2 cards. Fade. |
| Guard | 1 | Gain 8 Block. Fade. |
| Amplify | 1 | Next spell gains ×1.5 effect. Fade. |
| Mana Petal | 0 | Gain 1 mana. Fade. |

**Design note:** These cards give every class a shared utility package while still participating in draw/discard/exhaust decisions.

---

## Pyromancer 🔥

**Type:** Fire | **HP:** 70
**In-game description:** *"Burn DoT and high burst damage. Every fire spell leaves a smoldering mark."*

**Identity:** Burn DoT stacker. Applies Char to steadily drain enemy HP. The deck rewards setup — Inferno Core (from rewards) unlocks burst Char turns.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Firebolt | 1 | ×2 | Deal 5 damage. Apply 1 Char |
| Ignite | 1 | ×2 | Deal 4 damage. Apply 2 Char |
| Flame Burst | 2 | ×1 | Deal 5 damage and apply 2 Char. Twice |
| Cauterize | 2 | ×1 | Gain 10 Block. Apply 3 Char |

**Key mechanic:** Char ticks at the end of every enemy turn (before the enemy acts) and decays by 1 after dealing damage. Stack it high early, then let it burn.

**Type matchups:** Strong vs Plant, Ice, Shadow (2×). Weak vs Water, Arc, Rock (0.5×).

**Early game:** Low immediate damage — you're setting up Char stacks. Play Ignite before attacking.

**Late game:** High sustained damage from stacked Char. Look for more Char spells (Kindle, Fireball, Inferno Core) from rewards.

---

## Tidecaller 🌊

**Type:** Water | **HP:** 70
**In-game description:** *"Healing, mana generation, and crowd control. The longer the fight, the stronger you become."*

**Identity:** Healing, mana generation, and Drown DoT. The most survivable class. Wins long fights by healing through damage and stacking permanent Drown.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Wavecrash | 1 | ×2 | Deal 5 damage. Apply 1 Drown |
| Soothing Wave | 1 | ×2 | Heal 4 HP. Apply 2 Drown |
| Riptide | 2 | ×1 | Deal 4 damage. Apply 2 Drown. +1 mana next turn |
| Drown Surge | 2 | ×1 | Deal 8 damage. Apply 5 Drown |

**Key mechanic:** Drown never decays. Stack it early and it pays off every turn for the rest of the fight. Riptide's +1 mana next turn keeps the tempo up.

**Type matchups:** Strong vs Fire, Rock, Light (2×). Weak vs Arc, Plant, Shadow (0.5×).

**Early game:** Flexible — can heal, deal damage, or generate tempo depending on the situation.

**Late game:** Passive Drown damage handles a lot of work. Pair with block spells once Drown has built up enough to be lethal without attacking.

---

## Stonewarden 🪨

**Type:** Rock | **HP:** 70
**In-game description:** *"Maximum defense and endurance. You don't win fast — you win last."*

**Identity:** Maximum defense. Outlasts enemies through block accumulation and Daze disruption. Lowest raw damage, but nearly impossible to kill.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Rock Throw− | 1 | ×2 | Deal 4 damage. Apply 1 Daze |
| Stoneskin | 1 | ×2 | Gain 8 Block. Apply 2 Daze |
| Erode | 2 | ×1 | Deal 8 damage. Apply 4 Daze |
| On Guard | 2 | ×1 | Gain 20 Block. Apply 2 Daze |

**Key combo:** Apply Daze after an enemy defends. 50% chance they repeat the defend action instead of attacking next turn — effectively wasting their turn while you keep blocking.

**Key mechanic:** On Guard (20 Block) is one of the most efficient block cards in the game. This deck can absorb enormous amounts of damage.

**Type matchups:** Strong vs Fire, Arc, Light (2×). Weak vs Water, Plant, Ice (0.5×).

**Early game:** Stack block constantly. Take minimal damage. Use Erode to disrupt attack patterns.

**Late game:** Needs damage to close out fights — prioritize attack or Daze spells from rewards. Boulder Crash (28 damage) is a key pickup.

---

## Stormseeker ⚡

**Type:** Arc | **HP:** 70
**In-game description:** *"Fast chains and Shock combos. Strike before they can react."*

**Identity:** Fast chains and exponential burst. Stack Shock on the enemy, then land a heavy Arc hit for multiplied damage. Highest damage ceiling in the game.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Spark Strike | 1 | ×2 | Deal 5 damage. Apply 1 Shock |
| Static Charge | 1 | ×2 | Deal 4 damage. Apply 2 Shock |
| Chain Lightning | 2 | ×1 | Deal 4 damage and apply 2 Shock. Three times |
| Surge Engine | 2 | ×1 | Apply 3 Shock. +2 mana next turn |

**Key combo:** Build Shock with Surge Engine and Static Charge, then cash in with Chain Lightning — each of its 3 hits benefits from the full Shock multiplier (and adds 2 more Shock).

**Key mechanic:** Shock multiplies Arc damage by ×1.25 per stack, compounding (×1.25^N). Surge Engine's +2 mana next turn funds a big follow-up combo turn.

**Type matchups:** Strong vs Water, Fire, Shadow (2×). Weak vs Rock, Light, Ice (0.5×).

**Early game:** Build Shock stacks first, then burst. Don't waste the multiplier on Spark Strike when Chain Lightning is in hand.

**Late game:** Storm Call (10 damage ×3) with Shock is devastating. Extra draw effects help find the right burst sequence.

---

## Frostweaver ❄️

**Type:** Ice | **HP:** 70
**In-game description:** *"Freeze enemies solid and shatter them. Control the tempo, control the fight."*

**Identity:** Control. Accumulate Freeze stacks — at 5, the enemy skips their entire turn. Pairs solid block with turn denial.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Shardsicle | 1 | ×2 | Deal 5 damage. Apply 1 Freeze |
| Ice Cube | 1 | ×2 | Gain 8 Block. Apply 2 Freeze |
| Blizzard Strike | 2 | ×1 | Deal 5 damage and apply 2 Freeze. Twice |
| Frost Armor | 2 | ×1 | Gain 10 Block. Apply 3 Freeze |

**Key mechanic:** Freeze doesn't decay on its own — stacks accumulate across turns. When the enemy reaches **5** Freeze stacks, their next action is skipped and all stacks are consumed.

**Type matchups:** Strong vs Rock, Arc, Shadow (2×). Weak vs Fire, Plant, Light (0.5×).

**Early game:** Alternate block and Freeze application. Blizzard Strike lands 4 Freeze in one card (2 hits × 2 Freeze).

**Late game:** A skipped enemy turn at the right moment (before a big attack) can win fights. Blizzard (12 damage + 2 Freeze) and Absolute Zero (rare — 3 Freeze + 20 damage) are priority pickups.

---

## Shadowblade 🌑

**Type:** Shadow | **HP:** 70
**In-game description:** *"Lifesteal and curses. Drain everything they have."*

**Identity:** Lifesteal and curses. Drains HP from enemies to sustain itself. Self-sufficient — doesn't need healing from rest nodes as badly as others.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Shadow Strike | 1 | ×2 | Deal 5 damage. Apply 2 Lifesteal |
| Curse Touch | 1 | ×2 | Apply 4 Lifesteal |
| Soul Drain | 2 | ×1 | Deal 8 damage. Apply 8 Lifesteal |
| Shadow Pact | 2 | ×1 | Lose 6 HP. Apply 12 Lifesteal |

**Key mechanic:** Lifesteal queues up as a drain — at the end of the enemy's next turn, that much HP is taken from them and given to you (capped at max HP), then the stacks are consumed. It applies even if they die during your turn.

**Key combo:** Shadow Pact (lose 6 HP, apply 12 Lifesteal) is a huge tempo swing — the HP cost is paid back many times over when the drain resolves.

> **Note:** Weak is an **enemy-only** debuff in the current build. Despite the class fantasy of "curses," Curse Touch and Curse apply **Lifesteal**, not Weak — the Shadowblade starter kit does not apply Weak at all.

**Type matchups:** Strong vs Water, Plant, Light (2×). Weak vs Fire, Arc, Ice (0.5×).

**Early game:** Lead with Curse Touch and Shadow Strike to bank Lifesteal, then coast on the healing.

**Late game:** Dark Pact (draw 2, lose 4 HP) and Soul Rend (24 damage + 12 Lifesteal) are priority upgrades. The deck scales well with more Lifesteal.

---

## Dawnmage ☀️

**Type:** Light | **HP:** 70
**In-game description:** *"Shields, heals, and cleanses. Outlast and purify."*

**Identity:** Shields, heals, and cleanses. The most defensive class. Purify hard-counters status-heavy enemies. Blind disrupts attacks.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Radiant Bolt | 1 | ×2 | Deal 5 damage. Apply 1 Blind |
| Shielding Light | 1 | ×2 | Gain 8 Block. Apply 2 Blind |
| Purify | 2 | ×1 | Cleanse all debuffs. Heal 20 HP. Apply 2 Blind |
| Divine Barrier | 2 | ×1 | Gain 20 Block. Apply 3 Blind |

**Key mechanic:** Purify (the starter version) clears Char, Drown, Shock, Root, Freeze, Daze, and Weak from you and heals 20 HP. It does **not** remove Blind or Lifesteal. Against Char/Drown-heavy enemies, this card is worth more than any attack.

**Key mechanic:** Blind gives each enemy attack a **flat 50%** miss chance (it does not scale with stack count); each attack consumes 1 Blind stack whether it hits or misses. So 3 Blind covers the next 3 attacks with a 50% miss roll each.

**Type matchups:** Strong vs Plant, Arc, Ice (2×). Weak vs Water, Rock, Shadow (0.5×).

**Early game:** Block and heal to stay healthy. Apply Blind to disrupt the enemy's attack intent.

**Late game:** Purify and Divine Barrier carry this class far. Sunburst (20 damage + 10 heal + 8 block) is a top-tier rare pickup.

---

## Verdantmaker 🌿

**Type:** Plant | **HP:** 70
**In-game description:** *"Low base damage with exponential DoT. Plant the seeds and watch them suffer."*

**Identity:** Root trap with exponential burst. Stacks Root on the enemy — which detonates as 2× stacks in bonus damage the next time they take any damage. Verdant Surge doubles Root applied this turn.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Vine Lash | 1 | ×2 | Deal 5 damage. Apply 1 Root |
| Entangle | 1 | ×2 | Gain 4 Block. Apply 2 Root |
| Overgrowth | 2 | ×1 | Deal 8 damage. Apply 4 Root |
| Verdant Surge | 2 | ×1 | Root applied this turn is doubled. Fade |

**Key combo:** Verdant Surge → Entangle → Entangle → Vine Lash. That's (2+2) ×2 = 8 Root stacks, then Vine Lash detonates for 16 burst bonus damage + 5 damage = 21 from one sequence.

**Key mechanic:** Root does nothing on its own until the enemy takes damage. Time the detonation — the bigger the Root stack before you trigger it, the more burst damage.

**Type matchups:** Strong vs Water, Ice, Rock (2×). Weak vs Fire, Light, Shadow (0.5×).

**Early game:** Build Root stacks before dealing damage. Don't waste detonations on small hits — save trigger damage for when stacks are high.

**Late game:** Verdant Bloom (6 Root + 10 heal) is a top pickup. The deck rewards patience and setup over raw aggression.
