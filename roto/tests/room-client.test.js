import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// room-client.js is browser-bound, so the handful of globals it touches are stubbed
// here rather than pulling in a DOM implementation. It reads them inside methods, never
// at module load, so installing them before the first client is constructed is enough.

class FakeSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = {};
    this.closeCalls = 0;
    FakeSocket.instances.push(this);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event);
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close() {
    this.closeCalls += 1;
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.emit("close", {});
  }

  /* test helpers */
  open() {
    this.readyState = FakeSocket.OPEN;
    this.emit("open", {});
  }

  deliver(msg) {
    this.emit("message", { data: JSON.stringify(msg) });
  }

  deliverRaw(data) {
    this.emit("message", { data });
  }

  static latest() {
    return FakeSocket.instances.at(-1);
  }

  static reset() {
    FakeSocket.instances = [];
  }
}

// The first retry waits BACKOFF_MIN/2 plus up to BACKOFF_MIN/2 of jitter, so ticking the
// full BACKOFF_MIN always covers it without having to pin Math.random.
const BACKOFF_FIRST_RETRY_MS = 500;

globalThis.WebSocket = FakeSocket;
globalThis.location = { protocol: "http:", host: "127.0.0.1:8788" };
globalThis.document = { addEventListener() {}, visibilityState: "visible" };
globalThis.window = { addEventListener() {} };

const { RoomClient, createRoom, roomInfo } = await import("../room-client.js");

// An open client holds a 30s ping interval, so every client is tracked and closed after
// its test — otherwise a leaked interval keeps the whole run alive for half a minute.
const liveClients = [];

function track(client) {
  liveClients.push(client);
  return client;
}

afterEach(() => {
  while (liveClients.length) liveClients.pop().close();
});

// Builds a client that is already connected and seated, which is the state most of the
// frame-handling tests care about.
function connectedClient(overrides = {}) {
  FakeSocket.reset();
  const events = [];
  const client = track(
    new RoomClient({
      code: "TESTROOM",
      name: "Ann",
      onEvent: (e) => events.push(e),
      ...overrides,
    })
  );

  const socket = FakeSocket.latest();
  socket.open();
  socket.deliver({ t: "welcome", seat: 0, token: "tok-0", isHost: true, code: "TESTROOM" });

  return { client, socket, events };
}

/* ---------- createRoom / roomInfo ---------- */

test("createRoom posts the settings and returns the room", async () => {
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ code: "ABCD1234", protocol: 1 }) };
  };

  const room = await createRoom({ cubeId: "cube", players: 4 });

  assert.equal(room.code, "ABCD1234");
  assert.equal(seen.url, "/roto/api/rooms");
  assert.equal(seen.init.method, "POST");
  assert.deepEqual(JSON.parse(seen.init.body), { cubeId: "cube", players: 4 });
});

test("createRoom turns each server error into something a player can act on", async () => {
  const cases = [
    [{ error: "cube-too-small", have: 12 }, /only has 12 usable cards/],
    [{ error: "cube-fetch-failed", message: "CubeCobra returned 500." }, /CubeCobra returned 500\./],
    [{ error: "cube-fetch-failed" }, /Could not load that cube/],
    [{ error: "bad-cube" }, /CubeCobra cube link or ID/],
    [{ error: "something-new" }, /Could not create the room/],
    [{}, /Could not create the room/],
  ];

  for (const [body, expected] of cases) {
    globalThis.fetch = async () => ({ ok: false, json: async () => body });
    await assert.rejects(() => createRoom({}), expected, JSON.stringify(body));
  }
});

test("createRoom survives a response with no JSON body", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => {
      throw new Error("not json");
    },
  });

  await assert.rejects(() => createRoom({}), /Could not create the room/);
});

test("roomInfo reports a missing room rather than throwing", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ exists: true, phase: "lobby" }) });
  assert.deepEqual(await roomInfo("ABCD1234"), { exists: true, phase: "lobby" });

  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  assert.deepEqual(await roomInfo("NOPE0000"), { exists: false });
});

