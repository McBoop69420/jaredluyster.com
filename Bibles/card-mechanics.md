# Card Mechanics Bible

All rules governing the deck, hand, spells, and special effects during combat. Values sourced from `js/battle.js` and `js/data/spells.js`.

---

## The Four Piles

Every card in your deck is always in exactly one of four places:

| Pile | Description |
|---|---|
| **Draw** | Shuffled face-down stack you draw from. |
| **Hand** | Cards available to play this turn (max 5). |
| **Discard** | Played and skipped cards; reshuffled into Draw when Draw runs out. |
| **Exile** | Cards permanently removed from the run — never reshuffled. |

The **Deck View** button during combat shows all four piles so you always know where every card is.

---

## Turn Structure (Card Rules)

1. **Draw phase:** Draw 5 cards from the Draw pile (+ any `drawNextTurn` bonus).
2. **Play phase:** Play spells in any order until mana runs out or you press End Turn.
3. **Discard phase:** All remaining hand cards go to Discard.
4. **Reshuffle:** If Draw is empty when you need to draw, Discard is shuffled and becomes the new Draw pile. A log message appears: "Reshuffled discard pile."

---

## Fade (Exile on Play)

Cards marked **Fade** go to the Exile pile instead of Discard when played. They do not return when the deck is reshuffled — they are gone for the rest of the run.

All four universal starter cards (Focus, Guard, Amplify, Mana Petal) are Fade. This means your starting deck naturally thins itself over time. Other Fade cards include Verdant Surge and the starter Absolute Zero.

**Implication:** Fade cards reduce deck size, improving draw consistency for the remaining cards. Playing Fade cards early is generally correct.

---

## Amplify

Amplify is a single-use buff stored as a player status (`statusEffects.Amplify`).

- Playing the **Amplify** card sets the buff.
- The next spell you cast (that isn't itself Amplify) consumes the buff and increases **all numeric effects by ×1.5** (floored to integer).
- This applies to damage, block, heal, status values, draw count, and mana gain.
- Amplify does not carry over to the next turn — it persists until consumed, but the status is visible in the HUD.

---

## Inferno Core & Verdant Surge (Turn Buffs)

These cards grant a **single-turn buff** rather than a persistent status:

| Card | Buff | Effect |
|---|---|---|
| Inferno Core | `InfernoCore` | All Char applied this turn is doubled. |
| Verdant Surge | `VerdantSurge` | All Root applied this turn is doubled. |

Both buffs are **automatically cleared at the end of your turn** (when you draw your new hand). Play these before cards that apply Char or Root — order matters.

Neither buff stacks with itself. Amplify still applies ×1.5 on top of the doubled values if both are active.

---

## On-Hit Effects

Three cards (Flame Shield, Static Field, Thorn Armor) register a **reactive effect** that fires when the enemy hits you:

- The effect only triggers if the enemy's attack deals damage **through your block** (i.e., your HP actually drops).
- If the attack is fully blocked, the reaction does not fire.
- Multiple on-hit effects stack — play two Flame Shields and both will react.
- All on-hit effects are **cleared at the start of your next turn** (`bs.player.onHitEffects = []`).

These effects currently apply Char, Shock, or Root to the attacker (1 stack each).

---

## Mana

Base mana is 3 per turn.

**Immediate mana** (`gainMana` — Mana Petal, Mana Spring, Overcharge): Added to current mana right now. Can temporarily exceed your base max (the cap is `currentMana + value`, not `maxMana`). Unused mana does not carry forward.

**Bonus next-turn mana** (`gainManaNextTurn` — Riptide, Tidal Flow, Surge Engine): Added to your mana pool at the start of your next turn. Multiple effects stack additively. Mana resets to `base + bonusNextTurn` at turn start, not in addition to whatever was left.

Example: Surge Engine (+2 next turn) + Tidal Flow (+1 next turn) played in one turn = 6 mana on the following turn.

---

## Draw Bonuses

`drawNextTurn` (Heat Wave +1) adds extra cards drawn at the start of your next turn. Stacks additively with other draw bonuses. Does not affect the current turn.

---

## Cleanse

The cleanse effect (starter Purify, non-starter Purify) removes the following player statuses: **Char, Freeze, Shock, Drown, Root, Daze**.

It does **not** remove: Blind or Lifesteal (both are enemy-applied debuffs in this context and behave differently). It also never removes Amplify, InfernoCore, or VerdantSurge.

---

## Block

- Block absorbs incoming damage before HP.
- Player block **resets to 0 at the start of each player turn** (after drawing cards). It does not carry over.
- Enemy block persists until hit through.
- Block can exceed any cap — there is no maximum.

---

## Reward Spell Pool

After combat you choose 1 of 3 offered spells:

- Only non-starter spells are eligible.
- Spells already in your deck are de-prioritized (won't appear if an unchosen spell is available in that pool).
- **~2/3 of offers are your element type; ~1/3 are off-type.** If either pool runs short, the other fills the gap.
- The 3 cards are shuffled before display so the off-type card is not always in the same position.

---

## Self-Damage

`selfDamage` effects (Dark Pact, Shadow Pact) reduce player HP directly, bypassing block. They can kill you. They do not trigger on-hit effects.
