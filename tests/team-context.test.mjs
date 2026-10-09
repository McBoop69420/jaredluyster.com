// Tests for sports/team-context.js (Team Context on sports.jaredluyster.com/betting/,
// a port of BettingEdge's live MLB slate maths).
// Run: node --test tests/*.test.mjs
//
// TEAM_CONTEXT_UNDER_TEST=<path> points the suite at another copy of the module (used to
// mutation-test that these assertions really fail when the logic is broken).
// The expected numbers follow BettingEdge's own definitions: sql/010 + sql/020 for the
// fatigue profile, src/db/wave1-fatigue-rule.mjs for the flag, and
// src/preview/compute-slate-metrics.mjs for off days, travel and road days.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TC = require(process.env.TEAM_CONTEXT_UNDER_TEST || "../sports/team-context.js");

// Team ids: 1 = A, 2 = B, 3 = C, 4 = D. Each home team has its own park.
const PARK = { 1: 101, 2: 102, 3: 103, 4: 104 };
let pk = 1;
function game(date, away, home, opts = {}) {
  return {
    gamePk: pk++,
    gameType: opts.type || "R",
    gameDate: date + "T" + (opts.time || "23:05") + ":00Z",
    officialDate: date,
    status: { detailedState: opts.status || "Final", codedGameState: opts.code || "F" },
    teams: { away: { team: { id: away, abbreviation: "T" + away } }, home: { team: { id: home, abbreviation: "T" + home } } },
    venue: { id: opts.venue || PARK[home], name: "Park " + (opts.venue || PARK[home]) },
    gameNumber: opts.gameNumber || 1,
    lineups: opts.lineups,
  };
}
function payload(games) {
  const byDate = new Map();
  for (const g of games) {
    if (!byDate.has(g.officialDate)) byDate.set(g.officialDate, []);
    byDate.get(g.officialDate).push(g);
  }
  return { dates: [...byDate].map(([date, gs]) => ({ date, games: gs })) };
}
const rows = games => TC.scheduleGames(payload(games));

