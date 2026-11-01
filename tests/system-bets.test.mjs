// Tests for sports/system-bets.js (System Bets on sports.jaredluyster.com/betting/) and the
// Action Network fields it relies on (total, final) in sports/_worker.js.
// Run: node --test tests/*.test.mjs
//
// SYSTEM_BETS_UNDER_TEST=<path> points the suite at another copy of the module (used to
// mutation-test that these assertions really fail when the logic is broken).

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SB = require(process.env.SYSTEM_BETS_UNDER_TEST || "../sports/system-bets.js");
const EP = require("../sports/expert-picks.js");
const W = await import(new URL("../sports/_worker.js", import.meta.url).href);

const NOW = Date.parse("2026-11-07T11:00:00Z"); // 6:00 AM ET on a Saturday
const LATER = "2026-11-07T20:30:00.000Z";       // 3:30 PM ET kickoff

function picks(side, n, market = "total", line = 52.5) {
  return Array.from({ length: n }, (_, i) => ({ src: "Action Network", expert: side + market + i, market, side, line }));
}
function game(id, picksList, extra = {}) {
  return {
    id, start: LATER, status: "scheduled", away: { abbr: "UK" }, home: { abbr: "UGA" },
    picks: picksList, total: { line: 52.5, over: -110, under: -112 }, final: null, ...extra,
  };
}

test("candidates: a strong total lean is bet at the posted line and price on the experts' side", () => {
  const bets = SB.candidates([game("an1", [...picks("under", 6), ...picks("over", 1)])], EP, NOW);
  assert.equal(bets.length, 1);
  assert.deepEqual(
    { ...bets[0], loggedAt: undefined },
    { id: "cfb-strong-totals:an1", gameId: "an1", date: "2026-11-07", start: LATER, away: "UK", home: "UGA",
      side: "under", line: 52.5, odds: -112, stake: 1, experts: { on: 6, of: 7 }, loggedAt: undefined });
  assert.equal(bets[0].loggedAt, "2026-11-07T11:00:00.000Z");
});

test("candidates: weak leans, spread leans, started games and missing prices are skipped", () => {
  const cases = [
    game("few", picks("over", 4)),                                     // under 5 experts
    game("split", [...picks("over", 5), ...picks("under", 2)]),        // 71% < 75%
    game("spread", picks("away", 8, "spread", -3)),                    // a spread lean, not a total
    game("started", picks("over", 8), { start: "2026-11-07T10:00:00.000Z" }),
    game("noline", picks("over", 8), { total: null }),
    game("noprice", picks("over", 8), { total: { line: 50, over: null, under: -110 } }),
  ];
  assert.deepEqual(SB.candidates(cases, EP, NOW), []);
  // exactly at the thresholds qualifies: 6 of 8 = 75%, 5+ experts
  assert.equal(SB.candidates([game("edge", [...picks("over", 6), ...picks("under", 2)])], EP, NOW).length, 1);
});

test("addBets: a logged bet keeps its first line and price", () => {
  const first = SB.candidates([game("an1", picks("over", 6))], EP, NOW);
  const moved = SB.candidates([game("an1", picks("over", 6), { total: { line: 55, over: -120, under: 100 } })], EP, NOW);
  let r = SB.addBets([], first);
  assert.equal(r.added, 1);
  r = SB.addBets(r.bets, moved);
  assert.equal(r.added, 0);
  assert.equal(r.bets.length, 1);
  assert.equal(r.bets[0].line, 52.5);
  assert.equal(r.bets[0].odds, -110);
});

test("gradeTotal: over, under and push", () => {
  assert.equal(SB.gradeTotal("over", 52.5, { away: 30, home: 23 }), "won");
  assert.equal(SB.gradeTotal("over", 52.5, { away: 30, home: 22 }), "lost");
  assert.equal(SB.gradeTotal("under", 52.5, { away: 30, home: 22 }), "won");
  assert.equal(SB.gradeTotal("under", 52, { away: 30, home: 22 }), "push");
  assert.equal(SB.gradeTotal("over", 52, { away: 30, home: 22 }), "push");
});

