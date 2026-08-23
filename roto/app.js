import {
  COLOR_ORDER,
  createDraft,
  groupKey,
  makeSeed,
  pickCard,
  picksRemaining,
} from "./draft.js";

const CUBE_API = "https://cubecobra.com/cube/api/cubeJSON/";
const STORAGE_KEY = "roto.draft.v1";
const GROUP_ORDER = [...COLOR_ORDER, "M", "C", "L"];
const GROUP_LABELS = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  M: "Multicolor",
  C: "Colorless",
  L: "Land",
};

const els = {
  setupView: document.querySelector("#setup-view"),
  draftView: document.querySelector("#draft-view"),
  resultsView: document.querySelector("#results-view"),
  setupForm: document.querySelector("#setup-form"),
  setupStatus: document.querySelector("#setup-status"),
  startButton: document.querySelector("#start-draft"),
  cubeUrl: document.querySelector("#cube-url"),
  players: document.querySelector("#players"),
  packs: document.querySelector("#packs"),
  packSize: document.querySelector("#pack-size"),
  seedInput: document.querySelector("#seed"),
  doublePicks: document.querySelector("#double-picks"),
  doublePicksConfig: document.querySelector("#double-picks-config"),
  doublePickAfter: document.querySelector("#double-pick-after"),
  packHeading: document.querySelector("#pack-heading"),
  pickInstruction: document.querySelector("#pick-instruction"),
  packGrid: document.querySelector("#pack-grid"),
  poolList: document.querySelector("#pool-list"),
  poolCount: document.querySelector("#pool-count"),
  progress: document.querySelector("#draft-progress"),
  restart: document.querySelector("#restart"),
  resultsGrid: document.querySelector("#results-grid"),
  resultsSummary: document.querySelector("#results-summary"),
  copyDecklist: document.querySelector("#copy-decklist"),
  copySeedLink: document.querySelector("#copy-seed-link"),
  cardTemplate: document.querySelector("#card-template"),
};

let draft = null;

init();

function init() {
  els.doublePicks.addEventListener("change", syncDoublePicksVisibility);
  els.packSize.addEventListener("input", clampDoublePickAfter);
  els.setupForm.addEventListener("submit", onSetupSubmit);
  els.restart.addEventListener("click", onRestart);
  els.copyDecklist.addEventListener("click", onCopyDecklist);
  els.copySeedLink.addEventListener("click", onCopySeedLink);

  applyUrlParams();
  syncDoublePicksVisibility();

  const saved = loadSavedDraft();
  if (saved) {
    draft = saved;
    resumeDraft();
  }
}

/* ---------- setup ---------- */

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const fields = {
    cube: els.cubeUrl,
    seed: els.seedInput,
    players: els.players,
    packs: els.packs,
    packSize: els.packSize,
  };

  for (const [param, element] of Object.entries(fields)) {
    const value = params.get(param);
    if (value) {
      element.value = value;
    }
  }

  const doubleAfter = params.get("doublePickAfter");
  if (doubleAfter) {
    els.doublePicks.checked = true;
    els.doublePickAfter.value = doubleAfter;
  }
}

function syncDoublePicksVisibility() {
  els.doublePicksConfig.hidden = !els.doublePicks.checked;
  clampDoublePickAfter();
}

function clampDoublePickAfter() {
  const max = Math.max(1, Number(els.packSize.value) - 1);
  els.doublePickAfter.max = String(max);
  if (Number(els.doublePickAfter.value) > max) {
    els.doublePickAfter.value = String(max);
  }
}

async function onSetupSubmit(event) {
  event.preventDefault();

  const config = readConfig();
  if (!config.cubeId) {
    setSetupStatus("That doesn't look like a CubeCobra cube link or ID.", true);
    return;
  }

  els.startButton.disabled = true;
  setSetupStatus("Loading cube from CubeCobra…");

  try {
    const cards = await fetchCubeCards(config.cubeId);

    if (cards.length < config.packSize) {
      throw new Error(
        `This cube has ${cards.length} usable cards — not enough to fill a ${config.packSize}-card pack.`
      );
    }

    draft = createDraft(config, cards);
    saveDraft();
    resumeDraft();
    setSetupStatus("");
  } catch (error) {
    console.error(error);
    setSetupStatus(
      error.message || "Could not load that cube. Check the link and try again.",
      true
    );
  } finally {
    els.startButton.disabled = false;
  }
}

function readConfig() {
  return {
    cubeId: parseCubeId(els.cubeUrl.value.trim()),
    players: clamp(els.players.value, 2, 8),
    packs: clamp(els.packs.value, 1, 6),
    packSize: clamp(els.packSize.value, 4, 24),
    doublePickAfter: els.doublePicks.checked ? Number(els.doublePickAfter.value) : 0,
    seed: els.seedInput.value.trim() || makeSeed(),
  };
}

