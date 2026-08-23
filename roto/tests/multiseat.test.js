import test from "node:test";
import assert from "node:assert/strict";

import {
  advance,
  allSeatsReady,
  autoPickBots,
  autoPickSeat,
  convertSeatToBot,
  createDraft,
  pendingSeats,
  picksRemaining,
  resolveStep,
  submitPick,
} from "../draft.js";
import { config, makeCube, poolNames, sameMultiset } from "./fixtures.js";

const allHuman = (players) => new Array(players).fill("human");

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

// Deterministic per-seat choice that depends only on that seat's own progress, never on
// what other seats have done. That is what makes it a valid probe for order-independence.
function seatChoice(draft, seat) {
  const length = draft.currentPacks[seat].length;
  return hash(`${seat}:${draft.pools[seat].length}`) % length;
}

// Plays a whole draft with every seat human, submitting one card at a time and choosing
// which pending seat moves next via `nextSeat`.
function playInterleaved(draft, nextSeat) {
  let guard = 0;

  while (!draft.finished) {
    if (guard++ > 100000) throw new Error("playInterleaved did not terminate");

    const pending = pendingSeats(draft);
    if (pending.length === 0) {
      const result = resolveStep(draft);
      assert.equal(result.ok, true, "resolveStep should succeed once nobody is pending");
      continue;
    }

    const seat = nextSeat(pending, draft);
    const result = submitPick(draft, seat, seatChoice(draft, seat));
    assert.equal(result.ok, true, `submitPick failed for seat ${seat}: ${result.error}`);
  }

  return draft;
}

/* ---------- the property that makes async picks safe ---------- */

test("submission order within a step cannot change the outcome", () => {
  const cfg = config({ players: 6, packs: 2, packSize: 9, doublePickAfter: 5 });
  const cards = makeCube(500);

  const baseline = playInterleaved(
    createDraft(cfg, cards, allHuman(cfg.players)),
    (pending) => pending[0]
  );
  const expected = Array.from({ length: cfg.players }, (_, seat) => poolNames(baseline, seat));

  for (let trial = 0; trial < 20; trial += 1) {
    const draft = playInterleaved(
      createDraft(cfg, cards, allHuman(cfg.players)),
      (pending, state) =>
        pending[hash(`${trial}:${pending.length}:${state.step}`) % pending.length]
    );

    for (let seat = 0; seat < cfg.players; seat += 1) {
      assert.deepEqual(
        poolNames(draft, seat),
        expected[seat],
        `trial ${trial}: seat ${seat} diverged under a different submission order`
      );
    }
  }
});

test("reverse and last-seat-first orders match the baseline too", () => {
  const cfg = config({ players: 4, packs: 2, packSize: 8, doublePickAfter: 3 });
  const cards = makeCube(400);

  const forward = playInterleaved(
    createDraft(cfg, cards, allHuman(cfg.players)),
    (pending) => pending[0]
  );
  const reverse = playInterleaved(
    createDraft(cfg, cards, allHuman(cfg.players)),
    (pending) => pending[pending.length - 1]
  );

  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.deepEqual(poolNames(reverse, seat), poolNames(forward, seat), `seat ${seat}`);
  }
});

/* ---------- invariants across the whole draft ---------- */

test("packs stay equal length and cards are conserved after every resolve", () => {
  const cfg = config({ players: 6, packs: 2, packSize: 9, doublePickAfter: 5 });
  const draft = createDraft(cfg, makeCube(500), allHuman(cfg.players));

  let guard = 0;
  while (!draft.finished) {
    if (guard++ > 100000) throw new Error("did not terminate");

    const pending = pendingSeats(draft);
    if (pending.length === 0) {
      resolveStep(draft);

      if (!draft.finished) {
        const lengths = draft.currentPacks.map((pack) => pack.length);
        assert.equal(new Set(lengths).size, 1, `packs diverged in length: ${lengths}`);
      }

      const held = draft.currentPacks.reduce((sum, pack) => sum + pack.length, 0);
      const taken = draft.pools.reduce((sum, pool) => sum + pool.length, 0);
      const dealtSoFar = cfg.players * cfg.packSize * Math.min(draft.round + 1, cfg.packs);
      assert.equal(held + taken, dealtSoFar, "cards in packs plus pools must equal cards dealt");
      continue;
    }

    const seat = pending[0];
    submitPick(draft, seat, seatChoice(draft, seat));
  }

  const drafted = [];
  for (let seat = 0; seat < cfg.players; seat += 1) {
    drafted.push(...poolNames(draft, seat));
    assert.equal(draft.pools[seat].length, cfg.packs * cfg.packSize, `seat ${seat} pool size`);
  }

  const dealt = draft.rounds.flat(2).map((ref) => draft.catalog[ref].name);
  assert.ok(sameMultiset(drafted, dealt), "every dealt card ended up in exactly one pool");
});

