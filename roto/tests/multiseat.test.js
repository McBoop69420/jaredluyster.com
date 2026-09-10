import test from "node:test";
import assert from "node:assert/strict";

import {
  advance,
  autoPickSeat,
  convertSeatToBot,
  createDraft,
  picksRemaining,
  resolveStep,
  submitPick,
} from "../draft.js";
import { config, makeCube, poolNames, sameMultiset } from "./fixtures.js";

const allHuman = (players) => new Array(players).fill("human");

/* ---------- turn ownership ---------- */

test("only the seat currently up may submit a pick", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 5 });
  const draft = createDraft(cfg, makeCube(200), allHuman(4));

  assert.equal(draft.currentSeat, 0);
  for (const seat of [1, 2, 3]) {
    assert.deepEqual(submitPick(draft, seat, 0), { ok: false, error: "not-owed" });
  }

  assert.equal(submitPick(draft, 0, 0).ok, true);
});

test("resolveStep passes the turn to the next seat in snake order", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 5 });
  const draft = createDraft(cfg, makeCube(200), allHuman(4));

  submitPick(draft, 0, 0);
  const result = resolveStep(draft);

  assert.equal(result.ok, true);
  assert.equal(result.status, "next-pick");
  assert.equal(draft.currentSeat, 1);
});

test("a lap boundary hands the turn to the same seat twice in a row", () => {
  const cfg = config({ players: 3, cardsPerPlayer: 4 });
  const draft = createDraft(cfg, makeCube(200), allHuman(3));

  // Round 0 forward: 0, 1, 2.
  submitPick(draft, 0, 0);
  resolveStep(draft);
  submitPick(draft, 1, 0);
  resolveStep(draft);
  assert.equal(draft.currentSeat, 2);

  submitPick(draft, 2, 0);
  const result = resolveStep(draft);

  // Seat 2 was last of round 0 (forward) and leads round 1 (backward) too — the
  // back-to-back turn that defines a snake draft.
  assert.equal(result.status, "next-round");
  assert.equal(draft.round, 1);
  assert.equal(draft.currentSeat, 2);
});

/* ---------- invariants across the whole draft ---------- */

test("the pool and every seat's pool conserve every card after each resolve", () => {
  const cfg = config({ players: 6, cardsPerPlayer: 9, doublePickAfter: 5 });
  const draft = createDraft(cfg, makeCube(500), allHuman(cfg.players));
  const total = cfg.players * cfg.cardsPerPlayer;

  let guard = 0;
  while (!draft.finished) {
    if (guard++ > 100000) throw new Error("did not terminate");

    const seat = draft.currentSeat;
    const result = submitPick(draft, seat, 0);
    assert.equal(result.ok, true, `submitPick failed for seat ${seat}: ${result.error}`);

    if (picksRemaining(draft, seat) === 0) {
      resolveStep(draft);
    }

    const held = draft.pool.length;
    const taken = draft.pools.reduce((sum, pool) => sum + pool.length, 0);
    assert.equal(held + taken, total, "cards in the pool plus every seat's pool must equal the total");
  }

  const drafted = [];
  for (let seat = 0; seat < cfg.players; seat += 1) {
    drafted.push(...poolNames(draft, seat));
    assert.equal(draft.pools[seat].length, cfg.cardsPerPlayer, `seat ${seat} pool size`);
  }
  assert.equal(drafted.length, total);
});

test("finishing locks the draft", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 3 });
  const draft = createDraft(cfg, makeCube(200), allHuman(4));

  let last = null;
  while (!draft.finished) {
    submitPick(draft, draft.currentSeat, 0);
    last = resolveStep(draft);
  }

  assert.equal(last.status, "finished");
  assert.equal(draft.pool.length, 0);
  assert.deepEqual(submitPick(draft, 0, 0), { ok: false, error: "draft-finished" });
  assert.deepEqual(resolveStep(draft), { ok: false, error: "draft-finished" });
  assert.equal(picksRemaining(draft, 0), 0);
});

/* ---------- validation ---------- */

test("rejected picks are tagged and leave the draft untouched", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 5 });
  const draft = createDraft(cfg, makeCube(200), allHuman(4));

  const cases = [
    ["bad-seat", () => submitPick(draft, -1, 0)],
    ["bad-seat", () => submitPick(draft, 4, 0)],
    ["bad-seat", () => submitPick(draft, 1.5, 0)],
    ["not-owed", () => submitPick(draft, 1, 0)],
    ["bad-index", () => submitPick(draft, 0, -1)],
    ["bad-index", () => submitPick(draft, 0, draft.pool.length)],
    ["bad-index", () => submitPick(draft, 0, 1.5)],
    ["stale-pool", () => submitPick(draft, 0, 0, draft.pool[1])],
  ];

  for (const [expected, run] of cases) {
    const before = structuredClone({ pool: draft.pool, pools: draft.pools });
    const result = run();

    assert.equal(result.ok, false);
    assert.equal(result.error, expected);
    assert.deepEqual(
      { pool: draft.pool, pools: draft.pools },
      before,
      `${expected} must not mutate the draft`
    );
  }

  // A correct expectedRef is accepted.
  const ref = draft.pool[2];
  const ok = submitPick(draft, 0, 2, ref);
  assert.equal(ok.ok, true);
  assert.equal(ok.ref, ref);

  // Seat 0 now owes nothing this turn (doublePickAfter is off, so quota is 1).
  assert.deepEqual(submitPick(draft, 0, 0), { ok: false, error: "not-owed" });
});

