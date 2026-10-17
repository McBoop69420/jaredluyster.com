// Tests for Expert Picks on sports.jaredluyster.com/betting/: the /api/picks parsers and
// merge in sports/_worker.js, and the consensus maths in sports/expert-picks.js.
// Run: node --test tests/*.test.mjs
//
// The HTML and JSON below are trimmed copies of the real shapes (CBS Sports'
// TableExpertPicks table, Action Network's /web/v2/scoreboard/picks/<league>), cut
// down to the fields the parsers read.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EP = require("../sports/expert-picks.js");
const W = await import(new URL("../sports/_worker.js", import.meta.url).href);

// ---- CBS -----------------------------------------------------------------

function cbsHead(experts) {
  return experts.map(([first, last]) =>
    '<th class="TableBase-headGroupTh "><div class="AuthorHeadshotAndName-name">' +
    '<span class="AuthorHeadshotAndName-firstName">' + first + '</span>' +
    '<span class="AuthorHeadshotAndName-lastName">' + last + "</span></div></th>").join("") +
    "</tr><tr>" + experts.map(([, , rec]) =>
    '<th><p class="TableExpertPicks-weekRecords"> Week: 0-1-0 </p>' +
    '<p class="TableExpertPicks-overallRecords"> Overall: ' + rec + " </p></th>").join("");
}

function cbsUpcomingCell(code, slug, text, line) {
  return '<td class="TableBase-bodyTd "><div class="TableExpertPicks-pickLayout"><div class="TeamLogo">' +
    '<a href="/nfl/teams/' + code + "/" + slug + '/" aria-label="home team page"></a></div>' +
    "<button class=\"BetButton cbs-widget\" data-config='{\"meta\":{\"bets\":[]}" +
    (line != null ? ',"line":"' + line + '"' : "") + ",\"marketName\":\"Spread\"}'>" +
    '<div class="BetButton-inner"><div class="BetButton-text"> ' + text + " </div></div></button></div></td>";
}

function cbsFinalCell(code, slug, text, result) {
  return '<td class="TableBase-bodyTd "><div class="TableExpertPicks-cellWrapper">' +
    '<div class="TableExpertPicks-badge TableExpertPicks-badge--' + result + '"> ' + result.toUpperCase() + " </div>" +
    '<div class="TableExpertPicks-teamDetails"><a href="/nfl/teams/' + code + "/" + slug + '/"></a>' +
    '<p class="TableExpertPicks-pick"> ' + text + " </p></div></div></td>";
}

function cbsRow(stage, date, away, home, awayAbbr, homeAbbr, cells) {
  return '<tr class="TableBase-bodyTr"><td class="TableBase-bodyTd "><a class="GameMatchup" href="/nfl/gametracker/' +
    stage + "/NFL_" + date + "_" + away + "@" + home + '/">' +
    '<span class="GameMatchup-gameStatus--status"> SUN 9:30 am</span>' +
    '<span class="GameMatchup-teamAbbr">' + awayAbbr + "</span>" +
    '<span class="GameMatchup-teamAbbr">' + homeAbbr + "</span></a></td>" + cells.join("") + "</tr>";
}

function cbsTable(experts, rows) {
  return '<html><table class="TableBase-table TableExpertPicks hasStickyHeader"><thead><tr>' +
    '<th class="TableBase-headGroupTh "></th>' + cbsHead(experts) + "</tr></thead><tbody>" +
    rows.join("") + "</tbody></table></html>";
}

const EXPERTS = [["Pete", "Prisco", "34-44-2"], ["John", "Breech", "36-42-2"]];
const ATS_HTML = cbsTable(EXPERTS, [
  cbsRow("recap", "20261015", "SEA", "DEN", "SEA", "DEN", [
    cbsFinalCell("SEA", "seattle-seahawks", "SEA -3", "loss"),
    cbsFinalCell("DEN", "denver-broncos", "DEN +3", "win"),
  ]),
  cbsRow("preview", "20261018", "HOU", "JAC", "HOU", "JAX", [
    cbsUpcomingCell("JAC", "jacksonville-jaguars", "JAX -2.5", "-2.5"),
    cbsUpcomingCell("HOU", "houston-texans", "HOU +2.5", "2.5"),
  ]),
]);

