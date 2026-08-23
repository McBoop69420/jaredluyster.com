// Pure draft engine — no DOM, no network. Shared verbatim by the browser (solo mode)
// and by the DraftRoom Durable Object (multiplayer), so draft rules can never fork.
//
// Cards are held as integer refs into `draft.catalog`. Every pack, pool and deal is an
// array of refs; call `cardAt` to resolve one. This keeps the mutable slice of a draft
// small enough to persist on every pick and to send over a socket.

const RARITY_WEIGHT = { common: 1, uncommon: 1.35, rare: 1.8, mythic: 2.1 };

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

// Bumped whenever the wire-visible shape or the pick rules change. The DO echoes this
// in its welcome frame so a stale cached client can warn instead of desyncing.
export const ENGINE_VERSION = 2;

export function createDraft(config, cards, seatKinds) {
  if (!Array.isArray(cards) || cards.length < config.packSize) {
    throw new Error("cube-too-small");
  }

  const kinds = seatKinds
    ? seatKinds.slice()
    : Array.from({ length: config.players }, (_, seat) => (seat === 0 ? "human" : "bot"));

  const needed = config.players * config.packs * config.packSize;
  const random = mulberry32(hashSeed(config.seed));
  const supply = drawSupply(cards.length, needed, random);
  const rounds = [];

  let cursor = 0;
  for (let round = 0; round < config.packs; round += 1) {
    const seats = [];
    for (let seat = 0; seat < config.players; seat += 1) {
      seats.push(supply.slice(cursor, cursor + config.packSize));
      cursor += config.packSize;
    }
    rounds.push(seats);
  }

  return {
    config,
    catalog: cards,
    seatKinds: kinds,
    rounds,
    round: 0,
    pickNumber: 1,
    step: 0,
    takenThisStep: new Array(config.players).fill(0),
    currentPacks: rounds[0].map((pack) => pack.slice()),
    pools: Array.from({ length: config.players }, () => []),
    colorCounts: Array.from({ length: config.players }, () => ({})),
    finished: false,
  };
}

export function cardAt(draft, ref) {
  return draft.catalog[ref];
}

export function cardsOf(catalog, refs) {
  return refs.map((ref) => catalog[ref]);
}

/* ---------- queries ---------- */

// How many cards each seat owes this step. Table-wide by design: a per-seat quota would
// leave the pass boundary undefined.
export function picksThisStep(draft) {
  const { doublePickAfter } = draft.config;
  return doublePickAfter > 0 && draft.pickNumber > doublePickAfter ? 2 : 1;
}

// Cards this seat still owes, capped by what is actually left in its pack. The cap is
// load-bearing: without it a seat owing 2 from a 1-card pack never becomes ready and the
// whole table deadlocks.
export function picksRemaining(draft, seat = 0) {
  if (draft.finished) {
    return 0;
  }

  const taken = draft.takenThisStep[seat];
  const available = taken + draft.currentPacks[seat].length;
  return Math.min(picksThisStep(draft), available) - taken;
}

export function pendingSeats(draft) {
  const pending = [];

  for (let seat = 0; seat < draft.config.players; seat += 1) {
    if (picksRemaining(draft, seat) > 0) {
      pending.push(seat);
    }
  }

  return pending;
}

export function allSeatsReady(draft) {
  return pendingSeats(draft).length === 0;
}

/* ---------- mutation ---------- */

// Takes one card for a seat. Returns a tagged result rather than throwing: the Durable
// Object maps these straight onto error frames, and untrusted input shouldn't need a
// try/catch around it.
export function submitPick(draft, seat, index, expectedRef) {
  if (draft.finished) {
    return { ok: false, error: "draft-finished" };
  }

  if (!Number.isInteger(seat) || seat < 0 || seat >= draft.config.players) {
    return { ok: false, error: "bad-seat" };
  }

  if (picksRemaining(draft, seat) === 0) {
    return { ok: false, error: "not-owed" };
  }

  const pack = draft.currentPacks[seat];
  if (!Number.isInteger(index) || index < 0 || index >= pack.length) {
    return { ok: false, error: "bad-index" };
  }

  // Position-anchored, never indexOf: a pack may legitimately hold the same ref twice
  // when an undersized cube repeats, and indexOf would resolve to the wrong copy.
  if (expectedRef !== undefined && pack[index] !== expectedRef) {
    return { ok: false, error: "stale-pack" };
  }

  const ref = applyPick(draft, seat, index);

  return {
    ok: true,
    seat,
    ref,
    remaining: picksRemaining(draft, seat),
    seatReady: picksRemaining(draft, seat) === 0,
    pending: pendingSeats(draft),
  };
}

function applyPick(draft, seat, index) {
  const [ref] = draft.currentPacks[seat].splice(index, 1);
  draft.pools[seat].push(ref);
  draft.takenThisStep[seat] += 1;

  const counts = draft.colorCounts[seat];
  for (const color of draft.catalog[ref].colors) {
    counts[color] = (counts[color] || 0) + 1;
  }

  return ref;
}

// Fills a seat's outstanding picks with the bot heuristic. Used for bot seats, for AFK
// auto-picks, and for seats the host converts mid-draft.
export function autoPickSeat(draft, seat) {
  let taken = 0;

  while (picksRemaining(draft, seat) > 0) {
    applyPick(draft, seat, chooseBotCard(draft, draft.currentPacks[seat], draft.colorCounts[seat]));
    taken += 1;
  }

  return taken;
}