/* ---------- connection URL ---------- */

test("the socket URL carries the name on a first join and the token on a reclaim", () => {
  FakeSocket.reset();
  track(new RoomClient({ code: "TESTROOM", name: "Ann" }));
  let url = new URL(FakeSocket.latest().url);
  assert.equal(url.searchParams.get("name"), "Ann");
  assert.equal(url.searchParams.get("token"), null);
  assert.equal(url.searchParams.get("protocol"), "1");

  FakeSocket.reset();
  track(new RoomClient({ code: "TESTROOM", name: "Ann", token: "tok-9" }));
  url = new URL(FakeSocket.latest().url);
  assert.equal(url.searchParams.get("token"), "tok-9", "a token wins over a name");
  assert.equal(url.searchParams.get("name"), null);
});

test("the socket URL follows the page scheme and only claims a catalog once it has one", (t) => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  t.after(() => {
    mock.timers.reset();
    globalThis.location = { protocol: "http:", host: "127.0.0.1:8788" };
  });

  const { client, socket } = connectedClient();
  assert.ok(socket.url.startsWith("ws://127.0.0.1:8788/roto/api/rooms/TESTROOM/ws"));
  assert.equal(new URL(socket.url).searchParams.get("haveCatalog"), null);

  // A partial catalog must not set the flag, or a reconnect would never receive the rest.
  socket.deliver({ t: "catalog", chunk: 0, chunks: 2, start: 0, cards: [{ name: "a" }] });
  assert.equal(client.catalogComplete, false);

  socket.deliver({ t: "catalog", chunk: 1, chunks: 2, start: 1, cards: [{ name: "b" }] });
  assert.equal(client.catalogComplete, true);

  // Drop the socket and let the backoff elapse so the reconnect URL can be inspected.
  socket.close();
  mock.timers.tick(BACKOFF_FIRST_RETRY_MS);
  assert.notEqual(FakeSocket.latest(), socket, "a fresh socket was opened");
  assert.equal(
    new URL(FakeSocket.latest().url).searchParams.get("haveCatalog"),
    "1",
    "a reconnect tells the room not to resend the catalog"
  );
  client.close();

  globalThis.location = { protocol: "https:", host: "roto.jaredluyster.com" };
  FakeSocket.reset();
  const secure = track(new RoomClient({ code: "TESTROOM", name: "Ann" }));
  assert.ok(FakeSocket.latest().url.startsWith("wss://roto.jaredluyster.com/"));
  secure.close();
});

/* ---------- frames ---------- */

test("welcome seats the client and surfaces the token for storage", () => {
  const { client, events } = connectedClient();

  assert.equal(client.seat, 0);
  assert.equal(client.token, "tok-0");
  assert.equal(client.isHost, true);
  assert.deepEqual(events.at(-1), { type: "seat", seat: 0, token: "tok-0", code: "TESTROOM" });
});

test("catalog chunks land at their own offsets regardless of arrival order", () => {
  const { client, socket } = connectedClient();

  socket.deliver({ t: "catalog", chunk: 1, chunks: 2, start: 2, cards: [{ name: "c" }, { name: "d" }] });
  socket.deliver({ t: "catalog", chunk: 0, chunks: 2, start: 0, cards: [{ name: "a" }, { name: "b" }] });

  assert.deepEqual(client.catalog.map((c) => c.name), ["a", "b", "c", "d"]);
  client.close();
});

test("the room frame keeps host status in step with the roster", () => {
  const { client, socket } = connectedClient();

  socket.deliver({ t: "room", phase: "lobby", hostSeat: 1, seats: [{ seat: 0 }, { seat: 1 }] });
  assert.equal(client.isHost, false, "the host moved away from this seat");
  assert.equal(client.phase, "lobby");
  assert.deepEqual(client.mySeat, { seat: 0 });

  socket.deliver({ t: "room", phase: "drafting", hostSeat: 0, seats: [{ seat: 0 }, { seat: 1 }] });
  assert.equal(client.isHost, true);
  assert.equal(client.phase, "drafting");
  client.close();
});

