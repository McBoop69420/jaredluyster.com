# Enemies Bible

Enemies cycle through their intent pattern in order, repeating from the start when the pattern ends. HP values are given as [min, max] — randomized each encounter.

---

## Common Enemies (Floors 1–4, 6–9, 11)

Two per type; current pool has 16 enemies across 8 types. Found at Battle nodes.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| fire_imp | Fire Imp | Fire | 22–30 | 👺 | Attack 8 → Attack 6 → Apply 2 Char |
| lava_golem | Lava Golem | Fire | 30–40 | 🌋 | Defend 6 → Attack 12 → Attack 8 |
| sea_sprite | Sea Sprite | Water | 20–28 | 🧜 | Attack 7 → Defend 8 → Attack 9 |
| mud_elemental | Mud Elemental | Rock | 35–45 | 🟤 | Defend 10 → Attack 10 → Defend 6 → Attack 14 |
| storm_wisp | Storm Wisp | Arc | 18–26 | 🔵 | Attack 6 → Apply 2 Shock → Attack 10 |
| frost_wolf | Frost Wolf | Ice | 25–33 | 🐺 | Attack 8 → Apply 1 Freeze → Attack 10 |
| shade_wraith | Shade Wraith | Shadow | 20–30 | 👻 | Attack 8 → Attack 10 → Attack 13 |
| holy_sentinel | Holy Sentinel | Light | 28–36 | 🛡 | Defend 8 → Attack 8 → Defend 6 → Attack 12 |
| vine_creeper | Vine Creeper | Grass | 22–30 | 🌱 | Attack 4 → Apply 2 Root → Attack 5 |
| tide_lurker | Tide Lurker | Water | 25–33 | 🦑 | Apply 2 Drown → Attack 8 → Apply 1 Drown → Attack 10 |
| stone_crab | Stone Crab | Rock | 28–36 | 🦀 | Apply 1 Daze → Attack 9 → Attack 12 → Apply 2 Daze |
| arc_drone | Arc Drone | Arc | 24–32 | ⚡ | Defend 6 → Attack 8 → Apply 1 Shock → Attack 12 |
| ice_golem | Ice Golem | Ice | 32–42 | 🧊 | Defend 10 → Apply 2 Freeze → Attack 14 → Defend 8 |
| specter | Specter | Shadow | 24–32 | 👥 | Defend 8 → Attack 12 → Attack 6 → Attack 14 |
| sun_wisp | Sun Wisp | Light | 20–28 | ☀️ | Apply 2 Blind → Attack 9 → Apply 1 Blind → Attack 11 |
| bramble_sprite | Bramble Sprite | Grass | 20–28 | 🌵 | Apply 1 Root → Attack 6 → Apply 3 Root → Attack 8 |

---

## Elite Enemies (Floors 6–9, 11)

Found at Elite nodes. +15 gold reward over common.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| magma_lord | Magma Lord | Fire | 55–70 | 🌞 | Attack 14 → Apply 4 Char → Attack 18 → Apply 2 Char |
| tide_witch | Tide Witch | Water | 50–65 | 🧙 | Defend 12 → Attack 14 → Apply 3 Drown → Attack 18 |
| stone_guardian | Stone Guardian | Rock | 70–85 | 🗿 | Defend 16 → Attack 16 → Defend 12 → Attack 20 |
| thunder_mage | Thunder Mage | Arc | 48–62 | 🧝 | Attack 12 → Apply 4 Shock → Attack 20 → Apply 2 Shock |
| frost_lich | Frost Lich | Ice | 52–68 | 💀 | Apply 2 Freeze → Attack 16 → Defend 14 → Attack 20 |
| void_reaper | Void Reaper | Shadow | 55–70 | 🕷 | Attack 12 → Attack 14 → Attack 16 → Attack 20 |
| radiant_paladin | Radiant Paladin | Light | 58–72 | ⚔️ | Defend 14 → Attack 14 → Apply 3 Blind → Attack 22 |
| ancient_treant | Old-Growth | Grass | 60–75 | 🌳 | Apply 3 Root → Defend 12 → Attack 10 → Apply 4 Root |

