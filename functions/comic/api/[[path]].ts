// Serves /comic/api/* for comic.jaredluyster.com: the public reader's data and the private
// planner's store, both in one R2 bucket (COMIC). Pages calls it by that absolute path even on
// the subdomain, because the middleware leaves /comic/* alone and Pages only runs a Function
// for the path as requested, never for one a middleware rewrite produces.
//
//   plan.json       the whole planner document (private: scripts, notes, unposted strips)
//   published.json  the public slice, rewritten from plan.json on every save
//   img/<id>        uploaded scans and character art
//
// Public routes (no login):
//   GET public/site       settings, posted strips (scheduled ones hidden until their day), public cast
//   GET public/img/<id>   an image, only if a visible strip or public character uses it
//
// Private routes (the planner) — gated twice, the same layering as the RedZone bet store:
//   1. a `comic` Access application covers comic.jaredluyster.com/plan* and /comic/api/private/*;
//   2. this Function checks the signed Access JWT itself and that its email is in the
//      COMIC_OWNER_EMAILS secret, so the ungated *.pages.dev copy and other apps' guests get
//      nothing. Until that secret is set every private route answers 503 (fails closed).
//
//   GET    private/plan        the plan, with its ETag
//   PUT    private/plan        replace it (If-Match: the ETag it loaded, or "new" for the first save)
//   PUT    private/img/<id>    upload an image
//   GET    private/img/<id>    view any image, posted or not
//   DELETE private/img/<id>

import { authenticate, type AccessEnv } from "../../redzone/_lib/access.ts";
import { derivePublished, emptyPlan, isId, normalizePlan, publicImageIds, todayIn, visible, type Published } from "../_lib/plan.ts";

interface Env {
  COMIC?: R2Bucket;
  COMIC_OWNER_EMAILS?: string; // SECRET — the repo is public
  COMIC_ACCESS_AUD?: string; // optional: the `comic` Access app's AUD tag
  ACCESS_TEAM_DOMAIN?: string;
  // Local dev only (`wrangler pages dev --binding COMIC_DEV_EMAIL=...`): skips the JWT check,
  // and only ever on a localhost host, so it can't open the real store.
  COMIC_DEV_EMAIL?: string;
}

type Context = { request: Request; env: Env; params: { path?: string | string[] } };

const HOST = "comic.jaredluyster.com";
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "comic.localhost"]);
const TIME_ZONE = "America/New_York";
const PLAN_KEY = "plan.json";
const PUBLISHED_KEY = "published.json";
const MAX_PLAN_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const host = new URL(request.url).hostname.toLowerCase();
  const isDev = DEV_HOSTS.has(host);
  if (host !== HOST && !isDev) return json({ error: "not-found" }, 404);
  if (!env.COMIC) return json({ error: "not-configured" }, 503);

  const raw = context.params.path;
  const seg = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const method = request.method;

  if (seg[0] === "public") {
    if (method !== "GET" && method !== "HEAD") return json({ error: "method-not-allowed" }, 405, { Allow: "GET, HEAD" });
    if (seg.length === 2 && seg[1] === "site") return publicSite(env.COMIC, method);
    if (seg.length === 3 && seg[1] === "img" && isId(seg[2])) return publicImage(env.COMIC, seg[2], method);
    return json({ error: "not-found" }, 404);
  }

  if (seg[0] !== "private") return json({ error: "not-found" }, 404);

  const devOk = isDev && !!env.COMIC_DEV_EMAIL;
  if (!devOk) {
    if (isDev) return json({ error: "not-found" }, 404);
    const accessEnv: AccessEnv = { ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN, ACCESS_AUD: env.COMIC_ACCESS_AUD };
    const auth = await authenticate(request, accessEnv, env.COMIC_OWNER_EMAILS);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
  }

  if (seg.length === 2 && seg[1] === "plan") {
    if (method === "GET" || method === "HEAD") return getPlan(env.COMIC, method);
    if (method === "PUT") return putPlan(request, env.COMIC);
    return json({ error: "method-not-allowed" }, 405, { Allow: "GET, HEAD, PUT" });
  }
  if (seg.length === 3 && seg[1] === "img" && isId(seg[2])) {
    const key = `img/${seg[2]}`;
    if (method === "GET" || method === "HEAD") return serveImage(env.COMIC, key, method, "private, no-store");
    if (method === "PUT") return putImage(request, env.COMIC, key);
    if (method === "DELETE") {
      await env.COMIC.delete(key);
      return json({ ok: true });
    }
    return json({ error: "method-not-allowed" }, 405, { Allow: "GET, HEAD, PUT, DELETE" });
  }
  return json({ error: "not-found" }, 404);
};

