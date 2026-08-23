// Pure room logic for a multiplayer draft. No Cloudflare imports, no sockets, no clock
// of its own — every entry point takes `now` and returns the next state plus a list of
// effects. room.js is the thin Durable Object adapter that feeds it and dispatches the
// effects; everything interesting is testable under bare `node --test`.
//
// Effects: { to: "all" | <seat>, msg } — "all" broadcasts, a number unicasts.

import {
  advance,
  autoPickSeat,
  convertSeatToBot,
  createDraft,
  ENGINE_VERSION,
  pendingSeats,
  picksRemaining,
  picksThisStep,
  submitPick,
} from "../roto/draft.js";

export const PROTOCOL_VERSION = 1;
export const CATALOG_CHUNK = 100;

// How long a disconnected seat may hold up the table before the room picks for it.
export const AFK_MS = 90_000;
// A room with nobody connected stops scheduling alarms after this and resumes on rejoin.
export const IDLE_STOP_MS = 30 * 60_000;

/* ---------- construction ---------- */

export function createRoomState(code, config, cards, now, hostName = "Host") {
  // Every seat starts "human" so nothing auto-picks in the lobby. Unclaimed seats are
  // converted to bots at start, which keeps the deal fixed at creation time.
  const draft = createDraft(config, cards, new Array(config.players).fill("human"));

  return {
    code,
    protocol: PROTOCOL_VERSION,
    phase: "lobby",
    config,
    hostSeat: null,
    hostName,
    createdAt: now,
    lastSeenAny: now,
    seats: Array.from({ length: config.players }, (_, seat) => ({
      seat,
      name: "",
      kind: "human",
      token: null,
      claimed: false,
      connected: false,
      afk: false,
      lastSeen: 0,
    })),
    draft,
    pickLog: [],
  };
}

/* ---------- frame builders ---------- */

// Never carries tokens — this frame is broadcast.
export function roomFrame(state) {
  return {
    t: "room",
    code: state.code,
    phase: state.phase,
    config: state.config,
    hostSeat: state.hostSeat,
    seats: state.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      kind: seat.kind,
      claimed: seat.claimed,
      connected: seat.connected,
      afk: seat.afk,
    })),
  };
}

export function handFrame(state, seat) {
  const { draft } = state;

  return {
    t: "hand",
    step: draft.step,
    round: draft.round,
    pickNumber: draft.pickNumber,
    pack: draft.currentPacks[seat].slice(),
    remaining: picksRemaining(draft, seat),
    seq: draft.pools[seat].length,
  };
}

export function stepFrame(state) {
  const { draft } = state;

  return {
    t: "step",
    step: draft.step,
    round: draft.round,
    pickNumber: draft.pickNumber,
    picksThisStep: picksThisStep(draft),
    pending: pendingSeats(draft),
    poolSizes: draft.pools.map((pool) => pool.length),
  };
}

export function doneFrame(state) {
  return {
    t: "done",
    step: state.draft.step,
    pools: state.draft.pools.map((pool) => pool.slice()),
    seats: roomFrame(state).seats,
  };
}

function catalogFrames(state) {
  const { catalog } = state.draft;
  const chunks = Math.max(1, Math.ceil(catalog.length / CATALOG_CHUNK));
  const frames = [];

  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const start = chunk * CATALOG_CHUNK;
    frames.push({
      t: "catalog",
      chunk,
      chunks,
      start,
      cards: catalog.slice(start, start + CATALOG_CHUNK),
    });
  }

  return frames;
}

function error(code, message, fatal = false) {
  return { t: "err", code, message, fatal };
}

/* ---------- message handling ---------- */

export function handleMessage(state, actor, msg, now, deps = {}) {
  const effects = [];

  if (!msg || typeof msg.t !== "string") {
    return reply(state, effects, actor, error("bad-frame", "Malformed message."));
  }

  state.lastSeenAny = now;

  switch (msg.t) {
    case "join":
      return handleJoin(state, actor, msg, now, deps, effects);
    case "rename":
      return handleRename(state, actor, msg, effects);
    case "start":
      return handleStart(state, actor, now, effects);
    case "pick":
      return handlePick(state, actor, msg, now, effects);
    case "botify":
      return handleBotify(state, actor, msg, now, effects);
    case "resync":
      return handleResync(state, actor, msg, effects);
    case "leave":
      return handleLeave(state, actor, now, effects);
    default:
      return reply(state, effects, actor, error("unknown-type", `Unknown message "${msg.t}".`));
  }
}

