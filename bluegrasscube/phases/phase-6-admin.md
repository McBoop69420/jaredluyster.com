# Phase 6 — Admin Interface

## Goal

A simple, private admin page so Jared can manage events, overrides, announcements, posters,
and cubes without editing code. This is the phase where data moves from repo JSON files to
Cloudflare storage.

## Read first

[CLAUDE.md](../CLAUDE.md), [DESIGN.md](../DESIGN.md) §20 (maintenance). Repo-root
INFRASTRUCTURE.md §1b (Pages project). This phase has real architecture decisions — check
in with Jared on the auth approach before building if anything below seems off.

## Architecture (recommended)

- **Pages Functions** in `bluegrasscube/functions/` (this directory is the Pages project
  root, so functions deploy with the site).
- **Data:** one Cloudflare KV namespace holding the JSON blobs (`events`, `announcements`,
  `cubes`) — same shapes as the current `data/*.json`. The public site fetches from a
  read-only function (e.g. `GET /api/data`) with the repo JSON as fallback/seed.
- **Posters:** R2 bucket for uploads; a function serves or proxies them (or use R2 public
  bucket + custom domain). Accept common image types; reasonable size limit (~10 MB).
- **Auth:** simplest solid option is Cloudflare Access (Zero Trust) in front of `/admin`
  and the write endpoints — no password code to write or store. Fallback: a single shared
  secret token checked by the functions, stored as a Pages secret. Never commit secrets.

## Build

- `/admin` page (not linked from public nav): forms following DESIGN.md §20 —
  **Add Event** (what, date, start, end, where, poster upload, publish), plus cancel/replace
  a recurring instance on a date, add/edit/remove announcements, edit cube entries
  (nickname, strategy note, thumbnail).
- Write endpoints (`POST`/`PUT` functions) that validate input and update KV / upload to R2.
- Migrate seed data: on first deploy, load the current `data/*.json` contents into KV.
- Public pages switch to the API with graceful fallback to the static JSON.
- Admin UI can be plain and functional — it's for one person; it does NOT need the
  bulletin-board aesthetic. Clarity over style.

## Don't build

Multi-user accounts, roles, community submissions, edit history, drafts/scheduling. One
curator, publish-immediately.

## Acceptance criteria

- Jared can, from a browser with zero code edits: add a special event with a poster,
  cancel a Thursday, post an announcement, edit a cube's nickname — and each change is
  live on the public site after refresh.
- Write endpoints reject unauthenticated requests; nothing sensitive committed to git.
- Public site still renders if KV/API is unreachable (falls back to bundled JSON).
- `wrangler pages dev` local flow documented in PLAN.md (bindings for KV/R2).
- PLAN.md status updated; committed and pushed.