test("gradeBets: settles finished games with profit and closing line, voids canceled ones, leaves the rest", () => {
  const bet = (id, side, odds) => ({ id, gameId: id, side, line: 52.5, odds, stake: 1, date: "2026-11-07" });
  const bets = [bet("w", "over", -110), bet("l", "under", 120), bet("p", "over", 150), bet("v", "over", -110), bet("o", "over", -110), bet("gone", "over", -110)];
  bets[2].line = 52;
  const games = new Map([
    ["w", { id: "w", status: "complete", final: { away: 40, home: 20 }, total: { line: 54.5 } }],
    ["l", { id: "l", status: "complete", final: { away: 40, home: 20 }, total: { line: 51 } }],
    ["p", { id: "p", status: "complete", final: { away: 30, home: 22 }, total: null }],
    ["v", { id: "v", status: "cancelled", final: null, total: null }],
    ["o", { id: "o", status: "scheduled", final: null, total: { line: 53 } }],
  ]);
  const { bets: out, graded } = SB.gradeBets(bets, games);
  const by = Object.fromEntries(out.map(b => [b.id, b]));
  assert.equal(graded, 4);
  assert.deepEqual([by.w.result, by.w.profit, by.w.close], ["won", 0.91, 54.5]);
  assert.deepEqual([by.l.result, by.l.profit, by.l.close], ["lost", -1, 51]);
  assert.deepEqual([by.p.result, by.p.profit, by.p.close], ["push", 0, undefined]);
  assert.deepEqual([by.v.result, by.v.profit], ["void", 0]);
  assert.equal(by.o.result, undefined);
  assert.equal(by.gone.result, undefined);
  // graded bets are never regraded, even if the feed later says something else
  const again = SB.gradeBets(out, new Map([["w", { id: "w", status: "complete", final: { away: 0, home: 0 }, total: { line: 40 } }]]));
  assert.equal(again.graded, 0);
  assert.equal(again.bets.find(b => b.id === "w").result, "won");
});

test("toWin and closing-line value", () => {
  assert.equal(SB.toWin(150), 1.5);
  assert.ok(Math.abs(SB.toWin(-110) - 0.909) < 0.001);
  assert.equal(SB.clv({ side: "over", line: 52.5, close: 54.5 }), 2);
  assert.equal(SB.clv({ side: "under", line: 52.5, close: 54.5 }), -2);
  assert.equal(SB.clv({ side: "under", line: 52.5 }), null);
});

test("summarize: record, units, ROI without pushes or voids, open count, CLV", () => {
  const s = SB.summarize([
    { result: "won", profit: 0.91, stake: 1, side: "over", line: 50, close: 51 },
    { result: "lost", profit: -1, stake: 1, side: "under", line: 50, close: 51 },
    { result: "won", profit: 1.5, stake: 1, side: "under", line: 48, close: 46 },
    { result: "push", profit: 0, stake: 1, side: "over", line: 50, close: 50 },
    { result: "void", profit: 0, stake: 1, side: "over", line: 50 },
    { stake: 1, side: "over", line: 50 },
  ]);
  assert.deepEqual([s.won, s.lost, s.push, s.void, s.open], [2, 1, 1, 1, 1]);
  assert.equal(s.profit, 1.41);
  assert.equal(s.risked, 3);
  assert.ok(Math.abs(s.roi - 0.47) < 1e-9);
  assert.ok(Math.abs(s.winRate - 2 / 3) < 1e-9);
  assert.equal(s.avgClv, 0.5); // (+1 -1 +2 +0) / 4
  assert.equal(s.beatClose, 2);
  assert.equal(SB.summarize([]).roi, null);
});

test("panelHtml escapes team names and shows an empty state", () => {
  assert.match(SB.panelHtml({ bets: [] }), /No bets yet/);
  const html = SB.panelHtml({ bets: [{ id: "x", date: "2026-11-07", start: LATER, away: "<b>", home: "UGA", side: "over",
    line: 52.5, odds: -110, stake: 1, experts: { on: 6, of: 7 } }] });
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;/);
});

// ---- the worker side: Action Network's total and final score -----------------------

function anGame(extra) {
  return {
    id: 7, start_time: "2026-11-07T20:30:00.000Z", status: "scheduled", away_team_id: 1, home_team_id: 2,
    teams: [{ id: 1, abbr: "UK", full_name: "Kentucky Wildcats" }, { id: 2, abbr: "UGA", full_name: "Georgia Bulldogs" }],
    experts: [], ...extra,
  };
}
const totals = (line, over, under) => ({ "15": { event: { total: [
  { side: "under", value: line, odds: under }, { side: "over", value: line, odds: over }] } },
  "30": { event: { total: [{ side: "over", value: line + 3, odds: -105 }, { side: "under", value: line + 3, odds: -115 }] } } });

test("normalizeActionNetwork keeps the Consensus book's total and, once complete, the final score", () => {
  const [pre] = W.normalizeActionNetwork({ games: [anGame({ markets: totals(52.5, -110, -112) })] }, "2026-11-07");
  assert.deepEqual(pre.total, { line: 52.5, over: -110, under: -112 });
  assert.equal(pre.final, null);
  const [done] = W.normalizeActionNetwork({ games: [anGame({ status: "complete", markets: totals(54.5, -108, -112),
    boxscore: { total_away_points: 21, total_home_points: 35 } })] }, "2026-11-07");
  assert.deepEqual(done.final, { away: 21, home: 35 });
  assert.equal(done.total.line, 54.5);
  // in progress: no final yet; no markets: no total
  const [live] = W.normalizeActionNetwork({ games: [anGame({ status: "inprogress", boxscore: { total_away_points: 7, total_home_points: 3 } })] }, "2026-11-07");
  assert.equal(live.final, null);
  assert.equal(live.total, null);
});