// Direct response to whichever socket sent the message. Addressed as "actor" rather than
// by seat because an unseated socket (bad token, full room) has no seat to address.
function reply(state, effects, actor, msg) {
  effects.push({ to: "actor", msg });
  return { state, effects };
}

function handleJoin(state, actor, msg, now, deps, effects) {
  if (msg.protocol !== undefined && msg.protocol !== PROTOCOL_VERSION) {
    return reply(
      state,
      effects,
      actor,
      error("bad-protocol", "This page is out of date — reload to rejoin.", true)
    );
  }

  const seat = msg.token ? seatByToken(state, msg.token) : claimSeat(state, deps);

  if (!seat) {
    return reply(
      state,
      effects,
      actor,
      msg.token
        ? error("bad-token", "That seat is no longer yours.", true)
        : error(
            state.phase === "lobby" ? "room-full" : "draft-started",
            state.phase === "lobby"
              ? "Every seat at this table is taken."
              : "This draft has already started.",
            true
          )
    );
  }

  if (typeof msg.name === "string" && msg.name.trim()) {
    seat.name = cleanName(msg.name);
  }
  if (!seat.name) {
    seat.name = `Seat ${seat.seat + 1}`;
  }

  seat.connected = true;
  seat.afk = false;
  seat.lastSeen = now;

  if (state.hostSeat === null) {
    state.hostSeat = seat.seat;
  }

  // The token appears on this frame and nowhere else, so it goes to the joining socket
  // only — never to the seat tag, which a second tab could be sharing.
  effects.push({
    to: "actor",
    msg: {
      t: "welcome",
      seat: seat.seat,
      token: seat.token,
      isHost: state.hostSeat === seat.seat,
      protocol: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      code: state.code,
    },
  });

  if (!msg.haveCatalog) {
    for (const frame of catalogFrames(state)) {
      effects.push({ to: "actor", msg: frame });
    }
  }

  pushSeatView(state, seat.seat, effects, "actor");
  effects.push({ to: "all", msg: roomFrame(state) });

  return { state, effects, alarm: nextAlarm(state, now) };
}

// Everything this seat needs to render, in render order.
function pushSeatView(state, seat, effects, target = seat) {
  if (state.phase === "drafting") {
    effects.push({ to: target, msg: { t: "pool", refs: state.draft.pools[seat].slice() } });
    effects.push({ to: target, msg: handFrame(state, seat) });
    effects.push({ to: target, msg: stepFrame(state) });
  } else if (state.phase === "complete") {
    effects.push({ to: target, msg: doneFrame(state) });
  }
}

function claimSeat(state, deps) {
  if (state.phase !== "lobby") {
    return null;
  }

  // No await between finding the free seat and claiming it — see room.js.
  const seat = state.seats.find((candidate) => !candidate.claimed);
  if (!seat) {
    return null;
  }

  seat.claimed = true;
  seat.token = (deps.token || defaultToken)();
  return seat;
}

function seatByToken(state, token) {
  return state.seats.find((seat) => seat.token && seat.token === token) || null;
}

function handleRename(state, actor, msg, effects) {
  const seat = seatOf(state, actor);
  if (!seat) {
    return reply(state, effects, actor, error("no-seat", "You are not seated."));
  }

  seat.name = cleanName(msg.name) || seat.name;
  effects.push({ to: "all", msg: roomFrame(state) });
  return { state, effects };
}

