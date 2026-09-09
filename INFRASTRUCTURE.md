# jaredluyster.com — Infrastructure Overview

## Repository

- **GitHub:** `McBoop69420/jaredluyster.com` (public)
- **Remote:** `https://github.com/McBoop69420/jaredluyster.com.git`
- **Default branch:** `main`
- **Local working copy (active):** `%USERPROFILE%\Documents\jaredluyster.com`
- **Local clean copy:** `%USERPROFILE%\Projects\jaredluyster.com` (clean, matches HEAD)

## Deployment Architecture

The site is a **hybrid deployment** — two hosting mechanisms under one domain umbrella:

### 1. Homepage — Render (Flask, dynamic)

**This is the primary hosting** for the `jaredluyster.com` domain.

- **Host:** Render (Python web service)
- **Config:** `render.yaml` in repo root
  - Runtime: Python 3.11.11
  - Build: `pip install -r requirements.txt`
  - Start: `waitress-serve --host=0.0.0.0 --port=$PORT app:app`
  - Requirements: `flask`, `waitress`, `gunicorn`, `werkzeug`
- **App:** `app.py` (repo root) — a minimal Flask app, two routes: `GET /` serves `index.html`, `GET /<path:filename>` serves any other static file from the repo root (`radio.html`, `shared-theme.css`, etc.)

**Verified via HTTP headers:**
- `jaredluyster.com` → `Server: cloudflare`, `x-render-origin-server: waitress`, `rndr-id: ...` (Render)
- `jaredluyster.com/radio.html` → served by Render (same `x-render-origin-server: waitress`)

**Retired subdomain:** `shop.jaredluyster.com` no longer serves anything as of 2026-09-06 — the
shop moved to `bluegrasstcg.online` (see below), and that subdomain (if DNS for it still
resolves) just falls through to this app's static-file catch-all, which 404s. The Cloudflare DNS
record and any Render custom-domain entry for it can be deleted next time someone's in those
dashboards; nothing depends on it anymore.

**2026-09-09: the marketplace/shop moved to its own repo and Render service.** It used to live
at `marketplace/` in this repo, sharing this Flask process with the homepage via host-based
routing (requests to `bluegrasstcg.online` got rewritten to `/marketplace/*` under the hood).
It's now a separate private repo, `McBoop69420/bluegrasstcg` (local clone:
`%USERPROFILE%\Documents\bluegrasstcg`), on its own Render service (`bluegrasstcg`) with its own
`render.yaml`, database credentials, and PayPal config — `marketplace/` no longer exists in this
repo, and this app (`app.py`) never served it. `bluegrasstcg.online` and
`www.bluegrasstcg.online` are custom domains on that separate service now, not this one. See
that repo for its own infrastructure notes.

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

### 4. McBoop Newspaper + Calendar — Cloudflare Pages (`mcboop-daily` project, Wrangler-CLI deployed)

**Reconciled 2026-09-06** — a live check of the Cloudflare account (`pages projects`
list + zone DNS records) shows `news.jaredluyster.com` and `calendar.jaredluyster.com`
(added 2026-09-06) are the same Cloudflare Pages project, `mcboop-daily`, deployed by
`wrangler pages deploy` (not Git-integrated — see below). **`sports.jaredluyster.com`
is NOT part of this project**, despite `news/_worker.js` containing hostname-routing
code that looks like it should serve it — that code was dead, and has been removed.
Sports has its own project and its own deploy mechanism; see §4b.

