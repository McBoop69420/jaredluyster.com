// Run: node --test redzone/tests/bets.test.js
// (functions/_middleware.ts 404s anything under /tests/, so this never ships.)
const test = require("node:test");
const assert = require("node:assert/strict");
const { gradeLeg, gradeBet, summarize, toWin } = require("../bets.js");

const game = (state, away, home, statusText = "") => ({
  state, statusText,
  away: { id: "A", abbr: "AWY", score: String(away) },
  home: { id: "H", abbr: "HOM", score: String(home) },
});
const spread = (teamId, line) => ({ gameId: "1", kind: "spread", teamId, line });
const tone = (leg, g) => gradeLeg(leg, g).tone;

test("spread: favourite giving points", () => {
  assert.equal(tone(spread("H", -7.5), game("in", 10, 20)), "winning");   // up 10, covering by 2.5
  assert.equal(tone(spread("H", -7.5), game("in", 14, 20)), "losing");    // up 6, short by 1.5
  assert.equal(tone(spread("H", -7.5), game("post", 10, 20)), "won");
  assert.equal(tone(spread("H", -7.5), game("post", 14, 20)), "lost");
});
test("spread: underdog getting points", () => {
  assert.equal(tone(spread("A", 7.5), game("in", 14, 20)), "winning");    // down 6, +7.5
  assert.equal(tone(spread("A", 7.5), game("post", 10, 20)), "lost");     // down 10
  assert.equal(tone(spread("A", 7.5), game("post", 10, 17)), "won");      // down 7, +7.5
});
test("spread: whole-number line can push", () => {
  assert.equal(tone(spread("H", -7), game("in", 13, 20)), "pushing");
  assert.equal(tone(spread("H", -7), game("post", 13, 20)), "push");
});
test("spread: details name the margin", () => {
  assert.equal(gradeLeg(spread("H", -7.5), game("post", 10, 20)).detail, "Covered by 2.5");
  assert.equal(gradeLeg(spread("H", -7.5), game("post", 14, 20)).detail, "Missed by 1.5");
});
test("moneyline", () => {
  const ml = (t) => ({ gameId: "1", kind: "moneyline", teamId: t });
  assert.equal(tone(ml("H"), game("in", 3, 10)), "winning");
  assert.equal(tone(ml("H"), game("in", 10, 3)), "losing");
  assert.equal(tone(ml("H"), game("in", 7, 7)), "live");
  assert.equal(tone(ml("A"), game("post", 24, 21)), "won");
  assert.equal(tone(ml("A"), game("post", 21, 24)), "lost");
});
test("total: over clears the number mid-game and is clinched", () => {
  const over = { gameId: "1", kind: "total", side: "over", line: 45.5 };
  assert.deepEqual(gradeLeg(over, game("in", 24, 24)).tone, "won");
  assert.equal(gradeLeg(over, game("in", 24, 24)).clinched, true);
  assert.equal(gradeLeg(over, game("in", 10, 10)).tone, "live");
  assert.equal(gradeLeg(over, game("post", 20, 20)).tone, "lost");
  assert.equal(gradeLeg(over, game("post", 24, 24)).clinched, undefined);
});
test("total: under is lost the moment the number is passed", () => {
  const under = { gameId: "1", kind: "total", side: "under", line: 45.5 };
  assert.equal(gradeLeg(under, game("in", 24, 24)).tone, "lost");
  assert.equal(gradeLeg(under, game("in", 10, 10)).tone, "live");
  assert.equal(gradeLeg(under, game("post", 20, 20)).tone, "won");
});
test("total: landing exactly on a whole-number line pushes", () => {
  assert.equal(tone({ gameId: "1", kind: "total", side: "over", line: 40 }, game("post", 20, 20)), "push");
  assert.equal(tone({ gameId: "1", kind: "total", side: "under", line: 40 }, game("post", 20, 20)), "push");
});
test("not started and missing game", () => {
  assert.equal(tone(spread("H", -3), game("pre", 0, 0, "Sat 7:30 PM")), "pending");
  assert.equal(tone(spread("H", -3), null), "unknown");
});
test("bad data is reported, not guessed", () => {
  assert.equal(tone(spread("ZZZ", -3), game("in", 7, 0)), "unknown");                       // team not in game
  assert.equal(tone({ gameId: "1", kind: "spread", teamId: "H" }, game("in", 7, 0)), "unknown"); // no line
  assert.equal(tone({ gameId: "1", kind: "total", side: "over" }, game("in", 7, 0)), "unknown");
  assert.equal(tone({ gameId: "1", kind: "nonsense" }, game("in", 7, 0)), "unknown");
  assert.equal(tone({ gameId: "1", kind: "moneyline", teamId: "H" }, { state: "in", away: { id: "A", score: "" }, home: { id: "H", score: "3" } }), "unknown");
});
test("props are never auto-graded", () => {
  const prop = { gameId: "1", kind: "prop", label: "QB 250+ pass yds" };
  assert.equal(tone(prop, game("in", 7, 0)), "live");
  assert.equal(tone(prop, game("pre", 0, 0)), "pending");
  assert.equal(tone(prop, game("post", 7, 0)), "unknown"); // final but ungraded -> flagged
  assert.equal(tone({ ...prop, result: "won" }, game("post", 7, 0)), "won");
});
test("manual result on a leg beats the scoreboard", () => {
  assert.equal(tone({ ...spread("H", -7.5), result: "push" }, game("post", 10, 20)), "push");
});

