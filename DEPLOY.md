# Deployment — Cloudflare migration

## Where things run

| Layer | Host | Notes |
|---|---|---|
| Static site + tools + **apex `jaredluyster.com` / `www`** (`index.html`, `radio.html`, `roto/`, `social/`, `comic/`, …) | **Cloudflare Pages** (`jaredluyster-com`) | Served straight from the repo root, no build step. Apex + `www` are custom domains on this project since 2026-10-26. |
| Per-tool backends | **Cloudflare** (Pages Functions + R2 + a Durable Object) | `functions/*` over R2 buckets (social, comic, redzone/sports bets) and the roto DraftRoom DO. |

**History — this repo no longer uses Render.** This file began as a Render→Cloudflare
migration plan. Phase 1 put the static site on Cloudflare Pages while the marketplace stayed on
Render behind a proxy Function. That's all done and then some: the marketplace moved to its
**own repo + Render service** (`McBoop69420/bluegrasstcg`, serving `bluegrasstcg.online`), the
proxy Function `functions/marketplace/[[path]].ts` and its `MARKETPLACE_ORIGIN` var were deleted,
and on **2026-10-27 the apex's own Render service was retired** — apex + `www` now serve from the
`jaredluyster-com` Pages project. The "DNS cutover" and "Phase 2" sections at the bottom are the
completed migration, kept as a record; the per-tool sections below are setup history.

## One-time Cloudflare Pages setup

1. **Create the Pages project** — Cloudflare dashboard → Workers & Pages → Create → Pages →
   Connect to Git → `McBoop69420/jaredluyster.com`.
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: **`/`**
2. **(Obsolete) backend origin** — this step used to add a `MARKETPLACE_ORIGIN` env var
   pointing at Render, for the marketplace proxy Function. That Function and variable are gone
   (the shop moved to its own repo), so there is no backend origin to set here anymore.
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

**One-time setup — done 2026-09-18 (Cloudflare dashboard):**

1. ~~Custom domain~~ — done: `redzone.jaredluyster.com` added on the `jaredluyster-com` Pages
   project (Cloudflare created the `redzone` CNAME → `jaredluyster-com.pages.dev`).
2. ~~Cloudflare Access~~ — done: a `redzone` self-hosted Access application (destination
   `redzone.jaredluyster.com`) reuses the "Only Me" policy
   (`e664394b-54a3-4cd4-bc10-18b5f4b90c5b`) the same way `news`/`sports`/`calendar`/`social`
   do — same Zero Trust org, independently editable per-app. A second policy,
   `Redzone guest access` (Include Emails = `mohara350376@gmail.com`), was added 2026-09-18;
   that address is also on `Sports guest access`. One guest policy per app, addresses listed
   inside it.

   **Login methods (2026-09-18):** the Zero Trust org started with only the "Cloudflare"
   identity provider, which requires a Cloudflare account under the guest's email, so guests
   couldn't sign in. **One-time PIN** (emailed login code) was added briefly and then
   deliberately **removed again** the same day — the login page must not offer an
   email-a-code box. Re-add it under Zero Trust → Integrations → Identity providers if ever
   wanted; it applies to every app set to accept all identity providers.

   **Google sign-in (added 2026-09-18):** a `Google` identity provider is configured, so
   the login page offers **Cloudflare or Google** (verified logged-out on `redzone.` and
   `sports.`; no email box). It uses an OAuth client
   (`Cloudflare Access`, Web application) in the Google Cloud project "My First Project",
   with JavaScript origin `https://quiet-frost-ed57.cloudflareaccess.com` and redirect URI
   `https://quiet-frost-ed57.cloudflareaccess.com/cdn-cgi/access/callback`. The client ID/secret
   live only in Cloudflare (never commit them; the secret is not viewable in Google after
   creation). Not verified with a real guest sign-in.
   **The Google consent screen is in Testing mode** (External; Publish is blocked until the
   Branding page has a homepage/privacy/terms link). Only Google accounts on the *Test users*
   list (Google Auth Platform → Audience) can sign in with Google, so a new guest must be added
   there *and* to their app's Access policy. `mohara350376@gmail.com` is on the list. With the
   emailed code removed, a guest who isn't a test user and has no Cloudflare account has no
   way to sign in.

   **Google only, no picker, 1-month sessions (2026-10-22):** every Access app (`news`,
   `calendar`, `sports`, `social`, `redzone`, `comic`) now allows only the `Google` identity
   provider with **Instant Auth** on (`allowed_idps` = Google, `auto_redirect_to_identity`),
   so the login page forwards straight to Google with no Cloudflare/Google choice. Each app's
   session duration and the org's global session timeout (Settings → Authentication) are
   **1 month** (`730h`; were 24h). With a valid global session, opening another gated
   subdomain signs in silently through the team domain. The `Cloudflare` identity provider
   still exists in the org but no app accepts it; to undo, set an app back to "accept all
   identity providers" and turn Instant Auth off. Set through the dashboard's API from a
   signed-in browser (the Pages token has no Access scope). Verified the same day: every gated
   host `302`s to a login page that only links to Google, and a real Google sign-in loaded
   all six with `idp: google` in `/cdn-cgi/access/get-identity`, with `/api/ticks`,
   `/api/bets` and `/comic/api/private/plan` answering `200`. Every guest now needs to be a
   Google test user.

   **Where the Google OAuth client lives:** it belongs to **the owner's other Google
   account**, not `doctormcboop@gmail.com`. It's in that account's "My First Project", project
   ID `prefab-pride-461709-i0`, number `205430663206` (the client ID prefix). Manage test users
   at Google Auth Platform → Audience while signed in as that account. `doctormcboop`
   can't open the project and isn't a test user, yet its Google sign-in to Access works
   (seen 2026-10-22). Test users as of 2026-10-22: `mohara350376@gmail.com` and
   `lebronwall6@gmail.com` (added that day, for `Sports guest access`).