test("a hand frame is authoritative over any local guess", () => {
  const { client, socket } = connectedClient();

  client.pack = [99];
  client.pendingPick = 0;
  socket.deliver({ t: "hand", pack: [1, 2, 3], remaining: 2, seq: 5, step: 4 });

  assert.deepEqual(client.pack, [1, 2, 3]);
  assert.equal(client.remaining, 2);
  assert.equal(client.seq, 5);
  assert.equal(client.pendingPick, null, "an in-flight pick is cleared by the server's view");
  client.close();
});

test("done stores the reveal and empties the pack", () => {
  const { client, socket } = connectedClient();

  socket.deliver({ t: "hand", pack: [1, 2], remaining: 1, seq: 0 });
  socket.deliver({ t: "done", pools: [[1], [2]], seats: [] });

  assert.deepEqual(client.done.pools, [[1], [2]]);
  assert.deepEqual(client.pack, [], "no pack is left to click on the results screen");
  client.close();
});

test("pong is handled quietly and never reaches the renderer", () => {
  let changes = 0;
  const { socket, client } = connectedClient({ onChange: () => { changes += 1; } });

  const before = changes;
  socket.deliver({ t: "pong" });
  assert.equal(changes, before, "a keepalive does not trigger a re-render");
  client.close();
});

test("malformed and unknown frames do not throw", () => {
  const { client, socket } = connectedClient();

  assert.doesNotThrow(() => socket.deliverRaw("not json at all"));
  assert.doesNotThrow(() => socket.deliver({ t: "something-from-the-future", x: 1 }));
  assert.equal(client.seat, 0, "state is untouched");
  client.close();
});

test("a fatal error closes the client for good; a soft one does not", () => {
  const soft = connectedClient();
  soft.socket.deliver({ t: "err", code: "not-owed", message: "Already picked." });
  assert.deepEqual(soft.events.at(-1), {
    type: "error",
    code: "not-owed",
    message: "Already picked.",
    fatal: undefined,
  });
  assert.equal(soft.client.closed, false);
  soft.client.close();

  const fatal = connectedClient();
  fatal.socket.deliver({ t: "err", code: "bad-token", message: "Not yours.", fatal: true });
  assert.equal(fatal.client.closed, true);
  assert.equal(fatal.events.at(-1).code, "bad-token");
});

test("roomClosed is surfaced as fatal and stops the client reconnecting", () => {
  const { client, socket, events } = connectedClient();

  socket.deliver({ t: "roomClosed", reason: "expired", message: "Results expired." });

  assert.equal(client.closed, true);
  assert.deepEqual(events.at(-1), {
    type: "error",
    code: "expired",
    message: "Results expired.",
    fatal: true,
  });

  const before = FakeSocket.instances.length;
  socket.close();
  assert.equal(FakeSocket.instances.length, before, "a closed client does not reconnect");
});

/* ---------- the optimistic pick splice ---------- */

test("an ack appends to the pool and removes just that card from the pack", () => {
  const { client, socket } = connectedClient();
  socket.deliver({ t: "pool", refs: [7] });
  socket.deliver({ t: "hand", pack: [10, 11, 12], remaining: 2, seq: 1 });

  socket.deliver({ t: "picked", seq: 1, ref: 11, remaining: 1 });

  assert.deepEqual(client.pool, [7, 11]);
  assert.deepEqual(client.pack, [10, 12], "the taken card leaves the pack immediately");
  assert.equal(client.seq, 2, "seq advances per card so the next pick fences correctly");
  assert.equal(client.remaining, 1);
  assert.equal(client.pendingPick, null);
  client.close();
});

