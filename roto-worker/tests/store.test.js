import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { makeStore, nodeSqliteExec } from "../store.js";
import { createRoomState, handleMessage, stepFrame } from "../room-core.js";
import { config, makeCube } from "../../roto/tests/fixtures.js";

function freshStore() {
  const db = new DatabaseSync(":memory:");
  const store = makeStore(nodeSqliteExec(db));
  store.init();
  return store;
}

function newRoom(overrides = {}) {
  const cfg = config({ players: 4, packs: 2, packSize: 4, ...overrides });
  return createRoomState("ROOM-TEST", cfg, makeCube(200), 1000);
}

let counter = 0;
const deps = { token: () => `tok-${counter++}` };

function join(state, name) {
  const result = handleMessage(state, { seat: null }, { t: "join", name, haveCatalog: true }, 1000, deps);
  return result.effects.find((effect) => effect.msg.t === "welcome").msg;
}

function pick(state, seat) {
  const message = {
    t: "pick",
    seq: state.draft.pools[seat].length,
    index: 0,
    ref: state.draft.currentPacks[seat][0],
  };
  return handleMessage(state, { seat }, message, 1000, deps);
}

test("a fresh database holds no room", () => {
  const store = freshStore();
  assert.equal(store.exists(), false);
  assert.equal(store.load(), null);
});

test("a created room round-trips through SQLite intact", () => {
  const store = freshStore();
  const state = newRoom();
  store.writeCreation(state);

  assert.equal(store.exists(), true);
  const loaded = store.load();

  assert.equal(loaded.code, state.code);
  assert.deepEqual(loaded.config, state.config);
  assert.equal(loaded.phase, "lobby");
  assert.deepEqual(loaded.draft.catalog, state.draft.catalog, "the full catalog survives");
  assert.deepEqual(loaded.draft.rounds, state.draft.rounds, "the deal survives");
  assert.deepEqual(loaded.draft.currentPacks, state.draft.currentPacks);
});

test("an evicted room resumes mid-draft and finishes identically", () => {
  // Run a draft straight through, recording the final pools.
  const uninterrupted = newRoom();
  join(uninterrupted, "Ann");
  handleMessage(uninterrupted, { seat: 0 }, { t: "start" }, 1000, deps);
  while (uninterrupted.phase === "drafting") {
    pick(uninterrupted, 0);
  }

  // Now run the same draft, but persist and reload between every single pick — the
  // eviction the Hibernation API can perform at any moment.
  const store = freshStore();
  let state = newRoom();
  join(state, "Ann");
  handleMessage(state, { seat: 0 }, { t: "start" }, 1000, deps);
  store.writeCreation(state);

  let guard = 0;
  while (state.phase === "drafting" && guard++ < 200) {
    const result = pick(state, 0);
    store.writeLive(result.state);
    for (const entry of result.state.pickLog) {
      store.appendPick(entry);
    }

    // Drop every in-memory reference and rebuild purely from storage.
    state = store.load();
  }

  assert.equal(state.phase, "complete");
  assert.deepEqual(
    state.draft.pools,
    uninterrupted.draft.pools,
    "reloading between every pick must not change the draft"
  );
  assert.deepEqual(state.draft.seatKinds, uninterrupted.draft.seatKinds);
  assert.equal(state.draft.step, uninterrupted.draft.step);
});

test("the pick log survives reload and still fences a duplicate submission", () => {
  const store = freshStore();
  let state = newRoom();
  join(state, "Ann");
  join(state, "Ben");
  handleMessage(state, { seat: 0 }, { t: "start" }, 1000, deps);
  store.writeCreation(state);

  const message = {
    t: "pick",
    seq: 0,
    index: 0,
    ref: state.draft.currentPacks[0][0],
  };
  const first = handleMessage(state, { seat: 0 }, message, 1000, deps);
  store.writeLive(first.state);
  for (const entry of first.state.pickLog) store.appendPick(entry);

  state = store.load();
  assert.equal(state.pickLog.length, 1, "the log came back");

  const poolBefore = state.draft.pools[0].slice();
  const retry = handleMessage(state, { seat: 0 }, message, 1000, deps);
  const replay = retry.effects.find((effect) => effect.msg.t === "picked");

  assert.equal(replay.msg.replay, true, "the reloaded log still recognises the retry");
  assert.equal(replay.msg.ref, message.ref);
  assert.deepEqual(retry.state.draft.pools[0], poolBefore, "no second card was taken");
});

test("seat tokens and host survive eviction so players can reclaim their seats", () => {
  const store = freshStore();
  let state = newRoom();
  const ann = join(state, "Ann");
  const ben = join(state, "Ben");
  handleMessage(state, { seat: 0 }, { t: "start" }, 1000, deps);
  store.writeCreation(state);

  state = store.load();

  assert.equal(state.hostSeat, 0);
  assert.equal(state.seats[0].token, ann.token);
  assert.equal(state.seats[1].token, ben.token);

  const reclaim = handleMessage(
    state,
    { seat: null },
    { t: "join", token: ben.token, haveCatalog: true },
    2000,
    deps
  );
  assert.equal(reclaim.effects.find((e) => e.msg.t === "welcome").msg.seat, 1);
});

test("a reloaded room reports the same step frame", () => {
  const store = freshStore();
  let state = newRoom();
  join(state, "Ann");
  join(state, "Ben");
  handleMessage(state, { seat: 0 }, { t: "start" }, 1000, deps);
  pick(state, 0);
  store.writeCreation(state);

  const before = stepFrame(state);
  state = store.load();

  assert.deepEqual(stepFrame(state), before, "clock and pending seats survive the round trip");
});

test("destroy clears the room", () => {
  const store = freshStore();
  store.writeCreation(newRoom());
  assert.equal(store.exists(), true);

  store.destroy();
  assert.equal(store.exists(), false);
  assert.equal(store.load(), null);
});