test("parseCbsPicks reads experts, records, rows and both cell shapes", () => {
  const parsed = W.parseCbsPicks(ATS_HTML);
  assert.deepEqual(parsed.experts, [
    { name: "Pete Prisco", record: "34-44-2" },
    { name: "John Breech", record: "36-42-2" },
  ]);
  assert.equal(parsed.rows.length, 2);
  const [fin, up] = parsed.rows;
  assert.equal(fin.date, "2026-10-15");
  assert.deepEqual([fin.awayCode, fin.homeCode], ["SEA", "DEN"]);
  assert.deepEqual(fin.picks.map(p => [p.expert, p.code, p.text, p.result]),
    [[0, "SEA", "SEA -3", "loss"], [1, "DEN", "DEN +3", "win"]]);
  assert.equal(up.date, "2026-10-18");
  assert.deepEqual([up.awayCode, up.homeCode, up.awayAbbr, up.homeAbbr], ["HOU", "JAC", "HOU", "JAX"]);
  assert.deepEqual(up.picks.map(p => [p.code, p.slug, p.line, p.result]),
    [["JAC", "jacksonville-jaguars", -2.5, null], ["HOU", "houston-texans", 2.5, null]]);
});

test("parseCbsPicks returns nothing for a page without the table", () => {
  assert.deepEqual(W.parseCbsPicks("<html>No picks this week</html>"), { experts: [], rows: [] });
});

// ---- Action Network ------------------------------------------------------

const AN_TEAMS = {
  hou: { id: 1, abbr: "HOU", full_name: "Houston Texans", url_slug: "houston-texans" },
  jac: { id: 2, abbr: "JAC", full_name: "Jacksonville Jaguars", url_slug: "jacksonville-jaguars" },
  chi: { id: 3, abbr: "CHI", full_name: "Chicago Bears", url_slug: "chicago-bears" },
  atl: { id: 4, abbr: "ATL", full_name: "Atlanta Falcons", url_slug: "atlanta-falcons" },
};

function anGame(id, start, away, home, experts) {
  return { id, start_time: start, status: "scheduled", away_team_id: away.id, home_team_id: home.id, teams: [away, home], experts };
}
function anPick(type, value, odds, extra) {
  return { type, period: "game", value, odds, result: "pending", ...extra };
}

const AN_DATA = {
  league: {
    current_week: 6,
    calendar_info: {
      reg: [
        { week: 6, startDate: "2026-10-13T07:00Z", endDate: "2026-10-20T06:59Z" },
        { week: 7, startDate: "2026-10-20T07:00Z", endDate: "2026-10-27T06:59Z" },
      ],
    },
  },
  games: [
    anGame(10, "2026-10-18T13:30:00.000Z", AN_TEAMS.hou, AN_TEAMS.jac, [
      { id: 100, name: "Sharp One", record: { win: 22, loss: 25, push: 1, roi: 6.8 }, picks: [
        anPick("spread_away", 2.5, -105),
        anPick("spread_away", 3, -120),              // same expert, same side, re-posted: counted once
        anPick("under", 43.5, -110),
        anPick("custom", 0, 180),                    // a prop
        anPick("ml_home", 0, -130, { period: "firsthalf" }), // partial game
      ] },
      { id: 101, name: "Square Two", record: null, picks: [anPick("ml_home", 0, -135, { result: "win" })] },
    ]),
    // 8:20 PM ET on the 18th is still the 18th in ET, though it's the 19th in UTC.
    anGame(11, "2026-10-19T00:20:00.000Z", AN_TEAMS.chi, AN_TEAMS.atl, []),
    anGame(12, "2026-10-16T00:15:00.000Z", AN_TEAMS.chi, AN_TEAMS.hou, []),
  ],
};

test("normalizeActionNetwork keeps the ET day's games and full-game side picks only", () => {
  const games = W.normalizeActionNetwork(AN_DATA, "2026-10-18");
  assert.deepEqual(games.map(g => g.id), ["an10", "an11"]);
  const g = games[0];
  assert.deepEqual([g.away.abbr, g.home.abbr], ["HOU", "JAC"]);
  assert.equal(g.props, 2);
  assert.deepEqual(g.picks.map(p => [p.expert, p.market, p.side, p.line, p.odds, p.result]), [
    ["Sharp One", "spread", "away", 2.5, -105, null],
    ["Sharp One", "total", "under", 43.5, -110, null],
    ["Square Two", "ml", "home", null, -135, "win"],
  ]);
  assert.equal(g.picks[0].rec, "22-25-1");
  assert.equal(g.picks[0].recLabel, "last 30 days");
  assert.equal(g.picks[2].rec, null);
});

