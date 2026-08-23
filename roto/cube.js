// CubeCobra loading and card normalization. Shared by the browser and the DraftRoom
// Durable Object: the bot heuristic reads `rarity`, `colors`, `isLand` and `isCreature`,
// so both sides must build identical card objects from the same cube or solo and
// multiplayer drafts would diverge for the same input.

const CUBE_API = "https://cubecobra.com/cube/api/cubeJSON/";

// Accepts any CubeCobra link shape (overview/list/playtest/...) or a bare ID.
export function parseCubeId(input) {
  if (!input) {
    return "";
  }

  const trimmed = String(input).trim();
  const match = trimmed.match(/cubecobra\.com\/cube\/(?:[a-z]+\/)?([^/?#]+)/i);
  const id = match ? match[1] : trimmed;
  return /^[\w-]+$/.test(id) ? id : "";
}

export async function fetchCubeCards(cubeId, fetchImpl = fetch) {
  const response = await fetchImpl(CUBE_API + encodeURIComponent(cubeId));

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "CubeCobra has no cube with that ID."
        : `CubeCobra returned ${response.status}.`
    );
  }

  return cardsFromCubeJson(await response.json());
}

export function cardsFromCubeJson(cube) {
  const mainboard = cube?.cards?.mainboard;

  if (!Array.isArray(mainboard) || mainboard.length === 0) {
    throw new Error("That cube's mainboard is empty.");
  }

  return mainboard.map(toCard).filter((card) => card.image);
}

export function toCard(entry) {
  const details = entry.details || {};
  const type = details.type || "";

  return {
    id: details.scryfall_id || entry.cardID,
    name: details.name || "Unknown card",
    image: details.image_normal || details.image_small || "",
    link: details.scryfall_uri || "",
    cmc: Number(details.cmc) || 0,
    colors: Array.isArray(details.colors) ? details.colors : [],
    rarity: normalizeRarity(details.rarity),
    isLand: /\bLand\b/i.test(type),
    isCreature: /\bCreature\b/i.test(type),
  };
}

export function normalizeRarity(rarity) {
  const value = String(rarity || "common").toLowerCase();
  return value.startsWith("mythic") ? "mythic" : value;
}
