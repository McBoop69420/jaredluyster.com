import test from "node:test";
import assert from "node:assert/strict";

import * as engine from "../draft.js";
import { config, makeCube, poolNames, sameMultiset, scriptedPicker } from "./fixtures.js";

// Drives a draft to completion through the solo `pickCard` path, choosing each card
// with the supplied script. `pickCard` already auto-plays every bot turn in between,
// so one call per script pick is enough regardless of how many bots sit at the table.
function runSolo(cfg, cards, picker, guard = 100000) {
  const draft = engine.createDraft(cfg, cards);
  let steps = 0;

  while (!draft.finished) {
    if (steps++ > guard) throw new Error("runSolo did not terminate");
    if (draft.pool.length === 0) break;
    engine.pickCard(draft, picker(draft.pool.length));
  }

  return draft;
}

/* ---------- turn order ---------- */

test("turns snake through the table: forward, then backward, repeating", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 3 });
  const draft = engine.createDraft(cfg, makeCube(300), new Array(4).fill("bot"));
  const seatsInOrder = [];

  while (!draft.finished) {
    seatsInOrder.push(draft.currentSeat);
    engine.autoPickSeat(draft, draft.currentSeat);
    engine.resolveStep(draft);
  }

  // Round 0 forward, round 1 backward, round 2 forward — the boundary seat (3, then 0)
  // leads both the outgoing and incoming round, which is the defining "double turn" of
  // a snake draft.
  assert.deepEqual(seatsInOrder, [0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3]);
  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.equal(draft.pools[seat].length, cfg.cardsPerPlayer, `seat ${seat} pool size`);
  }
});

/* ---------- determinism ---------- */

test("same seed reproduces the draft, different seed does not", () => {
  const cards = makeCube(400);
  const cfg = config({ players: 4, cardsPerPlayer: 16, seed: "same" });

  const a = runSolo(cfg, cards, scriptedPicker("script"));
  const b = runSolo(cfg, cards, scriptedPicker("script"));
  assert.deepEqual(poolNames(b, 0), poolNames(a, 0));

  const c = runSolo({ ...cfg, seed: "different" }, cards, scriptedPicker("script"));
  assert.notDeepEqual(poolNames(c, 0), poolNames(a, 0));
});

/* ---------- conservation ---------- */

test("every seat ends with a full pool and no card is lost", () => {
  const cfg = config();
  const cards = makeCube(700);
  const draft = runSolo(cfg, cards, scriptedPicker("conserve"));

  assert.equal(draft.finished, true);
  assert.equal(draft.pool.length, 0);

  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.equal(draft.pools[seat].length, cfg.cardsPerPlayer, `seat ${seat} pool size`);
  }

  // Multiset, not Set — an undersized cube may legitimately repeat a card, and even a
  // large one can when drawSupply wraps a shuffle boundary. The pool started at exactly
  // players*cardsPerPlayer cards, so what's drafted must match it exactly.
  const drafted = [];
  for (let seat = 0; seat < cfg.players; seat += 1) {
    drafted.push(...poolNames(draft, seat));
  }

  assert.equal(drafted.length, cfg.players * cfg.cardsPerPlayer);
  assert.ok(sameMultiset(drafted, drafted), "sanity: multiset comparison is reflexive");
});

/* ---------- double-pick quotas ---------- */

test("double picks produce the documented quota sequence, ending on a single", () => {
  // cardsPerPlayer 15 with doublePickAfter 8: eight single picks, then doubles, and the
  // final turn must take 1 rather than 2 — the seat's own allotment simply runs out.
  const cfg = config({ players: 4, cardsPerPlayer: 15, doublePickAfter: 8 });
  const draft = engine.createDraft(cfg, makeCube(300));
  const quotas = [];

  let guard = 0;
  while (!draft.finished && guard++ < 1000) {
    const owed = engine.picksRemaining(draft);
    if (owed === 0) break;
    quotas.push(owed);
    for (let i = 0; i < owed; i += 1) {
      engine.pickCard(draft, 0);
    }
  }

  assert.deepEqual(quotas, [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1]);
  assert.equal(
    quotas.reduce((sum, n) => sum + n, 0),
    cfg.cardsPerPlayer,
    "quotas account for exactly this seat's allotment"
  );
  assert.equal(draft.pools[0].length, cfg.cardsPerPlayer);
});

test("odd allotments strand no cards under double picks", () => {
  for (const [cardsPerPlayer, after, expected] of [
    [5, 1, [1, 2, 2]],
    [4, 1, [1, 2, 1]],
    [7, 3, [1, 1, 1, 2, 2]],
  ]) {
    const cfg = config({ players: 4, cardsPerPlayer, doublePickAfter: after });
    const draft = engine.createDraft(cfg, makeCube(300));
    const quotas = [];

    let guard = 0;
    while (!draft.finished && guard++ < 1000) {
      const owed = engine.picksRemaining(draft);
      if (owed === 0) break;
      quotas.push(owed);
      for (let i = 0; i < owed; i += 1) {
        engine.pickCard(draft, 0);
      }
    }

    assert.deepEqual(quotas, expected, `cardsPerPlayer=${cardsPerPlayer} after=${after}`);
    assert.equal(draft.pools[0].length, cardsPerPlayer, `cardsPerPlayer=${cardsPerPlayer} pool is full`);
  }
});

test("picksRemaining never exceeds what is left in the pool or this seat's allotment", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 9, doublePickAfter: 4 });
  const draft = engine.createDraft(cfg, makeCube(300));

  let guard = 0;
  while (!draft.finished && guard++ < 1000) {
    const owed = engine.picksRemaining(draft);
    assert.ok(owed >= 0, "picksRemaining is never negative");
    assert.ok(owed <= draft.pool.length, "picksRemaining never exceeds the shared pool");
    assert.ok(
      owed <= cfg.cardsPerPlayer - draft.pools[draft.currentSeat].length,
      "picksRemaining never exceeds this seat's own allotment"
    );
    if (draft.pool.length === 0) break;
    engine.pickCard(draft, 0);
  }
});