test("normalizeActionNetwork takes a date range and tags each game with its ET day", () => {
  const games = W.normalizeActionNetwork(AN_DATA, "2026-10-15", "2026-10-18");
  assert.deepEqual(games.map(g => [g.id, g.date]), [["an10", "2026-10-18"], ["an11", "2026-10-18"], ["an12", "2026-10-15"]]);
  assert.deepEqual(W.normalizeActionNetwork(AN_DATA, "2026-10-16", "2026-10-17"), []);
});

test("mergeCbs takes a date range too", () => {
  const games = [];
  W.mergeCbs(games, "2026-10-15", [{ market: "spread", parsed: W.parseCbsPicks(ATS_HTML) }], "2026-10-18");
  assert.deepEqual(games.map(g => g.date).sort(), ["2026-10-15", "2026-10-18"]);
});

test("anWeekFor finds the calendar week holding a date", () => {
  assert.deepEqual(W.anWeekFor(AN_DATA.league, "2026-10-18"), { week: 6, seasonType: "reg" });
  assert.deepEqual(W.anWeekFor(AN_DATA.league, "2026-10-25"), { week: 7, seasonType: "reg" });
  assert.equal(W.anWeekFor(AN_DATA.league, "2027-03-01"), null);
  assert.equal(W.anWeekFor(null, "2026-10-18"), null);
});

// ---- Merge ---------------------------------------------------------------

test("mergeCbs matches CBS rows to Action Network games despite JAX/JAC", () => {
  const games = W.normalizeActionNetwork(AN_DATA, "2026-10-18");
  const ats = W.parseCbsPicks(ATS_HTML);
  const added = W.mergeCbs(games, "2026-10-18", [{ market: "spread", parsed: ats }]);
  assert.equal(added, 2);
  assert.equal(games.length, 2, "no stray CBS-only game");
  const cbs = games[0].picks.filter(p => p.src === "CBS Sports");
  assert.deepEqual(cbs.map(p => [p.expert, p.side, p.line, p.rec, p.recLabel]), [
    ["Pete Prisco", "home", -2.5, "34-44-2", "season ATS"],
    ["John Breech", "away", 2.5, "36-42-2", "season ATS"],
  ]);
});

test("mergeCbs keeps an unmatched CBS game as its own row", () => {
  const games = [];
  const added = W.mergeCbs(games, "2026-10-18", [{ market: "ml", parsed: W.parseCbsPicks(ATS_HTML) }]);
  assert.equal(added, 2);
  assert.equal(games.length, 1);
  assert.deepEqual([games[0].away.abbr, games[0].home.abbr, games[0].start, games[0].time], ["HOU", "JAX", null, "SUN 9:30 am"]);
  assert.ok(games[0].picks.every(p => p.market === "ml" && p.line == null && p.recLabel === "season straight up"));
});

test("mergeCbs ignores rows from other days", () => {
  const games = W.normalizeActionNetwork(AN_DATA, "2026-10-18");
  W.mergeCbs(games, "2026-10-18", [{ market: "spread", parsed: W.parseCbsPicks(ATS_HTML) }]);
  assert.ok(games.flatMap(g => g.picks).every(p => p.expert !== "Pete Prisco" || p.side !== "away"),
    "Thursday's SEA pick must not land on Sunday");
});

// ---- Consensus -----------------------------------------------------------

function pick(market, side, line, result, expert) {
  return { src: "Action Network", expert: expert || market + side + line + Math.random(), market, side, line, result: result || null };
}
const GAME = { away: { abbr: "HOU" }, home: { abbr: "JAX" } };

test("formatLine", () => {
  assert.equal(EP.formatLine(2.5), "+2.5");
  assert.equal(EP.formatLine(-3), "−3");
  assert.equal(EP.formatLine(0), "PK");
  assert.equal(EP.formatLine(null), "");
});

test("marketConsensus counts sides, picks the leader and its usual line", () => {
  const game = { ...GAME, picks: [
    pick("spread", "home", -2.5), pick("spread", "home", -2.5), pick("spread", "home", -3),
    pick("spread", "away", 2.5),
  ] };
  const c = EP.marketConsensus(game, "spread");
  assert.equal(c.count, 4);
  assert.equal(c.leader.side, "home");
  assert.equal(c.leader.line, -2.5);
  assert.equal(c.leader.label, "JAX −2.5");
  assert.equal(c.share, 0.75);
  assert.deepEqual(c.sides.map(s => [s.side, s.count]), [["home", 3], ["away", 1]]);
  assert.equal(EP.marketConsensus(game, "total"), null);
});

