// Reverse proxy: /marketplace/* -> the marketplace backend (currently Flask on Render).
//
// This is a transitional bridge. Cloudflare Pages serves the static site at the
// apex, and this Function forwards every /marketplace/* request to the backend
// origin so the store keeps working under the same domain (cookies included).
//
// Phase 2 replaces the Render origin with a native Cloudflare Worker + D1; when
// that happens, this file goes away (the Worker owns the /marketplace/* routes).

interface Env {
  // Full origin of the marketplace backend, e.g. https://jaredluyster-com.onrender.com
  MARKETPLACE_ORIGIN: string;
}

// Backend source / data files must never be served, even though they live under
// marketplace/ in the repo. Requests for them are refused before proxying.
const BLOCKED = /\.(py|pyc|db|db-shm|db-wal|bat|vbs|env|toml)$/i;

// Hop-by-hop headers that must not be forwarded verbatim.
const STRIP_REQUEST_HEADERS = ["host", "content-length", "cf-connecting-ip"];

export const onRequest = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (BLOCKED.test(url.pathname)) {
    return new Response("Not found", { status: 404 });
  }

  const origin = (env.MARKETPLACE_ORIGIN || "").replace(/\/$/, "");
  if (!origin) {
    return new Response("MARKETPLACE_ORIGIN is not configured", { status: 500 });
  }

  const target = origin + url.pathname + url.search;

  const headers = new Headers(request.headers);
  for (const h of STRIP_REQUEST_HEADERS) headers.delete(h);
  // Let the backend build correct absolute links (e.g. password-reset URLs)
  // even though the upstream request lands on the origin's own hostname.
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });

  // Pass the response through untouched (status, Set-Cookie, body...), but rewrite
  // any absolute redirect back to a same-origin path so the browser stays on the
  // public domain instead of bouncing to the origin host.
  const respHeaders = new Headers(upstream.headers);
  const location = respHeaders.get("location");
  if (location && location.startsWith(origin)) {
    respHeaders.set("location", location.slice(origin.length) || "/");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
};
