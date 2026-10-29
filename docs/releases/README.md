# Releases page

Read-only page at wizardbattle.jaredluyster.com/releases/. `releases.json` is a
snapshot written by the export script in the wizard-battle-demo repo and copied
here. The site is public: no Unity/App Store Connect/Firebase ids, keys, tester
names or itch download keys in the JSON.

Schema:

```json
{
  "generated": "2026-10-29",
  "bundleVersion": "2.0.0",
  "releases": [
    {
      "build": 412, "tag": "b412", "date": "2026-10-29", "sha": "abc1234",
      "bundleVersion": "2.0.0",
      "flags": { "DuelModeEnabled": false, "TutorialEnabled": true },
      "platforms": { "ios": "live", "android": "submitted", "windows": "unknown" },
      "changelog": "section text for this build"
    }
  ],
  "unreleased": {
    "since": "b412",
    "commits": [ { "sha": "abc1234", "subject": "..." } ],
    "flags": { "DuelModeEnabled": false, "TutorialEnabled": true },
    "clean": true, "pushed": true
  }
}
```

Platform status values: `live`, `submitted` (or any other word, shown amber), `unknown`.