Verified via `curl`: an unauthenticated request to `https://redzone.jaredluyster.com/` gets
`302` to `quiet-frost-ed57.cloudflareaccess.com/cdn-cgi/access/login/redzone.jaredluyster.com`
with `Www-Authenticate: Cloudflare-Access`. Not yet verified: a real signed-in load of the
board through Access (needs a login).

**Extra Access destination (2026-09-20):** the `redzone` Access app also protects
`jaredluyster-com.pages.dev` path `redzone/*`, so the Pages default hostname no longer serves
the board's files without a login (verified: `302` to Access on `/redzone/` and
`/redzone/redzone.js`; `pages.dev/roto/` and `jaredluyster.com/` are unaffected).

**The apex `/redzone/*` path (updated 2026-10-26).** When the apex ran on Render it couldn't be
gated at all — `jaredluyster.com` resolved to Render's own IPs (`216.24.57.x`), not through this
Cloudflare zone, so Access never saw those requests, and a `jaredluyster.com/redzone/*` Access
destination tried back then did nothing. Since the apex moved onto the `jaredluyster-com` Pages
project it is proxied through the zone, so a `jaredluyster.com` destination on the `redzone`
Access app *would* now take effect — add it there if you want that path gated. Either way it's
acceptable to leave open: the repo is public on GitHub anyway and the only private data (the
bets) is behind the API's own auth — see the bet tracker section. Do not put anything secret in
`redzone/`.

**Google sign-in test (2026-09-20):** Cloudflare's "Test" on the Google provider (run as the
owner) returned "Your Identity Provider works", confirming the OAuth client ID/secret are
valid. A real guest sign-in (`mohara350376@gmail.com`) is still untested.

### RedZone bet tracker — private store setup (one-time, needs your Cloudflare login)

The tracker's picks are personal, and this repo is **public**, so they live in a private R2
bucket read through `functions/redzone/api/[[path]].ts` — never in git. Until the steps below
are done the endpoint answers `503 not-configured` (fails closed) and the board simply shows a
"bet store isn't set up yet" note; shipping the code first is safe.

**Order matters — create the bucket BEFORE uncommenting the binding in `wrangler.toml`.** Pages
fails the deploy of the *whole site* if a bound R2 bucket doesn't exist.