- **Local project root:** `C:\Users\Jared\McBoop Newspaper\` (NOT in this repo — a
  separate, non-git-tracked directory containing the content-generation pipeline:
  `generate.py`, `archive.py`, `jsonize.py`, `export_betting_tracker.py`, betting
  tracker data, RSS/odds scraping scripts, etc.)
- **Deployable site shell — moved into this repo 2026-08-21** (news) / **2026-09-06**
  (calendar), matching every other subdomain's pattern (source lives in the git repo,
  not hand-edited in a deploy scratch directory):
  - [`news/`](news/index.html) — `index.html`, `app.css`, `app.js`, `robots.txt`,
    and `_worker.js` (the Pages Worker/router — also handles the `/api/feeds`
    proxy endpoint and the calendar.jaredluyster.com hostname routing, so it
    governs both domains even though it lives under `news/`)
  - [`calendar/`](calendar/index.html) — `index.html`, `calendar.css`,
    `calendar.js`, `robots.txt` (self-contained month-grid calendar; reads the
    same `/calendar.json` the news shell used to, still served from the deploy
    root — see below)
- **Deploy pipeline — moved off Hermes cron to a Windows Scheduled Task,
  2026-09-08.** Task `McBoop Daily Deploy` runs `McBoop Newspaper/deploy-pages.sh`
  every 15 minutes (not just twice a day — deliberately short so a `news/` or
  `calendar/` shell edit goes live within minutes without a manual trigger).
  `deploy-pages.sh` copies the shell fresh from this repo's `news/` and
  `calendar/` into a local `public/` staging dir, layers in `calendar.json` and
  the frozen `archive/` gallery (both private data that must never be committed
  to this public repo — see below), runs `push-ledger.sh` (see the ledger bullet
  below), then `wrangler pages deploy public --project-name mcboop-daily` (token
  in `~/.config/cloudflare_pages_token.txt`) and its own post-deploy verification.
  Same `LogonType=Interactive` requirement as `McBoop Ledger Push` (git push needs
  the logged-on user's credential store), so it does not fire while logged out.
  Most runs ship byte-identical content — the script has no generation step left
  to skip (see below), so it is cheap and safe to over-run; `wrangler pages
  deploy` and the ledger push are both idempotent/no-op when nothing changed.
  This is *why* the interval can be this short without git-integrating the
  project directly (which was considered and rejected — see below): the private
  `calendar.json`/`archive/` data has to be layered in locally by this script,
  something a Cloudflare-side git build could never do since it only sees what's
  actually committed to the public repo. **Editing `news/` or `calendar/` in this
  repo goes live on the next scheduled run (within 15 min), or immediately via a
  manual `bash deploy-pages.sh` / `Start-ScheduledTask -TaskName "McBoop Daily
  Deploy"`** — there's still no git-push-triggered auto-deploy for this project,
  and (unlike `mcboop-sports`, §4b) there deliberately can't be one.
