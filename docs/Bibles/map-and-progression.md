# Map & Progression Bible

## Map Structure

> Source: `Assets/Scripts/Map/MapGenerator.cs`. (Note: the file's header comment is stale — it says "6 paths / 7 columns"; the executed constants below are authoritative.)

- **12 floors** of nodes (floors 0–11) plus the **boss on floor 12**. Floor 0 is the run's first node.
- **4 paths** generated per run — paths drift but never cross (the column array is sorted after each drift step to preserve left→right order)
- **5 columns wide** — nodes placed at column positions 0–4
- Boss is always centered (**column 2**)
- On floors 9–11 the paths get a gentle center-pull so they funnel smoothly into the boss

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

> Code note: the `NodeType` enum is `{ Combat, Elite, Rest, Shop, Event, Boss }` — "Battle" above is `NodeType.Combat`. There is **no dedicated Start node type**; floor 0 is simply a Combat node (the run's first fight).

---

## Node Placement by Floor

Node types are assigned per floor by `MapGenerator.PickNodeType`. Some floors are **fixed**; the rest use a single random roll.

**Fixed floors:**

| Floor(s) | Node Type |
|---|---|
| 0 | Combat (the run's first fight) |
| 4, 9 | 50% Rest / 50% Shop (checkpoint) |
| 6, 7, 8, 11 | Elite (always) |
| 12 | Boss |

**Random roll (all other floors — 1, 2, 3, 5, 10):**

| Node | Chance |
|---|---|
| Combat | 45% |
| Event | 25% |
| Shop | 15% |
| Rest | 15% |

> Note: the code's elite set is `{6, 7, 8, 9, 11}`, but floor 9 is caught first by the rest/shop checkpoint check, so the **effective** Elite floors are **6, 7, 8, and 11**.

---

## Enemy Tiers by Floor

| Floor | Enemy Pool |
|---|---|
| 0–3, 5, 10 (Combat nodes) | Common |
| 6, 7, 8, 11 (Elite nodes) | Elite |
| 12 | Boss (one per type, randomly chosen from all 8) |

Rest/Shop checkpoints (floors 4, 9) have no enemy. Elites never appear on floors 0–5.

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
| Vial of Vigor | 💖 | 60 | +10 max HP (and current HP) |
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
| Strange Potion | 🧪 | Heal 15 HP / Lose 10 HP for +2 max HP / Leave |
| Mysterious Shrine | 🌫 | Spend 30 gold to heal to full / Pray (40% chance to heal 10 HP) / Move on |

---

## Progression Notes

- HP carries between all encounters — there is no reset except at Rest nodes
- Deck size grows each run (reward spells added permanently to that run's deck)
- No relics or passive items currently (beyond shop consumables)
- There is no branching difficulty scaling — floor number determines the enemy tier pool
- Elites do not appear at floors 1–4 at all, even by chance
