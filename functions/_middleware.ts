// Root middleware: keep infra/config files that live at the repo root from being
// served as static assets by Pages. Everything else passes straight through.

const HIDDEN = new Set([
  "/wrangler.toml",
  "/render.yaml",
  "/requirements.txt",
  "/.gitignore",
  "/caddyfile",
]);

export const onRequest = async (context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const path = new URL(context.request.url).pathname.toLowerCase();
  if (HIDDEN.has(path) || path.endsWith("/server.py") || path.endsWith("/store.py")) {
    return new Response("Not found", { status: 404 });
  }
  return context.next();
};
