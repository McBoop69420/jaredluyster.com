import test from "node:test";
import assert from "node:assert/strict";

import {
  AFK_MS,
  CLEANUP_MS,
  IDLE_STOP_MS,
  createRoomState,
  handleAlarm,
  handleDisconnect,
  handleMessage,
  handleReconnect,
} from "../room-core.js";
import { makeCube, config } from "../../roto/tests/fixtures.js";

// A room driven entirely through the reducer, recording every effect it emits so tests
// can assert over the whole conversation.
class Harness {
  constructor(overrides = {}, cubeSize = 300) {
    let counter = 0;
    this.deps = { token: () => `tok-${counter++}` };
    this.config = config({ players: 4, packs: 1, packSize: 4, ...overrides });
    this.state = createRoomState("TEST-ROOM", this.config, makeCube(cubeSize), 1000);
    this.now = 1000;
    this.log = [];
    this.tokens = new Map();
  }

  send(seat, msg) {
    const actor = { seat };
    const result = handleMessage(this.state, actor, msg, this.now, this.deps);
    this.state = result.state;
    this.record(result.effects, actor.seat);
    this.alarm = result.alarm;
    return result.effects;
  }

  join(name) {
    const effects = this.send(null, { t: "join", name, haveCatalog: true });
    const welcome = effects.find((e) => e.msg.t === "welcome");
    if (welcome) {
      this.tokens.set(welcome.msg.seat, welcome.msg.token);
    }
    return welcome ? welcome.msg : effects.find((e) => e.msg.t === "err").msg;
  }

  rejoin(seat) {
    return this.send(null, { t: "join", token: this.tokens.get(seat), haveCatalog: true });
  }

  disconnect(seat) {
    const result = handleDisconnect(this.state, seat, this.now);
    this.state = result.state;
    this.record(result.effects, seat);
    return result.effects;
  }

  reconnect(seat) {
    const result = handleReconnect(this.state, seat, this.now);
    this.state = result.state;
    this.record(result.effects, seat);
    return result.effects;
  }

  alarmNow() {
    const result = handleAlarm(this.state, this.now);
    this.state = result.state;
    this.record(result.effects, null);
    this.alarm = result.alarm;
    this.destroy = result.destroy === true;
    return result.effects;
  }

  // Resolves "actor" to the seat that sent the message so privacy assertions can treat
  // every effect as addressed to a concrete audience.
  record(effects, actorSeat) {
    for (const effect of effects) {
      this.log.push({
        to: effect.to === "actor" ? actorSeat : effect.to,
        msg: effect.msg,
      });
    }
  }

  // The card a seat would pick: always the first in its own pack.
  pickFor(seat) {
    const draft = this.state.draft;
    return {
      t: "pick",
      seq: draft.pools[seat].length,
      index: 0,
      ref: draft.currentPacks[seat][0],
    };
  }

  playToCompletion(humans) {
    let guard = 0;
    while (this.state.phase === "drafting" && guard++ < 500) {
      const pending = this.state.draft.pools.map((_, seat) => seat).filter((seat) => {
        const owed = this.state.draft.currentPacks[seat];
        return humans.includes(seat) && owed.length > 0;
      });
      let acted = false;
      for (const seat of pending) {
        if (this.state.phase !== "drafting") break;
        const before = this.state.draft.pools[seat].length;
        this.send(seat, this.pickFor(seat));
        if (this.state.draft.pools[seat].length > before) acted = true;
      }
      if (!acted) break;
    }
  }
}

const seatsOf = (frame) => frame.seats.map((seat) => seat.seat);

/* ---------- joining and seating ---------- */

test("joins take distinct seats with distinct tokens", () => {
  const room = new Harness();
  const welcomes = ["Ann", "Ben", "Cy", "Dee"].map((name) => room.join(name));

  assert.deepEqual(welcomes.map((w) => w.seat), [0, 1, 2, 3]);
  assert.equal(new Set(welcomes.map((w) => w.token)).size, 4, "tokens are unique");
  assert.equal(welcomes[0].isHost, true, "first to join hosts");
  assert.deepEqual(welcomes.slice(1).map((w) => w.isHost), [false, false, false]);
});

test("a fifth player is turned away from a full lobby", () => {
  const room = new Harness();
  for (const name of ["Ann", "Ben", "Cy", "Dee"]) room.join(name);

  const rejected = room.join("Eve");
  assert.equal(rejected.t, "err");
  assert.equal(rejected.code, "room-full");
  assert.equal(rejected.fatal, true);
});

