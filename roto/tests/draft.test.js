import test from "node:test";
import assert from "node:assert/strict";

import * as engine from "../draft.js";
import * as legacy from "./draft.legacy.mjs";
import {
  config,
  makeCube,
  packLength,
  poolNames,
  sameMultiset,
  scriptedPicker,
} from "./fixtures.js";

// Drives a draft to completion through the solo `pickCard` path, choosing each card
// with the supplied script. Works against either engine generation.
function runSolo(mod, cfg, cards, picker, guard = 100000) {
  const draft = mod.createDraft(cfg, cards);
  let steps = 0;

  while (!draft.finished) {
    if (steps++ > guard) throw new Error("runSolo did not terminate");
    const length = packLength(draft, 0);
    if (length === 0) break;
    mod.pickCard(draft, picker(length));
  }

  return draft;
}

/* ---------- parity: the current engine must behave like the frozen one ---------- */

test("solo parity with the frozen engine across table shapes", () => {
  const shapes = [
    config(),
    config({ players: 2, packs: 1, packSize: 4 }),
    config({ players: 4, packs: 2, packSize: 9 }),
    config({ players: 6, packs: 4, packSize: 11 }),
    config({ players: 3, packs: 3, packSize: 24, seed: "other-seed" }),
  ];

  for (const cfg of shapes) {
    const cards = makeCube(600);
    const label = `${cfg.players}p ${cfg.packs}x${cfg.packSize}`;

    const before = runSolo(legacy, cfg, cards, scriptedPicker(cfg.seed + label));
    const after = runSolo(engine, cfg, cards, scriptedPicker(cfg.seed + label));

    assert.deepEqual(
      poolNames(after, 0),
      poolNames(before, 0),
      `${label}: human pool diverged from the frozen engine`
    );

    for (let seat = 0; seat < cfg.players; seat += 1) {
      assert.deepEqual(
        poolNames(after, seat),
        poolNames(before, seat),
        `${label}: seat ${seat} diverged`
      );
    }
  }
});

test("solo parity holds with double picks enabled", () => {
  const shapes = [
    config({ packSize: 15, doublePickAfter: 8 }),
    config({ players: 4, packs: 2, packSize: 9, doublePickAfter: 4 }),
    config({ players: 4, packs: 1, packSize: 5, doublePickAfter: 1 }),
    config({ players: 2, packs: 1, packSize: 4, doublePickAfter: 1 }),
  ];

  for (const cfg of shapes) {
    const cards = makeCube(600);
    const label = `size=${cfg.packSize} after=${cfg.doublePickAfter}`;

    const before = runSolo(legacy, cfg, cards, scriptedPicker(label));
    const after = runSolo(engine, cfg, cards, scriptedPicker(label));

    for (let seat = 0; seat < cfg.players; seat += 1) {
      assert.deepEqual(poolNames(after, seat), poolNames(before, seat), `${label}: seat ${seat}`);
    }
  }
});

test("solo parity holds on an undersized cube that repeats cards", () => {
  const cfg = config({ players: 4, packs: 2, packSize: 8 });
  const cards = makeCube(20);

  const before = runSolo(legacy, cfg, cards, scriptedPicker("small"));
  const after = runSolo(engine, cfg, cards, scriptedPicker("small"));

  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.deepEqual(poolNames(after, seat), poolNames(before, seat), `seat ${seat}`);
  }
});

/* ---------- determinism ---------- */

test("same seed reproduces the draft, different seed does not", () => {
  const cards = makeCube(400);
  const cfg = config({ players: 4, packs: 2, packSize: 8, seed: "same" });

  const a = runSolo(engine, cfg, cards, scriptedPicker("script"));
  const b = runSolo(engine, cfg, cards, scriptedPicker("script"));
  assert.deepEqual(poolNames(b, 0), poolNames(a, 0));

  const c = runSolo(engine, { ...cfg, seed: "different" }, cards, scriptedPicker("script"));
  assert.notDeepEqual(poolNames(c, 0), poolNames(a, 0));
});

/* ---------- conservation ---------- */

test("every seat ends with a full pool and no card is lost", () => {
  const cfg = config();
  const cards = makeCube(700);
  const draft = runSolo(engine, cfg, cards, scriptedPicker("conserve"));

  assert.equal(draft.finished, true);

  const expected = cfg.packs * cfg.packSize;
  for (let seat = 0; seat < cfg.players; seat += 1) {
    assert.equal(draft.pools[seat].length, expected, `seat ${seat} pool size`);
  }

  // Multiset, not Set — an undersized cube may legitimately repeat a card, and even a
  // large one can when drawSupply wraps a shuffle boundary.
  const drafted = [];
  for (let seat = 0; seat < cfg.players; seat += 1) {
    drafted.push(...poolNames(draft, seat));
  }

  const dealt = [];
  for (const round of draft.rounds) {
    for (const pack of round) {
      for (const entry of pack) {
        dealt.push(typeof entry === "number" ? draft.catalog[entry].name : entry.name);
      }
    }
  }

  assert.equal(drafted.length, dealt.length, "drafted count matches dealt count");
  assert.ok(sameMultiset(drafted, dealt), "drafted cards are exactly the cards dealt");
});

/* ---------- double-pick quotas ---------- */

test("double picks produce the documented quota sequence, ending on a single", () => {
  // packSize 15 with doublePickAfter 8: eight single picks, then doubles, and the
  // final step must take 1 rather than 2 — the pack simply runs out.
  const cfg = config({ players: 4, packs: 1, packSize: 15, doublePickAfter: 8 });
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
    cfg.packSize,
    "quotas account for exactly the pack"
  );
  assert.equal(draft.pools[0].length, cfg.packSize);
});

test("odd pack sizes strand no cards under double picks", () => {
  for (const [packSize, after, expected] of [
    [5, 1, [1, 2, 2]],
    [4, 1, [1, 2, 1]],
    [7, 3, [1, 1, 1, 2, 2]],
  ]) {
    const cfg = config({ players: 4, packs: 1, packSize, doublePickAfter: after });
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

    assert.deepEqual(quotas, expected, `packSize=${packSize} after=${after}`);
    assert.equal(draft.pools[0].length, packSize, `packSize=${packSize} pool is full`);
  }
});

test("picksRemaining never exceeds what is left in the pack", () => {
  const cfg = config({ players: 4, packs: 1, packSize: 9, doublePickAfter: 4 });
  const draft = engine.createDraft(cfg, makeCube(300));

  let guard = 0;
  while (!draft.finished && guard++ < 1000) {
    const owed = engine.picksRemaining(draft);
    assert.ok(owed >= 0, "picksRemaining is never negative");
    assert.ok(owed <= packLength(draft, 0), "picksRemaining never exceeds the pack");
    if (packLength(draft, 0) === 0) break;
    engine.pickCard(draft, 0);
  }
});
