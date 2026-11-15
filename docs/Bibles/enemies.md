# Enemies Bible

Enemies cycle through their intent pattern in order, repeating from the start when the pattern ends. HP values are given as [min, max] — randomized each encounter, and the rolled value is that fight's full HP (the HP bar starts full against it).

Enemy names deliberately don't give away their element: the player works the type out in battle.

---

## Common Enemies (Combat nodes)

One per type. Found at Combat (Battle) nodes.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| fire_imp | Skittering Mite | Fire | 22–30 | 👺 | Attack 8 → Attack 6 → Apply 2 Char |
| lava_golem | Brass Automaton | Fire | 30–40 | 🌋 | Defend 6 → Attack 12 → Attack 8 |
| sea_sprite | Bound Familiar | Water | 20–28 | 🧜 | Attack 7 → Defend 8 → Attack 9 |
| mud_elemental | Wandering Husk | Rock | 35–45 | 🟤 | Defend 10 → Attack 10 → Defend 6 → Attack 14 |
| storm_wisp | Drifting Wisp | Arc | 18–26 | 🔵 | Attack 6 → Apply 2 Shock → Attack 10 |
| frost_wolf | Rune Hound | Ice | 25–33 | 🐺 | Attack 8 → Apply 1 Freeze → Attack 10 |
| shade_wraith | Hollow Stalker | Shadow | 20–30 | 👻 | Attack 8 → Apply 2 Weak → Attack 11 |
| holy_sentinel | Tower Sentinel | Light | 28–36 | 🛡 | Defend 8 → Attack 8 → Defend 6 → Attack 12 |
| vine_creeper | Coiled Serpent | Plant | 22–30 | 🌱 | Attack 4 → Apply 2 Root → Attack 5 |

---

## Elite Enemies (Elite nodes — floors 5 and 10, sometimes 6, 8, 9)

Found at Elite nodes (fixed floors). +15 gold reward over common.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| magma_lord | Mimic Chest | Fire | 55–70 | 🌞 | Attack 14 → Apply 3 Char → Attack 16 → Buff +2 Strength |
| tide_witch | Grey Pilgrim | Water | 50–65 | 🧙 | Defend 12 → Attack 14 → Apply 3 Weak → Attack 18 |
| stone_guardian | Masked Warden | Rock | 70–85 | 🗿 | Defend 16 → Attack 16 → Defend 12 → Attack 20 |
| thunder_mage | Ragged Scavenger | Arc | 48–62 | 🧝 | Attack 12 → Apply 3 Shock → Attack 18 → Buff +2 Strength |
| frost_lich | Crooked Hermit | Ice | 52–68 | 💀 | Apply 2 Freeze → Attack 12 → Apply 3 Freeze → Attack 16 → Defend 8 |
| shadow_stalker | Hooded Duelist | Shadow | 45–60 | 🦇 | Attack 10 → Apply 3 Weak → Attack 14 → Buff +2 Strength |
| radiant_knight | Tattered Knight | Light | 55–70 | ⚔️ | Defend 14 → Attack 12 → Apply 3 Blind → Attack 16 → Defend 10 |
| thornwood | Spellbound Squire | Plant | 50–65 | 🌳 | Apply 3 Root → Attack 8 → Apply 4 Root → Attack 12 → Defend 10 |

---

## Boss Enemies (Floor 12)

