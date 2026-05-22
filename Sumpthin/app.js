const CUBE_ID = "2d231bc9-1b10-4817-a889-9d86f17dacb9";
const CUBE_URL = `https://cubecobra.com/cube/api/cubeJSON/${CUBE_ID}`;
const PACK_PATTERN = [
  ["common", 11],
  ["uncommon", 3],
  ["rareSlot", 1],
];
const RARITY_LABELS = {
  common: "C",
  uncommon: "U",
  rare: "R",
  mythic: "M",
};

const state = {
  pools: null,
  pack: [],
};

const els = {
  status: document.querySelector("#status"),
  grid: document.querySelector("#pack-grid"),
  generate: document.querySelector("#generate-pack"),
  copy: document.querySelector("#copy-link"),
  commonCount: document.querySelector("#common-count"),
  uncommonCount: document.querySelector("#uncommon-count"),
  rareCount: document.querySelector("#rare-count"),
  template: document.querySelector("#card-template"),
};

els.generate.disabled = true;
els.copy.disabled = true;
els.generate.addEventListener("click", () => generateAndRender());
els.copy.addEventListener("click", () => copyPackLink());

init();

async function init() {
  renderPlaceholder("Loading cube...");

  try {
    const cube = await fetchCube();
    state.pools = buildPools(cube.cards.mainboard);
    updateStats(state.pools);
    restorePackFromUrl() || generateAndRender();
    els.generate.disabled = false;
    els.copy.disabled = false;
  } catch (error) {
    console.error(error);
    els.status.textContent =
      "Could not load the CubeCobra list. Refresh the page and try again.";
    renderPlaceholder("Cube load failed");
  }
}

async function fetchCube() {
  const response = await fetch(CUBE_URL);

  if (!response.ok) {
    throw new Error(`CubeCobra returned ${response.status}`);
  }

  return response.json();
}

function buildPools(cards) {
  const pools = {
    common: [],
    uncommon: [],
    rareSlot: [],
    cardsById: new Map(),
  };

  for (const entry of cards) {
    const details = entry.details;
    const rarity = normalizeRarity(details.rarity);

    if (!["common", "uncommon", "rare", "mythic"].includes(rarity)) {
      continue;
    }

    const card = {
      id: details.scryfall_id || entry.cardID,
      name: details.name,
      rarity,
      image: details.image_normal || details.image_small,
      link: details.scryfall_uri,
      set: details.set?.toUpperCase() || "",
    };

    pools.cardsById.set(card.id, card);

    if (rarity === "common") {
      addCopies(pools.common, card, 5);
    } else if (rarity === "uncommon") {
      addCopies(pools.uncommon, card, 3);
    } else if (rarity === "rare") {
      addCopies(pools.rareSlot, card, 2);
    } else {
      addCopies(pools.rareSlot, card, 1);
    }
  }

  validatePools(pools);
  return pools;
}

function normalizeRarity(rarity) {
  return rarity === "mythic" || rarity === "mythic rare" ? "mythic" : rarity;
}

function addCopies(pool, card, count) {
  for (let copy = 0; copy < count; copy += 1) {
    pool.push(card);
  }
}

function validatePools(pools) {
  for (const [poolName, needed] of PACK_PATTERN) {
    if (pools[poolName].length < needed) {
      throw new Error(`Not enough cards in ${poolName}`);
    }
  }
}

function generateAndRender(seed = makeSeed()) {
  const random = mulberry32(hashSeed(seed));
  const pack = [];

  for (const [poolName, count] of PACK_PATTERN) {
    const pool = state.pools[poolName];

    for (let pick = 0; pick < count; pick += 1) {
      pack.push(pool[Math.floor(random() * pool.length)]);
    }
  }

  state.pack = pack;
  updateUrl(seed);
  renderPack(pack);
  els.status.textContent = packSummary(pack);
}

function restorePackFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get("seed");

  if (!seed) {
    return false;
  }

  generateAndRender(seed);
  return true;
}

function renderPack(pack) {
  els.grid.textContent = "";

  for (const card of pack) {
    const tile = els.template.content.cloneNode(true);
    const article = tile.querySelector(".card-tile");
    const link = tile.querySelector("a");
    const image = tile.querySelector("img");
    const name = tile.querySelector(".card-name");
    const rarity = tile.querySelector(".card-rarity");

    article.title = `${card.name} (${card.set})`;
    link.href = card.link;
    image.src = card.image;
    image.alt = card.name;
    name.textContent = card.name;
    rarity.textContent = RARITY_LABELS[card.rarity];
    rarity.classList.add(card.rarity);
    els.grid.append(tile);
  }
}

function renderPlaceholder(message) {
  els.grid.innerHTML = `<div class="placeholder">${message}</div>`;
}

function updateStats(pools) {
  const commonUnique = uniqueCount(pools.common);
  const uncommonUnique = uniqueCount(pools.uncommon);
  const rareUnique = uniqueCount(pools.rareSlot);

  els.commonCount.textContent = `${commonUnique} x5`;
  els.uncommonCount.textContent = `${uncommonUnique} x3`;
  els.rareCount.textContent = `${rareUnique} weighted`;
}

function uniqueCount(pool) {
  return new Set(pool.map((card) => card.id)).size;
}

function packSummary(pack) {
  const rare = pack.find((card) => ["rare", "mythic"].includes(card.rarity));
  const duplicates = duplicateNames(pack);
  const duplicateText = duplicates.length
    ? ` Duplicates: ${duplicates.join(", ")}.`
    : "";

  return `Generated 11 commons, 3 uncommons, and ${articleFor(rare.rarity)} ${rare.rarity}: ${rare.name}.${duplicateText}`;
}

function duplicateNames(pack) {
  const counts = new Map();

  for (const card of pack) {
    counts.set(card.name, (counts.get(card.name) || 0) + 1);
  }

  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => `${name} x${count}`);
}

function articleFor(word) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function makeSeed() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(36)).join("-");
}

function hashSeed(seed) {
  let hash = 2166136261;

  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  return function nextRandom() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function updateUrl(seed) {
  const url = new URL(window.location);
  url.searchParams.set("seed", seed);
  window.history.replaceState({}, "", url);
}

async function copyPackLink() {
  await navigator.clipboard.writeText(window.location.href);
  const original = els.copy.textContent;
  els.copy.textContent = "Copied";
  window.setTimeout(() => {
    els.copy.textContent = original;
  }, 1200);
}
