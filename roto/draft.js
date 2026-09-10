// Pure draft engine — no DOM, no network. Shared verbatim by the browser (solo mode)
// and by the DraftRoom Durable Object (multiplayer), so draft rules can never fork.
//
// This is a snake draft: every card is shuffled once into a single shared `pool`,
// visible to the whole table, and seats pick from it one at a time in order
// 0..N-1, then N-1..0, repeating ("round" below means one such lap). Cards are held
// as integer refs into `draft.catalog`; call `cardAt` to resolve one. This keeps the
// mutable slice of a draft small enough to persist on every pick and to send over a
// socket.

const RARITY_WEIGHT = { common: 1, uncommon: 1.35, rare: 1.8, mythic: 2.1 };

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

// Bumped whenever the wire-visible shape or the pick rules change. The DO echoes this
// in its welcome frame so a stale cached client can warn instead of desyncing.
export const ENGINE_VERSION = 3;

export function createDraft(config, cards, seatKinds) {
  if (!Array.isArray(cards) || cards.length < config.players) {
    throw new Error("cube-too-small");
  }

  const kinds = seatKinds
    ? seatKinds.slice()
    : Array.from({ length: config.players }, (_, seat) => (seat === 0 ? "human" : "bot"));

  const needed = config.players * config.cardsPerPlayer;
  const random = mulberry32(hashSeed(config.seed));
  const pool = drawSupply(cards.length, needed, random);

  return {
    config,
    catalog: cards,
    seatKinds: kinds,
    pool,
    round: 0,
    currentSeat: 0,
    takenThisStep: 0,
    step: 0,
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

// How many cards the active seat owes this turn. Keyed off how many cards that seat
// had already taken as of the *start* of this turn — the snake-draft analogue of "pack
// position". Load-bearing to subtract takenThisStep back out: `pools[seat].length`
// updates as each card of this very turn is taken, so without it a turn that starts as
// a single can flip into a double partway through itself, once its own first card
// happens to cross the threshold.
export function picksThisStep(draft) {
  const { doublePickAfter } = draft.config;
  if (doublePickAfter <= 0) {
    return 1;
  }
  const takenBeforeThisTurn = draft.pools[draft.currentSeat].length - draft.takenThisStep;
  return takenBeforeThisTurn >= doublePickAfter ? 2 : 1;
}

// Cards the given seat still owes this turn — always 0 for any seat but the one
// currently up, and capped by whichever of two things runs out first: the shared pool,
// or (load-bearing, this one especially: without it double-picks can overdraw a seat
// past its own allotment even while the shared pool — everyone else's cards too —
// still has plenty left) this seat's own remaining `cardsPerPlayer` allotment. Both
// `pools[seat].length` and `draft.pool.length` already reflect whatever this turn has
// taken so far, so neither needs takenThisStep added back in — only this turn's own
// quota does.
export function picksRemaining(draft, seat = draft.currentSeat) {
  if (draft.finished || seat !== draft.currentSeat) {
    return 0;
  }

  const quotaLeft = picksThisStep(draft) - draft.takenThisStep;
  const ownAllotmentLeft = draft.config.cardsPerPlayer - draft.pools[seat].length;
  return Math.min(quotaLeft, ownAllotmentLeft, draft.pool.length);
}

export function pendingSeats(draft) {
  return picksRemaining(draft, draft.currentSeat) > 0 ? [draft.currentSeat] : [];
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

  if (seat !== draft.currentSeat || picksRemaining(draft, seat) === 0) {
    return { ok: false, error: "not-owed" };
  }

  const pool = draft.pool;
  if (!Number.isInteger(index) || index < 0 || index >= pool.length) {
    return { ok: false, error: "bad-index" };
  }

  // Position-anchored, never indexOf: the pool may legitimately hold the same ref
  // twice when an undersized cube repeats, and indexOf would resolve to the wrong copy.
  if (expectedRef !== undefined && pool[index] !== expectedRef) {
    return { ok: false, error: "stale-pool" };
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
  const [ref] = draft.pool.splice(index, 1);
  draft.pools[seat].push(ref);
  draft.takenThisStep += 1;

  const counts = draft.colorCounts[seat];
  for (const color of draft.catalog[ref].colors) {
    counts[color] = (counts[color] || 0) + 1;
  }

  return ref;
}

// Fills the active seat's outstanding picks with the bot heuristic. Used for bot
// seats, for AFK auto-picks, and for seats the host converts mid-draft. A no-op for
// any seat that isn't currently up.
export function autoPickSeat(draft, seat) {
  let taken = 0;

  while (seat === draft.currentSeat && picksRemaining(draft, seat) > 0) {
    applyPick(draft, seat, chooseBotCard(draft, draft.pool, draft.colorCounts[seat]));
    taken += 1;
  }

  return taken;
}

// Auto-plays every bot turn until a human owes a pick or the draft finishes. Only the
// active seat can ever be mid-turn, so this is just `advance` — kept as a named
// export since "run the bots" is a distinct intent from "resume the draft".
export function autoPickBots(draft) {
  return advance(draft);
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

// Closes the active seat's turn once its quota is fully taken and hands the turn to
// the next seat in snake order, rolling into the next round (and flipping direction)
// when a seat finishes a lap.
export function resolveStep(draft) {
  if (draft.finished) {
    return { ok: false, error: "draft-finished" };
  }

  const pending = pendingSeats(draft);
  if (pending.length > 0) {
    return { ok: false, error: "waiting", pending };
  }

  draft.takenThisStep = 0;
  draft.step += 1;

  // Finishing on pool exhaustion, not a fixed round count, is load-bearing: double
  // picks make some turns consume 2 cards instead of 1, so the number of laps it takes
  // to hand out `cardsPerPlayer` cards isn't fixed up front. picksRemaining already
  // caps every seat at its own allotment, so every seat's remaining allotment is
  // guaranteed to hit 0 at the same moment the shared pool does.
  if (draft.pool.length === 0) {
    draft.finished = true;
    return {
      ok: true,
      status: "finished",
      round: draft.round,
      currentSeat: draft.currentSeat,
      step: draft.step,
    };
  }

  return advanceTurn(draft);
}

// The boundary seat of a lap (last seat going forward, first seat going backward)
// leads both the outgoing and the incoming round — that back-to-back turn is the
// defining feature of a snake draft, compensating for picking last in the other
// direction. Reads draft.round before any mutation, so direction must be resolved
// first. Purely a turn-order bookkeeping step — finishing is decided by resolveStep
// before this ever runs.
function advanceTurn(draft) {
  const { players } = draft.config;
  const forward = draft.round % 2 === 0;
  const atBoundary = forward ? draft.currentSeat === players - 1 : draft.currentSeat === 0;

  if (atBoundary) {
    draft.round += 1;
    return {
      ok: true,
      status: "next-round",
      round: draft.round,
      currentSeat: draft.currentSeat,
      step: draft.step,
    };
  }

  draft.currentSeat = forward ? draft.currentSeat + 1 : draft.currentSeat - 1;

  return {
    ok: true,
    status: "next-pick",
    round: draft.round,
    currentSeat: draft.currentSeat,
    step: draft.step,
  };
}

// Runs the table as far forward as it can go: the active seat picks (if it's a bot)
// and its turn resolves, repeat. Stops as soon as a human still owes a card. Also the
// right thing to call right after a human's own pick, since it needs to resolve their
// turn and keep going through however many bot turns follow.
export function advance(draft, maxSteps = 512) {
  const resolved = [];

  for (let i = 0; i < maxSteps; i += 1) {
    if (draft.finished) {
      break;
    }

    if (draft.seatKinds[draft.currentSeat] === "bot") {
      autoPickSeat(draft, draft.currentSeat);
    }

    if (picksRemaining(draft, draft.currentSeat) > 0) {
      break;
    }

    const result = resolveStep(draft);
    resolved.push(result);
    if (!result.ok || result.status === "finished") {
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
    return "same-turn";
  }

  const resolved = advance(draft);
  const last = resolved[resolved.length - 1];
  return last && last.status === "finished" ? "finished" : "next-pick";
}

/* ---------- bot heuristic ---------- */

function chooseBotCard(draft, pool, colorCounts) {
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let index = 0; index < pool.length; index += 1) {
    const score = scoreCardForBot(draft.catalog[pool[index]], colorCounts);
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
