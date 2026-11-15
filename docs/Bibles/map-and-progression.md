# Map & Progression Bible

## Map Structure

> Source: `Assets/Scripts/Map/MapGenerator.cs`.

- **12 floors**, numbered **1–12** as the player sees them (the start row is floor 1, the **boss is floor 12**). Internally the floors are indices 0–11.
- **4 paths** generated per run — paths drift but never cross (the column array is sorted after each drift step to preserve left→right order)
- **5 columns wide** — nodes placed at column positions 0–4
- Boss is always centered (**column 2**)
- On the last three floors before the boss the paths get a gentle center-pull so they funnel smoothly into it
- The whole map fits on one phone screen; floors more than three ahead are dimmed, except elites, which stay full colour at any distance

---

## Node Types

| Type | Icon | Accent Color | Description |
|---|---|---|---|
| Battle (Combat) | ⚔ | `#dc5a3c` | Fight a common enemy |
| Elite | 💀 | `#aa50ff` | Fight an elite enemy (harder, more gold reward) |
| Rest | 🔥 | `#32c864` | Heal, upgrade, or remove a spell |
| Shop | 💰 | `#f0b932` | Spend gold on spells and items |
| Event | ? | `#50a0f0` | Random encounter with choices |
| Boss | ☠ | `#e62828` | Final boss fight — win = victory |

> Code note: the `NodeType` enum is `{ Combat, Elite, Rest, Shop, Event, Boss }` — "Battle" above is `NodeType.Combat`. There is **no dedicated Start node type**; floor 1 is simply a Combat node (the run's first fight).

---

## Node Placement by Floor

Floors below are as the player counts them (1–12).

**Fixed floors:**

| Floor | Node Type |
|---|---|
| 1 | Combat (the run's first fight) |
| 7, 11 | 60% Rest / 40% Shop (checkpoint) |
| 12 | Boss |

**Elite rules:**

- **Every route** from the start to the boss meets **at least one elite on floor 5 or floor 10**. About half of floor 5's nodes are elites; any floor-10 node a route can reach without having met a floor-5 elite is forced to be one.
- **No route** meets **more than two elites** in total.
- Up to three more elites are placed on **floors 6, 8 and 9**, each kept only if no route then exceeds two.
- Floors 5 and 10 are not labelled or highlighted on the map; players learn the pattern by playing.

These rules are covered by `MapGeneratorTests` (400 generated maps).

**Random roll (every other floor):**

| Floors | Combat | Event | Shop | Rest |
|---|---|---|---|---|
| 2–3 | 70% | 30% | — | — |
| 4–6, 8–10 | 45% | 25% | 15% | 15% |

---

## Enemy Tiers by Floor

| Node | Enemy Pool |
|---|---|
| Combat | Common |
| Elite (floors 5, 10, and sometimes 6, 8, 9) | Elite |
| Boss (floor 12) | Boss (one per type, randomly chosen from all 8) |

Elites never appear on floors 1–4.

---

## Combat Rewards

After winning any battle:
- **Gold:** 10–25 (random) + 15 bonus if enemy was elite tier
- **Spell choice:** 3 random spells offered, all of the player's own type. Player chooses one to add to deck, or skips.

---

## Rest Nodes

Two actions available:

| Action | Effect |
|---|---|
| Heal | Restore 30% of max HP (rounded to nearest). Does not overheal. |
| Upgrade a Spell | Choose one card from your deck to upgrade one tier (Minus → Regular, Regular → Plus). Greyed out if no upgradeable cards remain. |
| Remove a Spell | Choose one card from your deck to permanently exile it. |

Only one action may be taken per rest node.

---

## Shop Nodes

Shop offers:
- **4 spells for purchase** (all of the player's own type — off-type spells are never stocked)
- **4 items always in stock:**

| Item | Icon | Price | Effect |
|---|---|---|---|
| Minor Potion | 🧪 | 40 | Restore 20 HP |
| Major Potion | ⚗️ | 75 | Restore 40 HP |
| Vial of Vigor | 💖 | 60 | +10 max HP (does not heal) |
| Ink of Erasure | 🗑 | 50 | Remove one spell from deck permanently |

**Spell Prices:**
| Rarity | Price |
|---|---|
| Common | 35 |
| Uncommon | 55 |
| Rare | 80 |

Shop is one-visit per node — items don't restock.

---

## Event Nodes

4 possible events (randomly selected). All are one-time encounters with 2–3 choices:

| Event | Icon | Choices |
|---|---|---|
| Ancient Tome | 📜 | Gain 30 gold / Leave |
| Gemstone Cache | 💎 | Gain 50 gold / Ignore |
| Strange Potion | 🧪 | Heal 15 HP / Lose 10 HP for +2 max HP (the max HP does not heal) / Leave |
| Mysterious Shrine | 🌫 | Spend 30 gold to heal to full / Pray (40% chance to heal 10 HP) / Move on |

---

## Progression Notes

- HP carries between all encounters — there is no reset except at Rest nodes
- Gaining max HP never heals: the new HP is room to heal into (`GameManager.AddMaxHp`)
- The run is saved each time the map opens, so it survives closing the app; finished runs are kept in run history
- Deck size grows each run (reward spells added permanently to that run's deck)
- No relics or passive items currently (beyond shop consumables)
- There is no branching difficulty scaling — the node type determines the enemy tier pool
