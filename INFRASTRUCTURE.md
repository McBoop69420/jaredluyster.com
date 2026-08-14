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
  - Routes: `news.jaredluyster.com` → `localhost:8213`, `radio.jaredluyster.com` → `localhost:8081`
- **Player page:** `radio.html` (static, served via Render from site root)

### 4. McBoop Newspaper — Self-hosted (Cloudflare Access + Tunnel)

- **Host:** Self-hosted on `localhost:8213` behind Cloudflare Tunnel
- **URL:** `https://news.jaredluyster.com`
- **Access control:** Behind **Cloudflare Access** (requires authentication — redirects to `cloudflareaccess.com` login)
- **Verified via HTTP headers:** `Www-Authenticate: Cloudflare-Access`, `Set-Cookie: CF_AppSession=...`

### 5. McBoop Sports — Cloudflare-hosted (Cloudflare Access)

- **URL:** `https://sports.jaredluyster.com` ("McBoop Sports — Live")
- **Host:** Served **directly on Cloudflare** (Pages/Worker — proxied edge origin). **Not** the tunnel and **not** Render. Assets live under `/sports/` (`sports.css`, `sports.js`).
- **Content:** Live scoreboards and standings pulled **client-side from ESPN's public API** (`site.api.espn.com`) for the leagues Jared follows (MLB, MLS, Liga MX, Premier League, La Liga, Bundesliga, Serie A, Ligue 1, UCL, UEL, Eredivisie, Primeira Liga, Scottish Prem, Super Lig, NWSL, USL, NFL). Also includes a "Paper Bets — Live / Hermes experiment log" panel.
- **Origin/source:** Part of the **hermes** system (source resembles `.codex-tmp/hermes-audit/public/sports/`). Deployed to Cloudflare (likely a dashboard-connected Pages/Git integration — no local Wrangler token or `wrangler.toml` for it on this machine).
- **Access control:** Behind **Cloudflare Access**, in the **same Zero Trust org as news** (`quiet-frost-ed57.cloudflareaccess.com`), but a **separate Access application** with its own policy/allow-list — **independently editable** from news (distinct app `aud`, so editing one list never affects the other).
- **Verified via HTTP headers (2026-07-29):** `302 Found` → `Location: https://quiet-frost-ed57.cloudflareaccess.com/cdn-cgi/access/login/sports.jaredluyster.com`, `Www-Authenticate: Cloudflare-Access`, `Set-Cookie: CF_AppSession=...`. (Allow-list *contents* are managed in the Zero Trust dashboard and not externally verifiable.)

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

- `news.jaredluyster.com` → McBoop newspaper (port 8213, behind Cloudflare Access)
- `radio.jaredluyster.com` → Radio service (port 8081, public)

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
| `radio.jaredluyster.com` | Radio stream + player | Self-hosted (Cloudflare Tunnel) |
| `news.jaredluyster.com` | McBoop newspaper | Self-hosted (Cloudflare Tunnel + Access) |
| `sports.jaredluyster.com` | McBoop Sports (live scores) | Cloudflare-hosted (Pages/Worker) + Access |
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