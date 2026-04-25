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

**Identity:** Burn DoT stacker. Every card applies Char — the deck builds pressure from the first turn and never lets up.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Firebolt | 1 | ×2 | Deal 5 damage. Apply 1 Char |
| Ignite | 1 | ×2 | Deal 4 damage. Apply 2 Char |
| Flame Burst | 2 | ×1 | Deal 5 damage. Apply 2 Char. Twice |
| Cauterize | 2 | ×1 | Gain 10 Block. Apply 3 Char |

**Key mechanic:** Char ticks at end of every enemy turn and decays by 1 after dealing damage. Stack it early — even 4–5 Char is significant sustained pressure.

**Type matchups:** Strong vs Ice, Grass (2×). Weak vs Arc, Water (0.5×).

**Early game:** Every card applies Char, so pressure builds naturally. Lead with Ignite or Flame Burst to stack faster.

**Late game:** High sustained damage from stacked Char. Look for more Char spells (Kindle, Fireball) from rewards.

---

## Tidecaller 🌊

**Type:** Water | **HP:** 70

**Identity:** Drown DoT stacker. Every card applies Drown — the deck builds permanent passive damage from the first turn while staying alive through healing and block.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Wavecrash | 1 | ×2 | Deal 5 damage. Apply 1 Drown |
| Soothing Wave | 1 | ×2 | Heal 4 HP. Apply 2 Drown |
| Drown Surge | 2 | ×1 | Deal 8 damage. Apply 5 Drown |
| Riptide | 2 | ×1 | Deal 4 damage. Apply 2 Drown. Gain 1 mana next turn |

**Key mechanic:** Drown never decays. Every card applies it — even a slow turn spent healing with Soothing Wave still adds 2 permanent stacks. By mid-fight, Drown alone deals significant damage each turn.

**Type matchups:** Strong vs Grass, Fire (2×). Weak vs Rock, Arc (0.5×).

**Early game:** Every card builds Drown pressure regardless of situation. Lead with Soothing Wave turns to stay healthy while stacking faster.

**Late game:** Passive Drown damage handles a lot of work. Look for Whirlpool (multi-hit) and Deep Current from rewards to add burst on top of the DoT foundation.

---

## Stonewarden 🪨

**Type:** Rock | **HP:** 70

**Identity:** Daze stacker. Every card applies Daze — the deck disrupts enemy actions from turn one while building enormous block. Lowest raw damage, but Daze makes enemy turns increasingly unreliable.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Rock Throw | 1 | ×2 | Deal 5 damage. Apply 1 Daze |
| Stoneskin | 1 | ×2 | Gain 8 Block. Apply 2 Daze |
| Erode | 2 | ×1 | Deal 8 damage. Apply 4 Daze |
| On Guard | 2 | ×1 | Gain 20 Block. Apply 2 Daze |

**Key mechanic:** Daze gives a 50% chance the enemy repeats their last action instead of acting normally. Every card applies it — landing several stacks before a big enemy attack can waste their turn entirely.

**Key combo:** Stoneskin (2 Daze) + Erode (4 Daze) in one turn = 6 Daze stacked. Each stack is an independent disruption chance — sustained pressure on enemy actions while block absorbs what gets through.

**Type matchups:** Strong vs Water, Arc (2×). Weak vs Grass, Ice (0.5×).

**Early game:** Stack Daze and block simultaneously. Every card contributes to both — no dead draws.

**Late game:** Needs damage to close out fights — prioritize attack or Daze spells from rewards. Boulder Crash (28 damage) is a key pickup.

---

## Stormseeker ⚡

**Type:** Arc | **HP:** 70

**Identity:** Shock stacker. Every card applies Shock — the deck builds exponential damage multipliers before cashing them in with Chain Lightning for maximum burst. Highest damage ceiling in the game.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Spark Strike | 1 | ×2 | Deal 5 damage. Apply 1 Shock |
| Static Charge | 1 | ×2 | Deal 3 damage. Apply 2 Shock |
| Chain Lightning | 2 | ×1 | Deal 4 damage 3 times. Apply 2 Shock |
| Surge Engine | 2 | ×1 | Gain 2 mana next turn. Apply 3 Shock |

**Key combo:** Surge Engine this turn (3 Shock, 2 mana next turn) → 5 mana next turn with 3 Shock already stacked → Chain Lightning (4×3 damage × ×1.25³ ≈ ×1.95 per hit, plus 2 more Shock applied).

**Key mechanic:** Shock multiplies Arc damage by ×1.25 per stack, compounding (×1.25^N). Chain Lightning hits 3 times — each hit benefits from the full Shock multiplier.

**Type matchups:** Strong vs Fire, Water (2×). Weak vs Ice, Rock (0.5×).

**Early game:** Every card builds Shock. Prioritize Surge Engine turns to bank mana and stack fast before dropping Chain Lightning.

**Late game:** Storm Call (10 damage ×3) with high Shock is devastating. Surge Engine cycling back every loop keeps Shock climbing.

---

## Frostweaver ❄️

**Type:** Ice | **HP:** 70

**Identity:** Freeze control. Every card applies Freeze — the deck steadily builds toward the 3-stack threshold where the enemy skips their entire turn.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Shardsicle | 1 | ×2 | Deal 5 damage. Apply 1 Freeze |
| Ice Cube | 1 | ×2 | Gain 8 Block. Apply 2 Freeze |
| Blizzard Strike | 2 | ×1 | Deal 5 damage. Apply 2 Freeze. Twice |
| Frost Armor | 2 | ×1 | Gain 10 Block. Apply 3 Freeze |