function handleStart(state, actor, now, effects) {
  if (!isHost(state, actor)) {
    return reply(state, effects, actor, error("forbidden", "Only the host can start the draft."));
  }
  if (state.phase !== "lobby") {
    return reply(state, effects, actor, error("already-started", "The draft is already underway."));
  }

  // Anyone who never showed up drafts as a bot.
  for (const seat of state.seats) {
    if (!seat.claimed) {
      convertSeatToBot(state.draft, seat.seat);
      seat.kind = "bot";
      seat.name = seat.name || `Bot ${seat.seat + 1}`;
    }
  }

  state.phase = "drafting";
  effects.push({ to: "all", msg: roomFrame(state) });

  applyAdvance(state, now, effects);
  broadcastRound(state, effects);

  return { state, effects, alarm: nextAlarm(state, now) };
}

function handlePick(state, actor, msg, now, effects) {
  const seat = seatOf(state, actor);
  if (!seat) {
    return reply(state, effects, actor, error("no-seat", "You are not seated."));
  }
  if (state.phase !== "drafting") {
    return reply(state, effects, actor, error("not-drafting", "The draft is not running."));
  }

  const index = seat.seat;
  const pool = state.draft.pools[index];

  if (!Number.isInteger(msg.seq)) {
    return reply(state, effects, actor, error("bad-frame", "A pick needs a sequence number."));
  }

  // A retry after a dropped ack: replay the original result instead of taking a second
  // card. Fencing on pickNumber alone would silently let this through.
  if (msg.seq < pool.length) {
    const previous = state.pickLog.find(
      (entry) => entry.seat === index && entry.seq === msg.seq
    );

    if (previous) {
      effects.push({
        to: index,
        msg: {
          t: "picked",
          seq: previous.seq,
          step: previous.step,
          ref: previous.ref,
          remaining: picksRemaining(state.draft, index),
          replay: true,
        },
      });
      return { state, effects };
    }
  }

  if (msg.seq > pool.length) {
    effects.push({ to: index, msg: error("out-of-sync", "Your draft state was behind.") });
    pushSeatView(state, index, effects);
    return { state, effects };
  }

  const result = submitPick(state.draft, index, msg.index, msg.ref);

  if (!result.ok) {
    effects.push({ to: index, msg: error(result.error, pickErrorMessage(result.error)) });
    effects.push({ to: index, msg: handFrame(state, index) });
    return { state, effects };
  }

  seat.afk = false;
  seat.lastSeen = now;
  state.pickLog.push({
    seat: index,
    seq: msg.seq,
    step: state.draft.step,
    ref: result.ref,
    at: now,
  });

  effects.push({
    to: index,
    msg: {
      t: "picked",
      seq: msg.seq,
      step: state.draft.step,
      ref: result.ref,
      remaining: result.remaining,
    },
  });
  effects.push({
    to: "all",
    msg: { t: "seatPicked", step: state.draft.step, seat: index, remaining: result.remaining },
  });

  applyAdvance(state, now, effects);
  broadcastRound(state, effects);

  return { state, effects, alarm: nextAlarm(state, now) };
}

function pickErrorMessage(code) {
  switch (code) {
    case "not-owed":
      return "You have already picked this round.";
    case "stale-pack":
      return "That pack changed — here it is again.";
    case "bad-index":
      return "That card is not in your pack.";
    default:
      return "That pick could not be applied.";
  }
}

function handleBotify(state, actor, msg, now, effects) {
  if (!isHost(state, actor)) {
    return reply(state, effects, actor, error("forbidden", "Only the host can do that."));
  }

  const target = state.seats[msg.seat];
  if (!target) {
    return reply(state, effects, actor, error("bad-seat", "No such seat."));
  }
  if (target.connected && !target.afk) {
    return reply(
      state,
      effects,
      actor,
      error("seat-active", "That player is still connected.")
    );
  }
  if (!convertSeatToBot(state.draft, target.seat)) {
    return reply(state, effects, actor, error("already-bot", "That seat is already a bot."));
  }

  target.kind = "bot";
  // The seat is gone for good; its token must stop working.
  target.token = null;
  target.connected = false;

  effects.push({ to: "all", msg: roomFrame(state) });
  applyAdvance(state, now, effects);
  broadcastRound(state, effects);

  return { state, effects, alarm: nextAlarm(state, now) };
}