test("toWin: odds math and explicit override", () => {
  assert.equal(toWin({ stake: 110, odds: -110 }), 100);
  assert.equal(toWin({ stake: 25, odds: -110 }), 22.73);
  assert.equal(toWin({ stake: 10, odds: 250 }), 25);
  assert.equal(toWin({ stake: 10, odds: -110, toWin: 9.5 }), 9.5);
  assert.equal(toWin({ stake: 10 }), null);
  assert.equal(toWin({ odds: -110 }), null);
});

const byId = (games) => (leg) => games[leg.gameId] || null;
test("straight bet: settled profit", () => {
  const bet = { stake: 25, odds: -110, legs: [{ gameId: "1", kind: "spread", teamId: "H", line: -7.5 }] };
  const won = gradeBet(bet, byId({ 1: game("post", 10, 20) }));
  assert.equal(won.tone, "won"); assert.equal(won.profit, 22.73); assert.equal(won.settled, true);
  const lost = gradeBet(bet, byId({ 1: game("post", 14, 20) }));
  assert.equal(lost.tone, "lost"); assert.equal(lost.profit, -25);
  const live = gradeBet(bet, byId({ 1: game("in", 10, 20) }));
  assert.equal(live.tone, "winning"); assert.equal(live.profit, null); assert.equal(live.settled, false);
});
test("parlay: one lost leg kills it even with a leg still to play", () => {
  const bet = { stake: 10, odds: 600, legs: [
    { gameId: "1", kind: "moneyline", teamId: "H" },
    { gameId: "2", kind: "moneyline", teamId: "H" },
  ] };
  const g = gradeBet(bet, byId({ 1: game("post", 21, 10), 2: game("pre", 0, 0) }));
  assert.equal(g.tone, "lost"); assert.equal(g.profit, -10);
});
test("parlay: all legs won pays out, mixed live legs report as losing", () => {
  const bet = { stake: 10, odds: 600, legs: [
    { gameId: "1", kind: "moneyline", teamId: "H" },
    { gameId: "2", kind: "moneyline", teamId: "H" },
  ] };
  const won = gradeBet(bet, byId({ 1: game("post", 3, 10), 2: game("post", 3, 10) }));
  assert.equal(won.tone, "won"); assert.equal(won.profit, 60); assert.equal(won.detail, "All legs won");
  const losing = gradeBet(bet, byId({ 1: game("post", 3, 10), 2: game("in", 10, 3) }));
  assert.equal(losing.tone, "losing");
  const waiting = gradeBet(bet, byId({ 1: game("post", 3, 10), 2: game("pre", 0, 0) }));
  assert.equal(waiting.tone, "live"); assert.match(waiting.detail, /1 of 2 legs winning · 1 not started/);
  const nothing = gradeBet(bet, byId({ 1: game("pre", 0, 0), 2: game("pre", 0, 0) }));
  assert.equal(nothing.tone, "pending");
});
test("parlay: a pushed leg is flagged and profit can be overridden", () => {
  const bet = { stake: 10, odds: 300, profit: 20, legs: [
    { gameId: "1", kind: "spread", teamId: "H", line: -7 },
    { gameId: "2", kind: "moneyline", teamId: "H" },
  ] };
  const g = gradeBet(bet, byId({ 1: game("post", 13, 20), 2: game("post", 3, 10) }));
  assert.equal(g.tone, "won"); assert.match(g.detail, /payout may be reduced/); assert.equal(g.profit, 20);
});
test("bet-level manual result and empty legs", () => {
  const legs = [{ gameId: "1", kind: "prop", label: "x" }];
  assert.equal(gradeBet({ stake: 5, odds: 100, result: "won", legs }, byId({})).tone, "won");
  assert.equal(gradeBet({ stake: 5, legs: [] }, byId({})).tone, "unknown");
});
test("summarize", () => {
  const legs = [{ gameId: "1", kind: "spread", teamId: "H", line: -7.5 }];
  const gs = [
    gradeBet({ stake: 25, odds: -110, legs }, byId({ 1: game("post", 10, 20) })),   // won +22.73
    gradeBet({ stake: 25, odds: -110, legs }, byId({ 1: game("post", 14, 20) })),   // lost -25
    gradeBet({ stake: 50, odds: 100, legs }, byId({ 1: game("in", 10, 20) })),      // open, winning
    gradeBet({ stake: 10, odds: 100, legs }, byId({ 1: game("in", 14, 20) })),      // open, losing
  ];
  const s = summarize(gs);
  assert.deepEqual([s.open, s.won, s.lost, s.push, s.winning, s.losing], [2, 1, 1, 0, 1, 1]);
  assert.equal(s.atRisk, 60); assert.equal(s.potential, 60); assert.equal(s.net, -2.27);
});