---

## Boss Enemies (Floor 12)

One boss is randomly chosen per run. Fixed HP (no variance). All bosses have 5-intent patterns with heavy status applications.

| ID | Name | Type | HP | Icon | Pattern |
|---|---|---|---|---|---|
| arcane_overlord | The Drifter | Fire | 160 | 👁 | Attack 18 → Apply 3 Char → Apply 5 Char → Attack 26 → Defend 18 |
| abyssal_leviathan | Abyssal Leviathan | Water | 155 | 🐉 | Attack 16 → Defend 20 → Apply 5 Drown → Attack 22 → Attack 28 |
| mountain_titan | Mountain Titan | Rock | 180 | ⛰️ | Defend 24 → Attack 18 → Defend 18 → Attack 26 → Apply 4 Daze |
| storm_sovereign | Storm Sovereign | Arc | 150 | 🌩️ | Attack 16 → Apply 3 Shock → Attack 22 → Apply 4 Shock → Attack 30 |
| glacier_ancient | Glacial Mass | Ice | 158 | 🧊 | Apply 3 Freeze → Attack 18 → Defend 22 → Attack 24 → Apply 4 Freeze |
| shadow_sovereign | Shadow Sovereign | Shadow | 152 | 🌑 | Attack 16 → Attack 20 → Attack 22 → Attack 18 → Attack 28 |
| celestial_arbiter | Celestial Arbiter | Light | 155 | ✨ | Defend 22 → Attack 18 → Apply 4 Blind → Attack 26 → Defend 16 |
| world_root | World Root | Grass | 160 | 🌲 | Apply 4 Root → Defend 20 → Attack 16 → Apply 5 Root → Attack 22 |

---

## Boss Strategy Notes

**The Drifter (Fire):** Applies Char on intents 2 and 3 — Purify before the stacks compound. Attack 26 on intent 4 is the danger window; block heavy going in.

**Abyssal Leviathan (Water):** Applies 5 permanent Drown on intent 3. Attack 28 on intent 5 is dangerous; burn it down before the Drown compounds.

**Mountain Titan (Rock):** Highest HP of all bosses. Very defensive — cycle through its pattern quickly with burst damage. Daze on intent 5 can disrupt your offense if timed poorly.

**Storm Sovereign (Arc):** Stacks Shock on intents 2 and 4, then hits with 30 damage on intent 5. Don't let Shock stack — Rock's resistance and Ice's type advantage both help here.

**Glacial Mass (Ice):** Opens with 3 Freeze — if you're Frostweaver vs this boss, their Freeze goes on *you*. Intent 5 adds 4 more Freeze stacks.

**Shadow Sovereign (Shadow):** Pure escalating attacks — 16, 20, 22, 18, 28. No status to disrupt; outlast it with Lifesteal, block, or burst it down before the final 28.

**Celestial Arbiter (Light):** Most defensive boss — high block on intents 1 and 5. Applies 4 Blind on intent 3, making your attacks unreliable mid-cycle. Burst damage or sustained DoT needed to work through block cycles.

**World Root (Grass):** Applies massive Root stacks — watch for its attack intents triggering Root detonation on *itself* if you apply Root back. Intent 4 applies 5 Root before its own attack intent.

---

## Intent Legend

| Intent Type | Meaning |
|---|---|
| Attack N | Deals N damage (modified by Blind and type effectiveness) |
| Defend N | Gains N block |
| Apply N [Status] | Applies N stacks of a status effect to the player |

**Enemy attack typing:** All `Attack` intents are typed by the enemy's elemental type unless a specific attack states otherwise. This means the player's type resistances and weaknesses apply to enemy attacks, the same as they do to player spells.
