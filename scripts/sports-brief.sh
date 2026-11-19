#!/usr/bin/env bash
# Daily Brief snapshot for sports.jaredluyster.com/brief/ (INFRASTRUCTURE.md §4b).
#
# Runs from Scheduled Task "Sports Daily Brief" on JARED-SERVER at 7:30 AM ET
# (through sports-brief-hidden.vbs), in a clone kept only for this job so it never
# commits from, or pushes someone's half-done work out of, the checkout people edit in:
#   C:\Users\Jared Server\sports-brief\jaredluyster.com
# Pulls main, builds sports/brief/snapshot.json (scripts/sports-brief.mjs), and
# commits + pushes it. The push is what redeploys mcboop-sports.
#
# The whole body is in one { } block so bash has read all of it before the pull
# below can replace this file.
{
set -euo pipefail
REPO="${SPORTS_BRIEF_REPO:-/c/Users/Jared Server/sports-brief/jaredluyster.com}"
cd "$REPO"
echo "== $(date '+%Y-%m-%d %H:%M:%S') sports brief"

git pull --ff-only --quiet origin main
node scripts/sports-brief.mjs

git add sports/brief/snapshot.json
if git diff --cached --quiet; then
  echo "snapshot unchanged"
  exit 0
fi
git commit --quiet -m "Sports: daily brief snapshot ($(date '+%Y-%m-%d'))" -- sports/brief/snapshot.json
for attempt in 1 2 3; do
  if git push --quiet origin main; then
    echo "pushed $(git rev-parse --short HEAD)"
    exit 0
  fi
  # Someone pushed in between: replay the snapshot commit on top and retry.
  git pull --rebase --quiet origin main
done
echo "ERROR: push failed" >&2
exit 1
}