**Key mechanic:** Freeze stacks accumulate across turns with no decay. At 3 stacks, the enemy skips their next action and all stacks are consumed. Every card applies Freeze — the threshold arrives fast.

**Key combo:** Frost Armor (3 Freeze) into Ice Cube (2 Freeze) = 5 stacks. The first skip consumes 3, leaving 2 behind — one more card reaches the next threshold immediately.

**Type matchups:** Strong vs Arc, Rock (2×). Weak vs Fire, Grass (0.5×).

**Early game:** Alternate attacks and block while Freeze builds. Time the 3-stack trigger before a telegraphed enemy attack for maximum value.

**Late game:** Blizzard Strike's multi-hit is the starter deck's highest Freeze-per-turn. Blizzard (reward pool) and Absolute Zero (rare) accelerate stacking further.

---

## Shadowblade 🌑

**Type:** Shadow | **HP:** 70

**Identity:** Lifesteal and curses. Every card applies Lifesteal — the deck drains HP from enemies constantly, turning every turn into a sustained health advantage.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Shadow Strike | 1 | ×2 | Deal 5 damage. Lifesteal 2 |
| Curse Touch | 1 | ×2 | Deal 2 damage. Lifesteal 4 |
| Soul Drain | 2 | ×1 | Deal 8 damage. Lifesteal 8 |
| Shadow Pact | 2 | ×1 | Lose 6 HP. Lifesteal 12 |

**Key mechanic:** Lifesteal queues up as a drain — at the end of the enemy's next turn, that much HP is taken from them and given to you. Every card applies Lifesteal, so it stacks across the turn.

**Key combo:** Shadow Pact (−6 HP, 12 Lifesteal) + Curse Touch (2 dmg, 4 Lifesteal) + Shadow Strike (5 dmg, 2 Lifesteal) in one turn = 18 queued Lifesteal. Net swing: −6 HP now, +18 at end of enemy turn = +12 HP ahead — plus 7 direct damage dealt.

**Type matchups:** Strong vs Light (2×). Weak vs Shadow enemies (0.5×).

**Early game:** Every card applies Lifesteal — recovery is constant without needing rest stops.

**Late game:** Dark Pact (draw 2 cards, lose 4 HP) and Soul Rend (24 damage + heal 12) are priority upgrades.

---

## Dawnmage ☀️

**Type:** Light | **HP:** 70

**Identity:** Blind stacker. Every card applies Blind — the deck disrupts enemy attacks from the first turn while Purify cleanses any status that slips through.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Radiant Bolt | 1 | ×2 | Deal 5 damage. Apply 1 Blind |
| Shielding Light | 1 | ×2 | Gain 8 Block. Apply 2 Blind |
| Divine Barrier | 2 | ×1 | Gain 20 Block. Apply 3 Blind |
| Purify | 2 | ×1 | Cleanse all debuffs. Heal 20 HP. Apply 2 Blind |

**Key mechanic:** Blind gives a 50% miss chance on the enemy's next attack, then consumes 1 stack. Every card applies Blind — stack it before a heavy-hitting enemy and multiple attacks can miss consecutively.

**Key mechanic:** Purify removes all negative statuses from the player (Char, Drown, Freeze, Shock, Root, Daze) and heals 20 HP — and now also blinds the enemy in the same action. Against status-heavy enemies, this card alone can swing the fight.

**Type matchups:** Strong vs Shadow (2×). Weak vs Light enemies (0.5×).

**Early game:** Stack Blind every turn. Take minimal damage from attacks. Hold Purify for when enemy statuses overwhelm.

**Late game:** Sunburst (20 damage + 10 heal + 8 block) is the priority pickup. The deck's defensive depth is unmatched.

---

## Verdantmaker 🌿

**Type:** Grass | **HP:** 70

**Identity:** Root trap. Every card applies Root — the deck builds stacks constantly, and Verdant Surge doubles them in a single turn for explosive burst detonations.

**Starting Deck (class cards):**

| Card | Cost | Qty | Effect |
|---|---|---|---|
| Vine Lash | 1 | ×2 | Deal 5 damage. Apply 1 Root |
| Entangle | 1 | ×2 | Gain 4 Block. Apply 2 Root |
| Overgrowth | 2 | ×1 | Deal 8 damage. Apply 4 Root |
| Verdant Surge | 2 | ×1 | Apply 2 Root. Root applied this turn is doubled |

**Key mechanic:** Root detonates on the next hit the enemy takes — dealing 2× the stack count as bonus damage, then clearing. Every card applies Root, so stacks accumulate even on defensive turns.

**Key combo:** Verdant Surge → Entangle → Entangle → Vine Lash: (2+2+2) ×2 = 12 Root stacks, detonating on Vine Lash for 24 bonus damage + 5 base = 29 total from one sequence.

**Type matchups:** Strong vs Rock, Ice (2×). Weak vs Water, Fire (0.5×).

**Early game:** Build Root before attacking. Even Entangle turns (block + Root) contribute to the detonation. Don't trigger until stacks are significant.

**Late game:** Verdant Surge cycling back every loop means burst potential is always available. Verdant Bloom (6 Root + 10 heal) is the priority reward pickup.
