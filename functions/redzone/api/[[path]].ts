// Serves /redzone/api/bets — the RedZone bet tracker's picks, kept in a private R2 object
// (REDZONE_BETS, key `bets.json`) instead of the public GitHub repo.
//
// Read-only on purpose: picks are written to the bucket out of band (see DEPLOY.md), so this
// endpoint can only ever leak, never corrupt, and the write path doesn't exist to attack.
//
// Access control is layered because this data is the owner's alone:
//   1. only answers on redzone.jaredluyster.com, the hostname the `redzone` Access app gates
//      (the same files are also reachable ungated at *.pages.dev — they get a 404 here);
//   2. requires a valid, signed Access JWT (functions/redzone/_lib/access.ts);
//   3. requires that JWT's email to be in the BETS_ALLOWED_EMAILS secret — Access also lets
//      the guest policy through to this hostname, and a guest must not read the owner's bets.

import { authenticate, parseAllowlist, type AccessEnv } from "../_lib/access.ts";

interface Env extends AccessEnv {
  REDZONE_BETS?: R2Bucket;
}

type Context = {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
};

const HOST = "redzone.jaredluyster.com";
const KEY = "bets.json";

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.hostname !== HOST) return json({ error: "not-found" }, 404);

  const segments = Array.isArray(context.params.path)
    ? context.params.path
    : context.params.path
      ? [context.params.path]
      : [];
  if (segments.length !== 1 || segments[0] !== "bets") return json({ error: "not-found" }, 404);

  if (!env.REDZONE_BETS || parseAllowlist(env.BETS_ALLOWED_EMAILS).size === 0) {
    return json({ error: "not-configured" }, 503);
  }

  const auth = await authenticate(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method-not-allowed" }, 405, { Allow: "GET, HEAD" });
  }

  const object = await env.REDZONE_BETS.get(KEY);
  const body = object ? await object.text() : JSON.stringify({ bets: [] });
  return new Response(request.method === "HEAD" ? null : body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...extra },
  });
}