test("a token reclaims the same seat after a refresh", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  room.disconnect(0);
  const effects = room.rejoin(0);

  const welcome = effects.find((e) => e.msg.t === "welcome").msg;
  assert.equal(welcome.seat, 0);

  const order = effects.map((e) => e.msg.t);
  assert.deepEqual(
    order.filter((t) => ["welcome", "pool", "hand", "step", "room"].includes(t)),
    ["welcome", "pool", "hand", "step", "room"],
    "a reclaim replays the full seat view in render order"
  );
  assert.equal(room.state.seats[0].connected, true);
});

test("an unknown token is refused rather than handed a fresh seat", () => {
  const room = new Harness();
  room.join("Ann");

  const effects = room.send(null, { t: "join", token: "not-a-real-token" });
  const err = effects.find((e) => e.msg.t === "err").msg;

  assert.equal(err.code, "bad-token");
  assert.equal(err.fatal, true);
  assert.equal(room.state.seats[1].claimed, false, "no seat was consumed");
});

test("a protocol mismatch is fatal and names the fix", () => {
  const room = new Harness();
  const effects = room.send(null, { t: "join", protocol: 999 });
  const err = effects.find((e) => e.msg.t === "err").msg;

  assert.equal(err.code, "bad-protocol");
  assert.equal(err.fatal, true);
  assert.match(err.message, /reload/i);
});

/* ---------- starting ---------- */

test("unclaimed seats become bots at start", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");

  room.send(0, { t: "start" });

  assert.equal(room.state.phase, "drafting");
  assert.deepEqual(room.state.draft.seatKinds, ["human", "human", "bot", "bot"]);
  assert.deepEqual(
    room.state.seats.map((seat) => seat.kind),
    ["human", "human", "bot", "bot"]
  );
});

test("only the host may start or botify", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");

  const denied = room.send(1, { t: "start" });
  assert.equal(denied.find((e) => e.msg.t === "err").msg.code, "forbidden");
  assert.equal(room.state.phase, "lobby");

  room.send(0, { t: "start" });
  room.disconnect(1);
  const deniedBotify = room.send(1, { t: "botify", seat: 1 });
  assert.equal(deniedBotify.find((e) => e.msg.t === "err").msg.code, "forbidden");
});

test("joining after the draft starts is refused", () => {
  const room = new Harness();
  room.join("Ann");
  room.send(0, { t: "start" });

  const rejected = room.join("Late");
  assert.equal(rejected.code, "draft-started");
});

/* ---------- picking ---------- */

test("a pick acks the sender and tells the table only that a seat moved", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  const before = room.state.draft.currentPacks[0][0];
  const effects = room.send(0, room.pickFor(0));

  // Addressed by seat, not to the originating socket, so a second tab on the same seat
  // sees the ack too.
  const picked = effects.find((e) => e.msg.t === "picked");
  assert.equal(picked.to, 0);
  assert.equal(picked.msg.ref, before);

  const announced = effects.find((e) => e.msg.t === "seatPicked");
  assert.equal(announced.to, "all");
  assert.equal(announced.msg.seat, 0);
  assert.equal("ref" in announced.msg, false, "the table is not told which card");
});

test("a repeated seq replays the original ack instead of taking a second card", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  const pick = room.pickFor(0);
  room.send(0, pick);
  const poolAfterFirst = room.state.draft.pools[0].slice();

  const replayEffects = room.send(0, pick);
  const replay = replayEffects.find((e) => e.msg.t === "picked");

  assert.equal(replay.msg.replay, true);
  assert.equal(replay.msg.ref, pick.ref);
  assert.deepEqual(room.state.draft.pools[0], poolAfterFirst, "no second card was taken");
  assert.equal(
    replayEffects.some((e) => e.msg.t === "seatPicked"),
    false,
    "a replay must not re-announce the pick"
  );
});

test("a seq ahead of the server triggers a resync, not a pick", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  const poolBefore = room.state.draft.pools[0].slice();
  const effects = room.send(0, { t: "pick", seq: 99, index: 0, ref: room.state.draft.currentPacks[0][0] });

  assert.equal(effects.find((e) => e.msg.t === "err").msg.code, "out-of-sync");
  assert.ok(effects.some((e) => e.msg.t === "hand"), "the seat is resynced");
  assert.deepEqual(room.state.draft.pools[0], poolBefore);
});