test("a replayed ack changes nothing", () => {
  const { client, socket } = connectedClient();
  socket.deliver({ t: "pool", refs: [7] });
  socket.deliver({ t: "hand", pack: [10, 11], remaining: 1, seq: 1 });

  socket.deliver({ t: "picked", seq: 1, ref: 10, remaining: 0, replay: true });

  assert.deepEqual(client.pool, [7], "a replay must not double-count the card");
  assert.deepEqual(client.pack, [10, 11]);
  assert.equal(client.seq, 1);
  client.close();
});

test("a pack holding the same card twice loses only one copy", () => {
  // An undersized cube can legitimately deal the same ref into one pack, so the splice
  // has to be positional-safe rather than removing every match.
  const { client, socket } = connectedClient();
  socket.deliver({ t: "hand", pack: [10, 11, 10], remaining: 1, seq: 0 });

  socket.deliver({ t: "picked", seq: 0, ref: 10, remaining: 0 });

  assert.deepEqual(client.pack, [11, 10], "the second copy is still draftable");
  client.close();
});

test("an ack for a card that is not in the pack leaves the pack alone", () => {
  const { client, socket } = connectedClient();
  socket.deliver({ t: "hand", pack: [10, 11], remaining: 1, seq: 0 });

  socket.deliver({ t: "picked", seq: 0, ref: 99, remaining: 0 });

  assert.deepEqual(client.pack, [10, 11]);
  assert.deepEqual(client.pool, [99], "the server is still believed about what was taken");
  client.close();
});

/* ---------- pick() guards ---------- */

test("pick sends the fence fields the server checks", () => {
  const { client, socket } = connectedClient();
  socket.deliver({ t: "hand", pack: [10, 11, 12], remaining: 1, seq: 3 });

  client.pick(1);

  assert.deepEqual(socket.sent.at(-1), { t: "pick", seq: 3, index: 1, ref: 11 });
  assert.equal(client.pendingPick, 1);
  client.close();
});

test("pick is ignored when nothing is owed, when one is in flight, or out of range", () => {
  const { client, socket } = connectedClient();

  socket.deliver({ t: "hand", pack: [10, 11], remaining: 0, seq: 0 });
  client.pick(0);
  assert.equal(socket.sent.filter((m) => m.t === "pick").length, 0, "nothing owed");

  socket.deliver({ t: "hand", pack: [10, 11], remaining: 1, seq: 0 });
  client.pick(0);
  client.pick(1);
  assert.equal(
    socket.sent.filter((m) => m.t === "pick").length,
    1,
    "a second click while a pick is in flight is dropped"
  );

  socket.deliver({ t: "hand", pack: [10, 11], remaining: 1, seq: 1 });
  client.pick(9);
  assert.equal(socket.sent.filter((m) => m.t === "pick").length, 1, "out of range is ignored");
  client.close();
});

test("the second card of a double pick can be taken as soon as the first is acked", () => {
  const { client, socket } = connectedClient();
  socket.deliver({ t: "hand", pack: [10, 11, 12], remaining: 2, seq: 0 });

  client.pick(0);
  socket.deliver({ t: "picked", seq: 0, ref: 10, remaining: 1 });

  // No new hand frame yet — the local splice is what makes this feel instant.
  client.pick(0);

  const picks = socket.sent.filter((m) => m.t === "pick");
  assert.deepEqual(picks, [
    { t: "pick", seq: 0, index: 0, ref: 10 },
    { t: "pick", seq: 1, index: 0, ref: 11 },
  ], "the second pick uses the advanced seq and the respliced pack");
  client.close();
});

/* ---------- actions and derived views ---------- */

test("start, botify and rename put the right frames on the wire", () => {
  const { client, socket } = connectedClient();

  client.start();
  client.botify(2);
  client.rename("Ann Marie");

  assert.deepEqual(socket.sent.slice(-3), [
    { t: "start" },
    { t: "botify", seat: 2 },
    { t: "rename", name: "Ann Marie" },
  ]);
  assert.equal(client.name, "Ann Marie");
  client.close();
});

