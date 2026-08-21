# jaredluyster.com — Infrastructure Overview

## Repository

- **GitHub:** `McBoop69420/jaredluyster.com` (public)
- **Remote:** `https://github.com/McBoop69420/jaredluyster.com.git`
- **Default branch:** `main`
- **Local working copy (active):** `%USERPROFILE%\Documents\jaredluyster.com`
- **Local clean copy:** `%USERPROFILE%\Projects\jaredluyster.com` (clean, matches HEAD)

## Deployment Architecture

The site is a **hybrid deployment** — two hosting mechanisms under one domain umbrella:

### 1. Homepage + Marketplace — Render (Flask, dynamic)

**This is the primary hosting.** The `jaredluyster.com` domain and `shop.jaredluyster.com` subdomain are both served by a single Render Flask service.

- **Host:** Render (Python web service)
- **Config:** `render.yaml` in repo root
  - Runtime: Python 3.11.11
  - Build: `pip install -r requirements.txt`
  - Start: `cd marketplace && waitress-serve --host=0.0.0.0 --port=$PORT server:app`
  - Requirements: `flask`, `waitress`, `gunicorn`, `requests`, `werkzeug`, `libsql`
- **App:** `marketplace/server.py` (Flask app — ~1430 lines on `main`, including PayPal checkout)
- **Database:** SQLite local (`marketplace.db`) or Turso (via `TURSO_DATABASE_URL` env var)
- **Templates:** `marketplace/templates/` (admin.html, base.html, cart.html, login.html, orders.html, forgot_password.html, reset_password.html)
- **Static assets:** `marketplace/index.html` (shop front), `marketplace/inventory.json`, `marketplace/lands.json`
- **Subdomain:** `shop.jaredluyster.com` (redirects to `/marketplace/`)
- **Admin email:** `jared.luyster@gmail.com` (auto-admin on signup)

**Verified via HTTP headers:**
- `jaredluyster.com` → `Server: cloudflare`, `x-render-origin-server: waitress`, `rndr-id: ...` (Render)
- `shop.jaredluyster.com` → same Render headers, 302 redirect to `/marketplace/`
- `jaredluyster.com/radio.html` → served by Render (same `x-render-origin-server: waitress`)

**Flask routes (from server.py):**
- `GET /` → serves `index.html` (homepage) if host doesn't start with `shop.`, otherwise redirects to `/marketplace/`
- `GET /<path:filename>` → serves static files from site root (radio.html, shared-theme.css, etc.)
- `GET /marketplace/` → serves marketplace index.html
- `GET /marketplace/inventory.json` → serves inventory
- `GET /marketplace/login` → login page
- `GET /marketplace/cart` → cart page
- `GET /marketplace/orders` → order history (login required)
- `GET /marketplace/admin` → admin dashboard (admin required)
- Plus API endpoints for auth, cart, orders, admin, and PayPal

### 1b. Bluegrass Cube Staging — Cloudflare Pages (static, separate project)

