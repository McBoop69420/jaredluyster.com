// Tests for the Expert Picks history on sports.jaredluyster.com/betting/: the graded-pick
// ledger and leaderboard maths in sports/picks-ledger.js (scripts/picks-ledger.mjs writes
// the files, the Betting page ranks them).
// Run: node --test tests/*.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PL = require("../sports/picks-ledger.js");

const AN = "Action Network", CBS = "CBS Sports";

function pick(expert, market, side, line, odds, result, src = AN) {
  return { src, expert, market, side, line, odds, result, rec: "1-0", recLabel: "last 30 days" };
}

// A /api/picks game: SEA @ DEN, 5 on SEA -2.5 (4 lose, plus one at -3 that pushes),
// 1 on DEN; total 2-2 split.
function apiGame(id = "an1", extra = []) {
  return {
    id, start: "2026-10-16T00:15:00.000Z", status: "complete", time: null,
    away: { abbr: "SEA", name: "Seattle" }, home: { abbr: "DEN", name: "Denver" }, props: 3,
    picks: [
      pick("A", "spread", "away", -2.5, -110, "loss"),
      pick("B", "spread", "away", -2.5, -115, "loss"),
      pick("C ", "spread", "away", -2.5, -110, "loss"),
      pick("D", "spread", "away", -2.5, -110, "loss"),
      pick("E", "spread", "away", -3, -105, "push"),
      pick("F", "spread", "home", 3, 120, "win"),
      pick("A", "total", "over", 40.5, -110, "loss"),
      pick("B", "total", "over", 40.5, -110, "loss"),
      pick("C", "total", "under", 40.5, -110, "win"),
      pick("D", "total", "under", 40.5, -110, "win"),
      ...extra,
    ],
  };
}

test("ledgerGames keeps graded full-game picks, trims names, and grades the consensus", () => {
  const games = PL.ledgerGames({ games: [apiGame("an1", [pick("G", "ml", "home", null, 130, null)]),
    { id: "an2", away: { abbr: "X" }, home: { abbr: "Y" }, picks: [pick("A", "ml", "home", null, -150, null)] }] });
  assert.equal(games.length, 1, "a game with nothing graded is dropped");
  const g = games[0];
  assert.deepEqual([g.id, g.away, g.home, g.picks.length], ["an1", "SEA", "DEN", 10]);
  assert.deepEqual(Object.keys(g.picks[0]).sort(), ["expert", "line", "market", "result", "side", "src"], "no odds kept");
  assert.equal(g.picks[2].expert, "C");
  assert.deepEqual(g.consensus.spread, { side: "away", line: -2.5, n: 5, count: 6, result: "loss" });
  assert.equal(g.consensus.total, undefined, "a 2-2 split has no consensus");
  assert.equal(g.consensus.ml, undefined);
});

test("mergeGames keeps picks a later run no longer sees and takes newer gradings", () => {
  const cbsPick = pick("Pete Prisco", "spread", "home", 3, null, "win", CBS);
  const first = PL.ledgerGames({ games: [apiGame("an1", [cbsPick])] });
  const later = apiGame("an1");
  later.picks[5] = pick("F", "spread", "home", 3, 120, "push"); // regraded
  const merged = PL.mergeGames(first, PL.ledgerGames({ games: [later, apiGame("an0")] }));
  assert.deepEqual(merged.map(g => g.id), ["an0", "an1"], "sorted by start, then id");
  const g = merged[1];
  assert.equal(g.picks.length, 11, "CBS pick from the earlier run survives");
  assert.equal(g.picks.find(p => p.expert === "F").result, "push");
  assert.deepEqual(g.consensus.spread, { side: "away", line: -2.5, n: 5, count: 7, result: "loss" });
  assert.deepEqual(PL.mergeGames(first, []), first, "an empty re-run changes nothing");
  const legacy = [{ ...first[0], picks: first[0].picks.map(p => ({ ...p, odds: -110 })) }];
  assert.deepEqual(PL.mergeGames(legacy, []), first, "odds in older files are dropped");
});

function day(date, league, games) {
  return { date, leagues: { [league]: PL.ledgerGames({ games }) } };
}

