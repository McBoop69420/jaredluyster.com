#!/usr/bin/env node
// Logs and grades System Bets (sports/system-bets.js) for the Betting page.
//
// 1. Grades every open bet whose game is over (final score, closing line), or
//    marks it no action if the game was canceled or postponed.
// 2. Logs today's (ET) qualifying bets at the line and price posted right now.
//    Run at 6:00 AM ET by scripts/picks-ledger.sh, so "the 6 AM line" is literal;
//    a later hand run logs at that later line (each bet keeps its loggedAt).
//
// Writes sports/system-bets/<rule>.json only when it changes (one bet per line),
// which picks-ledger.sh then commits and pushes with the expert ledger. By hand:
//   node scripts/system-bets.mjs              # grade, then log today
//   node scripts/system-bets.mjs --no-log     # grade only

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SB = require(path.join(ROOT, "sports", "system-bets.js"));
const EP = require(path.join(ROOT, "sports", "expert-picks.js"));
const { buildPicks } = await import(new URL("../sports/_worker.js", import.meta.url).href);

const DIR = path.join(ROOT, "sports", "system-bets");
const FILE = path.join(DIR, SB.RULE.id + ".json");
const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const today = ET_DATE.format(new Date());

function serialize(doc) {
  return '{"rule":' + JSON.stringify(doc.rule) + ',"bets":[' +
    (doc.bets.length ? "\n" + doc.bets.map(b => JSON.stringify(b)).join(",\n") + "\n" : "") + "]}\n";
}

let doc;
try {
  doc = JSON.parse(await readFile(FILE, "utf8"));
} catch (e) {
  doc = { bets: [] };
}
doc.rule = { id: SB.RULE.id, label: SB.RULE.label, league: SB.RULE.league, market: SB.RULE.market,
  stake: SB.RULE.stake, minPicks: SB.RULE.minPicks, minShare: SB.RULE.minShare };

const byDate = new Map();
async function slate(date) {
  if (!byDate.has(date)) byDate.set(date, await buildPicks(SB.RULE.league, date));
  return byDate.get(date);
}

let failures = 0;
const openDates = [...new Set(doc.bets.filter(b => !b.result).map(b => b.date))].filter(d => d <= today).sort();
const games = new Map();
for (const date of openDates) {
  try {
    for (const g of (await slate(date)).games) games.set(g.id, g);
  } catch (e) {
    console.error("grading " + date + ": " + e.message);
    failures++;
  }
}
const graded = SB.gradeBets(doc.bets, games);
doc.bets = graded.bets;

let added = 0;
if (!process.argv.includes("--no-log")) {
  try {
    const data = await slate(today);
    const down = Object.entries(data.sources || {}).filter(([, s]) => !s.ok).map(([k]) => k);
    if (down.length) console.error("logging " + today + ": " + down.join("+") + " down");
    const r = SB.addBets(doc.bets, SB.candidates(data.games, EP, Date.now()));
    doc.bets = r.bets;
    added = r.added;
  } catch (e) {
    console.error("logging " + today + ": " + e.message);
    failures++;
  }
}

await mkdir(DIR, { recursive: true });
const text = serialize(doc);
let old = null;
try { old = await readFile(FILE, "utf8"); } catch (e) { /* first run */ }
if (old !== text) await writeFile(FILE, text);
const s = SB.summarize(doc.bets);
console.log("system bets (" + SB.RULE.id + "): " + added + " logged, " + graded.graded + " graded; " +
  s.won + "-" + s.lost + "-" + s.push + ", " + s.profit + "u, " + s.open + " open" + (old !== text ? " (updated)" : ""));
process.exit(failures ? 1 : 0);
