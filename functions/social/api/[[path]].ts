// Routes /social/api/* to the SOCIAL_ASSETS R2 bucket.
//
// One object per asset (`<project>/<filename>.png`), plus an optional sibling
// `<project>/<filename>.png.json` holding the editor's layer state so a saved design can be
// reloaded and edited again later — the PNG alone can't be un-flattened.

interface Env {
  SOCIAL_ASSETS: R2Bucket;
}

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
