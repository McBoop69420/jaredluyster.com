# Game Systems Bible

## Core Loop

1. Choose a wizard class → start with a fixed 10-card deck
2. Navigate a procedurally generated map of nodes (12 floors + boss)
3. Fight enemies, collect gold, upgrade your deck, survive to the boss

---

## Combat

### Structure
- Turn-based. Player goes first each combat.
- Both sides track: **HP**, **Block**, **Status Effects**
- Block resets to 0 at the start of each new player turn

### Player Turn
1. Draw 5 cards from deck (shuffles discard pile in when deck is empty)
2. Start with 3 mana (refills fully each turn)
3. Cast any spells you can afford (in any order)
4. End turn → enemy takes their action

### Enemy Turn
- Enemy executes the next intent in their fixed pattern (cycles through)
- Intents are: **attack**, **defend** (gain block), **buff** (gain Strength), **status** (apply a status to player)
- After enemy acts: end-of-turn status effects tick (Char, Drown, Lifesteal)
- Enemy pattern then advances to the next intent

### End of Combat
- All block is lost between encounters (does **not** carry over)
- HP persists between encounters
- Player earns gold + chooses one spell reward from 3 options (can skip)

---

## Mana

| Constant | Value |
|---|---|
| Starting mana per turn | 3 (`BASE_MANA`) |
| Max mana per turn | 3 (can be temporarily exceeded by effects) |

- Mana is fully restored at the start of each player turn
- Some spells grant bonus mana this turn or next turn
- Mana Petal (Fade): grants +1 mana for the current turn only
- Tidal Flow: grants +1 mana on the *next* turn
- Surge Engine: grants +2 mana on the *next* turn
- Overcharge: costs 0, grants +2 mana, discards 1 card (net: +2 mana, -1 hand)

---

## Block

- Block absorbs incoming damage before HP
- Block is reset to 0 at the start of the player's next turn (does not persist)
- Enemy block also resets each round
- Excess block beyond incoming damage is wasted (no overflow protection needed)
- Block stacks within a turn — casting multiple block spells accumulates

---

## Hand & Deck

| Constant | Value |
|---|---|
| Hand size per turn | 5 (`BATTLE_HAND_SIZE`) |
| Deck composition | Starts at 10 cards, grows via rewards/shop |

- Draw pile → hand → discard pile
- When draw pile is empty and more cards needed: shuffle discard into new draw pile
- **Fade** cards are removed from the game after being played (not sent to discard)
- No hand limit enforced — draw effects can exceed 5 cards in hand mid-turn

---

## Damage Calculation

```
base damage
+ Strength bonus (if attacker has Strength)
× 0.75 if target has Weak (floor)
× type effectiveness multiplier (2 = weakness, floor(÷2) = resistance, 1 = neutral)
× amplify multiplier (×1.5 if Amplify active)
× shock multiplier (×1.25^N if target has Shock stacks AND spell is Arc)
```

Block absorbs before HP.

Root detonation triggers separately on any damage hit.

---

## Type Effectiveness

**Cycle:** Fire > Grass > Ice > Rock > Arc > Water > Fire (each beats one, loses to one)

Shadow and Light are a separate pair: each is super effective against the other.

| Attacker → | vs Fire | vs Water | vs Rock | vs Arc | vs Ice | vs Shadow | vs Light | vs Grass |
|---|---|---|---|---|---|---|---|---|
| **Fire** | 1× | 0.5× | 1× | 1× | 1× | 1× | 1× | **2×** |
| **Water** | **2×** | 1× | 1× | 0.5× | 1× | 1× | 1× | 1× |
| **Rock** | 1× | 1× | 1× | **2×** | 0.5× | 1× | 1× | 1× |
| **Arc** | 1× | **2×** | 0.5× | 1× | 1× | 1× | 1× | 1× |
| **Ice** | 1× | 1× | **2×** | 1× | 1× | 1× | 1× | 0.5× |
| **Shadow** | 1× | 1× | 1× | 1× | 1× | 0.5× | **2×** | 1× |
| **Light** | 1× | 1× | 1× | 1× | 1× | **2×** | 0.5× | 1× |
| **Grass** | 0.5× | 1× | 1× | 1× | **2×** | 1× | 1× | 1× |

**Weakness** — target is weak to your spell's type: keyword damage is **doubled (2×)**.
**Resistance** — target resists your spell's type: keyword damage is **halved, rounded down**.

Type effectiveness applies to keyword damage only. It does **not** affect status effect stacks or block values.

---

## Gold

- Earned after every combat: 10–25 gold (base), +15 bonus for elite enemies
- Spent at shop nodes
- Starting gold: 50

---

## Amplify

The spell *Amplify* (neutral, in all starting decks) grants a one-time ×1.5 multiplier to the **next spell cast** this turn. Only damage and healing are amplified (not block, not status stacks). Consumed on use.

---

## Strength

- Flat bonus added to every attack, enemy or player
- Stacks with itself (each point adds +1 per attack)
- Applies before Weak reduction

---

## Win / Lose Conditions

- **Win:** Defeat the boss on floor 12
- **Lose:** Player HP reaches 0 at any point

No lives, no checkpoints. Run over = start over.
