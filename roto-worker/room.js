// The DraftRoom Durable Object: a thin adapter around room-core.js. It owns sockets,
// storage and alarms; every decision about the draft itself lives in the reducer.

import { fetchCubeCards } from "../roto/cube.js";
import {
  createRoomState,
  handleAlarm,
  handleDisconnect,
  handleMessage,
  PROTOCOL_VERSION,
} from "./room-core.js";
import { makeStore } from "./store.js";

const ROOM_TAG = "room";
const MAX_NAME = 24;

export class DraftRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.store = makeStore((sql, ...params) => ctx.storage.sql.exec(sql, ...params).toArray());

    // Hibernation can evict this object at any time, so nothing may live only in memory.
    // Everything is rebuilt from storage here before any request is served.
    ctx.blockConcurrencyWhile(async () => {
      this.store.init();
      this.state = this.store.load();
    });

    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(JSON.stringify({ t: "ping" }), JSON.stringify({ t: "pong" }))
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.pathname.split("/").filter(Boolean).pop();

    if (request.headers.get("Upgrade") === "websocket") {
      return this.connect(url);
    }
    if (action === "create" && request.method === "POST") {
      return this.create(request);
    }
    if (action === "info") {
      return this.info();
    }

    return json({ error: "not-found" }, 404);
  }

  /* ---------- room lifecycle ---------- */

  async create(request) {
    if (this.state) {
      return json({ error: "room-exists" }, 409);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad-request" }, 400);
    }

    const config = readConfig(body);
    if (!config.cubeId) {
      return json({ error: "bad-cube" }, 400);
    }

    let cards;
    try {
      // The room fetches the cube itself. A client-supplied card list would let one
      // player choose everyone's packs.
      cards = await fetchCubeCards(config.cubeId);
    } catch (error) {
      return json({ error: "cube-fetch-failed", message: String(error.message || error) }, 502);
    }

    if (cards.length < config.packSize) {
      return json({ error: "cube-too-small", have: cards.length }, 400);
    }

    const state = createRoomState(body.code, config, cards, Date.now(), body.hostName);

    this.state = state;
    this.store.writeCreation(state);

    return json({
      code: body.code,
      protocol: PROTOCOL_VERSION,
      cards: cards.length,
      // Not an error: the draft simply reuses cards. Worth surfacing in the lobby.
      undersized: cards.length < config.players * config.packs * config.packSize,
    }, 201);
  }

  info() {
    if (!this.state) {
      return json({ exists: false }, 404);
    }

    return json({
      exists: true,
      phase: this.state.phase,
      code: this.state.code,
      cubeId: this.state.config.cubeId,
      players: this.state.config.players,
      seatsOpen: this.state.seats.filter((seat) => !seat.claimed).length,
      protocol: PROTOCOL_VERSION,
    });
  }

  /* ---------- sockets ---------- */

  // The seat must be resolved before the socket is accepted, because hibernation tags
  // are fixed at accept time and the tag is how unicasts find the socket later.
  connect(url) {
    if (!this.state) {
      return json({ error: "no-such-room" }, 404);
    }

    const join = {
      t: "join",
      protocol: Number(url.searchParams.get("protocol")) || PROTOCOL_VERSION,
      token: url.searchParams.get("token") || undefined,
      name: (url.searchParams.get("name") || "").slice(0, MAX_NAME) || undefined,
      haveCatalog: url.searchParams.get("haveCatalog") === "1",
    };

    const result = this.apply(handleMessage(this.state, { seat: null }, join, Date.now()));
    const welcome = result.effects.find((effect) => effect.msg.t === "welcome");

    if (!welcome) {
      const failure = result.effects.find((effect) => effect.msg.t === "err");
      return json({ error: failure?.msg.code || "join-failed", message: failure?.msg.message }, 403);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const seat = welcome.msg.seat;

    this.ctx.acceptWebSocket(server, [ROOM_TAG, seatTag(seat)]);
    server.serializeAttachment({ seat, token: welcome.msg.token });

    this.dispatch(result.effects, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    const { seat } = ws.deserializeAttachment() || {};

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ t: "err", code: "bad-frame", message: "Malformed message." }));
      return;
    }

    if (msg?.t === "pong" || msg?.t === "ping") {
      return;
    }

    // The seat comes from the socket, never from the frame — there is no way to act on
    // another player's behalf.
    const result = this.apply(
      handleMessage(this.state, { seat: seat ?? null }, msg, Date.now())
    );
    this.dispatch(result.effects, ws);
  }

  webSocketClose(ws) {
    this.onSocketGone(ws);
  }

  webSocketError(ws) {
    this.onSocketGone(ws);
  }

  onSocketGone(ws) {
    const { seat } = ws.deserializeAttachment() || {};
    if (seat === undefined || seat === null || !this.state) {
      return;
    }

    // A second tab on the same seat means the player is still here.
    const remaining = this.ctx.getWebSockets(seatTag(seat)).filter((other) => other !== ws);
    if (remaining.length > 0) {
      return;
    }

    this.dispatch(this.apply(handleDisconnect(this.state, seat, Date.now())).effects, null);
  }

  async alarm() {
    if (!this.state) {
      return;
    }
    this.dispatch(this.apply(handleAlarm(this.state, Date.now())).effects, null);
  }

  /* ---------- plumbing ---------- */

  // Persists whatever the reducer changed and schedules the next alarm.
  apply(result) {
    const persistedPicks = this.persistedPicks ?? 0;
    this.state = result.state;

    this.store.writeLive(this.state);

    for (const entry of this.state.pickLog.slice(persistedPicks)) {
      this.store.appendPick(entry);
    }
    this.persistedPicks = this.state.pickLog.length;

    if (result.alarm) {
      this.ctx.storage.setAlarm(result.alarm);
    }

    return result;
  }

  dispatch(effects, actorSocket) {
    for (const { to, msg } of effects) {
      const text = JSON.stringify(msg);

      if (to === "all") {
        this.sendTo(this.ctx.getWebSockets(ROOM_TAG), text);
      } else if (to === "actor") {
        trySend(actorSocket, text);
      } else {
        this.sendTo(this.ctx.getWebSockets(seatTag(to)), text);
      }
    }
  }

  sendTo(sockets, text) {
    for (const socket of sockets) {
      trySend(socket, text);
    }
  }
}

function trySend(socket, text) {
  if (!socket) {
    return;
  }
  try {
    socket.send(text);
  } catch {
    // The socket is already gone; webSocketClose will clean the seat up.
  }
}

function seatTag(seat) {
  return `seat:${seat}`;
}

function readConfig(body) {
  return {
    cubeId: String(body.cubeId || "").trim(),
    players: clamp(body.players, 2, 8),
    packs: clamp(body.packs, 1, 6),
    packSize: clamp(body.packSize, 4, 24),
    doublePickAfter: clamp(body.doublePickAfter ?? 0, 0, 23),
    seed: String(body.seed || "").trim() || crypto.randomUUID(),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