test("a stale ref is refused and the pack is resent", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  const poolBefore = room.state.draft.pools[0].slice();
  const wrongRef = room.state.draft.currentPacks[0][1];
  const effects = room.send(0, { t: "pick", seq: 0, index: 0, ref: wrongRef });

  assert.equal(effects.find((e) => e.msg.t === "err").msg.code, "stale-pack");
  assert.deepEqual(room.state.draft.pools[0], poolBefore, "no card was taken");
  assert.ok(effects.some((e) => e.msg.t === "hand"), "the seat gets a fresh pack");
});

test("a pick cannot be made on another seat's behalf", () => {
  // All four seats human, so no bot picks can be mistaken for a successful spoof.
  const room = new Harness();
  for (const name of ["Ann", "Ben", "Cy", "Dee"]) room.join(name);
  room.send(0, { t: "start" });

  // Seat 0 sends a frame claiming to be seat 2.
  room.send(0, { ...room.pickFor(0), seat: 2 });

  assert.equal(room.state.draft.pools[0].length, 1, "the pick landed on the sender's seat");
  assert.equal(room.state.draft.pools[2].length, 0, "the named seat was untouched");
});

test("picks are refused before the draft starts", () => {
  const room = new Harness();
  room.join("Ann");

  const effects = room.send(0, { t: "pick", seq: 0, index: 0, ref: 0 });
  assert.equal(effects.find((e) => e.msg.t === "err").msg.code, "not-drafting");
});

/* ---------- privacy ---------- */

test("no frame ever shows a seat another seat's cards before the draft ends", () => {
  const room = new Harness({ players: 4, packs: 2, packSize: 4 });
  for (const name of ["Ann", "Ben", "Cy", "Dee"]) room.join(name);
  room.send(0, { t: "start" });
  room.playToCompletion([0, 1, 2, 3]);

  assert.equal(room.state.phase, "complete", "the draft ran to completion");

  const revealAt = room.log.findIndex((entry) => entry.msg.t === "done");
  assert.ok(revealAt > 0, "a done frame was broadcast");

  // Every card-bearing field, checked against the seat it was addressed to.
  for (let i = 0; i < revealAt; i += 1) {
    const { to, msg } = room.log[i];
    const refs = [
      ...(msg.pack || []),
      ...(msg.refs || []),
      ...(msg.ref === undefined ? [] : [msg.ref]),
      ...(msg.pools || []).flat(),
    ];

    if (refs.length === 0) continue;

    assert.notEqual(
      to,
      "all",
      `frame "${msg.t}" carrying ${refs.length} card refs was broadcast to the whole table`
    );
    assert.ok(Number.isInteger(to), `frame "${msg.t}" carrying cards had no seat audience`);
  }
});

test("broadcast frames carry only counts and status", () => {
  const room = new Harness();
  for (const name of ["Ann", "Ben", "Cy", "Dee"]) room.join(name);
  room.send(0, { t: "start" });
  room.send(0, room.pickFor(0));

  for (const { to, msg } of room.log) {
    if (to !== "all") continue;
    assert.equal("pack" in msg, false, `${msg.t} broadcast a pack`);
    assert.equal("refs" in msg, false, `${msg.t} broadcast a pool`);
    if (msg.t !== "done") {
      assert.equal("pools" in msg, false, `${msg.t} broadcast every pool`);
    }
  }
});

test("the room roster never carries seat tokens", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");

  const rosters = room.log.filter((entry) => entry.msg.t === "room");
  assert.ok(rosters.length > 0);

  for (const { msg } of rosters) {
    for (const seat of msg.seats) {
      assert.equal("token" in seat, false, "a roster frame leaked a seat token");
    }
  }
  assert.deepEqual(seatsOf(rosters.at(-1).msg), [0, 1, 2, 3]);
});

/* ---------- abandonment ---------- */

test("the host role moves to a connected human when the host leaves", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.join("Cy");

  assert.equal(room.state.hostSeat, 0);
  room.disconnect(0);
  assert.equal(room.state.hostSeat, 1, "the next connected human takes over");

  room.disconnect(1);
  assert.equal(room.state.hostSeat, 2);
});

test("the alarm auto-picks for a disconnected seat without botifying it", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  room.send(0, room.pickFor(0));
  room.disconnect(1);

  // Too soon: the seat keeps its slot.
  room.alarmNow();
  assert.equal(room.state.draft.pools[1].length, 0, "no auto-pick before the grace period");

  room.now += AFK_MS + 1;
  room.alarmNow();

  assert.equal(room.state.draft.pools[1].length, 1, "the room picked for the absent seat");
  assert.equal(room.state.seats[1].kind, "human", "the seat is still theirs");
  assert.equal(room.state.seats[1].afk, true);

  room.reconnect(1);
  assert.equal(room.state.seats[1].afk, false, "coming back clears the afk flag");
});