- **Content — rebuilt 2026-09-06:** the shell is now six tabs, all live, with no
  edition and no authored content anywhere in the pipeline:
  - **Local & Weather** — NWS forecast + active alerts (`api.weather.gov`) and
    the three LFUCG traffic CSVs (`lfucg.github.io/traffic-data`), both fetched
    **client-side** (those endpoints are CORS-open), plus local headlines.
  - **National / World / Business / Technology / Science & Health** — real RSS,
    fetched and merged **server-side** by `/api/feeds` in `_worker.js` (most
    publishers send no CORS header, so the browser can't read those feeds), each
    headline tagged with a rough editorial lean.

  What was removed in the same rebuild:
  - The **Sports & Betting tab** and its MLB value screen — duplicated
    `sports.jaredluyster.com`, so the screen was *moved* there rather than
    deleted (see §4b), taking the `/api/odds` route with it. `news/_worker.js`
    no longer scrapes BetExplorer at all.
  - The **`edition.json` scaffolding** — `generate.py` stopped producing an
    edition some time ago, but `app.js` still synthesized a fake edition object
    to keep retired render paths alive, and `_worker.js` still special-cased
    `/edition.json`. Both are gone; `app.js` went 714 → 400 lines.
  - The Calendar tab, already retired when it moved to its own domain.

  Calendar page reads `/calendar.json` (hand-edited at
  `C:\Users\Jared\McBoop Newspaper\public\calendar.json`, no-cache so new
  commitments show up without a redeploy) — no longer rendered anywhere on
  `news.jaredluyster.com`.
- **The Hermes cron jobs were retired 2026-09-08** in favor of the Scheduled
  Task above. They had gone dormant anyway — the twice-daily jobs (`McBoop Daily
  — Morning` 7:30a, `McBoop Daily — Evening` 8p, `cd "C:\Users\Jared\McBoop
  Newspaper" && python3 generate.py edition.md && bash deploy-pages.sh`) had not
  actually fired in about a month as of that date, since they only fire while
  Hermes is open. (`generate.py`'s `edition.md` argument was already dead by
  then too — see below — so nothing of value was lost by dropping it from the
  command.) **These two jobs must still be deleted from inside the Hermes
  session itself** — that config isn't a file this repo or its tooling can
  reach, so it wasn't possible to remove them as part of this migration.

  Since the 2026-09-06 rebuild this matters much less than it used to anyway:
  the shell renders every tab live in the browser, so *content* freshness never
  depended on redeploy cadence — only a redeploy when the UI itself changes.
  What actually motivated moving to a 15-minute Scheduled Task instead of a
  twice-daily one was wanting shell edits to go live quickly without a manual
  step, not any content-generation need.
- **Ledger push is now a Windows Scheduled Task — added 2026-09-08.** Task
  `McBoop Ledger Push`, daily 7:30a + 8:00p, runs
  `McBoop Newspaper/push-ledger.sh`: regenerate `sports/fake-bets.json` from the
  Obsidian tracker, and commit+push it to `main` only if it actually changed
  (which redeploys `mcboop-sports`). `deploy-pages.sh` calls the same script, so
  there is one implementation. Logs to `McBoop Newspaper/push-ledger.log`.
  **It must run as the logged-on user** (`LogonType=Interactive`) because git
  here uses `credential.helper=manager`, which reads the logged-on user's
  Windows credential store — a "run whether user is logged on or not" task
  cannot authenticate the push. It therefore does not fire while logged out.
  Verified in the Task Scheduler context (not just from a shell) on both the
  no-op and the push path, each returning result 0.
- **The pipeline directory is a git repo as of 2026-09-08.**
  `C:\Users\Jared\McBoop Newspaper\` held `deploy-pages.sh`,
  `export_betting_tracker.py`, `generate.py`, `jsonize.py`, `archive.py`,
  `serve.py`, `verify-live.sh` and 161 archived editions with no version control
  at all. It is now an initialised repo (673 files tracked, `public/*` and the
  regenerable caches ignored, `public/calendar.json` tracked as the exception
  since it is hand-edited and the only copy). **Deliberately local — no remote.**
  That tree contains a real commitments calendar and personal betting-ledger
  exports; a public remote would leak both.
- **Access control — news:** Behind **Cloudflare Access** (redirects to
  `quiet-frost-ed57.cloudflareaccess.com` login).
- **Post-deploy verification — corrected 2026-09-06.** This section used to say
  `deploy-pages.sh` does a post-deploy live check "via a Cloudflare Access
  Service Token (`~/.config/cloudflare_news_access.txt`)". **That token has
  never existed** — the Zero Trust org has zero service tokens (checked against
  the Access API), and the file is absent. The check was gated behind it, so it
  skipped with a `WARN` on every run since it was written: `wrangler pages
  deploy` reporting success was the only thing between a broken publish and
  never finding out. The block is now credential-free and always runs:
  1. `mcboop-daily.pages.dev` must serve the `app.js?v=NN` pin from the shell
     just published (with retries — a deploy is not always live the instant
     wrangler returns), proving the new bytes are actually live.
  2. `/api/feeds` must return JSON, proving `_worker.js` compiled and is running.
  3. `news.jaredluyster.com` must answer `302` + an Access challenge, proving
     DNS, the custom-domain binding and the Access app are all intact.

  Any failure exits non-zero so the cron run reports it. All three failure modes
  were tested by forcing them, not just by watching the happy path pass.

  What this still cannot prove is that a real principal gets `200` *through*
  Access — Access answers before the origin, so that needs a credential. If you
  want that, create a Service Token in **Zero Trust → Access → Service Auth**,
  add it to the news app's policy, and write two lines to
  `~/.config/cloudflare_news_access.txt`:

  ```
  CF-Access-Client-Id: <id>.access
  CF-Access-Client-Secret: <secret>
  ```

  The script already looks for that file and will upgrade itself to the full
  end-to-end check the moment it appears — no code change needed. (The existing
  `cloudflare_pages_token.txt` cannot create it: it has no Access scope, so the
  Access API returns empty lists rather than data.)
- **Access control — calendar:** Set up 2026-09-06 via the Cloudflare API. Custom
  domain added to the `mcboop-daily` Pages project (needed a manual DNS CNAME
  record — `calendar.jaredluyster.com` → `mcboop-daily.pages.dev`, proxied — it did
  NOT auto-provision like bluegrasscube's did), then a Cloudflare Access
  application (`self_hosted`, name `calendar`) was created, reusing the exact same
  reusable "Only Me" policy (`doctormcboop@gmail.com`, uid
  `e664394b-54a3-4cd4-bc10-18b5f4b90c5b`) that news's and sports's Access apps
  already reference — same allow-list, independently editable per-app.
- **Verified via HTTP headers (2026-09-06):** `news.jaredluyster.com` and
  `calendar.jaredluyster.com` both `302 Found` → `.../cdn-cgi/access/login/<host>`,
  `Www-Authenticate: Cloudflare-Access`, `Set-Cookie: CF_AppSession=...`.
  (Allow-list *contents* are managed in the Zero Trust dashboard and not
  externally verifiable.)

### 4b. McBoop Sports — Cloudflare Pages (`mcboop-sports` project, Git-integrated)

**A separate Pages project from §4**, discovered via the same 2026-09-06 reconciliation.
`sports.jaredluyster.com` CNAMEs to `mcboop-sports.pages.dev`, and that project is
**connected directly to this repo's GitHub remote** (`McBoop69420/jaredluyster.com`,
branch `main`, build root directory `sports/`) — same pattern as `bcs-website`'s own
GitHub Pages setup in §1c, except this one lives in the *same* repo as everything
else here. It rebuilds and redeploys automatically on every push to `main`
(`path_includes: ["*"]`, so any push triggers it, not just ones touching `sports/`).

- **Files served from:** [`sports/`](sports/index.html) — `index.html`, `sports.css`,
  `sports.js` (self-contained scoreboard page; fetches ESPN's public API
  client-side), `robots.txt`, `fake-bets.json`, and — **as of 2026-09-06** —
  `_worker.js`. Root directory = site root, so `sports/sports.css` in the repo is
  `/sports.css` on the live domain.
- **`sports/_worker.js` — added 2026-09-06, advanced mode.** This project used to
  be plain static hosting with no worker. It has one now for exactly one reason:
  the MLB value screen (below) needs BetExplorer moneylines, and the browser
  cannot fetch `betexplorer.com` (no CORS header). The worker serves `/api/odds`
  and falls through to `env.ASSETS.fetch(request)` for everything else.
  **Adding a `_worker.js` switches a Pages project into "advanced mode", where
  the worker fronts every request** — so a worker that throws takes down the
  whole site, not just `/api/odds`. Hence the blanket `try/catch` inside
  `handleOdds` and the unconditional ASSETS fallthrough at the bottom of the
  file. Smoke-test with `npx wrangler pages dev sports` before pushing.
- **Content:** pulls live scoreboards/standings **client-side from ESPN's public
  API** (`site.api.espn.com`) for MLB, MLS, Liga MX, Premier League, La Liga,
  Bundesliga, Serie A, Ligue 1, UCL, UEL, Eredivisie, Primeira Liga, Scottish Prem,
  Super Lig, NWSL, USL, NFL, plus a "Paper Bets — Live" panel fed by the committed
  `sports/fake-bets.json`.
- **MLB Value Screen — moved here from news 2026-09-06.** The model-vs-market
  table (VALUE / FADE / CHECK calls) that used to be The McBoop Daily's Sports
  tab. This is now its only home. Market lines come from `/api/odds` above; the
  model is computed **in the browser** from `statsapi.mlb.com` (CORS-open) — the
  same v2 starter-adjusted model the agent runs at paper time
  (`scripts/daily_mlb_model.py` in the live-sports-feeds skill), so the screen
  and the paper-bet ledger above it agree by construction. Rows are sorted by
  biggest disagreement with the market. It's MLB-only, so it shows under the
  "All" and "MLB" filters and hides for every other league.
- **Paper-bet ledger freshness — fixed 2026-09-06:** `export_betting_tracker.py`
  used to write to `McBoop Newspaper/public/sports/fake-bets.json`, which only
  ever reached the *old, dead* `mcboop-daily` sports route — never this project.
  `sports/fake-bets.json` had been stale since 2026-08-16 as a result.
  `deploy-pages.sh` now calls `export_betting_tracker.py --output
  "$SPORTS_SRC/fake-bets.json"` (writing straight into this repo's working copy)
  and then, in a scoped subshell, commits and pushes just that one file to
  `main` if it changed (`git diff --quiet` check first, so an unchanged ledger
  produces no commit) — that push is what makes `mcboop-sports` redeploy.
  Deliberately scoped to exactly that path (`git add sports/fake-bets.json`,
  never a blanket add) so it can't sweep up unrelated in-progress work sitting
  in that working copy, and uses `git pull --ff-only` before committing rather
  than ever force-pushing.
- **Access control:** Behind **Cloudflare Access**, same Zero Trust org as news,
  but a **separate Access application** with its own policy/allow-list —
  independently editable from news (distinct app `aud`). Verified via HTTP headers
  the same way as news/calendar (`302 Found` → Cloudflare Access login).
- **`sports/wrangler.toml` is load-bearing — do not remove.** It was wrongly
  deleted during the 2026-09-06 reconciliation on the assumption that a
  Git-integrated project ignores `wrangler.toml` entirely. It doesn't: Cloudflare's
  build step ("v2 root directory strategy") reads it to get
  `pages_build_output_dir = "."` scoped correctly under this project's `sports/`
  root directory. Without it, the build falls back to the *repository's own*
  top-level `wrangler.toml` (meant for the unrelated `jaredluyster-com` project)
  and fails with "build output directory is outside of the repository." Confirmed
  by breaking it, watching the build fail, and fixing it forward the same day —
  the live site kept serving the last good deployment throughout, so nothing was
  ever down, but new pushes silently stopped deploying until this was restored.

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
├── app.py                  # Flask app serving the homepage + static files (Render)
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
├── bluegrasscube/          # Bluegrass Cube staging site (Cloudflare Pages: bluegrasscube.jaredluyster.com)
├── news/                   # News site shell (Cloudflare Pages project "mcboop-daily": news.jaredluyster.com)
│   ├── index.html          # News UI shell (no edition; every tab is live)
│   ├── app.css             # News site styles
│   ├── app.js              # News UI logic (tabs, live weather/traffic/feed rendering)
│   ├── _worker.js          # Pages Worker: routes calendar.jaredluyster.com to /calendar/*, proxies /api/feeds
│   └── robots.txt
├── sports/                 # Sports scoreboard site — a SEPARATE Pages project (mcboop-sports), Git-integrated to this repo's main branch, root dir "sports/": sports.jaredluyster.com
│   ├── index.html
│   ├── sports.css
│   ├── sports.js           # ESPN API + the MLB value screen, both client-side
│   ├── _worker.js          # Pages Worker (advanced mode): proxies /api/odds, else falls through to assets — see §4b
│   ├── fake-bets.json      # Auto-committed + pushed by deploy-pages.sh each cron run, see INFRASTRUCTURE.md §4b
│   ├── wrangler.toml       # LOAD-BEARING — do not remove, see §4b
│   └── robots.txt
├── calendar/               # Standalone calendar site (same Pages project as news, "mcboop-daily", routed via news/_worker.js: calendar.jaredluyster.com)
│   ├── index.html
│   ├── calendar.css
│   ├── calendar.js         # Reads /calendar.json (deploy-root file, unchanged)
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

## PayPal Checkout

Moved with the marketplace to `McBoop69420/bluegrasstcg` on 2026-09-09 — see that repo for
`server.py`'s PayPal integration (`_paypal_config()`, `_paypal_access_token()`, etc.),
`store.py`'s payment columns, and the checkout templates. Nothing PayPal-related remains in
this repo.

## Key URLs

| URL | Service | Host |
|-----|---------|------|
| `jaredluyster.com` | Homepage + static assets | Render (Flask) |
| `jaredluyster.com/radio.html` | Radio player page | Render (Flask) |
| `wizardbattle.jaredluyster.com` | Wizard Battle site | GitHub Pages (docs/) |
| `bluegrasstcg.online` | Marketplace | Separate repo (`McBoop69420/bluegrasstcg`) + Render service |
| `bluegrasscube.jaredluyster.com` | Bluegrass Cube staging | Cloudflare Pages (separate project) — not yet created |
| `bcs.jaredluyster.com` | BCS marketing site staging | Cloudflare Pages, connected to `bcs-website` repo (separate project) |
| `radio.jaredluyster.com` | Radio stream + player | Self-hosted (Cloudflare Tunnel) |
| `news.jaredluyster.com` | McBoop newspaper (live weather, traffic & headlines) | Cloudflare Pages project `mcboop-daily` (source: `news/` in this repo) + Access |
| `sports.jaredluyster.com` | McBoop Sports (live scores, paper bets, MLB value screen) | Separate Cloudflare Pages project `mcboop-sports`, Git-integrated to this repo (root dir `sports/`, auto-deploys on push to `main`) + Access |
| `calendar.jaredluyster.com` | Calendar & Day Plan | Same Pages project `mcboop-daily`, routed via `news/_worker.js` (source: `calendar/` in this repo) + Access |
| `bluegrasscybersecurity.com` | BCS website | Separate (Namecheap) |

## How to Work With This Repo

### Local development
1. **Homepage/Wizard Battle (static):**
   - Homepage: Edit `index.html`, `radio.html`, `shared-theme.css` in repo root — push to `main`, Render auto-deploys (`app.py`)
   - Wizard Battle: Edit files in `docs/` — push to `main`, GitHub Pages auto-deploys
2. **Marketplace (Flask):** Separate repo now — see `McBoop69420/bluegrasstcg`
3. **Radio service:** Separate private repo (`McBoop69420/radio-service`)

### Deployment triggers
- **GitHub Pages (Wizard Battle):** Push to `main` branch (`docs/` directory)
- **Render (Homepage):** Push to `main` branch (auto-deploys from `render.yaml`)
- **Cloudflare Tunnel (Radio):** Runs locally via `cloudflared` (public, no Access)
- **Cloudflare Pages, Git-integrated (Sports, Bluegrass Cube, and a few legacy
  subdomains — see each project's own section):** Push to `main` branch, same as
  GitHub Pages/Render above — Cloudflare's own GitHub integration builds directly
  from this repo using each project's configured root directory.
- **Cloudflare Pages, Wrangler-CLI deployed (News + Calendar):** NOT triggered by
  `git push` — only by `deploy-pages.sh` (Windows Scheduled Task `McBoop Daily
  Deploy`, every 15 min — see §4) or a manual `wrangler pages deploy`, run from
  the separate `McBoop Newspaper` directory. Pushing changes to `news/` or
  `calendar/` in this repo does nothing live on its own until that next
  scheduled run picks them up.

### Git workflow
- Working copy: `%USERPROFILE%\Documents\jaredluyster.com` (active)
- Clean copy: `%USERPROFILE%\Projects\jaredluyster.com`
- Both point to the same remote: `origin = https://github.com/McBoop69420/jaredluyster.com.git`