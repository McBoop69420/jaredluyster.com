#!/usr/bin/env node
// Records graded expert picks for the Betting page's leaderboard (sports.jaredluyster.com/betting/).
//
// For each day asked for (default: the 4 days before today, ET) and each league,
// builds that day's picks exactly as /api/picks does (sports/_worker.js buildPicks),
// keeps the graded ones, and merges them into sports/picks-history/days/<date>.json.
// Then re-sums every day file into sports/picks-history/leaderboard.json. Files are
// only rewritten when their content changes, and nothing in them depends on the
// clock, so a run with nothing new leaves the tree clean.
//
// Run by scripts/picks-ledger.sh (the daily Scheduled Task on Jared-Server), which
// commits and pushes the result. By hand:
//   node scripts/picks-ledger.mjs                       # last 4 days
//   node scripts/picks-ledger.mjs --days 7
//   node scripts/picks-ledger.mjs --from 2026-09-01 --to 2026-10-15   # backfill
//
// Action Network keeps graded picks for past days, so a missed run is made up by
// the next one's lookback (or a backfill). CBS only shows the current week, so CBS
// picks are recorded only by runs made before CBS moves on to the next week.

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PL = require(path.join(ROOT, "sports", "picks-ledger.js"));
const { buildPicks } = await import(new URL("../sports/_worker.js", import.meta.url).href);

const OUT = path.join(ROOT, "sports", "picks-history");
const DAYS_DIR = path.join(OUT, "days");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : null;
}

const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
function shift(date, days) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

const today = ET_DATE.format(new Date());
const yesterday = shift(today, -1);
let from, to;
if (arg("from")) {
  from = arg("from");
  to = arg("to") || yesterday;
} else {
  const n = Math.max(1, parseInt(arg("days") || "4", 10));
  to = yesterday;
  from = shift(to, -(n - 1));
}
if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
  console.error("bad --from/--to (want YYYY-MM-DD)");
  process.exit(2);
}
if (to > yesterday) to = yesterday; // today's games aren't all graded yet

// CBS pages are the same for every date in a run (they only show the current
// week), so fetch each one once.
const realFetch = globalThis.fetch;
const cbsCache = new Map();
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://www.cbssports.com/")) return realFetch(url, init);
  if (!cbsCache.has(u)) {
    cbsCache.set(u, realFetch(url, init).then(async r => ({ ok: r.ok, status: r.status, text: r.ok ? await r.text() : "" })));
  }
  const r = await cbsCache.get(u);
  return new Response(r.text, { status: r.ok ? 200 : r.status || 502 });
};

// One game per line: small diffs, still valid JSON.
function serializeDay(day) {
  const leagues = Object.keys(day.leagues).filter(k => day.leagues[k].length).sort(
    (a, b) => PL.LEAGUES.indexOf(a) - PL.LEAGUES.indexOf(b));
  const parts = leagues.map(k => JSON.stringify(k) + ":[\n" + day.leagues[k].map(g => JSON.stringify(g)).join(",\n") + "\n]");
  return '{"date":' + JSON.stringify(day.date) + ',"leagues":{\n' + parts.join(",\n") + "\n}}\n";
}

function serializeBoard(board) {
  const rows = list => "[\n" + list.map(r => JSON.stringify(r)).join(",\n") + "\n]";
  const windows = Object.entries(board.windows).map(([name, w]) =>
    JSON.stringify(name) + ':{"experts":' + rows(w.experts) + ',\n"consensus":' + rows(w.consensus) + "}");
  return '{"from":' + JSON.stringify(board.from) + ',"to":' + JSON.stringify(board.to) + ',"days":' + board.days +
    ',"windowDays":' + board.windowDays + ',\n"windows":{\n' + windows.join(",\n") + "\n}}\n";
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch (e) { return null; }
}

async function writeIfChanged(file, text) {
  let old = null;
  try { old = await readFile(file, "utf8"); } catch (e) { /* new file */ }
  if (old === text) return false;
  await writeFile(file, text);
  return true;
}

await mkdir(DAYS_DIR, { recursive: true });
let failures = 0;
for (let date = from; date <= to; date = shift(date, 1)) {
  const file = path.join(DAYS_DIR, date + ".json");
  const old = (await readJson(file)) || { date, leagues: {} };
  const day = { date, leagues: {} };
  const notes = [];
  for (const league of PL.LEAGUES) {
    let fresh = [];
    try {
      const data = await buildPicks(league, date);
      const down = Object.entries(data.sources || {}).filter(([, s]) => !s.ok).map(([k]) => k);
      if (down.length) { notes.push(league + ": " + down.join("+") + " down"); failures++; }
      fresh = PL.ledgerGames(data);
    } catch (e) {
      notes.push(league + ": " + e.message);
      failures++;
    }
    day.leagues[league] = PL.mergeGames(old.leagues[league] || [], fresh);
  }
  const picks = Object.values(day.leagues).flat().reduce((n, g) => n + g.picks.length, 0);
  let changed = false;
  if (picks) changed = await writeIfChanged(file, serializeDay(day));
  console.log(date + ": " + picks + " graded picks" + (changed ? " (updated)" : "") + (notes.length ? " [" + notes.join("; ") + "]" : ""));
}

const days = [];
for (const name of (await readdir(DAYS_DIR)).sort()) {
  if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
  const d = await readJson(path.join(DAYS_DIR, name));
  if (d) days.push(d);
  else { console.error("unreadable " + name); failures++; }
}
const board = PL.buildLeaderboard(days);
const changed = await writeIfChanged(path.join(OUT, "leaderboard.json"), serializeBoard(board));
console.log("leaderboard: " + board.days + " days, " + board.from + " to " + board.to + (changed ? " (updated)" : ""));
// A source being down isn't fatal (the next run's lookback retries it), but say so
// in the exit code once it's every request.
process.exit(failures && failures >= PL.LEAGUES.length * (1 + (Date.parse(to) - Date.parse(from)) / 86400000) ? 1 : 0);