One boss is randomly chosen per run. Fixed HP (no variance). All bosses have 5-intent patterns with at least one Strength buff or heavy status application.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| the_drifter | The Drifter | Fire | 160 | 👁 | Attack 18 → Buff +2 Str → Apply 4 Char → Attack 24 → Defend 18 |
| abyssal_leviathan | Gnawing Beast | Water | 155 | 🐉 | Attack 16 → Defend 20 → Apply 4 Weak → Attack 22 → Attack 28 |
| mountain_titan | Bone Collector | Rock | 180 | ⛰️ | Defend 24 → Attack 18 → Defend 18 → Attack 26 → Buff +3 Str |
| storm_sovereign | Howling Brute | Arc | 150 | 🌩️ | Attack 16 → Buff +3 Str → Attack 20 → Apply 4 Shock → Attack 30 |
| glacial_mass | Clockwork Sentinel | Ice | 158 | 🧊 | Apply 3 Freeze → Attack 18 → Defend 22 → Attack 24 → Apply 4 Freeze |
| shadow_sovereign | Faceless Acolyte | Shadow | 152 | 🌑 | Apply 4 Weak → Attack 20 → Buff +3 Str → Attack 18 → Attack 28 |
| celestial_arbiter | Glass-Eyed Watcher | Light | 155 | ✨ | Defend 22 → Attack 18 → Buff +3 Str → Attack 24 → Defend 16 |
| world_root | Antlered Beast | Plant | 160 | 🌲 | Apply 4 Root → Defend 20 → Attack 16 → Apply 5 Root → Attack 22 |

---

## Boss Strategy Notes

**The Drifter (Fire):** Third intent applies 4 Char — plan block or Purify before intent 3. Strength buff happens on turn 2, so big hits come after that.

**Gnawing Beast (Water):** Heavy on Weak — all your damage is cut 25%. Attack 28 on intent 5 is dangerous; burn it down before that if possible.

**Bone Collector (Rock):** Highest HP of all bosses. Very defensive — cycle through its pattern quickly with burst damage. Strength buff is late in cycle (intent 5).

**Howling Brute (Arc):** Buffs Strength early (intent 2), then hits with 30 damage on intent 5 with Shock. Don't let Shock stack on you.

**Clockwork Sentinel (Ice):** Opens with 3 Freeze — if you're Frostweaver vs this boss, their Freeze goes on *you*. Intent 5 adds 4 more Freeze stacks.

**Faceless Acolyte (Shadow):** Applies 4 Weak in turn 1 — Dawnmage's Purify is extremely valuable here. Hits 28 on last intent after buffing Strength.

**Glass-Eyed Watcher (Light):** Most defensive boss — high block on intents 1 and 5. Burst damage or sustained DoT needed to work through block cycles.

**Antlered Beast (Plant):** Applies massive Root stacks — watch for its attack intents triggering Root detonation on *itself* if you apply Root back. Intent 4 applies 5 Root before its own attack intent.

---

## Speed & Turn Order

> ⚠️ **Proposed — not implemented.** Enemies have no speed stat and no status-intent suppression today. `EnemyData` carries only `id`, `enemyName`, `elementType`, `tier`, `minHp`/`maxHp`, `intentPattern`, and `portrait`; intents always resolve regardless of what statuses the enemy bears. Everything in this section is design intent. Per `CLAUDE.md` the code is the source of truth, so treat this as a proposal until it ships.

Every enemy acts on its type's initial speed (see the Type Matchups Bible → Speed & Turn Order):

| Type | Speed |
|---|---|
| Arc | 6 |
| Fire | 6 |
| Shadow | 5 |
| Light | 5 |
| Water | 5 |
| Ice | 4 |
| Plant | 4 |
| Rock | 4 |

**Status-intent suppression:** An enemy intent that applies a status is suppressed while the enemy bears the countering status. Example: a Coiled Serpent (Plant) bearing Char (Fire's signature) cannot use its "Apply 2 Root" intent — Char counters Root. The intent does nothing for as long as the countering status persists. This is how the player's primal-counter status neutralizes the enemy's signature.

---

## Intent Legend

| Intent Type | Meaning |
|---|---|
| Attack N | Deals N damage (modified by Strength, Weak, Blind, type effectiveness) |
| Defend N | Gains N block |
| Buff +N Strength | Permanently increases all attack damage by N |
| Apply N [Status] | Applies N stacks of a status effect to the player |
