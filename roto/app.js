import { cardsOf, createDraft, makeSeed, pickCard, picksRemaining } from "./draft.js";
import { fetchCubeCards, parseCubeId } from "./cube.js";
import { clearDraft, clearSeat, loadDraft, loadSeat, saveDraft, saveSeat } from "./storage.js";
import {
  decklistText,
  plural,
  renderCardGrid,
  renderPool,
  sortForResults,
} from "./render.js";

const els = {
  setupView: document.querySelector("#setup-view"),
  lobbyView: document.querySelector("#lobby-view"),
  draftView: document.querySelector("#draft-view"),
  resultsView: document.querySelector("#results-view"),
  setupForm: document.querySelector("#setup-form"),
  joinForm: document.querySelector("#join-form"),
  joinCode: document.querySelector("#join-code"),
  modeSolo: document.querySelector("#mode-solo"),
  modeFriends: document.querySelector("#mode-friends"),
  nameField: document.querySelector("#name-field"),
  playerName: document.querySelector("#player-name"),
  playersHint: document.querySelector("#players-hint"),
  setupLead: document.querySelector("#setup-lead"),
  lobbyCode: document.querySelector("#lobby-code"),
  lobbyStatus: document.querySelector("#lobby-status"),
  seatList: document.querySelector("#seat-list"),
  startRoom: document.querySelector("#start-room"),
  copyRoomLink: document.querySelector("#copy-room-link"),
  tableStatus: document.querySelector("#table-status"),
  tablePools: document.querySelector("#table-pools"),
  connection: document.querySelector("#connection-status"),
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
let mode = "solo";
let room = null;

init();

function init() {
  els.doublePicks.addEventListener("change", syncDoublePicksVisibility);
  els.packSize.addEventListener("input", clampDoublePickAfter);
  els.setupForm.addEventListener("submit", onSetupSubmit);
  els.joinForm.addEventListener("submit", onJoinSubmit);
  els.restart.addEventListener("click", onRestart);
  els.copyDecklist.addEventListener("click", onCopyDecklist);
  els.copySeedLink.addEventListener("click", onCopySeedLink);
  els.copyRoomLink.addEventListener("click", onCopyRoomLink);
  els.startRoom.addEventListener("click", () => room?.start());
  els.modeSolo.addEventListener("click", () => setMode("solo"));
  els.modeFriends.addEventListener("click", () => setMode("friends"));

  applyUrlParams();
  syncDoublePicksVisibility();

  const invited = new URLSearchParams(window.location.search).get("room");
  if (invited) {
    setMode("friends");
    joinRoom(normalizeCode(invited));
    return;
  }

  const saved = loadDraft();
  if (saved) {
    draft = saved;
    resumeDraft();
  }
}

function setMode(next) {
  mode = next;
  const friends = next === "friends";

  els.modeSolo.classList.toggle("is-active", !friends);
  els.modeFriends.classList.toggle("is-active", friends);
  els.modeSolo.setAttribute("aria-selected", String(!friends));
  els.modeFriends.setAttribute("aria-selected", String(friends));

  els.joinForm.hidden = !friends;
  els.nameField.hidden = !friends;
  els.startButton.textContent = friends ? "Create Room" : "Start Draft";
  els.playersHint.textContent = friends
    ? "Seats nobody claims are drafted by bots."
    : "You are seat 1. The rest are bots.";
  els.setupLead.textContent = friends
    ? "Create a table, share the code, and draft together. Any seat still empty when you start is filled by a bot."
    : "Paste a CubeCobra cube link, pick your table size, and draft against bots. Everything runs in your browser — share the seed to replay the exact same draft.";

  // The seed only reproduces a solo draft; multiplayer packs are dealt by the server.
  els.seedInput.closest(".field").hidden = friends;
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

  if (mode === "friends") {
    await createRoomFlow(config);
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
    saveDraft(draft);
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
    cubeId: parseCubeId(els.cubeUrl.value),
    players: clamp(els.players.value, 2, 8),
    packs: clamp(els.packs.value, 1, 6),
    packSize: clamp(els.packSize.value, 4, 24),
    doublePickAfter: els.doublePicks.checked ? Number(els.doublePickAfter.value) : 0,
    seed: els.seedInput.value.trim() || makeSeed(),
  };
}

/* ---------- multiplayer ---------- */

// Loaded on demand so a solo draft never fetches the networking code.
async function roomModule() {
  return import("./room-client.js");
}

async function createRoomFlow(config) {
  els.startButton.disabled = true;
  setSetupStatus("Creating the room…");

  try {
    const { createRoom } = await roomModule();
    const created = await createRoom({
      cubeId: config.cubeId,
      players: config.players,
      packs: config.packs,
      packSize: config.packSize,
      doublePickAfter: config.doublePickAfter,
      hostName: playerName(),
    });

    setSetupStatus("");
    await joinRoom(created.code, created.undersized);
  } catch (error) {
    console.error(error);
    setSetupStatus(error.message || "Could not create the room.", true);
  } finally {
    els.startButton.disabled = false;
  }
}

async function onJoinSubmit(event) {
  event.preventDefault();

  const code = normalizeCode(els.joinCode.value);
  if (code.length !== 8) {
    setSetupStatus("A room code is eight characters, like XXXX-XXXX.", true);
    return;
  }

  await joinRoom(code);
}

async function joinRoom(code, undersized = false) {
  const { RoomClient, roomInfo } = await roomModule();
  const saved = loadSeat(code);

  if (!saved) {
    const info = await roomInfo(code);
    if (!info.exists) {
      setMode("friends");
      showView("setup");
      setSetupStatus("No room with that code — check it and try again.", true);
      return;
    }
  }

  room?.close();
  room = new RoomClient({
    code,
    token: saved?.token,
    name: playerName(),
    onChange: renderRoom,
    onEvent: onRoomEvent,
  });

  if (undersized) {
    setLobbyStatus("Heads up: this cube is smaller than the draft, so cards will repeat.");
  }

  showView("lobby");
  els.lobbyCode.textContent = prettyCode(code);
}

function onRoomEvent(event) {
  if (event.type === "seat") {
    saveSeat(event.code, { seat: event.seat, token: event.token, name: playerName() });
    return;
  }

  if (event.type === "error") {
    if (event.fatal) {
      clearSeat(room?.code);
      showView("setup");
      setMode("friends");
      setSetupStatus(event.message, true);
      return;
    }
    setLobbyStatus(event.message, true);
  }
}

function renderRoom(client) {
  renderConnection(client.status);

  if (client.done) {
    showView("results");
    renderRoomResults(client);
    return;
  }

  if (client.phase === "lobby") {
    showView("lobby");
    renderSeatList(client);
    return;
  }

  showView("draft");
  renderRoomDraft(client);
}

function renderSeatList(client) {
  els.startRoom.hidden = !client.isHost;
  els.seatList.textContent = "";

  const seats = client.room?.seats || [];
  for (const seat of seats) {
    const row = document.createElement("div");
    row.className = "seat-row";
    if (seat.seat === client.seat) {
      row.classList.add("is-you");
    }

    const label = document.createElement("span");
    label.className = "seat-name";
    label.textContent = seat.claimed || seat.kind === "bot" ? seat.name : "Open seat";
    row.append(label);

    const tag = document.createElement("span");
    tag.className = "seat-tag";
    tag.textContent = seatTagText(seat, client);
    row.append(tag);

    els.seatList.append(row);
  }
}

function seatTagText(seat, client) {
  if (seat.seat === client.seat) return "You";
  if (seat.kind === "bot") return "Bot";
  if (!seat.claimed) return "Waiting";
  if (seat.seat === client.room?.hostSeat) return seat.connected ? "Host" : "Host · away";
  return seat.connected ? "Ready" : "Away";
}

function renderRoomDraft(client) {
  const step = client.step;
  const pack = client.cards(client.pack);

  els.packHeading.textContent = step
    ? `Pack ${step.round + 1}, Pick ${step.pickNumber}`
    : "Waiting for the table";

  if (client.remaining > 1) {
    els.pickInstruction.textContent = `Choose ${client.remaining} cards — click them one at a time.`;
  } else if (client.remaining === 1) {
    els.pickInstruction.textContent = "Choose a card.";
  } else {
    els.pickInstruction.textContent = "Waiting for the rest of the table…";
  }

  els.progress.textContent = step
    ? `Pack ${step.round + 1}/${client.room.config.packs} · ${pack.length} cards left`
    : "";

  const canPick = client.remaining > 0 && client.pendingPick === null;
  renderCardGrid(
    els.packGrid,
    els.cardTemplate,
    pack,
    canPick ? (index) => client.pick(index) : null
  );
  renderPool(els.poolList, els.poolCount, client.cards(client.pool));
  renderTableStatus(client);
}

function renderTableStatus(client) {
  const seats = client.room?.seats || [];
  const pending = new Set(client.step?.pending || []);
  const sizes = client.step?.poolSizes || [];

  els.tableStatus.hidden = false;
  els.tableStatus.textContent = "";

  for (const seat of seats) {
    const chip = document.createElement("span");
    chip.className = "seat-chip";

    const waiting = pending.has(seat.seat);
    if (waiting) chip.classList.add("is-waiting");
    if (seat.seat === client.seat) chip.classList.add("is-you");
    if (!seat.connected && seat.kind === "human") chip.classList.add("is-away");

    chip.textContent = `${seat.name} · ${sizes[seat.seat] ?? 0}`;
    chip.title = waiting ? `${seat.name} is still picking` : `${seat.name} has picked`;

    // The host can hand an abandoned seat to a bot rather than let it stall the table.
    if (client.isHost && seat.kind === "human" && !seat.connected) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "seat-botify";
      button.textContent = "Make bot";
      button.addEventListener("click", () => client.botify(seat.seat));
      chip.append(button);
    }

    els.tableStatus.append(chip);
  }
}

