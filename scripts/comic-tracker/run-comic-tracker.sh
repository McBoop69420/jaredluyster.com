#!/usr/bin/env bash
# Runs the comic release tracker (scripts/comic-tracker/tracker.py) and publishes what it
# changes to jaredluyster.com/calendar/comics.json.
#
# Meant for a Windows Scheduled Task on JARED-SERVER, once or twice a day. Works in a
# clone kept only for this job, like scripts/picks-ledger.sh, so it never commits from, or
# pushes someone's half-done work out of, the checkout people edit in:
#   C:\Users\Jared Server\comic-reminders\jaredluyster.com
# Pulls main, runs the tracker (it reads the calendar's ticks with wrangler, so
# CLOUDFLARE_API_TOKEN must be set for the task), and commits + pushes
# calendar/comics.json, scripts/comic-tracker/state.json and discoveries.md only if
# a reminder or the state changed (a new "generated" date alone doesn't count).
# Pass --dry-run to stop before the commit and show the diff.
{
set -euo pipefail
REPO="${COMIC_REMINDERS_REPO:-/c/Users/Jared Server/comic-reminders/jaredluyster.com}"
FILES=(calendar/comics.json scripts/comic-tracker/state.json scripts/comic-tracker/discoveries.md)
echo "== $(date '+%Y-%m-%d %H:%M:%S') comic tracker"

if [ ! -d "$REPO/.git" ]; then
  mkdir -p "$(dirname "$REPO")"
  git clone --quiet https://github.com/McBoop69420/jaredluyster.com.git "$REPO"
fi
cd "$REPO"
git pull --ff-only --quiet origin main
SUMMARY="$(mktemp)"
status=0
python scripts/comic-tracker/tracker.py --summary "$SUMMARY" || status=$?

for f in "${FILES[@]}"; do   # discoveries.md only exists while there is something to report
  if [ -e "$f" ] || git ls-files --error-unmatch "$f" >/dev/null 2>&1; then git add -A -- "$f"; fi
done
if git diff --cached --quiet -I '^  "generated": ' -- "${FILES[@]}"; then
  git reset --quiet -- "${FILES[@]}"
  git checkout --quiet -- "${FILES[@]}" 2>/dev/null || true
  echo "no changes"
  exit "$status"
fi
git --no-pager diff --cached --stat -- "${FILES[@]}"
if [ "${1:-}" = "--dry-run" ]; then
  git --no-pager diff --cached -- "${FILES[@]}"
  git reset --quiet -- "${FILES[@]}"
  git checkout --quiet -- "${FILES[@]}" 2>/dev/null || true
  echo "dry run: nothing committed"
  exit "$status"
fi
git commit --quiet -m "Calendar: refresh comic release reminders ($(date '+%Y-%m-%d'))" -m "$(cat "$SUMMARY")"
for attempt in 1 2 3; do
  if git push --quiet origin main; then
    echo "pushed $(git rev-parse --short HEAD)"
    exit "$status"
  fi
  # Someone pushed in between: replay the tracker commit on top and retry.
  git pull --rebase --quiet origin main
done
echo "ERROR: push failed" >&2
exit 1
}