- **Purpose:** Staging/working area for Bluegrass Cube group content (cube options, lists, etc.), separate from the live `bluegrasscube.com` site.
- **Host:** A dedicated Cloudflare Pages project (not Render, not GitHub Pages — this repo's GitHub Pages slot is already used by `docs/` → `wizardbattle.jaredluyster.com`, and GitHub only allows one custom domain per repo). Same category of hosting as `sports.jaredluyster.com`.
- **Files served from:** `bluegrasscube/` directory in repo root (currently just `index.html`, placeholder content).
- **Subdomain:** `bluegrasscube.jaredluyster.com`
- **Setup required (not yet done as of this writing):**
  1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `McBoop69420/jaredluyster.com`.
  2. Build settings: Framework preset **None**, build command *(empty)*, root/output directory **`bluegrasscube`**.
  3. Deploy, then add `bluegrasscube.jaredluyster.com` as a custom domain on that Pages project (dashboard walks through the DNS record — no manual CNAME needed since Cloudflare manages it automatically for Pages custom domains on a zone it already controls).
- **Caching gotcha:** Cloudflare Pages defaults static assets (`.css`, `.js`) to a 24h
  edge+browser cache (`Cache-Control: public, max-age=86400`) and does **not** purge it
  on redeploy — HTML updates instantly but a stylesheet can keep serving an
  hours-old cached copy after a push. `bluegrasscube/_headers` requests
  `max-age=0, must-revalidate` for `.css`/`.js`, but Cloudflare Pages appears to floor
  this at `max-age=14400` (4h) regardless — confirmed via curl 2026-08-14, the origin
  still returned 14400 even fresh from a cache MISS. **The header alone is not enough.**
  When `board.css` changes, bump the query string on its `<link>` in `index.html`
  (`board.css?v=1` → `?v=2`, etc.) — that's a brand-new cache key, so it's guaranteed
  to bypass any stale edge copy immediately rather than waiting up to 4h.

### 1c. BCS Staging — Cloudflare Pages (static, separate repo)

- **Purpose:** Staging/preview environment for the Bluegrass Cybersecurity Solutions
  marketing site, so changes can be reviewed before they go live on
  `www.bluegrasscybersecurity.com`.
- **Not served from this repo.** Source lives entirely in the separate
  `McBoop69420/bcs-website` repo (local clone: `%USERPROFILE%\Projects\bcs-website`),
  the same repo that also deploys production via GitHub Pages + a Cloudflare Worker
  (see `bcs-website/cloudflare/CLOUDFLARE-SETUP.md` in that repo). This repo's old
  `bcs/` folder (an internal documentation roadmap page, unrelated to the marketing
  site) was retired 2026-08-18 once that roadmap hit 247/247 documents complete — its
  final state is preserved in this repo's git history, not on the live domain.
- **Subdomain:** `bcs.jaredluyster.com` — now a Cloudflare Pages project connected
  directly to `McBoop69420/bcs-website` (Git integration, auto-deploys on push to that
  repo's `main`), **not** a project connected to this repo.
- **Indexing:** `bcs-website/_headers` sends `X-Robots-Tag: noindex, nofollow` on `/*`.
  That header is Cloudflare-Pages-only — GitHub Pages (production) ignores `_headers`
  entirely, so it has zero effect on `www.bluegrasscybersecurity.com`.
- **Known gap:** the signup/contact API (`/api/signup`) is served by a Cloudflare
  Worker whose routes are bound only to the `bluegrasscybersecurity.com` zone
  (`bcs-website/cloudflare/wrangler.toml`). On `bcs.jaredluyster.com` (a different
  zone) that route doesn't exist, so the signup/contact forms will fail there —
  staging is for visual/content review, not full end-to-end form testing.
- **Setup (Cloudflare dashboard, one-time):**
  1. Remove `bcs.jaredluyster.com` as a custom domain from the *old* Pages project
     (the one connected to this repo's now-deleted `bcs/` folder), or delete that
     project outright if nothing else uses it.
  2. Workers & Pages → Create → Pages → Connect to Git → `McBoop69420/bcs-website`.
  3. Build settings: Framework preset **None**, build command *(empty)*, root/output
     directory **`/`** (repo root).
  4. Deploy, then add `bcs.jaredluyster.com` as a custom domain on that new project.

### 2. Wizard Battle Site — GitHub Pages (static)

- **Host:** GitHub Pages
- **CNAME:** `docs/CNAME` → `wizardbattle.jaredluyster.com`
- **GitHub Pages source:** `docs/` directory on `main` branch
- **HTTPS:** Enforced, certificate approved (expires 2026-10-12)
- **Verified via HTTP headers:** `Server: GitHub.com`, `X-Served-By: cache-cmh1290026-CMH`

**Files served from `docs/`:** Wizard Battle site (`docs/index.html`, `docs/atlas.html`, `docs/cards.html`, etc.)

### 3. Radio Service — Self-hosted (private repo + Cloudflare Tunnel)

- **Repo:** `McBoop69420/radio-service` (private)
- **Stream:** `https://radio.jaredluyster.com/stream.mp3`
- **Status JSON:** `https://radio.jaredluyster.com/status.json` (currently showing Youth Fountain - Take One Capusle A Day)
- **Art endpoint:** `https://radio.jaredluyster.com/art/now`
- **Tunnel:** Cloudflare Tunnel (`~/.cloudflared/config.yml`)
  - Tunnel ID: `<TUNNEL_ID>`
  - Routes: `radio.jaredluyster.com` → `localhost:8081` (the `news.jaredluyster.com` route in this file is legacy/unused — see §4, news is Pages-hosted, not tunneled)
- **Player page:** `radio.html` (static, served via Render from site root)

### 4. McBoop Newspaper + McBoop Sports — Cloudflare Pages (single project, two custom domains)

**Corrected 2026-08-21** — both `news.jaredluyster.com` and `sports.jaredluyster.com` are the
**same Cloudflare Pages project** (`mcboop-daily`), not separate hosts, and not the
Cloudflare Tunnel. Confirmed via `public/_worker.js` (a Pages Functions worker that
special-cases `url.hostname === "sports.jaredluyster.com"` to serve `/sports/*`, and
falls through to `env.ASSETS.fetch` — i.e. `public/index.html` — for everything else,
which is what serves `news.jaredluyster.com`) and via `.claude/launch.json`'s
`news-preview` config, which points at the real local project root.

- **Local project root:** `C:\Users\Jared\McBoop Newspaper\` (NOT in this repo — a
  separate, non-git-tracked directory containing the content-generation pipeline:
  `generate.py`, `archive.py`, `jsonize.py`, `export_betting_tracker.py`, betting
  tracker data, RSS/odds scraping scripts, etc.)
- **Deployable site shell — moved into this repo 2026-08-21**, matching every other
  subdomain's pattern (source lives in the git repo, not hand-edited in a deploy
  scratch directory):
  - [`news/`](news/index.html) — `index.html`, `app.css`, `app.js`, `robots.txt`,
    and `_worker.js` (the Pages Worker/router described above — also handles the
    `/api/feeds` and `/api/odds` proxy endpoints and the sports.jaredluyster.com
    routing, so it governs both domains even though it lives under `news/`)
  - [`sports/`](sports/index.html) — `index.html`, `sports.css`, `sports.js`,
    `robots.txt` (self-contained scoreboard page; fetches ESPN's public API
    client-side — see below)
- **Deploy pipeline:** two Hermes cron jobs (`McBoop Daily — Morning` 7:30a,
  `McBoop Daily — Evening` 8p, defined inside the Hermes session — only fire if
  Hermes is open) run `cd "C:\Users\Jared\McBoop Newspaper" && python3 generate.py
  edition.md && bash deploy-pages.sh`. `deploy-pages.sh` copies the shell fresh
  from this repo's `news/` and `sports/` into a local `public/` staging dir,
  layers in generated data (`edition.json`, `calendar.json`, `archive/` gallery,
  `sports/fake-bets.json`), then runs `wrangler pages deploy public
  --project-name mcboop-daily` (token in `~/.config/cloudflare_pages_token.txt`).
  **Editing `news/` or `sports/` in this repo does nothing live until the next
  cron run (or a manual `bash deploy-pages.sh`) actually deploys it** — unlike
  Render/GitHub Pages, there's no git-push-triggered auto-deploy here.
- **Content:** News tab shell auto-refreshes from `edition.json`/`calendar.json`
  (regenerated per cron run) plus live RSS (`/api/feeds`) and MLB odds
  (`/api/odds`), both proxied through `_worker.js`. Sports page pulls live
  scoreboards/standings **client-side from ESPN's public API**
  (`site.api.espn.com`) for MLB, MLS, Liga MX, Premier League, La Liga,
  Bundesliga, Serie A, Ligue 1, UCL, UEL, Eredivisie, Primeira Liga, Scottish
  Prem, Super Lig, NWSL, USL, NFL, plus a "Paper Bets — Live" panel fed by
  `sports/fake-bets.json` (regenerated each deploy by `export_betting_tracker.py`).
- **Access control — news:** Behind **Cloudflare Access** (redirects to
  `quiet-frost-ed57.cloudflareaccess.com` login). `deploy-pages.sh` also does a
  post-deploy live check against news.jaredluyster.com via a Cloudflare Access
  Service Token (`~/.config/cloudflare_news_access.txt`).
- **Access control — sports:** Behind **Cloudflare Access**, same Zero Trust org
  as news, but a **separate Access application** with its own policy/allow-list —
  independently editable from news (distinct app `aud`).
- **Verified via HTTP headers (2026-07-29):** both hosts `302 Found` →
  `.../cdn-cgi/access/login/<host>`, `Www-Authenticate: Cloudflare-Access`,
  `Set-Cookie: CF_AppSession=...`. (Allow-list *contents* are managed in the
  Zero Trust dashboard and not externally verifiable.)

## Cloudflare Tunnel Configuration

File: `%USERPROFILE%\.cloudflared\config.yml`

```yaml
tunnel: <TUNNEL_ID>
credentials-file: %USERPROFILE%\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: news.jaredluyster.com
    service: http://localhost:8213
  - hostname: radio.jaredluyster.com
    service: http://localhost:8081
  - service: http_status:404
```

- `radio.jaredluyster.com` → Radio service (port 8081, public)
- The `news.jaredluyster.com` route above is **legacy/unused** — news is
  actually Cloudflare-Pages-hosted (see §4), not tunneled. `localhost:8213` is
  a LAN-only local mirror (`serve.py` in `C:\Users\Jared\McBoop Newspaper\`,
  launched by `start-server.bat` from the Windows Startup folder) that the
  public domain does not depend on.

## Directory Structure

```
jaredluyster.com/
├── index.html              # Homepage (served by Render Flask from site root)
├── radio.html              # Radio player page (served by Render Flask from site root)
├── shared-theme.css        # Shared styles (homepage + radio)
├── render.yaml             # Render deployment config
├── requirements.txt        # Python deps for Render
├── .gitignore              # Ignores .env, __pycache__, *.db, Caddyfile
├── docs/                   # Wizard Battle site (GitHub Pages, CNAME: wizardbattle.jaredluyster.com)
│   ├── CNAME               # → wizardbattle.jaredluyster.com
│   ├── .nojekyll
│   ├── index.html          # Wizard Battle landing page
│   ├── atlas.html          # Wiki (markdown-rendered design bibles)
│   ├── cards.html          # Card reference
│   ├── type-chart.html     # Type matchup chart
│   ├── icon-reference.html # Icon reference
│   ├── keywords.html       # Keyword reference
│   ├── logo-palette.html   # Logo color palette
│   ├── download.html       # Download links
│   ├── shared-theme.css    # Wizard Battle theme
│   ├── reference-pages.css # Wiki page styles
│   ├── cards-data.js       # Card data
│   ├── compass.js          # Compass rendering
│   ├── event-nodes.jsx     # Event node data
│   ├── icons.jsx           # Icon definitions
│   ├── marks.jsx           # Mark definitions
│   ├── tagify.js           # Tag input library
│   ├── master-sigil.svg    # Logo asset
│   ├── wordmark-*.svg      # Logo wordmarks
│   ├── TypeIcons/          # Type icon PNGs (8 elements)
│   └── Bibles/             # Design bibles (markdown)
│       ├── README.md
│       ├── classes.md
│       ├── spells.md
│       ├── enemies.md
│       ├── status-effects.md
│       ├── type-matchups.md
│       ├── card-mechanics.md
│       ├── game-systems.md
│       ├── map-and-progression.md
│       ├── starting-decks.md
│       ├── ui-and-design.md
│       ├── world-and-lore.md
│       └── HTML_STYLING_GUIDE.md
├── marketplace/            # Flask marketplace app (Render)
│   ├── server.py           # Main Flask app (~1430 lines, incl. PayPal checkout)
│   ├── store.py            # Database layer (SQLite/Turso)
│   ├── inventory.json      # Card inventory
│   ├── lands.json          # Basic lands inventory
│   ├── publish.py          # Inventory publish script
│   ├── batch_add.py        # Batch inventory add
│   ├── start_server.bat    # Local dev server launcher
│   ├── requirements.txt    # marketplace-specific deps
│   └── templates/
│       ├── admin.html      # Admin dashboard
│       ├── base.html       # Base template
│       ├── cart.html       # Shopping cart
│       ├── login.html      # Login page
│       ├── orders.html     # Order history
│       ├── forgot_password.html
│       └── reset_password.html
├── bluegrasscube/          # Bluegrass Cube staging site (Cloudflare Pages: bluegrasscube.jaredluyster.com)
├── news/                   # News site shell (Cloudflare Pages project "mcboop-daily": news.jaredluyster.com)
│   ├── index.html          # News UI shell (reads edition.json/calendar.json via app.js)
│   ├── app.css             # News site styles
│   ├── app.js              # News UI logic (tabs, live weather/feed/calendar rendering)
│   ├── _worker.js          # Pages Worker: routes sports.jaredluyster.com to /sports/*, proxies /api/feeds + /api/odds
│   └── robots.txt
├── sports/                 # Sports scoreboard site (same Pages project, routed via news/_worker.js: sports.jaredluyster.com)
│   ├── index.html
│   ├── sports.css
│   ├── sports.js           # Fetches ESPN's public API client-side
│   └── robots.txt
├── card-designer/          # Card designer tool
├── Colors/                 # Color assets
├── Sumpthin/               # Sumpthin project
├── dropoutcube/            # Dropoutcube project
├── bcs-logo*.png           # BCS logo assets
├── bmc-logo*.png           # BMC logo assets
├── wizard-battle-logo.svg  # Wizard Battle logo
├── wizard-hat.png          # Wizard hat asset
└── Logo Notes.png          # Logo design notes
```

## PayPal Checkout (merged)

PayPal checkout is **merged on `main`** (PR #2, `codex/paypal-checkout`).

### `marketplace/server.py`
- Config comes from **environment variables** — `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYPAL_CURRENCY` — resolved by `_paypal_config()`. Note these are env vars, *not* admin settings.
- `_paypal_access_token()` with a thread-locked token cache (`_paypal_token_lock` / `_paypal_token_cache`), and `_paypal_api_request()` as the generic API helper.
- Helpers: `_valid_paypal_id()`, `_paypal_purchase_unit()`, `_completed_paypal_capture()`, `_paypal_sdk_url()`.
- `_send_order_confirmation_email()` takes a `payment_method` param (cash vs PayPal).

### `marketplace/store.py`
- Order columns `payment_method`, `payment_status`, `paypal_order_id`; `create_order()` accepts PayPal params; `get_order_by_paypal_order_id()` lookup.

### Templates
- `admin.html` — payment method badges on orders, cancel warning for PayPal orders
- `cart.html` — PayPal button integration, payment method selector
- `orders.html` — payment method badges

> **Superseded WIP:** an earlier, competing PayPal implementation (982-line `server.py`, configured via *admin settings* rather than env vars — `_paypal_settings()`/`_paypal_api_base()`/`_paypal_create_order()`/`_paypal_capture_order()`) was abandoned in favour of the merged version above. Archived on 2026-08-02 as `%USERPROFILE%\Documents\jaredluyster-paypal-wip-2026-08-02.patch`.

## Key URLs

| URL | Service | Host |
|-----|---------|------|
| `jaredluyster.com` | Homepage + static assets | Render (Flask) |
| `jaredluyster.com/radio.html` | Radio player page | Render (Flask) |
| `jaredluyster.com/marketplace/` | Marketplace | Render (Flask) |
| `wizardbattle.jaredluyster.com` | Wizard Battle site | GitHub Pages (docs/) |
| `shop.jaredluyster.com` | Marketplace (redirect) | Render (Flask) |
| `bluegrasscube.jaredluyster.com` | Bluegrass Cube staging | Cloudflare Pages (separate project) — not yet created |
| `bcs.jaredluyster.com` | BCS marketing site staging | Cloudflare Pages, connected to `bcs-website` repo (separate project) |
| `radio.jaredluyster.com` | Radio stream + player | Self-hosted (Cloudflare Tunnel) |
| `news.jaredluyster.com` | McBoop newspaper | Cloudflare Pages project `mcboop-daily` (source: `news/` in this repo) + Access |
| `sports.jaredluyster.com` | McBoop Sports (live scores) | Same Pages project `mcboop-daily`, routed via `news/_worker.js` (source: `sports/` in this repo) + Access |
| `bluegrasscybersecurity.com` | BCS website | Separate (Namecheap) |

## How to Work With This Repo

### Local development
1. **Homepage/Wizard Battle (static):**
   - Homepage: Edit `index.html`, `radio.html`, `shared-theme.css` in repo root — push to `main`, Render auto-deploys
   - Wizard Battle: Edit files in `docs/` — push to `main`, GitHub Pages auto-deploys
2. **Marketplace (Flask):**
   - Local: `cd marketplace && python server.py` (port 5000)
   - Production: Push to `main`, Render auto-deploys from `render.yaml`
3. **Radio service:** Separate private repo (`McBoop69420/radio-service`)

### Deployment triggers
- **GitHub Pages (Wizard Battle):** Push to `main` branch (`docs/` directory)
- **Render (Homepage + Marketplace):** Push to `main` branch (auto-deploys from `render.yaml`)
- **Cloudflare Tunnel (Radio + News):** Runs locally via `cloudflared` (radio is public, news is behind Cloudflare Access)

### Git workflow
- Working copy: `%USERPROFILE%\Documents\jaredluyster.com` (active)
- Clean copy: `%USERPROFILE%\Projects\jaredluyster.com`
- Both point to the same remote: `origin = https://github.com/McBoop69420/jaredluyster.com.git`