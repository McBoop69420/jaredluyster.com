#!/usr/bin/env bash
# Daily Expert Picks ledger run for sports.jaredluyster.com/betting/ (INFRASTRUCTURE.md §4b).
#
# Runs from Scheduled Task "Sports Picks Ledger" on JARED-SERVER (through
# picks-ledger-hidden.vbs) in a clone kept only for this job, so it never commits
# from, or pushes someone's half-done work out of, the checkout people edit in:
#   C:\Users\Jared Server\picks-ledger\jaredluyster.com
# Pulls main, records the last few days' graded picks (scripts/picks-ledger.mjs),
# and commits + pushes sports/picks-history/ only if it changed. The push is what
# redeploys mcboop-sports. Extra arguments go to picks-ledger.mjs (e.g. --days 7).
#
# The whole body is in one { } block so bash has read all of it before the pull
# below can replace this file.
{
set -euo pipefail
REPO="${PICKS_LEDGER_REPO:-/c/Users/Jared Server/picks-ledger/jaredluyster.com}"
cd "$REPO"
echo "== $(date '+%Y-%m-%d %H:%M:%S') picks ledger"

git pull --ff-only --quiet origin main
node scripts/picks-ledger.mjs "$@"

git add sports/picks-history
if git diff --cached --quiet; then
  echo "no new graded picks"
  exit 0
fi
git commit --quiet -m "Sports: log graded expert picks ($(date '+%Y-%m-%d'))" -- sports/picks-history
for attempt in 1 2 3; do
  if git push --quiet origin main; then
    echo "pushed $(git rev-parse --short HEAD)"
    exit 0
  fi
  # Someone pushed in between: replay the ledger commit on top and retry.
  git pull --rebase --quiet origin main
done
echo "ERROR: push failed" >&2
exit 1
}