test("buildLeaderboard sums experts and consensus per league and market, with a 30-day window", () => {
  const board = PL.buildLeaderboard([
    day("2026-10-15", "nfl", [apiGame("an1")]),
    day("2026-09-01", "mlb", [{ id: "an9", away: { abbr: "TB" }, home: { abbr: "CLE" },
      picks: [pick("A", "ml", "home", null, -150, "win"), pick("B", "ml", "home", null, -140, "win")] },
    { id: "an8", away: { abbr: "NYY" }, home: { abbr: "BOS" }, picks: ["H", "I", "J", "K"].map(x =>
      pick(x, "ml", "home", null, -120, "win")).concat(["L", "M"].map(x => pick(x, "ml", "away", null, 110, "loss"))) }]),
  ]);
  assert.deepEqual([board.from, board.to, board.days], ["2026-09-01", "2026-10-15", 2]);
  const a = board.windows.all.experts.filter(r => r.expert === "A");
  assert.deepEqual(a.map(r => [r.league, r.market, r.w, r.l, r.p]),
    [["mlb", "ml", 1, 0, 0], ["nfl", "spread", 0, 1, 0], ["nfl", "total", 0, 1, 0]]);
  assert.deepEqual(Object.keys(a[0]).sort(), ["expert", "l", "league", "market", "p", "src", "w"], "records only");
  assert.ok(!board.windows.last30.experts.some(r => r.league === "mlb"), "September is outside the last 30 days");
  const cons = board.windows.all.consensus;
  assert.deepEqual(cons.find(r => r.league === "nfl" && r.market === "spread" && r.tier === "all"),
    { league: "nfl", market: "spread", tier: "all", w: 0, l: 1, p: 0 });
  assert.ok(cons.some(r => r.league === "nfl" && r.tier === "strong"), "5 of 6 on one side is a strong lean");
  assert.ok(!cons.some(r => r.league === "mlb" && r.tier === "strong"),
    "2 picks is too few to be strong, and 4 of 6 is under 75%");
  assert.deepEqual(cons.find(r => r.league === "mlb" && r.tier === "all"),
    { league: "mlb", market: "ml", tier: "all", w: 2, l: 0, p: 0 });
  assert.deepEqual(PL.buildLeaderboard([day("2026-09-01", "mlb", []), day("2026-10-15", "nfl", [apiGame()])]).windows,
    PL.buildLeaderboard([day("2026-10-15", "nfl", [apiGame()]), day("2026-09-01", "mlb", [])]).windows,
    "same ledger, same file");
});

const BOARD = [
  { src: AN, expert: "A", league: "nfl", market: "spread", w: 6, l: 4, p: 1 },
  { src: AN, expert: "A", league: "mlb", market: "ml", w: 3, l: 1, p: 0 },
  { src: AN, expert: "B", league: "nfl", market: "spread", w: 9, l: 3, p: 0 },
  { src: CBS, expert: "C", league: "nfl", market: "ml", w: 10, l: 2, p: 0 },
  { src: AN, expert: "D", league: "nfl", market: "total", w: 2, l: 0, p: 0 },
];

test("rankExperts filters by league and market, hides small samples, ranks by win rate", () => {
  const all = PL.rankExperts(BOARD, { minPicks: 10 });
  assert.deepEqual(all.rows.map(r => r.expert), ["C", "B", "A"]);
  assert.equal(all.hidden, 1);
  const a = all.rows.find(r => r.expert === "A");
  assert.deepEqual([a.w, a.l, a.p, a.graded], [9, 5, 1, 15]);
  assert.equal(a.pct, 9 / 14, "pushes left out of the win rate");
  const spreadNfl = PL.rankExperts(BOARD, { leagues: ["nfl"], market: "spread", minPicks: 1 });
  assert.deepEqual(spreadNfl.rows.map(r => r.expert), ["B", "A"]);
  assert.deepEqual(PL.rankExperts(BOARD, { leagues: ["mlb"], minPicks: 5 }), { rows: [], hidden: 1 });
});

test("consensusRecord totals the consensus side per market and overall", () => {
  const rows = [
    { league: "nfl", market: "spread", tier: "all", w: 5, l: 5, p: 1 },
    { league: "nfl", market: "spread", tier: "strong", w: 3, l: 1, p: 0 },
    { league: "mlb", market: "total", tier: "all", w: 2, l: 4, p: 0 },
  ];
  const all = PL.consensusRecord(rows, {});
  assert.deepEqual(all.spread.all, { w: 5, l: 5, p: 1, graded: 11, pct: 0.5 });
  assert.deepEqual(all.all.all, { w: 7, l: 9, p: 1, graded: 17, pct: 7 / 16 });
  assert.equal(all.all.strong.pct, 0.75);
  assert.equal(all.ml.all.pct, null);
  assert.equal(PL.consensusRecord(rows, { leagues: ["mlb"] }).spread.all.graded, 0);
});
