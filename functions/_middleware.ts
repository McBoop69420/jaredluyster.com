// Root middleware: keep infra/config files that live at the repo root from being
// served as static assets by Pages, and map tool subdomains onto their folders.

const HIDDEN = new Set([
  "/wrangler.toml",
  "/render.yaml",
  "/requirements.txt",
  "/.gitignore",
  "/caddyfile",
]);

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

  if (HIDDEN.has(path) || path.endsWith("/server.py") || path.endsWith("/store.py")) {
    return new Response("Not found", { status: 404 });
  }

  const root = SUBDOMAIN_ROOTS[url.hostname.split(".")[0].toLowerCase()];
  if (root && !path.startsWith(`${root}/`) && path !== root) {
    const rewritten = new URL(url);
    rewritten.pathname = path === "/" ? `${root}/` : root + url.pathname;
    return context.next(new Request(rewritten, context.request));
  }

  return context.next();
};