function handleResync(state, actor, msg, effects) {
  const seat = seatOf(state, actor);
  if (!seat) {
    return reply(state, effects, actor, error("no-seat", "You are not seated."));
  }

  if (!msg.haveCatalog) {
    for (const frame of catalogFrames(state)) {
      effects.push({ to: seat.seat, msg: frame });
    }
  }

  effects.push({ to: seat.seat, msg: roomFrame(state) });
  pushSeatView(state, seat.seat, effects);

  return { state, effects };
}

function handleLeave(state, actor, now, effects) {
  const seat = seatOf(state, actor);
  if (!seat) {
    return { state, effects };
  }
  return handleDisconnect(state, seat.seat, now);
}

/* ---------- lifecycle ---------- */

export function handleDisconnect(state, seatIndex, now) {
  const effects = [];
  const seat = state.seats[seatIndex];

  if (!seat) {
    return { state, effects };
  }

  seat.connected = false;
  seat.lastSeen = now;

  // The host leaving must not strand the table with nobody able to botify a seat.
  if (state.hostSeat === seatIndex) {
    const heir = state.seats.find(
      (candidate) => candidate.connected && candidate.kind === "human"
    );
    state.hostSeat = heir ? heir.seat : null;
  }

  effects.push({ to: "all", msg: roomFrame(state) });

  return { state, effects, alarm: nextAlarm(state, now) };
}

export function handleReconnect(state, seatIndex, now) {
  const seat = state.seats[seatIndex];
  if (seat) {
    seat.connected = true;
    seat.afk = false;
    seat.lastSeen = now;
  }
  return { state, effects: [{ to: "all", msg: roomFrame(state) }], alarm: nextAlarm(state, now) };
}

export function handleAlarm(state, now) {
  const effects = [];

  if (state.phase !== "drafting") {
    return { state, effects, alarm: nextAlarm(state, now) };
  }

  let picked = false;

  for (const seatIndex of pendingSeats(state.draft)) {
    const seat = state.seats[seatIndex];
    if (!seat || seat.connected) {
      continue;
    }
    if (now - seat.lastSeen < AFK_MS) {
      continue;
    }

    // Deliberately gentler than botifying: the seat stays human and clears `afk` the
    // moment its player comes back.
    if (autoPickSeat(state.draft, seatIndex) > 0) {
      seat.afk = true;
      picked = true;
      effects.push({ to: "all", msg: { t: "seatAfk", seat: seatIndex } });
    }
  }

  if (picked) {
    applyAdvance(state, now, effects);
    broadcastRound(state, effects);
    effects.push({ to: "all", msg: roomFrame(state) });
  }

  return { state, effects, alarm: nextAlarm(state, now) };
}

/* ---------- shared advancement ---------- */

function applyAdvance(state, now, effects) {
  const resolved = advance(state.draft);

  if (state.draft.finished && state.phase !== "complete") {
    state.phase = "complete";
    effects.push({ to: "all", msg: doneFrame(state) });
    effects.push({ to: "all", msg: roomFrame(state) });
  }

  return resolved;
}

// Sends everyone the post-resolve view. Built after advancing, never from a snapshot
// taken before — a pre-resolve snapshot ships empty packs for a whole round.
function broadcastRound(state, effects) {
  if (state.phase !== "drafting") {
    return;
  }

  effects.push({ to: "all", msg: stepFrame(state) });

  for (let seat = 0; seat < state.config.players; seat += 1) {
    if (state.seats[seat].kind === "human") {
      effects.push({ to: seat, msg: handFrame(state, seat) });
    }
  }
}

function nextAlarm(state, now) {
  if (state.phase !== "drafting") {
    return null;
  }

  const anyConnected = state.seats.some((seat) => seat.connected);
  if (!anyConnected && now - state.lastSeenAny > IDLE_STOP_MS) {
    return null;
  }

  const waiting = pendingSeats(state.draft).some((seat) => !state.seats[seat].connected);
  return waiting ? now + AFK_MS : null;
}

/* ---------- helpers ---------- */

function seatOf(state, actor) {
  if (actor.seat === null || actor.seat === undefined) {
    return null;
  }
  return state.seats[actor.seat] || null;
}

function isHost(state, actor) {
  return actor.seat !== null && actor.seat === state.hostSeat;
}

function cleanName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function defaultToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