test("botify only applies to an absent seat and revokes its token", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  const refused = room.send(0, { t: "botify", seat: 1 });
  assert.equal(refused.find((e) => e.msg.t === "err").msg.code, "seat-active");

  room.disconnect(1);
  room.send(0, { t: "botify", seat: 1 });

  assert.equal(room.state.seats[1].kind, "bot");
  assert.equal(room.state.draft.seatKinds[1], "bot");
  assert.equal(room.state.seats[1].token, null, "the old token stops working");

  const effects = room.send(null, { t: "join", token: "tok-1" });
  assert.equal(effects.find((e) => e.msg.t === "err").msg.code, "bad-token");
});

test("botifying the last pending seat advances the draft immediately", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  room.send(0, room.pickFor(0));
  const stepBefore = room.state.draft.step;

  room.disconnect(1);
  room.send(0, { t: "botify", seat: 1 });

  assert.ok(room.state.draft.step > stepBefore, "the table moved on");
});

/* ---------- completion ---------- */

test("a solo human against bots runs to a completed draft", () => {
  const room = new Harness({ players: 4, packs: 2, packSize: 4 });
  room.join("Ann");
  room.send(0, { t: "start" });

  room.playToCompletion([0]);

  assert.equal(room.state.phase, "complete");
  const done = room.log.filter((entry) => entry.msg.t === "done");
  assert.equal(done.length > 0, true);
  assert.equal(done.at(-1).to, "all", "the reveal is broadcast");

  for (const pool of done.at(-1).msg.pools) {
    assert.equal(pool.length, 8, "every seat filled its pool");
  }
});

test("picks after completion are refused", () => {
  const room = new Harness({ players: 2, packs: 1, packSize: 4 });
  room.join("Ann");
  room.send(0, { t: "start" });
  room.playToCompletion([0]);

  assert.equal(room.state.phase, "complete");
  const effects = room.send(0, { t: "pick", seq: 0, index: 0, ref: 0 });
  assert.equal(effects.find((e) => e.msg.t === "err").msg.code, "not-drafting");
});

/* ---------- double picks over the wire ---------- */

// packSize 4 with doublePickAfter 1 gives quotas [1, 2, 1]: one single pick, then a
// two-card step, then a final single because the pack runs dry. Everything below runs
// inside that middle step, where a seat owes two cards and `seq` moves twice.
function doublePickRoom() {
  const room = new Harness({ players: 2, packs: 1, packSize: 4, doublePickAfter: 1 });
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  // Clear the opening single-pick step so both seats land on the two-card step.
  room.send(0, room.pickFor(0));
  room.send(1, room.pickFor(1));

  return room;
}

test("a two-card step advances seq once per card, not once per step", () => {
  const room = doublePickRoom();

  assert.equal(room.state.draft.pickNumber, 2, "reached the double-pick step");
  assert.equal(room.state.draft.pools[0].length, 1, "one card from the opening step");

  const first = room.send(0, room.pickFor(0));
  const firstAck = first.find((e) => e.msg.t === "picked").msg;
  assert.equal(firstAck.seq, 1, "seq is the seat's pool length before the pick");
  assert.equal(firstAck.remaining, 1, "one card still owed");

  const second = room.send(0, room.pickFor(0));
  const secondAck = second.find((e) => e.msg.t === "picked").msg;
  assert.equal(secondAck.seq, 2, "seq moved again inside the same step");
  assert.equal(secondAck.remaining, 0, "the seat is now settled");

  assert.equal(room.state.draft.pools[0].length, 3);
});

test("a retry inside a two-card step replays rather than taking a third card", () => {
  const room = doublePickRoom();

  const pick = room.pickFor(0);
  room.send(0, pick);
  assert.equal(room.state.draft.pools[0].length, 2);

  // The ack for the first card never arrived, so the client sends the same seq again.
  const retry = room.send(0, pick);
  const ack = retry.find((e) => e.msg.t === "picked").msg;

  assert.equal(ack.replay, true);
  assert.equal(ack.ref, pick.ref);
  assert.equal(room.state.draft.pools[0].length, 2, "no third card was taken");
  assert.equal(
    retry.some((e) => e.msg.t === "seatPicked"),
    false,
    "a replay is not re-announced to the table"
  );
});

