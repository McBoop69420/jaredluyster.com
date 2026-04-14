# Enemies Bible

Enemies cycle through their intent pattern in order, repeating from the start when the pattern ends. HP values are given as [min, max] — randomized each encounter.

---

## Common Enemies (Floors 1–4, 6–9, 11–14)

One per type. Found at Battle nodes.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| fire_imp | Fire Imp | Fire | 22–30 | 👺 | Attack 8 → Attack 6 → Apply 2 Char |
| lava_golem | Lava Golem | Fire | 30–40 | 🌋 | Defend 6 → Attack 12 → Attack 8 |
| sea_sprite | Sea Sprite | Water | 20–28 | 🧜 | Attack 7 → Defend 8 → Attack 9 |
| mud_elemental | Mud Elemental | Rock | 35–45 | 🟤 | Defend 10 → Attack 10 → Defend 6 → Attack 14 |
| storm_wisp | Storm Wisp | Arc | 18–26 | 🔵 | Attack 6 → Apply 2 Shock → Attack 10 |
| frost_wolf | Frost Wolf | Ice | 25–33 | 🐺 | Attack 8 → Apply 1 Freeze → Attack 10 |
| shade_wraith | Shade Wraith | Shadow | 20–30 | 👻 | Attack 8 → Apply 2 Weak → Attack 11 |
| holy_sentinel | Holy Sentinel | Light | 28–36 | 🛡 | Defend 8 → Attack 8 → Defend 6 → Attack 12 |
| vine_creeper | Vine Creeper | Grass | 22–30 | 🌱 | Attack 4 → Apply 2 Root → Attack 5 |

---

## Elite Enemies (Floors 6–9, 11–14)

Found at Elite nodes. +15 gold reward over common.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| magma_lord | Magma Lord | Fire | 55–70 | 🌞 | Attack 14 → Apply 3 Char → Attack 16 → Buff +2 Strength |
| tide_witch | Tide Witch | Water | 50–65 | 🧙 | Defend 12 → Attack 14 → Apply 3 Weak → Attack 18 |
| stone_guardian | Stone Guardian | Rock | 70–85 | 🗿 | Defend 16 → Attack 16 → Defend 12 → Attack 20 |
| thunder_mage | Thunder Mage | Arc | 48–62 | 🧝 | Attack 12 → Apply 3 Shock → Attack 18 → Buff +2 Strength |
| frost_lich | Frost Lich | Ice | 52–68 | 💀 | Apply 2 Freeze → Attack (varies) → ... |
| shadow_stalker | Shadow Stalker | Shadow | 45–60 | 🦇 | (see data file) |
| radiant_knight | Radiant Knight | Light | 55–70 | ⚔️ | (see data file) |
| thornwood | Thornwood | Grass | 50–65 | 🌳 | (see data file) |

> Note: Frost Lich and later elite patterns — see `js/data/enemies.js` for full pattern arrays.

---

## Boss Enemies (Floor 12)

One boss is randomly chosen per run. Fixed HP (no variance). All bosses have 5-intent patterns with at least one Strength buff or heavy status application.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| arcane_overlord | Mysterious Stranger | Fire | 160 | 👁 | Attack 18 → Buff +2 Str → Apply 4 Char → Attack 24 → Defend 18 |
| abyssal_leviathan | Abyssal Leviathan | Water | 155 | 🐉 | Attack 16 → Defend 20 → Apply 4 Weak → Attack 22 → Attack 28 |
| mountain_titan | Mountain Titan | Rock | 180 | ⛰️ | Defend 24 → Attack 18 → Defend 18 → Attack 26 → Buff +3 Str |
| storm_sovereign | Storm Sovereign | Arc | 150 | 🌩️ | Attack 16 → Buff +3 Str → Attack 20 → Apply 4 Shock → Attack 30 |
| glacier_ancient | Glacier Ancient | Ice | 158 | 🧊 | Apply 3 Freeze → Attack 18 → Defend 22 → Attack 24 → Apply 4 Freeze |
| shadow_sovereign | Shadow Sovereign | Shadow | 152 | 🌑 | Apply 4 Weak → Attack 20 → Buff +3 Str → Attack 18 → Attack 28 |
| celestial_arbiter | Celestial Arbiter | Light | 155 | ✨ | Defend 22 → Attack 18 → Buff +3 Str → Attack 24 → Defend 16 |
| world_root | World Root | Grass | 160 | 🌲 | Apply 4 Root → Defend 20 → Attack 16 → Apply 5 Root → Attack 22 |

---

## Boss Strategy Notes

**Mysterious Stranger (Fire):** Third intent applies 4 Char — plan block or Purify before intent 3. Strength buff happens on turn 2, so big hits come after that.

**Abyssal Leviathan (Water):** Heavy on Weak — all your damage is cut 25%. Attack 28 on intent 5 is dangerous; burn it down before that if possible.

**Mountain Titan (Rock):** Highest HP of all bosses. Very defensive — cycle through its pattern quickly with burst damage. Strength buff is late in cycle (intent 5).

**Storm Sovereign (Arc):** Buffs Strength early (intent 2), then hits with 30 damage on intent 5 with Shock. Don't let Shock stack on you.

**Glacier Ancient (Ice):** Opens with 3 Freeze — if you're Frostweaver vs this boss, their Freeze goes on *you*. Intent 5 adds 4 more Freeze stacks.

**Shadow Sovereign (Shadow):** Applies 4 Weak in turn 1 — Dawnmage's Purify is extremely valuable here. Hits 28 on last intent after buffing Strength.

**Celestial Arbiter (Light):** Most defensive boss — high block on intents 1 and 5. Burst damage or sustained DoT needed to work through block cycles.

**World Root (Grass):** Applies massive Root stacks — watch for its attack intents triggering Root detonation on *itself* if you apply Root back. Intent 4 applies 5 Root before its own attack intent.

---

## Intent Legend

| Intent Type | Meaning |
|---|---|
| Attack N | Deals N damage (modified by Strength, Weak, Blind, type effectiveness) |
| Defend N | Gains N block |
| Buff +N Strength | Permanently increases all attack damage by N |
| Apply N [Status] | Applies N stacks of a status effect to the player |
