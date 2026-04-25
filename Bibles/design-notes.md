# Design Notes

Running notes on design decisions and principles per type. Use this to stay consistent when adding or adjusting cards.

---

## Rarity Definitions

**What each rarity means:**
- **Common** — The expected pickup. Solid, fits the type's identity, no surprises. Player sees these 3–4 times per run. The majority of deck additions will be Commons.
- **Uncommon** — A meaningful upgrade. Synergizes more specifically, amplifies a strategy, or does something Commons can't. Player sees these 1–2 times per run reliably.
- **Rare** — Run-defining. Highest power ceiling or unique mechanics. Seeing one is a decision point. Player sees 0–1 per run — sometimes it just doesn't show up.

**Reward pool weights:** 60% Common / 30% Uncommon / 10% Rare

**Shop prices** (already established): Common 35g / Uncommon 55g / Rare 80g

**Target card counts per class:**
- 6–8 Commons
- 3–4 Uncommons
- 2 Rares

Current pool is ~4C / 2U / 1R per class — roughly half the target. The pool needs to roughly double before the reward system feels varied enough across a full run.

---

## Non-Starter Card Rate Guidelines

Non-starter cards are rewards — they should feel meaningfully stronger than starters. The rarity tier is the primary power dial.

**General rate targets (relative to each type's starter rate):**
- **Common:** ~33% above starter rate. Can drop the "every card applies status" rule that starters follow — pure damage or pure block is valid at Common.
- **Uncommon:** ~40-45% above starter rate, or add a keyword/unique effect at Common-level base efficiency. Cards here should usually still apply the type's status.
- **Rare:** Highest power ceiling. Either dramatically above rate, or does something mechanically unique that Commons and Uncommons can't. Rares are allowed to break type conventions (e.g., no status application) if the effect is strong enough.

**Fire as the reference:** Starters run at 6 units/mana (1 dmg = 1 Char = 1 unit). Commons target 8 units/mana. Uncommons target ~8.5–9 units/mana or add a keyword. Rare effects are evaluated case by case.

For types without a defined unit system, calibrate relative to the type's own starters — not against Fire. Each type has different status values (Drown never decays, Shock multiplies, Root detonates) so raw numbers won't translate directly.

---

## Fire 🔥

**Starter rate:** 6 "units" per mana, where 1 damage = 1 Char = 1 unit.

**Card identity:** Every Fire card does some damage + some Char. Cards lean more toward one or the other but never pure damage or pure Char (at the starter level).

- Firebolt pattern: 5 dmg + 1 Char (damage-leaning)
- Ignite pattern: 4 dmg + 2 Char (balanced)

**2-mana cards** are allowed to be slightly better value than 2× the 1-mana rate — a small economy-of-scale premium is fine.

**Defense:** Fire can have defensive cards (Block) but only at higher mana costs. Cauterize (2 mana) is the model — it earns its defense by costing more.

**Multi-hit:** Fire uses multi-hit spells (Flame Burst: 5 dmg × 2). Each hit triggers type effectiveness and status separately.

**Non-starter cards:** Commons target 8 units/mana (~33% above starter rate). Uncommons target ~8.5–9 units/mana or add a keyword at Common-level base efficiency. See the general rate guidelines at the top of this document.

---

## Rock 🪨

**Starter rate:** Daze is probabilistic — each stack gives a 50% chance the enemy repeats their last action instead of acting normally. Like Blind, the payoff is conditional. Rock compensates with higher Daze-per-mana than Char or Drown stacks, since each stack is only a chance, not a guarantee.

**Card identity:** Every Rock starter applies Daze. The deck splits evenly between attack and defense — two 1-mana cards (one attack, one block), two 2-mana cards (one attack, one heavy block). No card is purely attack or purely defense at any cost.

- Rock Throw pattern: 5 dmg + 1 Daze (attack-leaning; mirrors Firebolt/Wavecrash)
- Stoneskin pattern: 8 Block + 2 Daze (defense-leaning; block now, disruption stacks for later)
- Erode pattern: 8 dmg + 4 Daze (2-mana burst attack; dumps the most Daze in one card)
- On Guard pattern: 20 Block + 2 Daze (2-mana heavy block; highest single-turn block of any starter)

**Defense:** Rock is the most block-heavy class alongside Light. On Guard (20 Block) is the highest single-card block value in any starter deck. The class is designed to absorb damage while Daze makes enemy turns unreliable.

**Non-starter cards** should apply Daze where thematically appropriate. Pure block cards (Stone Wall, Earthen Skin) are valid without Daze at the non-starter level — but attack cards should almost always apply Daze.

---

## Arc ⚡

**Multi-hit:** Arc uses multi-hit spells (Chain Lightning: 4 dmg × 3). Each hit benefits from the full Shock multiplier, making multi-hit the primary way Arc burst scales.

---

## Ice ❄️

**Multi-hit:** Ice uses multi-hit spells (Blizzard Strike: 5 dmg + 2 Freeze, Twice). Each hit applies Freeze separately — Blizzard Strike applies 4 Freeze total across two hits, making it the fastest Freeze-per-turn card in the starter deck. Unlike Arc where multi-hit drives damage scaling, Ice multi-hit primarily accelerates reaching the 3-stack skip threshold. Leftover stacks after a skip carry forward, so pushing past the threshold in one turn is intentional and rewarded.

---

## Water 🌊

**Starter rate:** Every card applies Drown. Drown never decays, so even 1 stack per card compounds across the whole fight — the rate doesn't need to be as aggressive as Char.

**Card identity:** Every Water starter applies Drown regardless of its primary function (attack, heal, or block). Cards lean toward one of three modes — attack, sustain, or defense — but always include Drown.

- Wavecrash pattern: 5 dmg + 1 Drown (attack-leaning)
- Soothing Wave pattern: 4 heal + 2 Drown (sustain-leaning)
- Riptide pattern: 10 Block + 3 Drown (defense-leaning, higher Drown to compensate for no damage)
- Drown Surge pattern: 8 dmg + 4 Drown (2-mana burst — dumps the most Drown in one card)

**Defense:** Water can have block cards at 2 mana (Riptide is the model), mirroring Cauterize in Fire.

**Non-starter cards** follow the "every card applies Drown" principle where possible, but utility cards (Tidal Shield, Healing Rain, Tidal Flow) are exempt — they fill holes the starter deck doesn't cover. Drown-applying non-starters (Drenching Rain, Monsoon, Whirlpool) reinforce the identity; the rest support it.

---

## Shadow 🌑

**Starter rate:** Lifesteal N resolves as both N damage to the enemy AND N HP healed to the player at end of the enemy's turn — it's a double-value mechanic, but delayed. Cards are calibrated with this in mind: Lifesteal values are higher than equivalent Char/Drown stacks because each stack does two things.

**Card identity:** Every Shadow starter applies Lifesteal. No card in the starter deck uses Block — Shadow's survival mechanic IS Lifesteal. The class sustains through attrition, not shields.

- Shadow Strike pattern: 5 dmg + 2 Lifesteal (attack-leaning; damage now, drain queued)
- Curse Touch pattern: 2 dmg + 4 Lifesteal (Lifesteal-leaning; minimal damage, heavy drain)
- Soul Drain pattern: 8 dmg + 8 Lifesteal (2-mana burst; best damage + best Lifesteal in the starter)
- Shadow Pact pattern: −6 HP + 12 Lifesteal (2-mana gamble; front-loads pain, back-loads massive healing)

**Defense:** Shadow has no block cards at any mana cost in the starter deck. This is intentional. Lifesteal fills the role. If the player wants block, they add it from the neutral pool (Guard) or rewards.

**Shadow Pact:** The HP cost is immediate; the 12 Lifesteal resolves at end of the enemy's next turn. The player must survive that turn to collect the gain. With a full Lifesteal hand (Shadow Strike + Curse Touch + Shadow Pact), queued drain is 2 + 4 + 12 = 18 — a net swing of +12 HP assuming the enemy doesn't hit for more than that. This card rewards high-HP states and stacked turns.

**Non-starter cards** should apply Lifesteal where possible. Cards that deal raw damage without Lifesteal (Shadow Bolt, Void Tear) are fine as non-starters but should feel different from the starter's drain identity.

---

## Light ☀️

**Starter rate:** Blind gives a 50% miss chance on the next enemy attack, then consumes 1 stack. Unlike deterministic statuses (Char ticks for sure, Drown deals damage every turn), Blind is probabilistic — its value scales with how hard the enemy hits and how often. Cards are calibrated to compensate: Blind values per card are slightly higher than equivalent Char/Drown stacks because the payoff is conditional.

**Card identity:** Every Light starter applies Blind. The deck has no 2-mana attack card — Light's "offense" is disruption (making attacks miss), not raw damage. The two 2-mana cards are both defensive/utility.

- Radiant Bolt pattern: 5 dmg + 1 Blind (attack-leaning; only attack tool in the starter)
- Shielding Light pattern: 8 Block + 2 Blind (defense-leaning; block + double Blind stack)
- Divine Barrier pattern: 20 Block + 3 Blind (heavy block + Blind setup before a big hit)
- Purify pattern: Cleanse all debuffs + Heal 20 HP + 2 Blind (reactive utility; counter to status-heavy enemies)

**Defense:** Light is the most block-heavy starter deck after Stonewarden. Both 2-mana cards grant block — Divine Barrier is the highest single-turn block value in any starter. This compensates for the class's low damage output.

**Purify:** The reactive anchor of the deck. Cleansing all statuses AND healing 20 HP AND applying 2 Blind in one 2-mana card is uniquely powerful — it's designed to swing fights against enemies that stack Char, Drown, or Freeze. Hold it for the turn it's needed most.

**Blind vs. status-applying enemies:** Blind only prevents damage from `Attack` intents — it does nothing against `Apply` intents (status application). Against enemies that apply Char, Drown, or Freeze, Blind provides no protection. Purify is the answer to those intents, not Blind.

**Non-starter cards** should apply Blind where thematically appropriate. Purely defensive cards (Holy Shield, Radiance) are valid without Blind — Light is allowed to have cards that just heal or block at the non-starter level.

---

## Grass 🌿

**Starter rate:** Root detonates on the next hit the enemy takes — dealing 2× the stack count as bonus damage, then clearing all stacks. Because Root converts into burst damage rather than ticking passively, the value is backloaded and depends on timing. Cards apply relatively few stacks per mana, but the multiplier makes even modest stacks impactful.

**Card identity:** Every Grass starter applies Root. The deck has one dedicated multiplier card (Verdant Surge) that doubles all Root applied on that turn — this is unique among starter decks and defines Grass's play pattern: stack first, multiply, then hit.

- Vine Lash pattern: 5 dmg + 1 Root (attack-leaning; the detonation trigger — play last in the combo)
- Entangle pattern: 4 Block + 2 Root (defense-leaning; lower block than equivalent cards elsewhere, compensated by Root buildup)
- Overgrowth pattern: 8 dmg + 4 Root (2-mana stack dump; best Root-per-card in the starter)
- Verdant Surge pattern: 2 Root + doubles all Root this turn (2-mana multiplier; no damage, no block — pure setup)

**Defense:** Entangle's 4 Block is the lowest block value of any defensive card across all starters. This is intentional — Grass's "defense" is detonation burst damage, not shields. The class wins by ending fights faster, not by absorbing more hits.

**Verdant Surge:** Doubles Root applied on the same turn it's played, including its own 2 Root. Play order matters: Verdant Surge first, then stack cards, then detonate with an attack. A full turn of Surge → Entangle → Entangle → Vine Lash yields (2+2+2) ×2 = 12 stacks detonating on Vine Lash for 24 bonus damage.

**Non-starter cards** should apply Root where possible. Cards without Root (Vine Whip, Thicket) should still feel like they fit the pressure-and-burst pattern — they're valid as non-starters but shouldn't define the class identity.