test("the table waits for both cards before the packs pass", () => {
  const room = doublePickRoom();
  const stepBefore = room.state.draft.step;

  // Ben settles his whole quota; Ann takes only the first of her two.
  room.send(1, room.pickFor(1));
  room.send(1, room.pickFor(1));
  room.send(0, room.pickFor(0));

  assert.equal(room.state.draft.step, stepBefore, "the step has not resolved");

  const pending = room.log.filter((e) => e.msg.t === "step").at(-1).msg.pending;
  assert.deepEqual(pending, [0], "only Ann is still owed a card");

  room.send(0, room.pickFor(0));
  assert.ok(room.state.draft.step > stepBefore, "the last card releases the pass");
});

test("botifying a seat mid-two-card-step settles only what it owed", () => {
  const room = doublePickRoom();

  // Ben takes one of two, then vanishes. Ann has not picked at all, so the step cannot
  // resolve and the bot sweep stops after Ben's outstanding card.
  room.send(1, room.pickFor(1));
  assert.equal(room.state.draft.pools[1].length, 2);

  room.disconnect(1);
  room.send(0, { t: "botify", seat: 1 });

  assert.equal(room.state.draft.pools[1].length, 3, "exactly the one owed card");
  assert.equal(room.state.seats[1].kind, "bot");
});

test("the afk alarm fills a whole two-card quota for an absent seat", () => {
  const room = doublePickRoom();
  const before = room.state.draft.pools[1].length;

  room.disconnect(1);
  room.now += AFK_MS + 1;
  room.alarmNow();

  assert.equal(room.state.draft.pools[1].length, before + 2, "both owed cards were taken");
  assert.equal(room.state.seats[1].kind, "human", "the seat is still theirs to reclaim");
  assert.equal(room.state.seats[1].afk, true);
});

test("a reconnect mid-two-card-step reports the remaining card, not the full quota", () => {
  const room = doublePickRoom();
  room.send(0, room.pickFor(0));

  room.disconnect(0);
  const effects = room.rejoin(0);
  const hand = effects.find((e) => e.msg.t === "hand").msg;

  assert.equal(hand.remaining, 1, "one card still owed, not two");
  assert.equal(hand.seq, 2, "seq matches the pool length so the fence lines up");
});

/* ---------- rename, resync, leave ---------- */

test("rename updates the roster and is cleaned up", () => {
  const room = new Harness();
  room.join("Ann");

  room.send(0, { t: "rename", name: "  Ann   Marie  " });
  assert.equal(room.state.seats[0].name, "Ann Marie", "whitespace is collapsed and trimmed");

  const roster = room.log.filter((e) => e.msg.t === "room").at(-1);
  assert.equal(roster.to, "all", "the table is told");
  assert.equal(roster.msg.seats[0].name, "Ann Marie");

  room.send(0, { t: "rename", name: "x".repeat(60) });
  assert.equal(room.state.seats[0].name.length, 24, "long names are capped");

  room.send(0, { t: "rename", name: "   " });
  assert.equal(room.state.seats[0].name.length, 24, "a blank rename keeps the old name");
});

test("resync replays the seat's whole view without touching the draft", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });
  room.send(0, room.pickFor(0));

  const before = JSON.stringify(room.state.draft);
  const effects = room.send(0, { t: "resync", haveCatalog: true });

  assert.deepEqual(
    effects.map((e) => e.msg.t),
    ["room", "pool", "hand", "step"],
    "the full seat view, in render order"
  );
  assert.equal(JSON.stringify(room.state.draft), before, "resync is read-only");

  // A client that lost its catalog gets it again.
  const cold = room.send(0, { t: "resync", haveCatalog: false });
  assert.ok(cold.some((e) => e.msg.t === "catalog"), "the catalog is resent on request");
});

test("leave marks the seat disconnected without freeing it", () => {
  const room = new Harness();
  room.join("Ann");
  room.join("Ben");

  room.send(1, { t: "leave" });

  assert.equal(room.state.seats[1].connected, false);
  assert.equal(room.state.seats[1].claimed, true, "the seat is still held");
  assert.equal(room.state.hostSeat, 0, "the host is unaffected");

  // The token still works, so leaving is recoverable.
  const back = room.rejoin(1);
  assert.equal(back.find((e) => e.msg.t === "welcome").msg.seat, 1);
  assert.equal(room.state.seats[1].connected, true);
});

