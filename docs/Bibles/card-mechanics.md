# Card Mechanics Bible

All rules governing deck, hand, discard, exhaust, and combat turn flow.

---

## Combat Deck

Each run starts with the wizard class starter deck. All spells, including Neutral spells, live in the combat deck unless exhausted by a card rule.

Combat uses four piles:

| Pile | Purpose |
|---|---|
| Draw pile | Face-down pile cards are drawn from. |
| Hand | Cards currently playable this turn. |
| Discard pile | Played and unplayed non-Fade cards go here. |
| Exhaust pile | Fade cards go here after being played and do not return this combat. |

When the draw pile is empty and a card draw is needed, the discard pile is shuffled into the draw pile. If both piles are empty, the draw stops.

---

## Turn Structure

1. **Start combat:** Shuffle the deck into the draw pile and draw 5 cards.
2. **Start player turn:** Reset Block, refill to 3 mana, then draw 5 cards plus any queued bonus draw.
3. **Play phase:** Play any cards from hand as long as you can pay their mana costs.
4. **End turn:** Discard all cards remaining in hand. Char and Drown tick on the enemy, then the enemy acts.

There is no fixed cast limit. Mana is the main limiter.

---

## Mana

- The player starts each turn with **3 mana**.
- Cards cost their `manaCost`.
- Cards that grant mana add to the current turn unless they specify next turn.
- Next-turn mana is added when the next player turn starts, then cleared.

---

## Draw

`DrawCards` draws immediately from the draw pile, reshuffling discard if needed.

`DrawCardsNextTurn` queues extra cards for the next player turn.

Draw effects can increase hand size beyond 5.

---

## Fade / Exhaust

Cards with `fade = true` go to the exhaust pile after they are played. Exhausted cards do not return to the draw or discard pile during the current combat.

Non-Fade cards go to the discard pile after they are played.

---

## Amplify

Amplify is a single-use turn buff:

- The next applicable spell effect consumes Amplify.
- Damage and healing are multiplied by 1.5 and rounded to the nearest integer.
- Amplify does not carry over to the next turn.

---

## Inferno Core & Verdant Surge

These cards grant a single-turn buff when cast:

| Card | Buff | Effect |
|---|---|---|
| Inferno Core | `InfernoCore` | All Char applied this turn is doubled. |
| Verdant Surge | `VerdantSurge` | All Root applied this turn is doubled. |

Both buffs are cleared at the start of the next player turn. Cast these before cards that apply Char or Root; order matters.

---

## On-Hit Effects

Three cards (Flame Shield, Static Field, Thorn Armor) register a reactive effect that fires when the enemy hits you:

- The effect only triggers if the enemy's attack deals damage through Block.
- If the attack is fully blocked, the reaction does not fire.
- The current implementation stores one pending on-hit effect; this should become a stack if multiple reactions need to coexist.
- On-hit effects are cleared at the start of the next player turn.

---

## Block

- Block absorbs incoming damage before HP.
- Player Block resets to 0 at the start of each player turn.
- Enemy Block persists until hit through.
- Block can exceed any cap; there is no maximum.

---

## Reward Cards

After combat you choose 1 of 3 offered spells:

- Only Regular-tier, non-Starter spells are eligible.
- Offers are restricted to your active wizard type. Off-type spells are never offered.
- Neutral spells are permitted by the filter, but every neutral is Starter rarity, so none are offered today.
- Chosen spells are added to your deck permanently.

---

## Self-Damage

Self-damage effects reduce player HP directly, bypassing Block. They can kill you. They do not trigger on-hit effects.
