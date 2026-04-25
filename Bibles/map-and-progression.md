# Map & Progression Bible

## Map Structure

- **12 floors** of nodes (floor 0 = start, floors 1–11 = regular, floor 12 = boss)
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
| 11 | Common + Elite (at elite nodes) |
| 12 (boss node) | Boss only |

Boss is always chosen from the boss pool (one per type). Random selection from all 8 boss types.

---

## Combat Rewards

After winning any battle:
- **Gold:** 10–25 (random) + 15 bonus if enemy was elite tier
- **Spell choice:** 3 random spells offered, all from the player's type. Player chooses one to add to deck, or skips.

---

## Rest Nodes

Two actions available:

| Action | Effect |
|---|---|
| Heal | Restore 30% of max HP (floored). Does not overheal. |
| Remove Spell | Choose one spell from your deck to permanently remove. |

---

## Shop Nodes

Shop offers:
- **4 spells for purchase** (3 from player's type, 1 from a random other type)
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

7 possible events (randomly selected). All are one-time encounters with 2–3 choices:

| Event | Icon | Choices |
|---|---|---|
| Worn Notebook | 📜 | Gain 30 gold / Leave |
| Gemstone Cache | 💎 | Gain 50 gold / Ignore |
| Strange Potion | 🧪 | Heal 15 HP / Lose 10 HP for +2 max HP / Leave |
| Makeshift Shrine | 🌫 | Spend 30 gold to heal to full / Pray (40% chance to heal 10 HP) / Move on |
| Ancient Tome | 📚 | Add a random Common spell of your type to your deck / Sell it for 35 gold / Leave |
| Cursed Chest | ☠️ | Add a random spell of your type (any rarity). Lose 20 HP / Leave |
| Wandering Scholar | 🧙 | Remove one spell from your deck, gain a random Uncommon of your type / Leave |

---

## Progression Notes

- HP carries between all encounters — there is no reset except at Rest nodes
- Deck size grows each run (reward spells added permanently to that run's deck)
- No relics or passive items currently (beyond shop consumables)
- Elites do not appear at floors 1–4 at all, even by chance

---

## Difficulty Scaling

Enemy stats scale linearly with floor number. Bosses (floor 12) are hand-crafted and not subject to floor scaling.

| Stat | Scaling |
|---|---|
| HP | Base × (1 + floor × 0.10) |
| Damage | Base × (1 + floor × 0.08) |

**Examples at key floors:**
- Floor 4 (end of early): 1.4× HP, 1.32× damage
- Floor 9 (end of mid): 1.9× HP, 1.72× damage
- Floor 11 (pre-boss): 2.1× HP, 1.88× damage

**Design intent:** This dungeon is designed as a hard intro. Scaling is intentionally steep — the player should feel the pressure by mid-run and be genuinely tested at floor 11. Further content above this dungeon will be where players grind and master their decks.