test("packs alternate direction each round", () => {
  const cfg = config({ players: 4, packs: 2, packSize: 3 });
  const draft = createDraft(cfg, makeCube(200), allHuman(cfg.players));

  const directionOf = (round) => {
    const before = draft.currentPacks.slice();
    for (const seat of pendingSeats(draft)) {
      submitPick(draft, seat, 0);
    }
    resolveStep(draft);

    const moves = before.map((pack) => draft.currentPacks.indexOf(pack));
    assert.ok(
      moves.every((to, from) => to === (from + (round % 2 === 0 ? 1 : 3)) % 4),
      `round ${round} passed the wrong way: ${moves}`
    );
  };

  directionOf(0); // round 0 passes left: seat n -> seat n+1
  while (draft.round === 0) {
    for (const seat of pendingSeats(draft)) submitPick(draft, seat, 0);
    resolveStep(draft);
  }
  directionOf(1); // round 1 passes right
});

test("a round rollover advances exactly one step and refills every pack", () => {
  const cfg = config({ players: 4, packs: 2, packSize: 3 });
  const draft = createDraft(cfg, makeCube(200), allHuman(cfg.players));

  let last = null;
  while (draft.round === 0 && !draft.finished) {
    for (const seat of pendingSeats(draft)) submitPick(draft, seat, 0);
    const stepBefore = draft.step;
    last = resolveStep(draft);
    assert.equal(draft.step, stepBefore + 1, "step must advance exactly once");
  }

  assert.equal(last.status, "next-round");
  assert.equal(draft.round, 1);
  assert.equal(draft.pickNumber, 1);
  assert.deepEqual(draft.takenThisStep, [0, 0, 0, 0]);
  assert.ok(
    draft.currentPacks.every((pack) => pack.length === cfg.packSize),
    "every pack refills at a new round"
  );
});

test("finishing locks the draft", () => {
  const cfg = config({ players: 4, packs: 1, packSize: 3 });
  const draft = createDraft(cfg, makeCube(200), allHuman(cfg.players));

  let last = null;
  while (!draft.finished) {
    for (const seat of pendingSeats(draft)) submitPick(draft, seat, 0);
    last = resolveStep(draft);
  }

  assert.equal(last.status, "finished");
  assert.equal(draft.round, cfg.packs, "round lands at config.packs, which indexes past rounds");
  assert.deepEqual(submitPick(draft, 0, 0), { ok: false, error: "draft-finished" });
  assert.deepEqual(resolveStep(draft), { ok: false, error: "draft-finished" });
  assert.equal(picksRemaining(draft, 0), 0);
});

/* ---------- validation ---------- */

test("rejected picks are tagged and leave the draft untouched", () => {
  const cfg = config({ players: 4, packs: 1, packSize: 5 });
  const draft = createDraft(cfg, makeCube(200), allHuman(cfg.players));

  const cases = [
    ["bad-seat", () => submitPick(draft, -1, 0)],
    ["bad-seat", () => submitPick(draft, 4, 0)],
    ["bad-seat", () => submitPick(draft, 1.5, 0)],
    ["bad-index", () => submitPick(draft, 0, -1)],
    ["bad-index", () => submitPick(draft, 0, 5)],
    ["bad-index", () => submitPick(draft, 0, 1.5)],
    ["stale-pack", () => submitPick(draft, 0, 0, draft.currentPacks[0][1])],
  ];

  for (const [expected, run] of cases) {
    const before = structuredClone({ packs: draft.currentPacks, pools: draft.pools });
    const result = run();

    assert.equal(result.ok, false);
    assert.equal(result.error, expected);
    assert.deepEqual(
      { packs: draft.currentPacks, pools: draft.pools },
      before,
      `${expected} must not mutate the draft`
    );
  }

  // A correct expectedRef is accepted.
  const ref = draft.currentPacks[0][2];
  const ok = submitPick(draft, 0, 2, ref);
  assert.equal(ok.ok, true);
  assert.equal(ok.ref, ref);

  // Seat 0 now owes nothing this step.
  assert.deepEqual(submitPick(draft, 0, 0), { ok: false, error: "not-owed" });
});