function parseCubeId(input) {
  if (!input) {
    return "";
  }

  const match = input.match(/cubecobra\.com\/cube\/(?:[a-z]+\/)?([^/?#]+)/i);
  const id = match ? match[1] : input;
  return /^[\w-]+$/.test(id) ? id : "";
}

async function fetchCubeCards(cubeId) {
  const response = await fetch(CUBE_API + encodeURIComponent(cubeId));

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "CubeCobra has no cube with that ID."
        : `CubeCobra returned ${response.status}.`
    );
  }

  const cube = await response.json();
  const mainboard = cube?.cards?.mainboard;

  if (!Array.isArray(mainboard) || mainboard.length === 0) {
    throw new Error("That cube's mainboard is empty.");
  }

  return mainboard.map(toCard).filter((card) => card.image);
}

function toCard(entry) {
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

function normalizeRarity(rarity) {
  const value = String(rarity || "common").toLowerCase();
  return value.startsWith("mythic") ? "mythic" : value;
}

/* ---------- draft loop ---------- */

function resumeDraft() {
  showView(draft.finished ? "results" : "draft");

  if (draft.finished) {
    renderResults();
  } else {
    renderDraft();
  }
}

function onCardPicked(index) {
  const outcome = pickCard(draft, index);
  saveDraft();

  if (outcome === "finished") {
    showView("results");
    renderResults();
    return;
  }

  renderDraft();
}

/* ---------- rendering ---------- */

function showView(name) {
  els.setupView.hidden = name !== "setup";
  els.draftView.hidden = name !== "draft";
  els.resultsView.hidden = name !== "results";
  els.restart.hidden = name === "setup";
  els.progress.hidden = name !== "draft";
}

function renderDraft() {
  const pack = draft.currentPacks[0];
  const remaining = picksRemaining(draft);

  els.packHeading.textContent = `Pack ${draft.round + 1}, Pick ${draft.pickNumber}`;
  els.pickInstruction.textContent =
    remaining > 1 ? `Choose ${remaining} cards — click them one at a time.` : "Choose a card.";
  els.progress.textContent =
    `Pack ${draft.round + 1}/${draft.config.packs} · ${pack.length} cards left`;

  renderCardGrid(els.packGrid, pack, onCardPicked);
  renderPool();
}

function renderCardGrid(container, cards, onPick) {
  container.textContent = "";

  cards.forEach((card, index) => {
    const tile = els.cardTemplate.content.cloneNode(true);
    const button = tile.querySelector(".card-button");
    const image = tile.querySelector("img");

    image.src = card.image;
    image.alt = card.name;
    tile.querySelector(".card-name").textContent = card.name;
    tile.querySelector(".card-cost").textContent = costLabel(card);

    if (onPick) {
      button.title = `Pick ${card.name}`;
      button.addEventListener("click", () => onPick(index));
    } else {
      button.disabled = true;
    }

    container.append(tile);
  });
}

function costLabel(card) {
  if (card.isLand && card.colors.length === 0) {
    return "Land";
  }
  return `${card.cmc} · ${card.colors.length ? card.colors.join("") : "C"}`;
}

function plural(count, noun) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function renderPool() {
  const pool = draft.pools[0];
  els.poolCount.textContent = plural(pool.length, "card");
  els.poolList.textContent = "";

  for (const [group, cards] of groupPool(pool)) {
    const section = document.createElement("section");
    section.className = "pool-group";

    const heading = document.createElement("h3");
    heading.textContent = `${GROUP_LABELS[group]} (${cards.length})`;
    section.append(heading);

    const list = document.createElement("ul");
    for (const card of cards) {
      const item = document.createElement("li");
      item.textContent = card.name;
      item.title = `${card.name} — ${costLabel(card)}`;
      list.append(item);
    }

    section.append(list);
    els.poolList.append(section);
  }
}

function groupPool(pool) {
  const groups = new Map();

  for (const card of pool) {
    const key = groupKey(card);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(card);
  }

  for (const cards of groups.values()) {
    cards.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  }

  return [...groups].sort(
    (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0])
  );
}

function renderResults() {
  const pool = draft.pools[0];
  const creatures = pool.filter((card) => card.isCreature).length;

  const article = draft.config.players === 8 ? "an" : "a";

  els.resultsSummary.textContent =
    `${plural(pool.length, "card")} over ${plural(draft.config.packs, "pack")} ` +
    `at ${article} ${draft.config.players}-player table — ${plural(creatures, "creature")}. ` +
    `Seed: ${draft.config.seed}`;

  renderCardGrid(els.resultsGrid, sortForResults(pool), null);
}

function sortForResults(pool) {
  return pool
    .slice()
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(groupKey(a)) - GROUP_ORDER.indexOf(groupKey(b)) ||
        a.cmc - b.cmc ||
        a.name.localeCompare(b.name)
    );
}

/* ---------- actions ---------- */

function onRestart() {
  window.localStorage.removeItem(STORAGE_KEY);
  draft = null;
  showView("setup");
  setSetupStatus("");
}

async function onCopyDecklist() {
  const counts = new Map();

  for (const card of draft.pools[0]) {
    counts.set(card.name, (counts.get(card.name) || 0) + 1);
  }

  const lines = [...counts].map(([name, count]) => `${count} ${name}`).join("\n");
  await copyWithFeedback(els.copyDecklist, lines);
}

async function onCopySeedLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("cube", draft.config.cubeId);
  url.searchParams.set("seed", draft.config.seed);
  url.searchParams.set("players", String(draft.config.players));
  url.searchParams.set("packs", String(draft.config.packs));
  url.searchParams.set("packSize", String(draft.config.packSize));

  if (draft.config.doublePickAfter > 0) {
    url.searchParams.set("doublePickAfter", String(draft.config.doublePickAfter));
  }

  await copyWithFeedback(els.copySeedLink, url.toString());
}

async function copyWithFeedback(button, text) {
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function setSetupStatus(message, isError = false) {
  els.setupStatus.textContent = message;
  els.setupStatus.classList.toggle("error", isError);
}

/* ---------- persistence ---------- */

function saveDraft() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn("Could not save draft progress", error);
  }
}

function loadSavedDraft() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed?.config && Array.isArray(parsed.pools) ? parsed : null;
  } catch {
    return null;
  }
}

/* ---------- utilities ---------- */

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}