test("cards resolves refs and drops any the catalog has not filled in yet", () => {
  const { client, socket } = connectedClient();
  socket.deliver({
    t: "catalog", chunk: 0, chunks: 1, start: 0,
    cards: [{ name: "a" }, { name: "b" }],
  });

  assert.deepEqual(client.cards([1, 0]).map((c) => c.name), ["b", "a"]);
  assert.deepEqual(client.cards([0, 5]).map((c) => c.name), ["a"], "a missing ref is skipped");
  client.close();
});

test("send is a no-op while the socket is not open", () => {
  FakeSocket.reset();
  const client = track(new RoomClient({ code: "TESTROOM", name: "Ann" }));
  const socket = FakeSocket.latest();

  client.start();
  assert.equal(socket.sent.length, 0, "nothing is queued before the socket opens");
  client.close();
});

/* ---------- reconnect and keepalive ---------- */

test("reconnect backs off exponentially and caps out", (t) => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const random = mock.method(Math, "random", () => 0);
  t.after(() => {
    mock.timers.reset();
    random.mock.restore();
  });

  FakeSocket.reset();
  const client = track(new RoomClient({ code: "TESTROOM", name: "Ann" }));

  // With jitter pinned to 0 the delay is half the doubling base: 500, 1000, 2000...
  // capped at BACKOFF_MAX (8000), so half-delays run 250, 500, 1000, 2000, 4000, 4000.
  for (const expected of [250, 500, 1000, 2000, 4000, 4000]) {
    const before = FakeSocket.instances.length;
    FakeSocket.latest().close();

    mock.timers.tick(expected - 1);
    assert.equal(FakeSocket.instances.length, before, `no reconnect before ${expected}ms`);

    mock.timers.tick(1);
    assert.equal(FakeSocket.instances.length, before + 1, `reconnected at ${expected}ms`);
  }

  client.close();
});

test("a successful connection resets the backoff", (t) => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const random = mock.method(Math, "random", () => 0);
  t.after(() => {
    mock.timers.reset();
    random.mock.restore();
  });

  FakeSocket.reset();
  const client = track(new RoomClient({ code: "TESTROOM", name: "Ann" }));

  FakeSocket.latest().close();
  mock.timers.tick(250);
  FakeSocket.latest().close();
  mock.timers.tick(500);

  // Third socket connects successfully, so the next drop starts from the minimum again.
  FakeSocket.latest().open();
  assert.equal(client.status, "connected");

  const before = FakeSocket.instances.length;
  FakeSocket.latest().close();
  assert.equal(client.status, "reconnecting");
  mock.timers.tick(250);
  assert.equal(FakeSocket.instances.length, before + 1, "backoff restarted at the minimum");

  client.close();
});

test("closing the client stops it reconnecting", (t) => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  t.after(() => mock.timers.reset());

  FakeSocket.reset();
  const client = track(new RoomClient({ code: "TESTROOM", name: "Ann" }));
  FakeSocket.latest().open();

  client.close();
  const before = FakeSocket.instances.length;

  mock.timers.tick(60000);
  assert.equal(FakeSocket.instances.length, before, "no further sockets after close()");
});

test("the keepalive pings and drops a socket that stops answering", (t) => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  t.after(() => mock.timers.reset());

  FakeSocket.reset();
  const client = track(new RoomClient({ code: "TESTROOM", name: "Ann" }));
  const socket = FakeSocket.latest();
  socket.open();

  mock.timers.tick(30000);
  assert.deepEqual(socket.sent.at(-1), { t: "ping" }, "a ping goes out on the interval");

  // The server answers, so the socket survives the grace period.
  socket.deliver({ t: "pong" });
  mock.timers.tick(10000);
  assert.equal(socket.closeCalls, 0, "an answered ping keeps the socket");

  // The next ping goes unanswered.
  mock.timers.tick(20000);
  assert.deepEqual(socket.sent.at(-1), { t: "ping" });
  mock.timers.tick(10000);
  assert.ok(socket.closeCalls > 0, "an unanswered ping drops the socket so it reconnects");

  client.close();
});