test("a pack that runs out mid-double-pick still marks the seat ready", () => {
  // packSize 3, doubles after pick 1: the last step offers 1 card while the quota is 2.
  const cfg = config({ players: 2, packs: 1, packSize: 3, doublePickAfter: 1 });
  const draft = createDraft(cfg, makeCube(100), allHuman(cfg.players));

  for (const seat of pendingSeats(draft)) submitPick(draft, seat, 0);
  resolveStep(draft);

  // Now in the double-pick phase with 2 cards left.
  assert.equal(picksRemaining(draft, 0), 2);
  submitPick(draft, 0, 0);
  assert.equal(picksRemaining(draft, 0), 1);
  submitPick(draft, 0, 0);
  assert.equal(picksRemaining(draft, 0), 0, "seat is ready with an empty pack, not deadlocked");

  submitPick(draft, 1, 0);
  submitPick(draft, 1, 0);
  assert.equal(allSeatsReady(draft), true);
  assert.equal(resolveStep(draft).status, "finished");
});

/* ---------- bots and advancement ---------- */

test("advance does nothing while a human still owes a card", () => {
  const cfg = config({ players: 4, packs: 1, packSize: 5 });
  const draft = createDraft(cfg, makeCube(200), ["human", "human", "bot", "bot"]);

  submitPick(draft, 0, 0);
  const first = advance(draft);
  assert.deepEqual(first, [], "seat 1 has not picked yet");

  const snapshot = structuredClone({ pools: draft.pools, step: draft.step });
  assert.deepEqual(advance(draft), [], "advance is idempotent while pending");
  assert.deepEqual({ pools: draft.pools, step: draft.step }, snapshot);

  submitPick(draft, 1, 0);
  const resolved = advance(draft);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].status, "next-pick");
});

test("converting a seat to a bot finishes its outstanding picks", () => {
  const cfg = config({ players: 4, packs: 1, packSize: 6, doublePickAfter: 1 });
  const draft = createDraft(cfg, makeCube(200), ["human", "human", "bot", "bot"]);

  for (const seat of [0, 1]) submitPick(draft, seat, 0);
  advance(draft);

  // Seat 1 takes one of the two it owes, then abandons the draft.
  submitPick(draft, 1, 0);
  assert.equal(picksRemaining(draft, 1), 1);
  const poolBefore = draft.pools[1].length;

  assert.equal(convertSeatToBot(draft, 1), true);
  assert.equal(convertSeatToBot(draft, 1), false, "converting twice is a no-op");

  // One bot sweep settles exactly the card that was still owed for this step.
  autoPickBots(draft);
  assert.equal(draft.pools[1].length, poolBefore + 1, "the bot completed only what was owed");
  assert.equal(picksRemaining(draft, 1), 0);

  // From here the seat is indistinguishable from any other bot.
  submitPick(draft, 0, 0);
  submitPick(draft, 0, 0);
  advance(draft);

  assert.equal(draft.seatKinds[1], "bot");
  assert.equal(draft.pools[1].length, draft.pools[2].length, "keeps pace with the other bots");
});

test("an all-bot table runs itself to completion in one advance", () => {
  const cfg = config({ players: 4, packs: 2, packSize: 5 });
  const draft = createDraft(cfg, makeCube(200), new Array(4).fill("bot"));

  const resolved = advance(draft);

  assert.equal(draft.finished, true);
  assert.equal(resolved[resolved.length - 1].status, "finished");
  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.equal(draft.pools[seat].length, cfg.packs * cfg.packSize, `seat ${seat}`);
  }
});

test("autoPickSeat respects the outstanding quota only", () => {
  const cfg = config({ players: 4, packs: 1, packSize: 6, doublePickAfter: 1 });
  const draft = createDraft(cfg, makeCube(200), allHuman(cfg.players));

  assert.equal(autoPickSeat(draft, 0), 1, "single-pick step takes one");
  for (const seat of [1, 2, 3]) submitPick(draft, seat, 0);
  resolveStep(draft);

  assert.equal(autoPickSeat(draft, 0), 2, "double-pick step takes two");
});

/* ---------- guards ---------- */

test("a cube smaller than one pack is rejected at construction", () => {
  assert.throws(
    () => createDraft(config({ packSize: 15 }), makeCube(14)),
    /cube-too-small/
  );
  assert.throws(() => createDraft(config(), null), /cube-too-small/);
});

test("an undersized cube repeats cards without losing any", () => {
  const cfg = config({ players: 4, packs: 2, packSize: 8 });
  const draft = createDraft(cfg, makeCube(20), new Array(4).fill("bot"));

  advance(draft);

  assert.equal(draft.finished, true);
  const drafted = [];
  for (let seat = 0; seat < cfg.players; seat += 1) {
    drafted.push(...poolNames(draft, seat));
  }
  const dealt = draft.rounds.flat(2).map((ref) => draft.catalog[ref].name);

  assert.equal(drafted.length, 64);
  assert.ok(sameMultiset(drafted, dealt));
  assert.ok(new Set(drafted).size < drafted.length, "an undersized cube must repeat cards");
});