test("marketConsensus calls a tie a split and labels totals", () => {
  const game = { ...GAME, picks: [pick("total", "over", 47.5), pick("total", "under", 47.5)] };
  const c = EP.marketConsensus(game, "total");
  assert.equal(c.leader, null);
  assert.equal(c.share, 0.5);
  assert.deepEqual(c.sides.map(s => s.label), ["Over 47.5", "Under 47.5"]);
});

test("the leader's result is the majority of its graded picks", () => {
  const game = { ...GAME, picks: [
    pick("spread", "home", -2.5, "win"), pick("spread", "home", -2.5, "win"), pick("spread", "home", -3, "push"),
  ] };
  assert.equal(EP.marketConsensus(game, "spread").leader.result, "win");
  const ungraded = { ...GAME, picks: [pick("ml", "away", null)] };
  assert.equal(EP.marketConsensus(ungraded, "ml").leader.result, null);
});

test("summarizeGame counts distinct experts across markets", () => {
  const s = EP.summarizeGame({ ...GAME, picks: [
    pick("spread", "home", -2.5, null, "A"), pick("total", "over", 44, null, "A"), pick("ml", "home", null, null, "B"),
  ] });
  assert.equal(s.experts, 2);
  assert.equal(s.picks, 3);
  assert.equal(s.markets.ml.leader.label, "JAX");
});

test("strongLeans needs 5+ picks at 75%+, on spreads and totals only", () => {
  const many = (market, side, n, line) => Array.from({ length: n }, () => pick(market, side, line));
  const a = EP.summarizeGame({ ...GAME, picks: [...many("spread", "home", 6, -2.5), ...many("spread", "away", 1, 2.5)] });
  const b = EP.summarizeGame({ ...GAME, picks: [...many("total", "under", 4, 44)] });              // too few
  const c = EP.summarizeGame({ ...GAME, picks: [...many("total", "over", 7, 44), ...many("total", "under", 3, 44)] }); // 70%
  const d = EP.summarizeGame({ ...GAME, picks: [...many("ml", "home", 9, null)] });                 // winner: never
  const e = EP.summarizeGame({ ...GAME, picks: [...many("total", "over", 5, 51)] });                // 100%
  const leans = EP.strongLeans([a, b, c, d, e]);
  assert.deepEqual(leans.map(l => [l.consensus.market, l.consensus.leader.label]),
    [["total", "Over 51"], ["spread", "JAX −2.5"]]);
});

// ---- Top 25 --------------------------------------------------------------

const rankEntry = (current, location, name, nickname) => ({ current, team: { location, name, nickname: nickname || location } });
const RANKINGS = {
  rankings: [
    { name: "AP Top 25", type: "ap", ranks: [
      rankEntry(3, "Miami", "Hurricanes"),
      rankEntry(9, "Ole Miss", "Rebels"),
      rankEntry(25, "Northwestern", "Wildcats"),
    ] },
    { name: "AFCA Coaches Poll", type: "usa", ranks: [rankEntry(1, "Georgia", "Bulldogs")] },
  ],
};

test("rankIndex reads the AP poll and matches teams by full name", () => {
  const idx = EP.rankIndex(RANKINGS);
  assert.equal(idx.name, "AP Top 25");
  assert.equal(EP.rankOf(idx, { abbr: "MIA", name: "Miami (FL) Hurricanes" }), 3);
  assert.equal(EP.rankOf(idx, { abbr: "MISS", name: "Ole Miss Rebels" }), 9);
  assert.equal(EP.rankOf(idx, { abbr: "NW", name: "Northwestern Wildcats" }), 25);
  assert.equal(EP.rankOf(idx, { abbr: "UGA", name: "Georgia Bulldogs" }), null, "coaches poll is not used");
  assert.equal(EP.rankOf(idx, { abbr: "UK", name: "Kentucky Wildcats" }), null);
  assert.equal(EP.rankOf(null, { name: "Miami Hurricanes" }), null);
});

test("pickPoll prefers the College Football Playoff ranking once it exists", () => {
  const withCfp = { rankings: [...RANKINGS.rankings, { name: "CFP Rankings", type: "cfp", ranks: [rankEntry(1, "Ole Miss", "Rebels")] }] };
  const idx = EP.rankIndex(withCfp);
  assert.equal(idx.name, "CFP Rankings");
  assert.equal(EP.rankOf(idx, { name: "Ole Miss Rebels" }), 1);
  assert.equal(EP.rankIndex({ rankings: [] }), null);
  assert.equal(EP.rankIndex(null), null);
});
