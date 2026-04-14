# Map & Progression Bible

## Map Structure

- **12 floors** of nodes + a boss on floor 12 (floor 0 is the start node)
- **6 paths** generated per run — paths branch and cross, creating choices
- **7 columns wide** — nodes placed at column positions 0–6
- Boss is always centered (column 3)

---

## Node Types

| Type | Icon | Color | Description |
|---|---|---|---|
| Start | ⚑ | `#19c37d` | Beginning of run. No event. |
| Battle | ⚔ | `#cc3333` | Fight a common enemy |
| Elite | 💀 | `#aa2222` | Fight an elite enemy (harder, more gold reward) |
| Rest | 🔥 | `#cc7722` | Heal or other rest actions |
| Shop | 💰 | `#22aa66` | Spend gold on spells and items |
| Event | ? | `#7744aa` | Random encounter with choices |
| Boss | ☠ | `#ff2222` | Final boss fight — win = victory |

---

## Node Spawn Probabilities by Floor

### Floors 1–4 (early)
| Node | Chance |
|---|---|
| Battle | 65% |
| Event | 15% |
| Rest | 10% |
| Shop | 10% |

### Floors 5, 10 (rest/shop checkpoint)
Always: 50% Rest / 50% Shop

### Floors 6–9 (mid)
| Node | Chance |
|---|---|
| Battle | 55% |
| Elite | 15% |
| Event | 12% |
| Rest | 9% |
| Shop | 9% |

### Floors 10–11 (late)
| Node | Chance |
|---|---|
| Battle | 50% |
| Elite | 18% |
| Event | 10% |
| Rest | 10% |
| Shop | 12% |

### Floor 12
Always: Boss

---

## Enemy Tiers by Floor

| Floor Range | Enemy Pool |
|---|---|
| 1–4 | Common only |
| 6–9 | Common + Elite (at elite nodes) |
| 11–14 | Common + Elite (at elite nodes) |
| 12 (boss node) | Boss only |

Boss is always chosen from the boss pool (one per type). Random selection from all 8 boss types.

---

## Combat Rewards

After winning any battle:
- **Gold:** 10–25 (random) + 15 bonus if enemy was elite tier
- **Spell choice:** 3 random spells offered, biased toward player's type. Player chooses one to add to deck, or skips.

---

## Rest Nodes

Two actions available:

| Action | Effect |
|---|---|
| Heal | Restore 30% of max HP (floored). Does not overheal. |
| (No second option by default) | Rest node currently only offers healing |

> Note: Future rest actions may be added (upgrade, remove spell, etc.).

---

## Shop Nodes

Shop offers:
- **4 spells for purchase** (biased toward player type, includes some off-type)
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
