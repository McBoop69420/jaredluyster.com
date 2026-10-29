# Releases page

Read-only page at wizardbattle.jaredluyster.com/releases/. It is a separate
record for tracking and accountability, in two independent files:

- `ledger.json`: the source of truth for what reached which platform. Edited by
  hand (or by Claude on request) every time a build is submitted, goes live, is
  pulled or fails. Append only; never rewrite history.
- `releases.json`: optional git snapshot (tags, flags, changelog, unreleased
  commits) from the export script in wizard-battle-demo. The page uses it only
  to cross-check the ledger.

The page raises an accountability issue when: a ledgered build has no git tag,
a build reached a platform with `DuelModeEnabled` true, a tagged build was never
ledgered, an entry lacks `by` or `date`, or main has `DuelModeEnabled` true.

The site is public: no Unity/App Store Connect/Firebase ids, keys, tester names
or itch download keys. Use roles or first names in `by`, not emails.

## ledger.json

```json
{ "entries": [
  { "build": 412, "platform": "ios", "action": "live",
    "date": "2026-10-29", "by": "jared", "note": "TestFlight internal group" }
] }
```

`platform`: `ios` | `android` | `windows`. `action`: `submitted` | `live` | `pulled` | `failed`.
The "current build" card for a platform is its most recent `live` entry.

## releases.json

```json
{
  "generated": "2026-10-29", "bundleVersion": "2.0.0",
  "releases": [ { "build": 412, "tag": "b412", "date": "...", "sha": "abc1234",
                  "bundleVersion": "2.0.0",
                  "flags": { "DuelModeEnabled": false, "TutorialEnabled": true },
                  "changelog": "section text for this build" } ],
  "unreleased": { "since": "b412", "commits": [ { "sha": "abc1234", "subject": "..." } ],
                  "flags": { "DuelModeEnabled": false, "TutorialEnabled": true },
                  "clean": true, "pushed": true }
}
```
