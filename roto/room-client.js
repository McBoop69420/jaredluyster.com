// WebSocket client for a multiplayer room. Holds the seat's view of the draft and
// reconnects on its own; the caller just renders whatever `onChange` hands it.
//
// This module never runs the draft engine. Everything it knows arrives from the server,
// which is why a bug here cannot leak another player's pack or corrupt a draft.

const API = "/roto/api/rooms";
const PROTOCOL = 1;
const BACKOFF_MIN = 500;
const BACKOFF_MAX = 8000;
const PING_MS = 30000;
const PONG_GRACE_MS = 10000;

export async function createRoom(settings) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(describeCreateError(body));
  }

  return body;
}

export async function roomInfo(code) {
  const response = await fetch(`${API}/${encodeURIComponent(code)}`);
  return response.ok ? response.json() : { exists: false };
}

function describeCreateError(body) {
  switch (body.error) {
    case "cube-too-small":
      return `That cube only has ${body.have} usable cards — not enough for one pack.`;
    case "cube-fetch-failed":
      return body.message || "Could not load that cube from CubeCobra.";
    case "bad-cube":
      return "That doesn't look like a CubeCobra cube link or ID.";
    default:
      return "Could not create the room. Try again.";
  }
}

export class RoomClient {
  constructor({ code, token, name, onChange, onEvent }) {
    this.code = code;
    this.token = token;
    this.name = name;
    this.onChange = onChange || (() => {});
    this.onEvent = onEvent || (() => {});

    this.catalog = [];
    this.catalogComplete = false;
    this.seat = null;
    this.isHost = false;
    this.room = null;
    this.step = null;
    this.pack = [];
    this.pool = [];
    this.remaining = 0;
    this.seq = 0;
    this.done = null;
    this.status = "connecting";

    this.attempt = 0;
    this.closed = false;
    this.pendingPick = null;

    this.connect();
    this.bindVisibility();
  }

  /* ---------- connection ---------- */

  connect() {
    if (this.closed) {
      return;
    }

    const params = new URLSearchParams({ protocol: String(PROTOCOL) });
    if (this.token) params.set("token", this.token);
    else if (this.name) params.set("name", this.name);
    if (this.catalogComplete) params.set("haveCatalog", "1");

    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url = `${scheme}://${location.host}${API}/${this.code}/ws?${params}`;

    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    let socket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    socket.addEventListener("open", () => this.onOpen());
    socket.addEventListener("message", (event) => this.onMessage(event));
    socket.addEventListener("close", () => this.onClose());
    socket.addEventListener("error", () => socket.close());
  }

  onOpen() {
    this.attempt = 0;
    this.setStatus("connected");
    this.startPing();
  }

  onClose() {
    this.stopPing();
    if (this.closed) {
      return;
    }
    this.setStatus("reconnecting");
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    this.attempt += 1;
    const base = Math.min(BACKOFF_MIN * 2 ** (this.attempt - 1), BACKOFF_MAX);
    const delay = base / 2 + Math.random() * (base / 2);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  // The server answers pings without waking the room, so this is cheap.
  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ t: "ping" });
      clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => this.socket?.close(), PONG_GRACE_MS);
    }, PING_MS);
  }

  stopPing() {
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
  }

  bindVisibility() {
    this.onWake = () => {
      if (!this.closed && this.socket?.readyState !== WebSocket.OPEN) {
        clearTimeout(this.retryTimer);
        this.attempt = 0;
        this.connect();
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.onWake();
    });
    window.addEventListener("online", this.onWake);
  }

  close() {
    this.closed = true;
    this.stopPing();
    clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  send(msg) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  /* ---------- frames ---------- */

  onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.t) {
      case "pong":
        clearTimeout(this.pongTimer);
        return;

      case "welcome":
        this.seat = msg.seat;
        this.token = msg.token;
        this.isHost = msg.isHost;
        this.onEvent({ type: "seat", seat: msg.seat, token: msg.token, code: msg.code });
        break;

      case "catalog":
        for (let i = 0; i < msg.cards.length; i += 1) {
          this.catalog[msg.start + i] = msg.cards[i];
        }
        if (msg.chunk === msg.chunks - 1) {
          this.catalogComplete = true;
        }
        break;

      case "room":
        this.room = msg;
        this.isHost = msg.hostSeat === this.seat;
        break;

      case "hand":
        // Authoritative: replaces any local guess made while a pick was in flight.
        this.pack = msg.pack;
        this.remaining = msg.remaining;
        this.seq = msg.seq;
        this.pendingPick = null;
        break;

      case "pool":
        this.pool = msg.refs;
        break;

      case "picked":
        this.applyPicked(msg);
        break;

      case "step":
        this.step = msg;
        break;

      case "done":
        this.done = msg;
        this.pack = [];
        break;

      case "err":
        this.onEvent({ type: "error", code: msg.code, message: msg.message, fatal: msg.fatal });
        if (msg.fatal) {
          this.close();
        }
        break;

      default:
        break;
    }

    this.onChange(this);
  }

  applyPicked(msg) {
    this.pendingPick = null;

    if (msg.replay) {
      return;
    }

    this.pool = [...this.pool, msg.ref];
    this.remaining = msg.remaining;
    this.seq += 1;

    // Drop the card locally rather than waiting for the next hand frame, so the second
    // card of a double pick is immediate. The server echoed the ref, so this is safe.
    const index = this.pack.indexOf(msg.ref);
    if (index !== -1) {
      this.pack = [...this.pack.slice(0, index), ...this.pack.slice(index + 1)];
    }
  }

  /* ---------- actions ---------- */

  pick(index) {
    if (this.pendingPick !== null || this.remaining <= 0) {
      return;
    }

    const ref = this.pack[index];
    if (ref === undefined) {
      return;
    }

    this.pendingPick = index;
    this.send({ t: "pick", seq: this.seq, index, ref });
    this.onChange(this);
  }

  start() {
    this.send({ t: "start" });
  }

  botify(seat) {
    this.send({ t: "botify", seat });
  }

  rename(name) {
    this.name = name;
    this.send({ t: "rename", name });
  }

  setStatus(status) {
    this.status = status;
    this.onChange(this);
  }

  /* ---------- derived views ---------- */

  cards(refs) {
    return refs.map((ref) => this.catalog[ref]).filter(Boolean);
  }

  get phase() {
    return this.room?.phase || "lobby";
  }

  get mySeat() {
    return this.room?.seats?.[this.seat] || null;
  }
}
