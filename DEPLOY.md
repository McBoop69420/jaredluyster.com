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

## Tool subdomains (roto.jaredluyster.com, wintergreen.jaredluyster.com)

Tools live as folders in the repo (`roto/`, `card-designer/`, `dropoutcube/`,
`wintergreen/`…) and are reachable at `/<folder>/`. To also serve one from its own
subdomain:

1. Add the hostname to `SUBDOMAIN_ROOTS` in `functions/_middleware.ts`
   (`roto` → `/roto` and `wintergreen` → `/wintergreen` are already there). The
   middleware rewrites requests on that hostname so `roto.jaredluyster.com/` serves
   `roto/index.html` (and likewise for wintergreen).
2. Pages project → **Custom domains** → add `<name>.jaredluyster.com`. Cloudflare
   creates the CNAME for you since the zone is already on Cloudflare.
3. No build change is needed — the folder is static and ships with the root deploy.

The path form (`jaredluyster.com/roto/`) keeps working, so the subdomain is additive
and safe to roll back by removing the custom domain.

## Social Asset Studio (social.jaredluyster.com)

A personal tool for crafting and storing social graphics (per-project templates, a canvas
editor, an asset library) for every project in this ecosystem. Static frontend in `social/`
following the tool-subdomain pattern above (`social` is in `SUBDOMAIN_ROOTS`), plus one
piece of real backend: an R2 bucket for the library, reached through
`functions/social/api/[[path]].ts`.

**One-time setup — all done 2026-09-16:**

1. ~~Create the bucket~~ — done: `jaredluyster-social-assets` exists (R2 free-tier
   subscription added to the account first, since this account had never used R2 before).
2. ~~Add the binding~~ — **turned out to need no manual dashboard step.** This Pages
   project's bindings are managed entirely through the root `wrangler.toml` (the dashboard
   says so directly: "Bindings for this project are being managed through wrangler.toml" —
   the "Add" button under Settings -> Bindings is disabled). Pushing the `[[r2_buckets]]`
   block to `main` was enough; the next deploy provisioned `SOCIAL_ASSETS` automatically,
   the same way `sports/wrangler.toml` drives that project's build config (§4b in
   INFRASTRUCTURE.md). The `DRAFT_ROOM` Durable Object binding documented above must have
   been added the same way, not by hand — the dashboard has never actually supported adding
   a binding here independent of the file.
3. ~~Add the custom domain~~ — done: `social.jaredluyster.com` is a custom domain on the
   `jaredluyster-com` Pages project, same CNAME-to-`.pages.dev` pattern as
   `roto`/`wintergreen`.
4. ~~Put it behind Cloudflare Access~~ — done: a `social` self-hosted Access application
   (destination `social.jaredluyster.com`) reuses the same "Only Me" policy
   (`e664394b-54a3-4cd4-bc10-18b5f4b90c5b`) as `news`/`sports`/`calendar` — same Zero Trust
   org, independently editable per-app like the others. The API in
   `functions/social/api/[[path]].ts` still has no auth of its own; Access is what gates it,
   at the edge, before a request ever reaches the Function.

Verified live end-to-end 2026-09-16: saved a design from the editor, watched it land in the
library grid backed by the real R2 bucket, deleted it, confirmed the grid went back to
"Nothing saved yet." Verified Access separately via `curl`: an unauthenticated request gets
`302` to `quiet-frost-ed57.cloudflareaccess.com/cdn-cgi/access/login/social.jaredluyster.com`
with `Www-Authenticate: Cloudflare-Access` — same signature as the other gated subdomains.

## RedZone NCAAF board (redzone.jaredluyster.com)

A private, personal-use "whiparound" schedule board — ranks every live NCAAF game by how
close/urgent it is, whiparound-style, and shows which network each game is on. Static
frontend in `redzone/`, following the tool-subdomain pattern above (`redzone` is in
`SUBDOMAIN_ROOTS`). No backend: it fetches ESPN's public, CORS-open scoreboard API
(`site.api.espn.com`) client-side, the same endpoint `sports/sports.js` already relies on.

**Deliberately no video in this pass.** Network badges link out to that broadcaster's own
homepage (espn.com, foxsports.com, cbssports.com, etc.) — you sign in there with whatever
you already subscribe to. The board itself never streams, proxies, embeds, or rebroadcasts
any video, so there's no copyright exposure from this repo. A later pass could add iframe
embed slots using official embed codes from services you're personally authenticated to
(ESPN+, a TV-provider login, etc.) — that's a bigger, separate step and hasn't been built.

**One-time setup still needed (Cloudflare dashboard):**

1. Pages project (`jaredluyster-com`) → **Custom domains** → add
   `redzone.jaredluyster.com`, same as `roto`/`wintergreen`/`social`.
2. **Put it behind Cloudflare Access** — this is a *private* board, so don't skip this step.
   Zero Trust → Access → Applications → Add → self-hosted, destination
   `redzone.jaredluyster.com`, reuse the existing "Only Me" policy
   (`e664394b-54a3-4cd4-bc10-18b5f4b90c5b`) the same way `news`/`sports`/`calendar`/`social`
   do — same Zero Trust org, independently editable per-app.

Until both steps are done, the folder deploys with the rest of the site (reachable at
`jaredluyster.com/redzone/`, unauthenticated) but the subdomain won't resolve and nothing
is Access-gated yet.

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

### Room cleanup

A finished draft's room stays readable for 7 days (`CLEANUP_MS` in `room-core.js`), then
the Durable Object deletes its own storage on its next scheduled alarm and the room code
frees up. Anyone still connected gets a `roomClosed` frame first. There's no standing
cron for this — each room schedules its own cleanup alarm the moment it completes.

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
