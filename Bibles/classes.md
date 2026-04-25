# Classes Bible

Each class is a wizard archetype defined by their element, HP, and in-game description. The description shown on the selection screen is the player's first impression of what the class does — it should be accurate, distinct, and not overlap with other classes.

---

## Class Roster

| Class | Type | HP | In-Game Description |
|---|---|---|---|
| Pyromancer | Fire | 70 | Char DoT, high damage. |
| Tidecaller | Water | 70 | Healing, mana gen, Drown control. |
| Stonewarden | Rock | 70 | Max defense, Daze stacks, outlasts foes. |
| Stormseeker | Arc | 70 | Fast chains, Shock combos. |
| Frostweaver | Ice | 70 | Freeze control. |
| Shadowblade | Shadow | 70 | Lifesteal and curses. |
| Dawnmage | Light | 70 | Shields, heals, Blind. |
| Verdantmaker | Grass | 70 | Low base damage, exponential Root DoT. |

---

## Class Profiles

### Pyromancer
**Type:** Fire | **HP:** 70 | *"Burn DoT, high damage."*

Applies Char stacks that deal damage every enemy turn and decay slowly. The class rewards setup — the first few turns apply Char, then the DoT carries the fight. Inferno Core doubles Char applied in a single turn, enabling burst stack rounds. High ceiling on total damage output; slower start than raw attack classes.

---

### Tidecaller
**Type:** Water | **HP:** 70 | *"Healing, mana gen, control."*

Three distinct tools in one class. Healing (Soothing Wave) extends HP longevity. Mana generation (Tidal Flow) unlocks turns with more cards played than mana normally allows. Drown applies permanent DoT that compounds with no decay — the "control" part. Best in long fights where all three tools get to pay off.

---

### Stonewarden
**Type:** Rock | **HP:** 70 | *"Max defense, outlasts foes."*

The highest block values of any class. On Guard (25 Block, 2 mana) is the defining card — it creates a near-impenetrable wall. Daze disrupts enemy patterns by making them repeat their last action. This class wins by making the enemy's damage irrelevant. Requires patience; damage output is the lowest in the roster.

---

### Stormseeker
**Type:** Arc | **HP:** 70 | *"Fast chains, Shock combos."*

Speed and burst. Shock stacks on the enemy multiply incoming Arc damage (×1.25 per stack, compounding). Chain Lightning hits three times — each hit benefits from the full Shock multiplier. Surge Engine generates extra mana for the next turn, enabling big combo turns. The highest single-turn damage ceiling in the game.

---

### Frostweaver
**Type:** Ice | **HP:** 70 | *"Freeze control."*

Accumulates Freeze stacks on enemies — Freeze doesn't decay, so it builds until the 3-stack threshold skips the enemy's entire turn. A well-timed skip before a big enemy attack prevents massive damage. Pairs solid block with this disruption. Requires setup turns; the payoff is full turn denial.

---

### Shadowblade
**Type:** Shadow | **HP:** 70 | *"Lifesteal and curses."*

Lifesteal drains HP from the enemy and heals the player at end of their turn — passive sustain without using a healing card. Every card applies Lifesteal, so recovery is constant across the whole turn. Self-sustaining in a way no other class is; doesn't rely on rest nodes as heavily.

---

### Dawnmage
**Type:** Light | **HP:** 70 | *"Shields, heals, cleanses."*

Layered survival. Block (shields) absorbs hits. Heals restore HP after damage gets through. Purify removes all negative status effects and heals 20 HP — the best reactive card in the game against DoT or debuff-heavy enemies. Blind from Radiant Bolt creates miss chances on enemy attacks. The most defensively rounded class.

---

### Verdantmaker
**Type:** Grass | **HP:** 70 | *"Low base damage, exponential DoT."*

Root stacks accumulate on the enemy and do nothing — until the enemy takes any damage, which detonates all stacks as 2× burst bonus damage. Verdant Surge doubles Root applied in a turn. The DoT is not tick-based; it's a trap that explodes on contact. The "exponential" part comes from stacking many Root stacks before triggering the detonation. High ceiling, slow ramp.

---

## Design Notes

**All classes start at 70 HP.** This is intentional — class differentiation comes from the deck, not from HP differences. A class that is genuinely too fragile or too tanky should be tuned through its spells, not its HP.

**Descriptions are three words or a short phrase, comma-separated.** They communicate the strategy, not the story. Keep them factual and specific. "Burn DoT, high damage" tells you both *how* (DoT) and *what* (damage). "Freeze control" tells you the mechanic and the role. Avoid vague words like "versatile" or "balanced."

**Each class should have a distinct identity that doesn't overlap.** Both Tidecaller and Dawnmage involve healing, but Tidecaller is about mana generation and permanent DoT while Dawnmage is about cleansing and block. The descriptions should reflect what makes each class *uniquely* that class, not what it shares with others.