test("dates: day arithmetic across months and years", () => {
  assert.equal(TC.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(TC.addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(TC.addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(TC.daysBetween("2026-03-30", "2026-04-02"), 3);
});

test("scheduleGames: keeps only regular season and postseason, oldest first", () => {
  const g = rows([
    game("2026-09-02", 1, 2),
    game("2026-03-01", 1, 2, { type: "S" }),       // spring training
    game("2026-07-14", 1, 2, { type: "A" }),       // All-Star Game
    game("2026-10-05", 1, 2, { type: "D" }),
    game("2026-09-01", 1, 2, { time: "23:05" }),
    game("2026-09-01", 1, 2, { time: "17:05", gameNumber: 1 }),
  ]);
  assert.deepEqual(g.map(x => x.date + "/" + x.start.slice(11, 16)),
    ["2026-09-01/17:05", "2026-09-01/23:05", "2026-09-02/23:05", "2026-10-05/23:05"]);
});

test("scheduleGames: postponed and cancelled games are marked off", () => {
  const g = rows([
    game("2026-09-01", 1, 2, { status: "Postponed", code: "D" }),
    game("2026-09-02", 1, 2, { status: "Cancelled", code: "C" }),
    game("2026-09-03", 1, 2),
  ]);
  assert.deepEqual(g.map(x => x.off), [true, true, false]);
});

test("fatigue: a full week without a day off on a long road trip", () => {
  // Team 1 plays every day Sep 1-7 on the road, then again on the road Sep 8.
  const sched = [];
  for (let d = 1; d <= 8; d++) sched.push(game("2026-09-0" + d, 1, 2));
  const p = TC.fatigueProfile(rows(sched), 1, "2026-09-08");
  assert.equal(p.offDays, 0);
  assert.equal(p.gamesPrev3d, 3);
  assert.equal(p.gamesPrev7d, 7);
  assert.equal(p.gamesYesterday, 1);
  assert.equal(p.roadStreak, 8);
  assert.equal(p.score, 25 + 22 + 22 + 10 + 16);   // 95
  assert.equal(p.tier, "burnt");
  assert.equal(p.burnout, true);
});

test("fatigue: the same week seen from the home side has no road points", () => {
  const sched = [];
  for (let d = 1; d <= 8; d++) sched.push(game("2026-09-0" + d, 1, 2));
  const p = TC.fatigueProfile(rows(sched), 2, "2026-09-08");
  assert.equal(p.roadStreak, 0);
  assert.equal(p.score, 79);
  assert.equal(p.tier, "burnt");
});

test("fatigue: each score step and tier boundary", () => {
  const s = (o) => TC.fatigueScore(Object.assign(
    { offDays: 3, gamesPrev3d: 0, gamesPrev7d: 0, gamesToday: 1, gamesYesterday: 0, roadStreak: 0 }, o));
  assert.equal(s({}), 0);
  assert.equal(s({ offDays: null }), 0);
  assert.equal(s({ offDays: 0 }), 25);
  assert.equal(s({ offDays: 1 }), 10);
  assert.equal(s({ gamesPrev3d: 2 }), 14);
  assert.equal(s({ gamesPrev3d: 4 }), 22);
  assert.equal(s({ gamesPrev7d: 4 }), 8);
  assert.equal(s({ gamesPrev7d: 5 }), 16);
  assert.equal(s({ gamesPrev7d: 6 }), 22);
  assert.equal(s({ gamesToday: 2 }), 22);
  assert.equal(s({ gamesYesterday: 1 }), 10);
  assert.equal(s({ gamesYesterday: 2 }), 18);
  assert.equal(s({ roadStreak: 2 }), 0);
  assert.equal(s({ roadStreak: 3 }), 8);
  assert.equal(s({ roadStreak: 6 }), 16);
  assert.equal(s({ offDays: 0, gamesPrev3d: 3, gamesPrev7d: 6, gamesToday: 2, gamesYesterday: 2, roadStreak: 6 }), 100);
  assert.deepEqual([0, 24, 25, 44, 45, 69, 70, 100].map(TC.fatigueTier),
    ["fresh", "fresh", "elevated", "elevated", "stressed", "stressed", "burnt", "burnt"]);
});

test("fatigue: doubleheaders today and yesterday", () => {
  const g = rows([
    game("2026-09-09", 1, 2, { time: "17:05" }), game("2026-09-09", 1, 2, { time: "23:05", gameNumber: 2 }),
    game("2026-09-10", 1, 2, { time: "17:05" }), game("2026-09-10", 1, 2, { time: "23:05", gameNumber: 2 }),
  ]);
  const p = TC.fatigueProfile(g, 1, "2026-09-10");
  assert.equal(p.gamesToday, 2);
  assert.equal(p.gamesYesterday, 2);
  assert.equal(p.gamesPrev3d, 2);
  assert.equal(p.roadStreak, 3); // today's first game plus yesterday's two
  assert.equal(p.score, 25 + 14 + 0 + 22 + 18 + 8);
});

test("fatigue: off days, no prior game, no game today, postponed games don't count", () => {
  const g = rows([
    game("2026-09-01", 1, 2),
    game("2026-09-03", 1, 2, { status: "Postponed", code: "D" }),
    game("2026-09-04", 1, 2),
  ]);
  const p = TC.fatigueProfile(g, 1, "2026-09-04");
  assert.equal(p.offDays, 2);        // Sep 2 and Sep 3 (rained out) were both days off
  assert.equal(p.gamesPrev3d, 1);    // Sep 1 only; the rainout isn't a game played
  assert.equal(TC.fatigueProfile(g, 1, "2026-09-01").offDays, null);
  assert.equal(TC.fatigueProfile(g, 1, "2026-09-02"), null);
  assert.equal(TC.fatigueProfile(g, 1, "2026-09-03"), null);
});

test("fatigue: road streak stops at the last home game", () => {
  const g = rows([
    game("2026-09-01", 1, 2), game("2026-09-02", 2, 1), game("2026-09-03", 1, 3),
    game("2026-09-04", 1, 3), game("2026-09-06", 1, 4),
  ]);
  assert.equal(TC.fatigueProfile(g, 1, "2026-09-06").roadStreak, 3);
});

test("wave-1: flags the fresh side only against a burnt one with 2+ days more rest", () => {
  const burnt = { tier: "burnt", offDays: 0 };
  const fresh = (offDays) => ({ tier: "fresh", offDays });
  assert.deepEqual(TC.evaluateWave1(fresh(2), burnt),
    { side: "home", restAdvantageDays: 2, market: "moneyline", rule: "v1_fatigue_rest_rule" });
  assert.equal(TC.evaluateWave1(burnt, fresh(3)).side, "away");
  assert.equal(TC.evaluateWave1(burnt, fresh(3)).restAdvantageDays, 3);
  assert.equal(TC.evaluateWave1(fresh(1), burnt), null);                 // only 1 day better
  assert.equal(TC.evaluateWave1({ tier: "elevated", offDays: 4 }, burnt), null);
  assert.equal(TC.evaluateWave1(fresh(4), { tier: "stressed", offDays: 0 }), null);
  assert.equal(TC.evaluateWave1(fresh(4), { tier: "burnt", offDays: null }).restAdvantageDays, 4); // null counts as 0
  assert.equal(TC.evaluateWave1(fresh(3), burnt, 4), null);
  assert.equal(TC.evaluateWave1(null, burnt), null);
});

test("next off day: first open date after today, or null past the horizon", () => {
  const g = rows([game("2026-09-10", 1, 2), game("2026-09-11", 1, 2), game("2026-09-12", 1, 2), game("2026-09-14", 1, 2)]);
  assert.deepEqual(TC.nextOffDay(g, 1, "2026-09-10"), { date: "2026-09-13", inDays: 3 });
  assert.deepEqual(TC.nextOffDay(g, 1, "2026-09-12"), { date: "2026-09-13", inDays: 1 });
  const daily = [];
  for (let i = 0; i <= 25; i++) daily.push(game(TC.addDays("2026-08-01", i), 1, 2));
  assert.equal(TC.nextOffDay(rows(daily), 1, "2026-08-01"), null);
  assert.deepEqual(TC.nextOffDay(rows(daily), 1, "2026-08-01", 30), { date: "2026-08-27", inDays: 26 });
});

test("next travel: 0 means the team moves on after tonight", () => {
  const g = rows([
    game("2026-09-10", 1, 2), game("2026-09-11", 1, 3),                     // team 1 moves 2 -> 3
    game("2026-09-11", 4, 2), game("2026-09-12", 4, 2), game("2026-09-14", 2, 3), // team 2 home until 14th
  ]);
  const venue = rows([game("2026-09-10", 1, 2)])[0].venueKey;
  assert.deepEqual(TC.nextTravel(g, 1, "2026-09-10", venue), { date: "2026-09-11", inDays: 0 });
  assert.deepEqual(TC.nextTravel(g, 2, "2026-09-10", venue), { date: "2026-09-14", inDays: 3 });
  assert.equal(TC.nextTravel(g, 4, "2026-09-12", rows([game("2026-09-12", 4, 2)])[0].venueKey), null);
  assert.equal(TC.travelDayFlag({ inDays: 0 }, { inDays: 3 }), "away");
  assert.equal(TC.travelDayFlag({ inDays: 2 }, { inDays: 0 }), "home");
  assert.equal(TC.travelDayFlag({ inDays: 0 }, { inDays: 0 }), null);
  assert.equal(TC.travelDayFlag(null, null), null);
});

test("away road days: calendar days since the trip began, off days included", () => {
  const g = rows([
    game("2026-09-01", 2, 1),                       // last home game for team 1
    game("2026-09-03", 1, 3), game("2026-09-04", 1, 3),
    game("2026-09-06", 1, 4),                       // off day on the 5th still counts
  ]);
  assert.equal(TC.awayRoadDays(g, 1, "2026-09-06"), 4);
  assert.equal(TC.awayRoadDays(g, 1, "2026-09-03"), 1);
  assert.equal(TC.awayRoadDays(rows([game("2026-09-06", 2, 1)]), 1, "2026-09-06"), null);
});

test("lineup starts: counted per distinct game, summarised to one decimal", () => {
  const people = { people: [
    { id: 10, stats: [{ splits: [
      { stat: { gamesStarted: 1 }, game: { gamePk: 1 } },
      { stat: { gamesStarted: 0 }, game: { gamePk: 1 } },   // moved position mid-game
      { stat: { gamesStarted: 1 }, game: { gamePk: 2 } },
      { stat: { gamesStarted: 0 }, game: { gamePk: 3 } },   // came off the bench
    ] }] },
    { id: 11, stats: [{ splits: [{ stat: { gamesStarted: 1 }, game: { gamePk: 1 } }, { stat: { gamesStarted: 1 }, game: { gamePk: 1 } }] }] },
    { id: 12 },
  ] };
  const starts = TC.startsFromPeople(people);
  assert.deepEqual([...starts], [[10, 2], [11, 1], [12, 0]]);
  assert.deepEqual(TC.summaryStats([9, 8, 10, 7]), { mean: 8.5, median: 8.5, n: 4 });
  assert.deepEqual(TC.summaryStats([9, undefined, 3, 4]), { mean: 5.3, median: 4, n: 3 });
  assert.deepEqual(TC.summaryStats([]), { mean: null, median: null, n: 0 });
});

test("buildSlate: one row per game with both sides, the flag and the lineup edge", () => {
  // Team 1 has played 7 straight on the road; team 2 sat out the last three days.
  const hist = [];
  for (let d = 1; d <= 7; d++) hist.push(game("2026-09-0" + d, 1, 3));
  hist.push(game("2026-09-04", 4, 2));
  const today = game("2026-09-08", 1, 2, { lineups: {
    awayPlayers: [{ id: 10 }, { id: 11 }], homePlayers: [{ id: 20 }, { id: 21 }],
  } });
  const all = rows(hist.concat([today, game("2026-09-09", 1, 2), game("2026-09-10", 2, 4)]));
  const slate = rows([today]);
  const starts = new Map([[10, 9], [11, 8], [20, 5], [21, 6]]);
  const [row] = TC.buildSlate(all, slate, "2026-09-08", starts);

  assert.equal(row.away.fatigue.tier, "burnt");
  assert.equal(row.home.fatigue.offDays, 3);
  assert.equal(row.home.fatigue.tier, "fresh");
  assert.equal(row.flag.side, "home");
  assert.equal(row.flag.restAdvantageDays, 3);
  assert.equal(row.away.roadDays, 8);
  assert.equal(row.away.games10d, 7);
  assert.deepEqual(row.away.nextOff, { date: "2026-09-10", inDays: 2 });
  assert.deepEqual(row.home.travel, { date: "2026-09-10", inDays: 1 });
  assert.equal(row.travelFlag, null);
  assert.equal(row.away.lineup.mean, 8.5);
  assert.equal(row.lineupEdge, 3);
});

test("buildSlate: lineups not posted and postponed games", () => {
  const today = game("2026-09-08", 1, 2, { status: "Postponed", code: "D" });
  const [row] = TC.buildSlate(rows([today]), rows([today]), "2026-09-08", new Map());
  assert.equal(row.away.lineup, null);
  assert.equal(row.away.fatigue, null);
  assert.equal(row.flag, null);
  assert.equal(row.lineupEdge, null);
});
