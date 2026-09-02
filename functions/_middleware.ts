// Root middleware: keep infra/config files that live at the repo root from being
// served as static assets by Pages, and map tool subdomains onto their folders.

const HIDDEN = new Set([
  "/wrangler.toml",
  "/render.yaml",
  "/requirements.txt",
  "/.gitignore",
  "/caddyfile",
]);

// Source that lives in the repo but must never be served. Pages serves the repo root
// (pages_build_output_dir = "."), so the Worker sources would otherwise be public URLs.
const HIDDEN_PREFIXES = ["/roto-worker/"];

// <subdomain>.jaredluyster.com serves the matching repo folder at the root path.
const SUBDOMAIN_ROOTS: Record<string, string> = {
  roto: "/roto",
  wintergreen: "/wintergreen",
};

// Assets that live at the repo root and are shared by the tools. A tool page links these
// as ../shared-theme.css, which resolves to /shared-theme.css — and on a subdomain the
// rewrite below would send that into the tool's own folder, where it does not exist.
// Pages then serves index.html for the miss with a 200 and text/html, so the stylesheet
// is silently dropped rather than 404ing. These pass through unrewritten instead.
const SHARED_ROOT_ASSETS = new Set(["/shared-theme.css"]);

// Record-detail pages (e.g. wintergreen product pages) share one template file per entity
// type instead of one static file per record, since the catalog is JSON-driven
// (wintergreen/data/*.json) rather than hand-authored per page. A request for
// /wintergreen/products/<id>/ is rewritten to the shared template's directory; the
// template's own JS reads the id back out of the still-unrewritten client-visible URL.
// Rewrite to the directory (trailing slash), NOT ".../index.html" directly — Pages' asset
// server 308-redirects an explicit "index.html" path back to its directory form, which
// would drop the rewrite. The directory form resolves straight to that index.html with no
// redirect since it's each template's own real path. Add an entry here when another entity
// type (locations, collections, designers) gets a detail page too.
const DETAIL_PAGE_TEMPLATES: Record<string, string> = {
  "/wintergreen/products/": "/wintergreen/products/",
  "/wintergreen/locations/": "/wintergreen/locations/",
  "/wintergreen/collections/": "/wintergreen/collections/",
  "/wintergreen/designers/": "/wintergreen/designers/",
};

export const onRequest = async (context: {
  request: Request;
  next: (input?: Request) => Promise<Response>;
}): Promise<Response> => {
  const url = new URL(context.request.url);
  const path = url.pathname.toLowerCase();

  if (
    HIDDEN.has(path) ||
    HIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    path.endsWith("/server.py") ||
    path.endsWith("/store.py") ||
    path.endsWith(".test.js") ||
    path.includes("/tests/")
  ) {
    return new Response("Not found", { status: 404 });
  }

  // A WebSocket upgrade must reach its Function untouched. Rebuilding the Request below
  // would strip the upgrade, so hand these straight through — /roto/api/* is already an
  // absolute path and needs no subdomain rewrite anyway.
  if (context.request.headers.get("Upgrade") === "websocket") {
    return context.next();
  }

  let rewritten: URL | null = null;

  const root = SUBDOMAIN_ROOTS[url.hostname.split(".")[0].toLowerCase()];
  if (root && !SHARED_ROOT_ASSETS.has(path) && !path.startsWith(`${root}/`) && path !== root) {
    rewritten = new URL(url);
    rewritten.pathname = path === "/" ? `${root}/` : root + url.pathname;
  }

  const effectivePath = (rewritten ?? url).pathname.toLowerCase();
  const detailPrefix = Object.keys(DETAIL_PAGE_TEMPLATES).find(
    (prefix) =>
      effectivePath.startsWith(prefix) &&
      effectivePath !== prefix &&
      !effectivePath.slice(prefix.length).replace(/\/$/, "").includes("/"),
  );
  if (detailPrefix) {
    rewritten = rewritten ?? new URL(url);
    rewritten.pathname = DETAIL_PAGE_TEMPLATES[detailPrefix];
  }

  if (rewritten) {
    return context.next(new Request(rewritten, context.request));
  }

  return context.next();
};