function renderRoomResults(client) {
  els.packGrid.textContent = "";
  els.tableStatus.hidden = true;

  const mine = client.cards(client.done.pools[client.seat] || []);
  const creatures = mine.filter((card) => card.isCreature).length;
  const seats = client.done.seats;

  els.resultsSummary.textContent =
    `${plural(mine.length, "card")} over ${plural(client.room.config.packs, "pack")} ` +
    `with ${plural(seats.filter((seat) => seat.kind === "human").length, "drafter")} — ` +
    `${plural(creatures, "creature")}.`;

  renderCardGrid(els.resultsGrid, els.cardTemplate, sortForResults(mine), null);
  els.copySeedLink.hidden = true;

  // Everyone's pool is public once the draft is over — that is the payoff.
  els.tablePools.hidden = false;
  els.tablePools.textContent = "";

  client.done.pools.forEach((refs, seat) => {
    if (seat === client.seat) return;

    const section = document.createElement("section");
    section.className = "table-pool";

    const heading = document.createElement("h3");
    heading.textContent = `${seats[seat].name} — ${plural(refs.length, "card")}`;
    section.append(heading);

    const list = document.createElement("div");
    list.className = "pool-list";
    renderPool(list, null, client.cards(refs));
    section.append(list);

    els.tablePools.append(section);
  });
}