test("a seat's own allotment running low still marks it ready, never deadlocked", () => {
  // cardsPerPlayer 3, doubles after 1: a seat's second turn nominally wants 2 cards but
  // only has 2 left of its 3-card allotment — exactly enough. Verifies the cap tracks
  // the seat's own allotment, not just what's left in the shared pool.
  const cfg = config({ players: 2, cardsPerPlayer: 3, doublePickAfter: 1 });
  const draft = createDraft(cfg, makeCube(100), allHuman(2));

  submitPick(draft, 0, 0);
  resolveStep(draft);
  submitPick(draft, 1, 0);
  resolveStep(draft);

  assert.equal(draft.currentSeat, 1);
  assert.equal(picksRemaining(draft, 1), 2);
  submitPick(draft, 1, 0);
  submitPick(draft, 1, 0);
  assert.equal(picksRemaining(draft, 1), 0, "seat is ready, not deadlocked");
  assert.equal(draft.pools[1].length, 3);

  const result = resolveStep(draft);
  assert.equal(result.status, "next-pick");
  assert.equal(draft.currentSeat, 0);
  assert.equal(picksRemaining(draft, 0), 2);
  submitPick(draft, 0, 0);
  submitPick(draft, 0, 0);
  assert.equal(draft.pools[0].length, 3);
  assert.equal(resolveStep(draft).status, "finished");
});

/* ---------- bots and advancement ---------- */

test("advance stops as soon as a human seat is up, but keeps resolving until then", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 5 });
  const draft = createDraft(cfg, makeCube(200), ["human", "human", "bot", "bot"]);

  submitPick(draft, 0, 0);
  const resolved = advance(draft);

  // Seat 0 had nothing further owed, so its turn resolves and hands off to seat 1 —
  // also human, so advance stops there rather than picking on their behalf.
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].status, "next-pick");
  assert.equal(draft.currentSeat, 1);
  assert.equal(picksRemaining(draft, 1), 1);

  const snapshot = structuredClone({
    pools: draft.pools,
    step: draft.step,
    currentSeat: draft.currentSeat,
  });
  assert.deepEqual(advance(draft), [], "advance is idempotent while seat 1 is pending");
  assert.deepEqual(
    { pools: draft.pools, step: draft.step, currentSeat: draft.currentSeat },
    snapshot
  );

  submitPick(draft, 1, 0);
  const next = advance(draft);
  assert.ok(next.length >= 1, "seat 1's turn resolves and the bots behind it keep going");
  // Landing back on seat 1 itself is legitimate here — it isn't a lap-boundary seat, so
  // it gets no back-to-back turn, but the bots on either side of it can, which can
  // cycle control back to seat 1 well within one advance() sweep. The real invariant is
  // just that advance() never stops on anything but a human seat.
  assert.equal(draft.seatKinds[draft.currentSeat], "human", "advance always stops on a human seat");
});

test("converting a seat to a bot finishes only its outstanding turn, not a fresh one", () => {
  const cfg = config({ players: 2, cardsPerPlayer: 6, doublePickAfter: 1 });
  const draft = createDraft(cfg, makeCube(200), ["human", "human"]);

  submitPick(draft, 0, 0);
  resolveStep(draft);
  submitPick(draft, 1, 0);
  resolveStep(draft);

  // Seat 1's second turn is a double pick. Take one of the two, then abandon mid-turn.
  assert.equal(draft.currentSeat, 1);
  assert.equal(picksRemaining(draft, 1), 2);
  submitPick(draft, 1, 0);
  assert.equal(picksRemaining(draft, 1), 1);
  const poolBefore = draft.pools[1].length;

  assert.equal(convertSeatToBot(draft, 1), true);
  assert.equal(convertSeatToBot(draft, 1), false, "converting twice is a no-op");

  advance(draft);
  assert.equal(draft.pools[1].length, poolBefore + 1, "the bot completed only what was owed");
  assert.equal(draft.seatKinds[1], "bot");
  assert.equal(draft.currentSeat, 0, "turn moved on to seat 0");
});

test("an all-bot table runs itself to completion in one advance", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 10 });
  const draft = createDraft(cfg, makeCube(200), new Array(4).fill("bot"));

  const resolved = advance(draft);

  assert.equal(draft.finished, true);
  assert.equal(resolved[resolved.length - 1].status, "finished");
  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.equal(draft.pools[seat].length, cfg.cardsPerPlayer, `seat ${seat}`);
  }
});

test("autoPickSeat takes exactly the current turn's quota", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 6, doublePickAfter: 1 });
  const draft = createDraft(cfg, makeCube(200), allHuman(4));

  assert.equal(autoPickSeat(draft, 0), 1, "seat 0's first turn is a single");
  resolveStep(draft);

  while (draft.currentSeat !== 0) {
    submitPick(draft, draft.currentSeat, 0);
    resolveStep(draft);
  }

  assert.equal(autoPickSeat(draft, 0), 2, "seat 0's second turn is a double");
});

/* ---------- guards ---------- */

test("a cube smaller than the table is rejected at construction", () => {
  assert.throws(() => createDraft(config({ players: 8 }), makeCube(6)), /cube-too-small/);
  assert.throws(() => createDraft(config(), null), /cube-too-small/);
});

test("an undersized cube repeats cards without losing any", () => {
  const cfg = config({ players: 4, cardsPerPlayer: 16 });
  const draft = createDraft(cfg, makeCube(20), new Array(4).fill("bot"));
  const dealt = draft.pool.map((ref) => draft.catalog[ref].name);

  advance(draft);

  assert.equal(draft.finished, true);
  const drafted = [];
  for (let seat = 0; seat < cfg.players; seat += 1) {
    drafted.push(...poolNames(draft, seat));
  }

  assert.equal(drafted.length, 64);
  assert.ok(sameMultiset(drafted, dealt));
  assert.ok(new Set(drafted).size < drafted.length, "an undersized cube must repeat cards");
});
