#!/usr/bin/env node
// Builds the Daily Brief snapshot for sports.jaredluyster.com/brief/.
//
// Pulls yesterday's finals (the recap) and today's slate (the preview) from ESPN
// with the same code the page uses (sports/brief-core.js), selects My Teams plus
// the top 10 of everything else for each half, and writes sports/brief/snapshot.json.
// The page loads that file first so it opens instantly.
//
// Run by scripts/sports-brief.sh (Scheduled Task "Sports Daily Brief", 7:30 AM ET),
// which commits and pushes the result. By hand:
//   node scripts/sports-brief.mjs
//
// It refuses to overwrite a good snapshot with an empty one: if ESPN failed for
// most leagues the old file stays and the run exits non-zero.

import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Core = require(path.join(ROOT, "sports", "brief-core.js"));
const OUT = path.join(ROOT, "sports", "brief", "snapshot.json");

const brief = await Core.buildBrief();

// 31 league feeds per half. A few quiet or flaky ones are normal; most of them
// failing means ESPN (or this machine's network) was down, not that nothing played.
const FEEDS = Core.LEAGUES.length * 2;
if (brief.failed > FEEDS / 2) {
  console.error(`ERROR: ${brief.failed} of ${FEEDS} ESPN feeds failed; keeping the existing snapshot.`);
  process.exit(1);
}
if (!brief.recap.total && !brief.preview.total && brief.failed) {
  console.error("ERROR: no games and some feeds failed; keeping the existing snapshot.");
  process.exit(1);
}

await writeFile(OUT, JSON.stringify(brief) + "\n");
console.log(
  `snapshot ${brief.recapDate} -> ${brief.previewDate}: ` +
  `${brief.recap.total} finals (${brief.recap.mine.length} mine), ` +
  `${brief.preview.total} today (${brief.preview.mine.length} mine)` +
  (brief.failed ? `, ${brief.failed} feeds failed` : "")
);