function renderConnection(status) {
  const labels = {
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
    connected: "",
  };

  const text = labels[status] ?? "";
  els.connection.textContent = text;
  els.connection.hidden = !text;
}

function playerName() {
  return els.playerName.value.trim() || "";
}

function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function prettyCode(code) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function setLobbyStatus(message, isError = false) {
  els.lobbyStatus.textContent = message;
  els.lobbyStatus.classList.toggle("error", isError);
}

async function onCopyRoomLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", room.code);
  await copyWithFeedback(els.copyRoomLink, url.toString());
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
  saveDraft(draft);

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
  els.lobbyView.hidden = name !== "lobby";
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

  renderCardGrid(els.packGrid, els.cardTemplate, cardsOf(draft.catalog, pack), onCardPicked);
  renderPool(els.poolList, els.poolCount, cardsOf(draft.catalog, draft.pools[0]));
}

function renderResults() {
  // Drop the spent pack so its tiles stop carrying live pick handlers.
  els.packGrid.textContent = "";

  const pool = cardsOf(draft.catalog, draft.pools[0]);
  const creatures = pool.filter((card) => card.isCreature).length;
  const article = draft.config.players === 8 ? "an" : "a";

  els.resultsSummary.textContent =
    `${plural(pool.length, "card")} over ${plural(draft.config.packs, "pack")} ` +
    `at ${article} ${draft.config.players}-player table — ${plural(creatures, "creature")}. ` +
    `Seed: ${draft.config.seed}`;

  renderCardGrid(els.resultsGrid, els.cardTemplate, sortForResults(pool), null);
}

/* ---------- actions ---------- */

function onRestart() {
  clearDraft();
  draft = null;

  room?.close();
  room = null;

  // Drop ?room= so a reload does not rejoin the table we just left.
  if (new URLSearchParams(window.location.search).has("room")) {
    window.history.replaceState(null, "", window.location.pathname);
  }

  els.tableStatus.hidden = true;
  els.tablePools.hidden = true;
  els.copySeedLink.hidden = false;
  renderConnection("connected");
  setLobbyStatus("");
  showView("setup");
  setSetupStatus("");
}

async function onCopyDecklist() {
  const pool = room?.done
    ? room.cards(room.done.pools[room.seat] || [])
    : cardsOf(draft.catalog, draft.pools[0]);

  await copyWithFeedback(els.copyDecklist, decklistText(pool));
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

/* ---------- utilities ---------- */

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}
