# Game Systems Bible

## Core Loop

1. Choose a wizard class and start with a fixed 10-card deck
2. Navigate a procedurally generated map of nodes (12 floors + boss)
3. Fight enemies, collect gold, upgrade your deck, survive to the boss

---

## Combat

### Structure
- Turn-based. Player goes first each combat.
- Both sides track: **HP**, **Block**, **Status Effects**
- Player Block resets to 0 at the start of each new player turn

### Player Turn
1. **Draw:** Draw 5 cards from the draw pile, reshuffling discard into draw if needed.
2. **Mana:** Start each player turn with 3 mana, plus any next-turn mana bonuses.
3. **Cast:** Play any cards in hand as long as you can pay their mana costs.
4. **End turn:** Discard all unplayed hand cards. Char and Drown tick on the enemy, then the enemy acts.

### Enemy Turn
- Enemy executes the next intent in their fixed pattern (cycles through)
- Intents are: **attack**, **defend** (gain Block), **buff** (gain Strength), **status** (apply a status to player)
- After enemy acts: end-of-turn status effects tick (Lifesteal)
- Enemy pattern then advances to the next intent

### End of Combat
- All Block is lost between encounters
- HP persists between encounters
- Player earns gold and chooses one spell reward from 3 options (can skip)

---

## Block

- Block absorbs incoming damage before HP
- Player Block is reset to 0 at the start of the player's next turn
- Enemy Block persists until hit through
- Block stacks within a turn; casting multiple Block spells accumulates

---

## Deck, Hand & Mana

| Constant | Value |
|---|---|
| Hand draw per turn | 5 |
| Mana per turn | 3 |
| Deck composition | Starts at 10 cards |

- Combat uses draw, hand, discard, and exhaust piles.
- Played non-Fade cards go to discard.
- Unplayed hand cards go to discard at end of turn.
- Fade cards go to exhaust after use and do not return this combat.
- When draw is empty and a draw is needed, discard is shuffled into draw.
- Draw effects draw from the draw pile and may increase hand size beyond 5.

---

## Damage Calculation

```
base damage
+ Strength bonus (if attacker has Strength)
x 0.75 if target has Weak (floor)
x type effectiveness multiplier
x amplify multiplier (x1.5 if Amplify active)
x shock multiplier (x1.25^N if target has Shock stacks AND spell is Arc)
```

Block absorbs before HP.

Root detonation triggers separately on any damage hit.

---

## Type Effectiveness

**Main ring:** Fire > Grass > Ice > Rock > Arc > Water > Fire

Every non-neutral type is strong against 3 types, weak against 3 types, and neutral with 1 paired type.

Neutral pairs: Fire <-> Light, Water <-> Ice, Rock <-> Shadow, Grass <-> Arc.

| Attacker -> | vs Fire | vs Water | vs Rock | vs Arc | vs Ice | vs Shadow | vs Light | vs Grass |
|---|---|---|---|---|---|---|---|---|
| **Fire** | 1x | 0.5x | 0.5x | 0.5x | **2x** | **2x** | 1x | **2x** |
| **Water** | **2x** | 1x | **2x** | 0.5x | 1x | 0.5x | **2x** | 0.5x |
| **Rock** | **2x** | 0.5x | 1x | **2x** | 0.5x | 1x | **2x** | 0.5x |
| **Arc** | **2x** | **2x** | 0.5x | 1x | 0.5x | **2x** | 0.5x | 1x |
| **Ice** | 0.5x | 1x | **2x** | **2x** | 1x | **2x** | 0.5x | 0.5x |
| **Shadow** | 0.5x | **2x** | 1x | 0.5x | 0.5x | 1x | **2x** | **2x** |
| **Light** | 1x | 0.5x | 0.5x | **2x** | **2x** | 0.5x | 1x | **2x** |
| **Grass** | 0.5x | **2x** | **2x** | 1x | **2x** | 0.5x | 0.5x | 1x |

Type effectiveness applies to spell damage. It does not affect status effect stacks or Block values.

---

## Gold

- Earned after every combat: 10-25 gold (base), +15 bonus for elite enemies
- Spent at shop nodes
- Starting gold: 50

---

## Amplify

The spell *Amplify* grants a one-time x1.5 multiplier to the next applicable spell effect this turn. Current implementation applies it to damage and healing. Consumed on use.

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