test("an unseated socket cannot rename, resync or leave", () => {
  const room = new Harness();
  room.join("Ann");

  for (const msg of [{ t: "rename", name: "Nope" }, { t: "resync" }]) {
    const effects = room.send(null, msg);
    assert.equal(effects.find((e) => e.msg.t === "err").msg.code, "no-seat", msg.t);
  }
  assert.equal(room.state.seats[0].name, "Ann", "the seated player is untouched");
});

/* ---------- idle rooms ---------- */

test("an abandoned room stops scheduling alarms", () => {
  const room = new Harness({ players: 2, packs: 1, packSize: 4 });
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  room.disconnect(0);
  room.disconnect(1);

  // Long enough that the room is past both the afk grace period and the idle cutoff.
  room.now += IDLE_STOP_MS + 1;
  room.alarmNow();

  assert.equal(room.state.phase, "drafting", "the draft is paused, not finished");
  assert.equal(room.alarm, null, "nothing is rescheduled for a room nobody is in");
});

test("a rejoin revives an idled room's alarm scheduling", () => {
  const room = new Harness({ players: 2, packs: 1, packSize: 4 });
  room.join("Ann");
  room.join("Ben");
  room.send(0, { t: "start" });

  room.disconnect(0);
  room.disconnect(1);
  room.now += IDLE_STOP_MS + 1;
  room.alarmNow();
  assert.equal(room.alarm, null);

  room.rejoin(0);
  assert.equal(room.state.seats[0].connected, true);
  assert.equal(room.alarm, room.now + AFK_MS, "seat 1 is still absent, so the clock restarts");
});

/* ---------- cleanup ---------- */

test("a finished draft schedules its own cleanup alarm", () => {
  const room = new Harness({ players: 2, packs: 1, packSize: 4 });
  room.join("Ann");
  room.send(0, { t: "start" });
  room.playToCompletion([0]);

  assert.equal(room.state.phase, "complete");
  assert.equal(room.state.completedAt, room.now, "completion time is recorded");
  assert.equal(room.alarm, room.now + CLEANUP_MS, "the cleanup alarm is scheduled for +CLEANUP_MS");
});

test("the cleanup alarm does nothing before the threshold", () => {
  const room = new Harness({ players: 2, packs: 1, packSize: 4 });
  room.join("Ann");
  room.send(0, { t: "start" });
  room.playToCompletion([0]);

  room.now += CLEANUP_MS - 1;
  room.alarmNow();

  assert.equal(room.destroy, false, "not yet due");
  assert.equal(room.state.phase, "complete", "the room is untouched");
  assert.equal(room.alarm, room.state.completedAt + CLEANUP_MS, "still scheduled for the same time");
});

test("the cleanup alarm signals destroy once the threshold passes", () => {
  const room = new Harness({ players: 2, packs: 1, packSize: 4 });
  room.join("Ann");
  room.send(0, { t: "start" });
  room.playToCompletion([0]);

  room.now += CLEANUP_MS;
  room.alarmNow();

  assert.equal(room.destroy, true);
  assert.equal(room.alarm, null, "nothing left to schedule once destroyed");
});

test("a room still in the lobby or mid-draft never schedules a cleanup alarm", () => {
  const lobby = new Harness();
  lobby.join("Ann");
  assert.equal(lobby.state.phase, "lobby");
  assert.equal(lobby.alarm, null, "a lobby has nothing to schedule");

  const drafting = new Harness({ players: 2, packs: 2, packSize: 4 });
  drafting.join("Ann");
  drafting.send(0, { t: "start" });
  drafting.now += CLEANUP_MS * 2;
  drafting.alarmNow();
  assert.equal(drafting.destroy, false, "an in-progress draft is never destroyed by the cleanup path");
});

test("unknown and malformed frames are rejected without touching state", () => {
  const room = new Harness();
  room.join("Ann");
  room.send(0, { t: "start" });
  const before = JSON.stringify(room.state.draft);

  assert.equal(
    room.send(0, { t: "nonsense" }).find((e) => e.msg.t === "err").msg.code,
    "unknown-type"
  );
  assert.equal(room.send(0, null).find((e) => e.msg.t === "err").msg.code, "bad-frame");
  assert.equal(
    room.send(0, { t: "pick", index: 0 }).find((e) => e.msg.t === "err").msg.code,
    "bad-frame"
  );

  assert.equal(JSON.stringify(room.state.draft), before);
});
