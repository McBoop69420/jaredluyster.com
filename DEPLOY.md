# Deployment — Cloudflare migration

## Where things run

| Layer | Host | Notes |
|---|---|---|
| Static site + tools (`index.html`, `atlas.html`, `card-designer/`, `dropoutcube/`, images…) | **Cloudflare Pages** | Served straight from the repo root, no build step. |
| Marketplace backend (`/marketplace/*`) | **Render** (Flask) | Reached via the Pages Function in `functions/marketplace/[[path]].ts`, which reverse-proxies to `MARKETPLACE_ORIGIN`. |
| Database | **Turso** (libsql) | Set on the Render service via `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. |

This is **Phase 1**: everything static is on Cloudflare, and the store keeps working
unchanged behind a proxy. **Phase 2** replaces the Render/Flask backend with a native
Cloudflare Worker + D1 + Resend, at which point the proxy Function is swapped for the
Worker and Render/Turso are retired.

## One-time Cloudflare Pages setup

1. **Create the Pages project** — Cloudflare dashboard → Workers & Pages → Create → Pages →
   Connect to Git → `McBoop69420/jaredluyster.com`.
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: **`/`**
2. **Set the backend origin** — Pages project → Settings → Environment variables →
   add `MARKETPLACE_ORIGIN` = your Render URL (confirm it in the Render dashboard;
   likely `https://jaredluyster-com.onrender.com`). This overrides the default in
   `wrangler.toml`.
3. **Deploy** — the first push builds the project. To deploy from the CLI instead:
   ```bash
   npx wrangler pages deploy .
   ```

## Tool subdomains (roto.jaredluyster.com)

Tools live as folders in the repo (`roto/`, `card-designer/`, `dropoutcube/`…) and are
reachable at `/<folder>/`. To also serve one from its own subdomain:

1. Add the hostname to `SUBDOMAIN_ROOTS` in `functions/_middleware.ts`
   (`roto` → `/roto` is already there). The middleware rewrites requests on that
   hostname so `roto.jaredluyster.com/` serves `roto/index.html`.
2. Pages project → **Custom domains** → add `roto.jaredluyster.com`. Cloudflare
   creates the CNAME for you since the zone is already on Cloudflare.
3. No build change is needed — the folder is static and ships with the root deploy.

The path form (`jaredluyster.com/roto/`) keeps working, so the subdomain is additive
and safe to roll back by removing the custom domain.

## Roto multiplayer (the DraftRoom Durable Object)

Roto's "draft with friends" mode is served by a Durable Object. Solo drafting is
unaffected by any of this — it runs entirely in the browser and needs no backend.

**Order matters: deploy the Worker first.** The Pages binding references it by name and
resolves to nothing until it exists.

1. **Deploy the Worker that hosts the class.** Pages cannot define a Durable Object
   itself, only bind to one.
   ```bash
   npx wrangler deploy --config roto-worker/wrangler.toml
   ```
   It has `workers_dev = false`, so it is not publicly reachable — the only way in is the
   Pages binding.

2. **Bind it to the Pages project.** `[[durable_objects.bindings]]` in the root
   `wrangler.toml` covers `wrangler pages dev` and `wrangler pages deploy`. For the
   dashboard-managed production project, also add it under
   **Settings → Bindings → Durable Object**: variable `DRAFT_ROOM`, class `DraftRoom`,
   from the `roto-draft-room` Worker. `script_name` is *required* for Pages bindings —
   it is optional only when one Worker binds another.

3. **Deploy Pages as usual.** No build step changes.

The class uses the **SQLite** storage backend (`new_sqlite_classes` in the migration),
which is the variant available on the Workers Free plan; key-value backed Durable Objects
require a paid plan. Rooms hold their own state, so there is no D1 database to provision.

### Running it locally

Two processes — the second connects to the first through the local service registry:

```bash
npx wrangler dev --config roto-worker/wrangler.toml --port 8787
```
```bash
npx wrangler pages dev . --port 8788 --do DRAFT_ROOM=DraftRoom@roto-draft-room
```

Then open `http://127.0.0.1:8788/roto/`. The Pages output should list
`env.DRAFT_ROOM (DraftRoom, defined in roto-draft-room) … [connected]`; if it says
`[not connected]`, the Worker process is not running.

### Two things to re-check after any middleware change

- **The WebSocket upgrade.** `functions/_middleware.ts` rebuilds the Request to rewrite
  subdomains, which strips a WebSocket upgrade. It returns early for
  `Upgrade: websocket` — if that guard is removed, multiplayer breaks while everything
  else keeps working.
- **`/roto-worker/*` must 404.** Pages serves the repo root, so without the prefix guard
  in the same file the Worker's source would be downloadable at
  `jaredluyster.com/roto-worker/room.js`.

### Rollback

Multiplayer is additive. Removing the binding (or leaving the Worker undeployed) makes
"Draft with friends" fail at room creation while solo drafting continues to work.

## DNS cutover (do this when you're ready to go live on Cloudflare)

The domain currently points at Render (`216.24.57.x`). To move the front door to Cloudflare:

1. Add `jaredluyster.com` as a **custom domain** on the Pages project (dashboard →
   the project → Custom domains). Cloudflare walks you through the DNS record.
2. Add `www.jaredluyster.com` as a second custom domain, then create a **Redirect Rule**
   (`www.jaredluyster.com/*` → `https://jaredluyster.com/$1`, 301) to preserve the old
   Caddy `www → apex` behavior.
3. Leave the Render service running — the proxy Function depends on it. Do **not** remove
   `jaredluyster.com` from Render's custom domains until you've confirmed the store works
   through Cloudflare (the Function reaches Render by its `onrender.com` hostname, so this
   is just belt-and-suspenders).

**Verify after cutover:** load the homepage, click through to `/marketplace/`, log in,
add to cart, and place a test order. Cookies/sessions must persist (they ride through the
proxy). If a password-reset email shows the wrong domain, confirm the Render service has
picked up the `X-Forwarded-Host` change in `marketplace/server.py`.

**Rollback:** point the apex DNS back at Render (or lower Cloudflare to DNS-only). Because
Render still serves the full site, this is an instant revert.

## Phase 2 (later) — retire Render

- Rewrite `marketplace/server.py` as a TypeScript Worker (Hono), backed by **D1**.
- Move `inventory.json` / `lands.json` into D1 tables (removes the file-lock race).
- Sessions/cart → signed cookie or KV; email → **Resend** (HTTP, since Workers can't SMTP).
- Port the PayPal create/capture flow — it's just HTTPS calls to PayPal, so it maps cleanly
  to a Worker; PayPal + Resend credentials become Worker **secrets**.
- Delete the proxy Function, `render.yaml`, and `requirements.txt` once the Worker is live.
