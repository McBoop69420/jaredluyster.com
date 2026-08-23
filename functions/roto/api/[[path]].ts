// Routes /roto/api/* to the DraftRoom Durable Object.
//
// Unlike functions/marketplace/[[path]].ts, this is not a reverse proxy: the Worker is
// on this account, so Pages binds the Durable Object namespace directly. That keeps the
// Worker off the public internet and lets a WebSocket upgrade pass through as-is instead
// of having to be reassembled from a fetch response.

interface Env {
  DRAFT_ROOM: DurableObjectNamespace;
}

// Crockford base32 minus the ambiguous letters, so a code read aloud survives the trip.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;
const CREATE_ATTEMPTS = 3;

type Context = {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
};

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  // /roto/api/rooms...
  const rooms = segments.indexOf("rooms");
  if (rooms === -1) {
    return json({ error: "not-found" }, 404);
  }

  const code = segments[rooms + 1];
  const action = segments[rooms + 2];

  if (!code) {
    if (request.method !== "POST") {
      return json({ error: "method-not-allowed" }, 405);
    }
    return createRoom(request, env);
  }

  if (!isValidCode(code)) {
    return json({ error: "bad-code" }, 400);
  }

  const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName(code));

  if (action === "ws") {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "expected-websocket" }, 426);
    }
    // Forwarded untouched so the upgrade — headers and all — survives intact.
    return stub.fetch(request);
  }

  if (!action && request.method === "GET") {
    return stub.fetch(new Request(`${url.origin}/info`, request));
  }

  return json({ error: "not-found" }, 404);
};

async function createRoom(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-request" }, 400);
  }

  // Every code maps to a valid Durable Object id, so a collision can only be detected by
  // asking the room itself — it answers 409 if it has already been initialized.
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const code = makeCode();
    const stub = env.DRAFT_ROOM.get(env.DRAFT_ROOM.idFromName(code));

    const response = await stub.fetch("https://roto.internal/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, code }),
    });

    if (response.status !== 409) {
      return response;
    }
  }

  return json({ error: "code-collision" }, 503);
}

function makeCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((char) => CODE_ALPHABET.includes(char));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