export function autoPickBots(draft) {
  let taken = 0;

  for (let seat = 0; seat < draft.config.players; seat += 1) {
    if (draft.seatKinds[seat] === "bot") {
      taken += autoPickSeat(draft, seat);
    }
  }

  return taken;
}

export function convertSeatToBot(draft, seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= draft.config.players) {
    return false;
  }
  if (draft.seatKinds[seat] === "bot") {
    return false;
  }

  // colorCounts has been accumulated for this seat all along, so the bot picks up
  // consistently with whatever the human already drafted.
  draft.seatKinds[seat] = "bot";
  return true;
}

// Closes the step once every seat has picked: passes the packs, and rolls into the next
// round when they run dry.
export function resolveStep(draft) {
  if (draft.finished) {
    return { ok: false, error: "draft-finished" };
  }

  const pending = pendingSeats(draft);
  if (pending.length > 0) {
    return { ok: false, error: "waiting", pending };
  }

  draft.takenThisStep.fill(0);
  draft.pickNumber += 1;
  passPacks(draft);
  draft.step += 1;

  if (draft.currentPacks.every((pack) => pack.length === 0)) {
    return startNextRound(draft);
  }

  return {
    ok: true,
    status: "next-pick",
    round: draft.round,
    pickNumber: draft.pickNumber,
    step: draft.step,
  };
}

// Runs the table as far forward as it can go: bots pick, the step resolves, repeat.
// Stops as soon as a human still owes a card. The loop matters for an all-bot table.
export function advance(draft, maxSteps = 512) {
  const resolved = [];

  for (let i = 0; i < maxSteps; i += 1) {
    if (draft.finished) {
      break;
    }

    autoPickBots(draft);
    if (!allSeatsReady(draft)) {
      break;
    }

    const result = resolveStep(draft);
    if (!result.ok) {
      break;
    }

    resolved.push(result);
    if (result.status === "finished") {
      break;
    }
  }

  return resolved;
}

// Solo driver: seat 0 is the human, every other seat is a bot that picks immediately.
export function pickCard(draft, index) {
  const result = submitPick(draft, 0, index);

  if (!result.ok) {
    throw new Error(`pickCard: ${result.error}`);
  }

  if (result.remaining > 0) {
    return "same-pack";
  }

  const resolved = advance(draft);
  const last = resolved[resolved.length - 1];
  return last && last.status === "finished" ? "finished" : "next-pick";
}

function startNextRound(draft) {
  draft.round += 1;
  draft.pickNumber = 1;
  draft.takenThisStep.fill(0);

  if (draft.round >= draft.config.packs) {
    draft.finished = true;
    return { ok: true, status: "finished", round: draft.round, pickNumber: 1, step: draft.step };
  }

  draft.currentPacks = draft.rounds[draft.round].map((pack) => pack.slice());

  return {
    ok: true,
    status: "next-round",
    round: draft.round,
    pickNumber: draft.pickNumber,
    step: draft.step,
  };
}

/* ---------- bot heuristic ---------- */

function chooseBotCard(draft, pack, colorCounts) {
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let index = 0; index < pack.length; index += 1) {
    const score = scoreCardForBot(draft.catalog[pack[index]], colorCounts);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function scoreCardForBot(card, colorCounts) {
  let score = RARITY_WEIGHT[card.rarity] || 1;

  if (card.colors.length === 0) {
    score += card.isLand ? -0.4 : 0.25;
  } else {
    const affinity = card.colors.reduce((total, color) => total + (colorCounts[color] || 0), 0);
    score += affinity * 0.09;
    score -= (card.colors.length - 1) * 0.35;
  }

  if (card.isCreature) {
    score += 0.15;
  }

  return score;
}

/* ---------- dealing ---------- */

// Direction alternates per round. This reads draft.round, so it must run before
// startNextRound increments it — otherwise the pass silently flips at every rollover.
function passPacks(draft) {
  const { players } = draft.config;
  const passLeft = draft.round % 2 === 0;
  const next = new Array(players);

  for (let seat = 0; seat < players; seat += 1) {
    const target = passLeft ? (seat + 1) % players : (seat - 1 + players) % players;
    next[target] = draft.currentPacks[seat];
  }

  draft.currentPacks = next;
}

// Deals refs, not cards. Shuffling an index array consumes the RNG identically to
// shuffling the card array, so the deal matches the pre-refactor engine exactly.
function drawSupply(cardCount, needed, random) {
  const indices = Array.from({ length: cardCount }, (_, i) => i);
  const supply = [];

  while (supply.length < needed) {
    const shuffled = shuffle(indices, random);
    supply.push(...shuffled.slice(0, Math.min(needed - supply.length, shuffled.length)));
  }

  return supply;
}

function shuffle(items, random) {
  const copy = items.slice();

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}

/* ---------- serialization ---------- */

// The catalog is immutable and often large, so it is stored once and rejoined on load.
export function toJSON(draft) {
  const { catalog, ...rest } = draft;
  return rest;
}

export function fromJSON(data, catalog) {
  return { ...data, catalog };
}

/* ---------- misc ---------- */

export function groupKey(card) {
  if (card.colors.length > 1) {
    return "M";
  }
  if (card.colors.length === 1) {
    return card.colors[0];
  }
  return card.isLand ? "L" : "C";
}

export function makeSeed() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(36)).join("-");
}

function hashSeed(seed) {
  let hash = 2166136261;

  for (const char of String(seed)) {
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
