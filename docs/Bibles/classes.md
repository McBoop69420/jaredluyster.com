# Classes Bible

Each class is a wizard archetype defined by their element, HP, and in-game description. The description shown on the selection screen is the player's first impression of what the class does — it should be accurate, distinct, and not overlap with other classes.

The roster table below gives a terse **role summary** for quick scanning; each class profile quotes the **verbatim selection-screen description** as it appears in the game (`CreateGameData.cs`).

---

## Class Roster

| Class | Type | HP | Role summary |
|---|---|---|---|
| Pyromancer | Fire | 70 | Burn DoT, high damage. |
| Tidecaller | Water | 70 | Healing, sustain, control. |
| Stonewarden | Rock | 70 | Max defense, outlasts foes. |
| Stormseeker | Arc | 70 | Fast chains, Shock combos. |
| Frostweaver | Ice | 70 | Freeze control. |
| Shadowblade | Shadow | 70 | Lifesteal, curses, sustain. |
| Dawnmage | Light | 70 | Shields, heals, cleanses. |
| Verdantmaker | Plant | 70 | Low base damage, exponential DoT. |

> Classes have no Speed stat in the game today. Proposed per-type speed values live in the Type Matchups Bible → Speed & Turn Order, marked as unimplemented.

---

## Class Profiles

### Pyromancer
**Type:** Fire | **HP:** 70 | *"Burn DoT and high burst damage. Every fire spell leaves a smoldering mark."*

Applies Char stacks that deal damage every enemy turn and decay slowly. The class rewards setup — the first few turns apply Char, then the DoT carries the fight. Inferno Core doubles Char applied in a single turn, enabling burst stack rounds. High ceiling on total damage output; slower start than raw attack classes.

---

### Tidecaller
**Type:** Water | **HP:** 70 | *"Healing, mana generation, and crowd control. The longer the fight, the stronger you become."*

Three distinct tools in one class. Healing (Soothing Wave) extends HP longevity. Extra draw (Tidal Flow) widens the current hand while mana keeps turns bounded. Drown applies permanent DoT that compounds with no decay — the "control" part. Best in long fights where all three tools get to pay off.

---

### Stonewarden
**Type:** Rock | **HP:** 70 | *"Maximum defense and endurance. You don't win fast — you win last."*

The highest block values of any class. On Guard is the defining card — it creates a near-impenetrable wall. Daze disrupts enemy patterns by making them repeat their last action. This class wins by making the enemy's damage irrelevant. Requires patience; damage output is the lowest in the roster.

---

### Stormseeker
**Type:** Arc | **HP:** 70 | *"Fast chains and Shock combos. Strike before they can react."*

Speed and burst. Shock stacks on the enemy multiply incoming Arc damage (×1.25 per stack, compounding). Chain Lightning hits three times — each hit benefits from the full Shock multiplier. Surge Engine adds a concentrated Shock setup card, enabling big combo turns. The highest single-turn damage ceiling in the game.

---

### Frostweaver
**Type:** Ice | **HP:** 70 | *"Freeze enemies solid and shatter them. Control the tempo, control the fight."*

Accumulates Freeze stacks on enemies — Freeze doesn't decay, so it builds until the 5-stack threshold skips the enemy's entire turn. A well-timed skip before a big enemy attack prevents massive damage. Pairs solid block with this disruption. Requires setup turns; the payoff is full turn denial.

---

### Shadowblade
**Type:** Shadow | **HP:** 70 | *"Lifesteal and curses. Drain everything they have."*

Lifesteal drains HP from the enemy and heals the player at the end of their turn — passive sustain without using a healing card. The "curse" cards (Curse Touch, Curse) are pure Lifesteal application, letting the deck out-sustain incoming damage over a long fight. Self-sustaining in a way no other class is; doesn't rely on rest nodes as heavily.

> **Note:** Weak is an **enemy-only** debuff in the current build — Shadowblade's starter kit does not apply it. Curse Touch applies **Lifesteal 4**, not Weak.

---

### Dawnmage
**Type:** Light | **HP:** 70 | *"Shields, heals, and cleanses. Outlast and purify."*

Layered survival. Block (shields) absorbs hits. Heals restore HP after damage gets through. Purify clears most negative status effects (Char, Drown, Shock, Root, Freeze, Daze, Weak — but not Blind or Lifesteal) and heals 20 HP — the best reactive card in the game against DoT or debuff-heavy enemies. Blind from Radiant Bolt gives each enemy attack a flat 50% miss chance. The most defensively rounded class.

---

### Verdantmaker
**Type:** Plant | **HP:** 70 | *"Low base damage with exponential DoT. Plant the seeds and watch them suffer."*

Root stacks accumulate on the enemy and do nothing — until the enemy takes any damage, which detonates all stacks as 2× burst bonus damage. Verdant Surge doubles Root applied in a turn. The DoT is not tick-based; it's a trap that explodes on contact. The "exponential" part comes from stacking many Root stacks before triggering the detonation. High ceiling, slow ramp.

---

## Design Notes

**All classes start at 70 HP.** This is intentional — class differentiation comes from the deck, not from HP differences. A class that is genuinely too fragile or too tanky should be tuned through its spells, not its HP.

**In-game descriptions are one or two short sentences** that lead with the mechanics and close with a bit of flavor — e.g. "Fast chains and Shock combos. Strike before they can react." Keep them factual and specific about *how* the class plays; avoid vague words like "versatile" or "balanced." (The roster table's terse comma-separated "role summary" is a scanning aid, not the in-game text.)

**Each class should have a distinct identity that doesn't overlap.** Both Tidecaller and Dawnmage involve healing, but Tidecaller is about extra draw and permanent DoT while Dawnmage is about cleansing and block. The descriptions should reflect what makes each class *uniquely* that class, not what it shares with others.
