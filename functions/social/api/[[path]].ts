// Routes /social/api/* to the SOCIAL_ASSETS R2 bucket.
//
// One object per asset (`<project>/<filename>.png`), plus an optional sibling
// `<project>/<filename>.png.json` holding the editor's layer state so a saved design can be
// reloaded and edited again later — the PNG alone can't be un-flattened.
//
// Gated twice, the same layering as the RedZone bet store: the `social` Access app covers
// social.jaredluyster.com, and this Function checks the signed Access JWT itself. Access only
// guards that one hostname; the same Function is reachable on jaredluyster.com and *.pages.dev,
// so without the in-code check every route here was open to the internet. Fails closed (503)
// until SOCIAL_OWNER_EMAILS (or the shared BETS_ALLOWED_EMAILS) is set.

import { authenticate, type AccessEnv } from "../../redzone/_lib/access.ts";

interface Env {
  SOCIAL_ASSETS: R2Bucket;
  SOCIAL_OWNER_EMAILS?: string; // SECRET: the repo is public
  SOCIAL_ACCESS_AUD?: string; // optional: the `social` Access app's AUD tag
  BETS_ALLOWED_EMAILS?: string; // fallback: the owner's email, already set for RedZone
  ACCESS_TEAM_DOMAIN?: string;
}

const HOST = "social.jaredluyster.com";
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "social.localhost"]);

type Context = {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
};

// Generous but bounded — this bucket only ever holds hand-crafted graphics, not video.
const MAX_BYTES = 20 * 1024 * 1024;

export const onRequest = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host !== HOST && !DEV_HOSTS.has(host)) return json({ error: "not-found" }, 404);
  if (!DEV_HOSTS.has(host)) {
    const accessEnv: AccessEnv = { ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN, ACCESS_AUD: env.SOCIAL_ACCESS_AUD };
    const auth = await authenticate(request, accessEnv, env.SOCIAL_OWNER_EMAILS || env.BETS_ALLOWED_EMAILS);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
  }
  const segments = Array.isArray(context.params.path)
    ? context.params.path
    : context.params.path
      ? [context.params.path]
      : [];

  // /social/api/assets[/<project>/<filename>]
  if (segments[0] !== "assets") {
    return json({ error: "not-found" }, 404);
  }
  const rest = segments.slice(1);

  if (rest.length === 0) {
    if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405);
    return listAssets(env, url);
  }

  if (rest.length === 2) {
    const [project, filename] = rest;
    if (!isSafeSegment(project) || !isSafeSegment(filename)) {
      return json({ error: "bad-request" }, 400);
    }
    const key = `${project}/${filename}`;

    if (request.method === "PUT") return putAsset(request, env, key, url);
    if (request.method === "GET") return getAsset(env, key);
    if (request.method === "DELETE") return deleteAsset(env, key);
    return json({ error: "method-not-allowed" }, 405);
  }

  return json({ error: "not-found" }, 404);
};

async function listAssets(env: Env, url: URL): Promise<Response> {
  const project = url.searchParams.get("project") || undefined;
  const prefix = project ? `${project}/` : undefined;

  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SOCIAL_ASSETS.list({ prefix, cursor, include: ["customMetadata"] });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const designKeys = new Set(objects.filter((o) => o.key.endsWith(".json")).map((o) => o.key));

  const items = objects
    .filter((o) => !o.key.endsWith(".json"))
    .map((o) => {
      const [proj, ...fileParts] = o.key.split("/");
      const filename = fileParts.join("/");
      return {
        key: o.key,
        project: proj,
        filename,
        size: o.size,
        uploaded: o.uploaded,
        title: o.customMetadata?.title || filename,
        platform: o.customMetadata?.platform || "",
        hasDesign: designKeys.has(`${o.key}.json`),
      };
    })
    .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime());

  return json({ items });
}

async function putAsset(request: Request, env: Env, key: string, url: URL): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BYTES) return json({ error: "too-large" }, 413);

  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const title = url.searchParams.get("title");
  const platform = url.searchParams.get("platform");
  const customMetadata: Record<string, string> = {};
  if (title) customMetadata.title = title;
  if (platform) customMetadata.platform = platform;

  await env.SOCIAL_ASSETS.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata,
  });
  return json({ ok: true, key });
}

async function getAsset(env: Env, key: string): Promise<Response> {
  const obj = await env.SOCIAL_ASSETS.get(key);
  if (!obj) return json({ error: "not-found" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, max-age=0, must-revalidate");
  // Uploads are whatever the client declared. Never let one run as a page on this origin.
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  return new Response(obj.body, { headers });
}

async function deleteAsset(env: Env, key: string): Promise<Response> {
  await env.SOCIAL_ASSETS.delete(key);
  await env.SOCIAL_ASSETS.delete(`${key}.json`);
  return json({ ok: true });
}

function isSafeSegment(segment: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(segment) && segment !== "." && segment !== "..";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
