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

  const root = SUBDOMAIN_ROOTS[url.hostname.split(".")[0].toLowerCase()];
  if (root && !path.startsWith(`${root}/`) && path !== root) {
    const rewritten = new URL(url);
    rewritten.pathname = path === "/" ? `${root}/` : root + url.pathname;
    return context.next(new Request(rewritten, context.request));
  }

  return context.next();
};