1. Create the bucket: `wrangler r2 bucket create jaredluyster-redzone-bets`
2. Set the allowlist secret (the owner's email; comma-separate several):
   `wrangler pages secret put BETS_ALLOWED_EMAILS --project-name jaredluyster-com`
   It is a **secret, not a `[vars]` entry** — `wrangler.toml` is public. The `Redzone guest
   access` policy lets a guest reach this hostname; this allowlist is what keeps them out of the
   bets (they get `403`, and the section stays hidden for them).
3. Optional hardening: also set `ACCESS_AUD` to the `redzone` Access application's AUD tag
   (Zero Trust → Access → Applications → redzone → Overview), so a token issued for a different
   Access app in the same org is refused.
4. Uncomment the `[[r2_buckets]]` block for `REDZONE_BETS` at the bottom of `wrangler.toml`
   and push.
5. Put picks in the bucket (a JSON file shaped `{ "bets": [ ... ] }`, schema in the header of
   `redzone/bets.js`; `redzone/bets.json` is gitignored so a working copy can't be committed):
   `wrangler r2 object put jaredluyster-redzone-bets/bets.json --file redzone/bets.json --content-type application/json --remote`
6. Load `https://redzone.jaredluyster.com/` signed in as the owner. If the "My bets" section
   doesn't appear, open the browser console: `no access to the bet store (HTTP 401)` means Access's
   token was rejected (check `ACCESS_AUD` / the team domain in `functions/redzone/_lib/access.ts`);
   `403` means you're signed in with an address that isn't in `BETS_ALLOWED_EMAILS`.

**Not yet verified against a real login:** the code was verified with real RSA signatures and
against Cloudflare's live key endpoint, but a token actually issued by Access hasn't been seen.
The claim names it checks (`iss`, `email`, `aud`, `exp`) follow Cloudflare's docs. If one is off
the failure is safe — the endpoint refuses and no bets show — never the reverse.

Tests: `node --test redzone/tests/api.test.mjs` (auth + endpoint) and
`node --test redzone/tests/bets.test.js` (grading). Neither is ever served (`/tests/` is 404'd by
`functions/_middleware.ts`).

## Sports My Bets — private store setup (one-time, needs your Cloudflare login)

**Done 2026-10-17** (steps 1, 2, 3 and 5; `ACCESS_AUD` not set). Kept for a rebuild.

**My Bets** (paper bets placed from the game cards' **+ Bet** button, `sports/my-bets.js`) saves
through `/api/bets` in `sports/_worker.js` to a private R2 object **per Access login**
(`bets/<url-encoded email>.json`), never to git (this repo is public). It is the same layering as
RedZone's store above: only answers on `sports.jaredluyster.com` and needs a signed Access JWT with
an email; every account the `sports` Access app admits (the owner and each `Sports guest access`
guest) gets its own ledger and can only reach that one. Until the bucket exists and is bound the
endpoint answers `503 not-configured` and the panel says the store isn't set up. Shipping the code
first is safe.

**Per-account since 2026-10-26.** Before that there was one shared object, `paper-bets.json`,
gated to the owner by the `BETS_ALLOWED_EMAILS` secret. That object is left in place as a backup;
the worker copies it to its owner's key the first time the owner loads My Bets without a ledger of
their own. The owner is `BETS_LEGACY_OWNER` if set, else the one address in `BETS_ALLOWED_EMAILS`
(with several addresses nothing is copied until `BETS_LEGACY_OWNER` names one:
`wrangler pages secret put BETS_LEGACY_OWNER --project-name mcboop-sports`).
`BETS_ALLOWED_EMAILS` is no longer a gate.

`mcboop-sports` is a **separate, Git-integrated** Pages project (INFRASTRUCTURE.md §4b): its
bindings come from `sports/wrangler.toml`, and its secrets are set per project.

**Order matters: create the bucket BEFORE uncommenting the binding.** A bound bucket that doesn't
exist fails the build, and pushes silently stop deploying (the live site keeps the last good build).

1. `wrangler login` (once per machine).
2. Create the bucket: `wrangler r2 bucket create mcboop-sports-bets`
3. (Before 2026-10-26: the `BETS_ALLOWED_EMAILS` allowlist secret. Not needed for a rebuild;
   see "Per-account" above.)
4. Optional hardening: `wrangler pages secret put ACCESS_AUD --project-name mcboop-sports` with the
   `sports` Access application's AUD tag (Zero Trust → Access → Applications → sports → Overview).
5. Uncomment the `[[r2_buckets]]` block for `SPORTS_BETS` at the bottom of `sports/wrangler.toml`
   and push. The push is the deploy.
6. Load `https://sports.jaredluyster.com/betting/` signed in: My Bets should show with an empty
   record. If it says it couldn't confirm your login (HTTP 401), check `ACCESS_AUD` and the team
   domain (`ACCESS_TEAM_DOMAIN` in `sports/_worker.js`); `HTTP 403` means a login with no email
   (a service token).

Backup / inspect one account: `wrangler r2 object get "mcboop-sports-bets/bets/<email with @ as %40>.json" --remote --file bets-backup.json`;
list them with `wrangler r2 object list mcboop-sports-bets --remote`. The pre-2026-10-26 shared
ledger is still at `mcboop-sports-bets/paper-bets.json`. Keep backups out of the repo.

**Local dev:** the `sports-bets-dev` launch config runs
`npx wrangler pages dev sports --port 8792 --r2 SPORTS_BETS --binding BETS_DEV_EMAIL=dev@localhost`:
a local, throwaway bucket, and `BETS_DEV_EMAIL` skips the JWT check, but only when the request host
is `localhost`/`127.0.0.1`, so it can never open the real store.

Tests: `node --test tests/my-bets.test.mjs` (grading, ESPN parsing, and the endpoint's auth and
writes with real RSA signatures; each guard was mutation-tested).

## Sports accounts — sign up / sign in (one-time, needs your Cloudflare login)

Anyone can join `sports.jaredluyster.com/join/` with an email and password. Accounts live in the
private `mcboop-sports-bets` bucket under `users/<email>.json` (salted PBKDF2 hash, never the
password). The session is an HMAC-signed `sports_session` cookie, 30 days, keyed by a secret.
Games and Betting stay public; only My Bets needs a sign-in. Code: the "Accounts" section of
`sports/_worker.js` (`/api/auth/*`) and `sports/join/`.

Until steps 1 and 2 are done, `/api/auth/*` answers `503 not-configured` and the join page says
accounts aren't on yet. Nothing else breaks.

1. Set the session secret (at least 32 characters; never commit it):
   `openssl rand -base64 48`, then `npx wrangler pages secret put SESSION_SECRET --project-name mcboop-sports`.
   For local dev, put `SESSION_SECRET=<any 32+ characters>` in `sports/.dev.vars` (gitignored).
2. Remove the Cloudflare Access app for `sports.jaredluyster.com` (Zero Trust → Access →
   Applications → `sports` → Delete). Access gates the whole hostname, so while it exists a
   visitor hits the Google login wall and never reaches the join page. Deleting it opens Games and
   Betting to everyone. Keep the `Sports guest access` policy only if you still want it: it has no
   effect once the app is gone. Until the app is removed, My Bets still accepts Access logins as a
   fallback, so nothing you use today stops working.
3. Your existing bets carry over: sign up with `doctormcboop@gmail.com` (the same email your Access
   login used) and the account's ledger key is the same `bets/<email>.json` object as before.
4. Verify: load `https://sports.jaredluyster.com/join/` in a private window, create an account,
   then `/betting/` should show My Bets with your bets; sign out and it should show the sign-in link.

Tests: `node --test tests/accounts.test.mjs` (hashing, the signed cookie, sign-up/sign-in/sign-out
against an in-memory bucket).

## QR Code Maker (qr.jaredluyster.com)

Make, download (PNG/SVG) and print QR codes for links, text, Wi-Fi logins, contact cards,
email, phone and SMS. Static frontend in `qr/`, following the tool-subdomain pattern above
(`qr` is in `SUBDOMAIN_ROOTS`). **No backend and no Access gate** — it holds nothing private,
and every code is generated in the visitor's browser.

**Why the codes never expire:** they're *static* — the payload (the URL, the `WIFI:` string,
the vCard…) is encoded directly into the modules. There's no short link or redirect in
between, which is what makes commercial "dynamic" codes die when a subscription lapses. The
encoder (Kazuhiko Arase's `qrcode-generator`, MIT, v2.0.4) is vendored at
`qr/vendor/qrcode.js` rather than loaded from a CDN, so the page itself keeps working too.
Payload formats are in the header of `qr/payload.js`.

**Center logo (added 2026-10-04):** an uploaded image or a short text badge ("SCAN ME",
"50% OFF", an emoji) in the middle of the code, on a plate (rounded square or circle, any
color). The modules under it are cleared, error correction is locked to High while it's on,
and tiny codes are bumped to version 3 so the logo has room. Size is capped at 30% of the
code's width (`CENTER_MAX` in `qr/code.js`) — decoding only started failing around 46% in
stress tests with random noise in the center, so the cap leaves margin for real-world print
blur and camera angles. Images are processed in the browser (transparent margins trimmed,
scaled to ≤512px; small SVGs kept as vector) and stored only in that browser's
`localStorage`, never uploaded.

**Scan check:** after every change the page decodes its own finished code — logo, colors and
all — with jsQR (Apache-2.0, vendored at `qr/vendor/jsQR.js`, lazy-loaded) and says whether it
reads back as exactly the intended content. It runs with `inversionAttempts: "dontInvert"`, so
light-on-dark codes fail the check on purpose.

**One-time setup — done 2026-10-05:** ~~`jaredluyster-com` Pages project → Custom domains →
add `qr.jaredluyster.com`~~. Cloudflare created the CNAME `qr` → `jaredluyster-com.pages.dev`,
which takes precedence over the zone's `*` wildcard (the wildcard record stays). Serving within
about a minute of activation; verified `qr.jaredluyster.com/` 200, `/tests/` 404. No Access
application — deliberately public. Also reachable at `jaredluyster-com.pages.dev/qr/`.

Tests: `node --test qr/tests/qr.test.js` (payload formats, version selection, overflow, SVG
geometry, and center logos decoded with jsQR at the size cap across versions 3–40). Never served (`/tests/` is 404'd by `functions/_middleware.ts`). Every payload
type was also round-trip decoded with an independent decoder (jsQR) at all four
error-correction levels when this was built.

## Comic (comic.jaredluyster.com)

A comic strip drawn on notebook paper, and the private planner it's made in. Static frontend in
`comic/` following the tool-subdomain pattern above (`comic` is in `SUBDOMAIN_ROOTS`), plus one
Function, `functions/comic/api/[[path]].ts`, over the `COMIC` R2 bucket
(`jaredluyster-comic`).

- **Reader** (`comic/index.html`, public, no login): newest strip, `#/12` permalinks, archive,
  cast, about. Reads `/comic/api/public/site`.
- **Planner** (`comic/plan/`, owner only): strip board (Idea → Scripted → Penciled → Inked →
  Posted), panel-by-panel script editor, scan upload, scheduling, cast, ideas, settings, JSON
  backup. Autosaves `plan.json`; every save also rewrites `published.json`, the only thing the
  public routes read. Private notes, scripts and unposted scans never leave `plan.json` / the
  bucket, and a public image URL 404s unless a visible strip or public character uses it. A
  posted strip with a future date is scheduled: it appears (and gets its number) on that day,
  Eastern time.
- **Two devices:** saves send the ETag they loaded (`If-Match`), so a stale tab gets a 412 and a
  "load theirs / keep mine" banner instead of silently overwriting newer work.
- **API paths are absolute (`/comic/api/...`) even on the subdomain.** Pages only runs a Function
  for the path as requested; a subdomain-relative `/api/...` gets rewritten by the middleware
  into a static miss that falls through to the homepage HTML with a 200.
- **Uploads** are re-encoded in the browser (≤3000px, EXIF/GPS dropped). PNG, JPEG, WebP, GIF only
  (no SVG: it could carry script), ≤15 MB.

**One-time setup:**

1. ~~Create the bucket~~ — done 2026-10-20: `wrangler r2 bucket create jaredluyster-comic`. Must exist **before**
   the `[[r2_buckets]]` block for `COMIC` in `wrangler.toml` is pushed (a missing bound bucket
   fails the whole site's deploy).
2. ~~Custom domain~~ — done 2026-10-20: `comic.jaredluyster.com` on the `jaredluyster-com` Pages
   project (CNAME `comic` → `jaredluyster-com.pages.dev`, overriding the `*` wildcard).
3. ~~Cloudflare Access~~ — done 2026-10-20: a self-hosted application named `comic` with the "Only Me" policy
   (`e664394b-54a3-4cd4-bc10-18b5f4b90c5b`) and **path-scoped** destinations, so the reader stays
   public:
   - `comic.jaredluyster.com/plan` (an Access path also covers everything under it)
   - `comic.jaredluyster.com/comic/api/private`
   - `comic.jaredluyster.com/comic/plan` (the same planner page by its folder path)
4. ~~Owner allowlist~~ — done 2026-10-20 (a **secret**; the repo is public):
   `wrangler pages secret put COMIC_OWNER_EMAILS --project-name jaredluyster-com` with your Access
   login email. Until it's set the planner shows "not set up yet" and every private route answers
   503. Optional hardening: `COMIC_ACCESS_AUD` = the `comic` Access app's AUD tag.

**Local dev:** the `comic-pages-dev` launch config runs
`npx wrangler pages dev . --port 8793 --binding COMIC_DEV_EMAIL=dev@localhost` and opens
`http://comic.localhost:8793`. Local, throwaway bucket; `COMIC_DEV_EMAIL` skips the JWT check
only when the host is `localhost`/`127.0.0.1`/`comic.localhost`.

Backup: the planner's Settings → Download backup, or
`wrangler r2 object get jaredluyster-comic/plan.json --remote --file comic-plan.json` (keep it out
of the repo).

Tests: `node --test comic/tests/api.test.mjs` (what's public vs private, scheduling, the ETag
guard, upload types, host and auth gates; the key guards were mutation-tested). Access JWT
verification is the shared `functions/redzone/_lib/access.ts`, covered by
`redzone/tests/api.test.mjs`.

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

## DNS cutover — DONE 2026-10-26

The apex used to point at Render (`216.24.57.x`); it now serves from the `jaredluyster-com`
Pages project. What was done, kept as a record:

1. Added `jaredluyster.com` as a **custom domain** on the `jaredluyster-com` Pages project
   (CNAME swapped from `jaredluyster-com.onrender.com` → `jaredluyster-com.pages.dev`; the zone
   is already on Cloudflare, so it was an edge-side swap with no visitor DNS wait).
2. Added `www.jaredluyster.com` as a second custom domain, plus a **Redirect Rule**
   (`https://www.*` → `https://${1}`, 301) to preserve the old Caddy `www → apex` behavior.
   The wildcard `${1}` already carries path + query, so "Preserve query string" stays off.
3. Left the Render service running one day as a rollback net, then retired it 2026-10-27
   (no marketplace proxy depended on it anymore — that had moved to its own repo).

**Verified (2026-10-26 → 27):** apex `200` `Server: cloudflare` with **no** `x-render` header,
`www` `301` → apex (path + query preserved), config files `404` at the apex, cert issued and
active (Google Trust Services, valid to 2027-01-24). The Render origin went idle (cold-started
in ~21s), confirming no real traffic.

**Rollback (while it lasted):** point the apex CNAME back at `jaredluyster-com.onrender.com`.
That one-click revert is gone now that the Render service is retired — but the static site lives
in the repo, so rebuilding it on Pages (or anywhere) is the fallback. Render is no longer special.

## Phase 2 — retire Render (resolved differently, 2026-09 → 2026-10)

This was originally a plan to rewrite `marketplace/server.py` as a TypeScript Worker (D1 +
Resend + PayPal) so Render could go away. It played out differently: the **marketplace left this
repo entirely** — it's now its own private repo and Render service (`McBoop69420/bluegrasstcg`,
`bluegrasstcg.online`), so there was nothing to rewrite here. With the shop gone, the apex was
the last thing on Render; it moved to Pages (see "DNS cutover" above), the proxy Function
`functions/marketplace/[[path]].ts` was deleted, and `app.py` + `render.yaml` + `requirements.txt`
were removed on 2026-10-27. **This repo no longer uses Render.** (The separate `bluegrasstcg`
repo still runs its own Render service — unrelated to this one.)
