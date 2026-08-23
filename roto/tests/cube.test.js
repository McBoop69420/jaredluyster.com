import test from "node:test";
import assert from "node:assert/strict";

import { cardsFromCubeJson, normalizeRarity, parseCubeId, toCard } from "../cube.js";

// These functions run in two places — the browser for solo drafts and the DraftRoom
// Durable Object for multiplayer. If they ever disagree, the same cube yields different
// cards and the bot heuristic diverges, so the mapping is pinned here rather than left
// to whichever runtime happens to be exercised.

/* ---------- parseCubeId ---------- */

test("parseCubeId pulls the id out of every CubeCobra link shape", () => {
  const id = "2d231bc9-1b10-4817-a889-9d86f17dacb9";

  for (const url of [
    `https://cubecobra.com/cube/overview/${id}`,
    `https://cubecobra.com/cube/list/${id}`,
    `https://cubecobra.com/cube/playtest/${id}`,
    `http://cubecobra.com/cube/overview/${id}`,
    `https://CubeCobra.com/cube/Overview/${id}`,
    `cubecobra.com/cube/overview/${id}`,
    `https://cubecobra.com/cube/${id}`,
  ]) {
    assert.equal(parseCubeId(url), id, url);
  }
});

test("parseCubeId ignores query strings and fragments", () => {
  assert.equal(parseCubeId("https://cubecobra.com/cube/list/my-cube?tab=0"), "my-cube");
  assert.equal(parseCubeId("https://cubecobra.com/cube/overview/my-cube#section"), "my-cube");
});

test("parseCubeId accepts a bare id and trims surrounding space", () => {
  assert.equal(parseCubeId("my-cube"), "my-cube");
  assert.equal(parseCubeId("  my-cube  "), "my-cube");
  assert.equal(parseCubeId("2d231bc9-1b10-4817-a889-9d86f17dacb9"), "2d231bc9-1b10-4817-a889-9d86f17dacb9");
  assert.equal(parseCubeId("Cube_123"), "Cube_123");
});

test("parseCubeId rejects anything that is not a plausible id", () => {
  for (const bad of [
    "",
    "   ",
    null,
    undefined,
    "hello world",
    "https://example.com/cube/overview/abc",
    "not/a/cube",
    "cube@home",
  ]) {
    assert.equal(parseCubeId(bad), "", JSON.stringify(bad));
  }
});

/* ---------- normalizeRarity ---------- */

test("normalizeRarity folds every mythic spelling onto one value", () => {
  for (const input of ["mythic", "Mythic", "MYTHIC", "mythic rare", "Mythic Rare"]) {
    assert.equal(normalizeRarity(input), "mythic", input);
  }
});

test("normalizeRarity lowercases the ordinary rarities and defaults to common", () => {
  assert.equal(normalizeRarity("Rare"), "rare");
  assert.equal(normalizeRarity("UNCOMMON"), "uncommon");
  assert.equal(normalizeRarity("common"), "common");

  for (const missing of [undefined, null, ""]) {
    assert.equal(normalizeRarity(missing), "common", JSON.stringify(missing));
  }
});

/* ---------- toCard ---------- */

test("toCard maps a full CubeCobra entry onto the engine's card shape", () => {
  const card = toCard({
    cardID: "fallback-id",
    details: {
      scryfall_id: "scry-1",
      name: "Lightning Bolt",
      image_normal: "https://img/normal.jpg",
      image_small: "https://img/small.jpg",
      scryfall_uri: "https://scryfall.com/card/bolt",
      cmc: 1,
      colors: ["R"],
      rarity: "Common",
      type: "Instant",
    },
  });

  assert.deepEqual(card, {
    id: "scry-1",
    name: "Lightning Bolt",
    image: "https://img/normal.jpg",
    link: "https://scryfall.com/card/bolt",
    cmc: 1,
    colors: ["R"],
    rarity: "common",
    isLand: false,
    isCreature: false,
  });
});

test("toCard falls back sensibly when details are thin", () => {
  const card = toCard({ cardID: "fallback-id" });

  assert.equal(card.id, "fallback-id", "cardID stands in for a missing scryfall_id");
  assert.equal(card.name, "Unknown card");
  assert.equal(card.image, "");
  assert.equal(card.link, "");
  assert.equal(card.cmc, 0);
  assert.deepEqual(card.colors, []);
  assert.equal(card.rarity, "common");
  assert.equal(card.isLand, false);
  assert.equal(card.isCreature, false);
});

test("toCard prefers the normal image but accepts the small one", () => {
  assert.equal(
    toCard({ details: { image_normal: "n.jpg", image_small: "s.jpg" } }).image,
    "n.jpg"
  );
  assert.equal(toCard({ details: { image_small: "s.jpg" } }).image, "s.jpg");
});

test("toCard coerces cmc and guards colors against bad input", () => {
  assert.equal(toCard({ details: { cmc: "3" } }).cmc, 3, "numeric strings are coerced");
  assert.equal(toCard({ details: { cmc: "x" } }).cmc, 0, "unparseable cmc becomes 0");
  assert.equal(toCard({ details: {} }).cmc, 0);

  // The engine calls card.colors.reduce, so a non-array here would throw mid-draft.
  for (const colors of [undefined, null, "R", 5, {}]) {
    assert.deepEqual(toCard({ details: { colors } }).colors, [], JSON.stringify(colors));
  }
});

test("toCard reads land and creature off the type line", () => {
  const typeOf = (type) => toCard({ details: { type } });

  assert.equal(typeOf("Legendary Creature — Human Wizard").isCreature, true);
  assert.equal(typeOf("Artifact Creature — Golem").isCreature, true);
  assert.equal(typeOf("creature — bear").isCreature, true, "matching is case-insensitive");
  assert.equal(typeOf("Instant").isCreature, false);

  assert.equal(typeOf("Land").isLand, true);
  assert.equal(typeOf("Basic Land — Mountain").isLand, true);
  assert.equal(typeOf("Artifact Land").isLand, true);
  assert.equal(typeOf("Land Creature — Dryad").isLand, true);
  assert.equal(typeOf("Instant").isLand, false);

  // Word-boundary matching: an ability name that merely starts with "Land" is not a type.
  assert.equal(typeOf("Enchantment — Landfall").isLand, false);
});

/* ---------- cardsFromCubeJson ---------- */

test("cardsFromCubeJson maps the mainboard and drops imageless cards", () => {
  const cards = cardsFromCubeJson({
    cards: {
      mainboard: [
        { details: { name: "Has image", image_normal: "a.jpg", type: "Instant" } },
        { details: { name: "No image", type: "Instant" } },
        { details: { name: "Small only", image_small: "b.jpg", type: "Instant" } },
      ],
    },
  });

  assert.deepEqual(cards.map((card) => card.name), ["Has image", "Small only"]);
});

test("cardsFromCubeJson rejects a cube with nothing usable", () => {
  for (const bad of [
    undefined,
    null,
    {},
    { cards: {} },
    { cards: { mainboard: [] } },
    { cards: { mainboard: "not an array" } },
  ]) {
    assert.throws(() => cardsFromCubeJson(bad), /mainboard is empty/, JSON.stringify(bad));
  }
});