async function readPublished(bucket: R2Bucket): Promise<Published> {
  const obj = await bucket.get(PUBLISHED_KEY);
  if (!obj) return derivePublished(emptyPlan());
  try {
    return JSON.parse(await obj.text()) as Published;
  } catch {
    return derivePublished(emptyPlan());
  }
}

async function publicSite(bucket: R2Bucket, method: string): Promise<Response> {
  const site = visible(await readPublished(bucket), todayIn(TIME_ZONE));
  // Short cache: a newly posted strip (or one whose scheduled day just arrived) shows up
  // within a minute without anyone having to purge anything.
  return new Response(method === "HEAD" ? null : JSON.stringify(site), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}

async function publicImage(bucket: R2Bucket, id: string, method: string): Promise<Response> {
  const allowed = publicImageIds(await readPublished(bucket), todayIn(TIME_ZONE));
  if (!allowed.has(id)) return json({ error: "not-found" }, 404);
  // Each upload gets a fresh id, so an image URL's bytes never change: cache it hard.
  return serveImage(bucket, `img/${id}`, method, "public, max-age=31536000, immutable");
}

async function serveImage(bucket: R2Bucket, key: string, method: string, cache: string): Promise<Response> {
  const obj = await bucket.get(key);
  if (!obj) return json({ error: "not-found" }, 404);
  const type = obj.httpMetadata?.contentType ?? "";
  return new Response(method === "HEAD" ? null : obj.body, {
    headers: {
      "Content-Type": IMAGE_TYPES.has(type) ? type : "application/octet-stream",
      "Cache-Control": cache,
      ETag: obj.httpEtag,
    },
  });
}

async function getPlan(bucket: R2Bucket, method: string): Promise<Response> {
  const obj = await bucket.get(PLAN_KEY);
  const body = obj ? await obj.text() : JSON.stringify(emptyPlan());
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    ETag: obj ? obj.httpEtag : '"new"',
  };
  return new Response(method === "HEAD" ? null : body, { headers });
}

async function putPlan(request: Request, bucket: R2Bucket): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_PLAN_BYTES) return json({ error: "too-large" }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "bad-json" }, 400);
  }
  const plan = normalizePlan(parsed);
  if (!plan) return json({ error: "bad-plan" }, 400);

  // Optimistic concurrency: a save from a tab holding an older copy (the planner open on a
  // phone and a laptop) must not silently overwrite newer work. The client sends the ETag
  // it loaded; R2 refuses the write if the stored object has moved on since.
  const ifMatch = request.headers.get("If-Match");
  if (!ifMatch) return json({ error: "if-match-required" }, 428);
  let written: R2Object | null;
  if (ifMatch === '"new"') {
    if (await bucket.head(PLAN_KEY)) return conflict();
    written = await bucket.put(PLAN_KEY, JSON.stringify(plan), { httpMetadata: { contentType: "application/json" } });
  } else {
    written = await bucket.put(PLAN_KEY, JSON.stringify(plan), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: { etagMatches: ifMatch.replace(/^W\//, "").replace(/"/g, "") },
    });
  }
  if (!written) return conflict();

  await bucket.put(PUBLISHED_KEY, JSON.stringify(derivePublished(plan)), {
    httpMetadata: { contentType: "application/json" },
  });
  return json({ ok: true, plan }, 200, { ETag: written.httpEtag });
}

function conflict(): Response {
  return json({ error: "conflict" }, 412);
}

async function putImage(request: Request, bucket: R2Bucket, key: string): Promise<Response> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return json({ error: "unsupported-type" }, 415);
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_IMAGE_BYTES) return json({ error: "too-large" }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: "empty" }, 400);
  if (body.byteLength > MAX_IMAGE_BYTES) return json({ error: "too-large" }, 413);
  await bucket.put(key, body, { httpMetadata: { contentType: type } });
  return json({ ok: true });
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...extra },
  });
}
