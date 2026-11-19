// Run with: node --test tests/sports-brief.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const Core = createRequire(import.meta.url)("../sports/brief-core.js");
const nba = Core.LEAGUES.find(l => l.label === "NBA");
const ncaam = Core.LEAGUES.find(l => l.label === "NCAAM");

function ev(id, away, home, o = {}) {
  const c = (team, homeAway, score, rank) => ({
    homeAway, score: String(score), winner: score === Math.max(away[1], home[1]),
    team: { displayName: team }, curatedRank: { current: rank || 99 },
  });
  return {
    id, date: "2026-11-19T00:00:00Z",
    status: { type: { state: o.state || "post", name: o.name || "STATUS_FINAL", detail: o.detail || "Final" } },
    competitions: [{
      competitors: [c(away[0], "away", away[1], away[2]), c(home[0], "home", home[1], home[2])],
      headlines: o.recap ? [{ type: "Recap", shortLinkText: o.recap, description: "x" }] : [],
      notes: o.note ? [{ headline: o.note }] : [],
    }],
  };
}

test("recap keeps finished games only, and drops postponed ones", () => {
  assert.ok(Core.parse(ev("1", ["A", 90], ["B", 80]), nba, "post"));
  assert.equal(Core.parse(ev("2", ["A", 0], ["B", 0], { state: "pre" }), nba, "post"), null);
  assert.equal(Core.parse(ev("3", ["A", 0], ["B", 0], { name: "STATUS_POSTPONED" }), nba, "post"), null);
});

test("preview keeps upcoming and live games, not finished ones", () => {
  assert.ok(Core.parse(ev("1", ["A", 0], ["B", 0], { state: "pre" }), nba, "pre"));
  assert.ok(Core.parse(ev("2", ["A", 5], ["B", 3], { state: "in" }), nba, "pre").live);
  assert.equal(Core.parse(ev("3", ["A", 90], ["B", 80]), nba, "pre"), null);
});

test("my teams are pulled out and listed first", () => {
  const spurs = Core.parse(ev("1", ["LA Clippers", 100], ["San Antonio Spurs", 110]), nba, "post");
  const other = Core.parse(ev("2", ["A", 100], ["B", 101], { detail: "Final/OT" }), nba, "post");
  const sel = Core.select([other, spurs], false);
  assert.equal(sel.mine.length, 1);
  assert.equal(sel.mine[0].home.name, "San Antonio Spurs");
  assert.equal(sel.others.length, 1);
  assert.equal(sel.otherTotal, 1);
});

test("top 10 caps the rest, and pro leagues beat plain college games", () => {
  const games = [];
  for (let i = 0; i < 30; i++) games.push(Core.parse(ev("c" + i, ["C" + i, 80], ["D" + i, 70]), ncaam, "post"));
  games.push(Core.parse(ev("p", ["A", 100], ["B", 98]), nba, "post"));
  const sel = Core.select(games, false);
  assert.equal(sel.others.length, Core.TOP_N);
  assert.equal(sel.total, 31);
  assert.ok(sel.others.some(g => g.id === "basketball/nba:p"));
});

test("ranked upset outranks an ordinary game", () => {
  const upset = Core.parse(ev("u", ["Big", 70, 3], ["Small", 75]), ncaam, "post");
  const plain = Core.parse(ev("p", ["X", 80], ["Y", 60]), ncaam, "post");
  assert.ok(upset.weight > plain.weight);
});

test("preview is ordered by start time", () => {
  const early = Core.parse(Object.assign(ev("e", ["A", 0], ["B", 0], { state: "pre" }), { date: "2026-11-19T18:00:00Z" }), nba, "pre");
  const late = Core.parse(Object.assign(ev("l", ["C", 0], ["D", 0], { state: "pre" }), { date: "2026-11-19T23:00:00Z" }), nba, "pre");
  const sel = Core.select([late, early], true);
  assert.deepEqual(sel.others.map(g => g.id), ["basketball/nba:e", "basketball/nba:l"]);
});

test("date helpers", () => {
  assert.equal(Core.addDays("2026-11-19", -1), "2026-11-18");
  assert.equal(Core.addDays("2026-12-31", 1), "2027-01-01");
});
