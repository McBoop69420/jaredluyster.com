// Tests for My Bets on sports.jaredluyster.com/betting/: the parsing and grading in
// sports/my-bets.js, and the private store behind it, /api/bets in sports/_worker.js
// (auth with real RSA signatures; only the fetch of Access's published keys is faked).
// Run: node --test tests/*.test.mjs
//
// The ESPN odds object below is a trimmed copy of a real scoreboard event's
// competitions[0].odds[0] (DraftKings via ESPN, 2026-10-17).

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PB = require("../sports/my-bets.js");
const W = await import(new URL("../sports/_worker.js", import.meta.url).href);

// ---- ESPN parsing -----------------------------------------------------------

const NFL_ODDS = {
  details: "JAX -2.5", overUnder: 42.5, spread: -2.5,
  awayTeamOdds: { team: { id: "34", abbreviation: "HOU" } },
  homeTeamOdds: { team: { id: "30", abbreviation: "JAX" } },
  moneyline: { home: { close: { odds: "-148" }, open: { odds: "-105" } }, away: { close: { odds: "+124" }, open: { odds: "-115" } } },
  pointSpread: {
    home: { close: { line: "-2.5", odds: "-120" }, open: { line: "+1.5", odds: "-118" } },
    away: { close: { line: "+2.5", odds: "+100" }, open: { line: "-1.5", odds: "-102" } },
  },
  total: { over: { close: { line: "o42.5", odds: "-110" } }, under: { close: { line: "u42.5", odds: "-110" } } },
};
const SOCCER_ODDS = {
  overUnder: 3.5, drawOdds: { moneyLine: 260 },
  total: { over: { close: { line: "o3.5", odds: "+140" } }, under: { close: { line: "u3.5", odds: "-170" } } },
  pointSpread: { home: { close: { line: "+0.5", odds: "-185" } }, away: { close: { line: "-0.5", odds: "+135" } } },
  moneyline: { home: { close: { odds: "+175" } }, away: { close: { odds: "+150" } }, draw: { close: { odds: "+260" } } },
};

function event({ id = "401872996", state = "pre", completed = false, name = "STATUS_SCHEDULED", away = 0, home = 0, odds = NFL_ODDS } = {}) {
  return {
    id, date: "2026-10-18T17:00Z",
    status: { type: { state, completed, name, shortDetail: state === "in" ? "Q3 5:12" : "10/18 - 1:00 PM EDT" } },
    competitions: [{
      competitors: [
        { homeAway: "home", score: String(home), team: { id: "30", abbreviation: "JAX", displayName: "Jacksonville Jaguars" } },
        { homeAway: "away", score: String(away), team: { id: "34", abbreviation: "HOU", displayName: "Houston Texans" } },
      ],
      odds: odds ? [odds] : [],
    }],
  };
}

const offer = (game, kind, side) => game.offers.find(o => o.kind === kind && o.side === side);

test("parseAmerican takes real prices only", () => {
  assert.equal(PB.parseAmerican("+124"), 124);
  assert.equal(PB.parseAmerican("-148"), -148);
  assert.equal(PB.parseAmerican("EVEN"), 100);
  assert.equal(PB.parseAmerican(260), 260);
  for (const bad of ["OFF", "", null, undefined, "50", "-99", "abc"]) assert.equal(PB.parseAmerican(bad), null, String(bad));
});

test("parseEvent reads teams, state and DraftKings' current prices", () => {
  const g = PB.parseEvent(event(), "football/nfl");
  assert.equal(g.id, "401872996");
  assert.equal(g.away.abbr, "HOU");
  assert.equal(g.home.id, "30");
  assert.equal(g.state, "pre");
  assert.deepEqual(offer(g, "spread", "away"), { kind: "spread", side: "away", odds: 100, line: 2.5 });
  assert.deepEqual(offer(g, "spread", "home"), { kind: "spread", side: "home", odds: -120, line: -2.5 });
  assert.deepEqual(offer(g, "moneyline", "away"), { kind: "moneyline", side: "away", odds: 124 });
  assert.deepEqual(offer(g, "moneyline", "home"), { kind: "moneyline", side: "home", odds: -148 });
  assert.deepEqual(offer(g, "total", "over"), { kind: "total", side: "over", odds: -110, line: 42.5 });
  assert.equal(offer(g, "moneyline", "draw"), undefined);
  assert.equal(g.offers.length, 6);
});

test("soccer offers a three-way moneyline", () => {
  const g = PB.parseEvent(event({ odds: SOCCER_ODDS }), "soccer/eng.1");
  assert.deepEqual(offer(g, "moneyline", "draw"), { kind: "moneyline", side: "draw", odds: 260, threeWay: true });
  assert.equal(offer(g, "moneyline", "home").threeWay, true);
  assert.equal(offer(g, "total", "under").line, 3.5);
});

test("the older flat odds fields are a fallback", () => {
  const legacy = { spread: -7, overUnder: 44, awayTeamOdds: { moneyLine: 250, spreadOdds: -105 }, homeTeamOdds: { moneyLine: -300 }, overOdds: -115 };
  const g = PB.parseEvent(event({ odds: legacy }), "football/nfl");
  assert.deepEqual(offer(g, "spread", "away"), { kind: "spread", side: "away", odds: -105, line: 7 });
  assert.deepEqual(offer(g, "spread", "home"), { kind: "spread", side: "home", odds: -110, line: -7 });
  assert.equal(offer(g, "moneyline", "away").odds, 250);
  assert.equal(offer(g, "total", "over").odds, -115);
  assert.equal(offer(g, "total", "under").odds, -110);
});

test("parseSummary reads a game summary: header for teams and status, pickcenter for odds", () => {
  const ev = event({ state: "pre" });
  const comp = ev.competitions[0];
  const summary = {
    header: { id: ev.id, competitions: [{ id: ev.id, date: ev.date, status: ev.status, competitors: comp.competitors }] },
    pickcenter: [NFL_ODDS],
  };
  const g = PB.parseSummary(summary, "football/nfl");
  assert.equal(g.id, "401872996");
  assert.equal(g.away.abbr, "HOU");
  assert.equal(g.state, "pre");
  assert.deepEqual(offer(g, "spread", "home"), { kind: "spread", side: "home", odds: -120, line: -2.5 });
  assert.equal(g.offers.length, 6);
  assert.deepEqual(PB.parseSummary({ ...summary, pickcenter: [] }, "football/nfl").offers, []);
  assert.equal(PB.parseSummary({}, "football/nfl"), null);
});

test("a leg keeps the card's league label, and summaries group by it", () => {
  const g = { ...PB.parseEvent(event(), "soccer/fifa.worldq.uefa"), leagueLabel: "WC Qualifying · UEFA" };
  const leg = PB.legFromOffer(g, { kind: "moneyline", side: "home", odds: 150, threeWay: true });
  assert.equal(leg.leagueLabel, "WC Qualifying · UEFA");
  const s = PB.summarize([{ id: "a", stake: 1, legs: [leg] }], new Map([["a", { tone: "won", final: true, profit: 1.5 }]]));
  assert.deepEqual(s.byLeague.map(r => r.label), ["WC Qualifying · UEFA"]);
});

test("no odds -> no offers; postponed and canceled games are void", () => {
  assert.deepEqual(PB.parseEvent(event({ odds: null }), "football/nfl").offers, []);
  assert.equal(PB.parseEvent(event({ state: "post", name: "STATUS_POSTPONED" }), "football/nfl").voided, true);
  assert.equal(PB.parseEvent(event({ state: "post", name: "STATUS_CANCELED" }), "football/nfl").voided, true);
  assert.equal(PB.parseEvent(event({ state: "post", completed: true, name: "STATUS_FINAL" }), "football/nfl").voided, false);
});

// ---- Grading ------------------------------------------------------------------

const pre = PB.parseEvent(event(), "football/nfl");
const legOf = (kind, side, game = pre) => PB.legFromOffer(game, offer(game, kind, side));
const final = (away, home) => PB.parseEvent(event({ state: "post", completed: true, name: "STATUS_FINAL", away, home }), "football/nfl");
const live = (away, home) => PB.parseEvent(event({ state: "in", away, home }), "football/nfl");
const tone = (leg, game) => PB.gradeLeg(leg, game).tone;

test("legFromOffer keeps what grading and display need", () => {
  const leg = legOf("spread", "away");
  assert.deepEqual(leg, {
    league: "football/nfl", gameId: "401872996", start: "2026-10-18T17:00Z",
    away: { id: "34", abbr: "HOU" }, home: { id: "30", abbr: "JAX" },
    kind: "spread", side: "away", odds: 100, line: 2.5,
  });
  assert.equal(PB.legLabel(leg), "HOU +2.5");
  assert.equal(PB.legLabel(legOf("spread", "home")), "JAX −2.5");
  assert.equal(PB.legLabel(legOf("moneyline", "home")), "JAX ML");
  assert.equal(PB.legLabel(legOf("total", "under")), "Under 42.5");
  assert.equal(PB.gameLabel(leg), "HOU @ JAX");
});

test("spreads: covering, failing and landing on the number", () => {
  const hou = legOf("spread", "away"); // HOU +2.5
  const jax = legOf("spread", "home"); // JAX -2.5
  assert.equal(tone(hou, final(20, 21)), "won");
  assert.equal(tone(jax, final(20, 21)), "lost");
  assert.equal(tone(jax, final(17, 20)), "won");
  const whole = { ...jax, line: -3 };
  assert.equal(tone(whole, final(17, 20)), "push");
  assert.equal(tone({ ...hou, line: 3 }, final(17, 20)), "push");
});

test("moneylines: a tie is a push two-way, a loss three-way; the draw wins only on a tie", () => {
  assert.equal(tone(legOf("moneyline", "away"), final(24, 21)), "won");
  assert.equal(tone(legOf("moneyline", "home"), final(24, 21)), "lost");
  assert.equal(tone(legOf("moneyline", "home"), final(20, 20)), "push");
  const soccer = PB.parseEvent(event({ odds: SOCCER_ODDS }), "soccer/eng.1");
  const draw = legOf("moneyline", "draw", soccer);
  const home = legOf("moneyline", "home", soccer);
  assert.equal(tone(draw, final(1, 1)), "won");
  assert.equal(tone(draw, final(2, 1)), "lost");
  assert.equal(tone(home, final(1, 1)), "lost");
  assert.equal(tone(home, final(0, 1)), "won");
});

test("totals: over, under and push", () => {
  const over = legOf("total", "over"); // 42.5
  const under = legOf("total", "under");
  assert.equal(tone(over, final(21, 22)), "won");
  assert.equal(tone(under, final(21, 22)), "lost");
  assert.equal(tone(under, final(20, 20)), "won");
  assert.equal(tone({ ...over, line: 40 }, final(20, 20)), "push");
});

test("live games grade as things stand; pre-game is pending; void and hand grades are final", () => {
  const jax = legOf("spread", "home");
  assert.deepEqual(PB.gradeLeg(jax, live(7, 14)), { tone: "winning", final: false, detail: "HOU 7–14 JAX · Q3 5:12" });
  assert.equal(tone(jax, live(14, 14)), "losing");
  assert.equal(tone({ ...jax, line: -3 }, live(10, 13)), "pushing");
  assert.equal(tone(jax, pre), "pending");
  const postponed = PB.parseEvent(event({ state: "post", name: "STATUS_POSTPONED" }), "football/nfl");
  assert.deepEqual(PB.gradeLeg(jax, postponed), { tone: "void", final: true, detail: "Postponed or canceled" });
  assert.equal(PB.gradeLeg({ ...jax, result: "lost" }, final(0, 40)).tone, "lost");
});

test("a stored final score wins over whatever ESPN says now", () => {
  const leg = { ...legOf("spread", "home"), final: { away: 10, home: 20 } };
  assert.equal(tone(leg, null), "won");
  assert.equal(tone(leg, live(30, 0)), "won");
  assert.equal(tone({ ...leg, final: { void: true } }, final(10, 20)), "void");
});

test("no game data: pending before the start, unknown after", () => {
  const leg = legOf("spread", "home");
  assert.equal(PB.gradeLeg(leg, null, Date.parse("2026-10-18T12:00Z")).tone, "pending");
  assert.equal(PB.gradeLeg(leg, null, Date.parse("2026-10-18T20:00Z")).tone, "unknown");
});

test("progress: spread bar is centred on the line, measured from our side", () => {
  const lac = { ...legOf("spread", "away"), line: 9.5 }; // HOU (away) +9.5
  assert.equal(PB.progress(lac, pre), null);
  assert.deepEqual(PB.progress(lac, live(3, 19)), { kind: "margin", value: -16, target: -9.5, margin: -6.5, half: 14 });
  const jax = legOf("spread", "home"); // JAX -2.5
  assert.deepEqual(PB.progress(jax, live(7, 14)), { kind: "margin", value: 7, target: 2.5, margin: 4.5, half: 14 });
  // a blowout widens the bar rather than pinning the dot to the end
  assert.equal(PB.progress(jax, live(0, 40)).half, 47);
});

test("progress: moneyline is centred on a tie; a draw pick has no bar", () => {
  assert.deepEqual(PB.progress(legOf("moneyline", "away"), live(10, 13)), { kind: "margin", value: -3, target: 0, margin: -3, half: 14 });
  const soccer = PB.parseEvent(event({ odds: SOCCER_ODDS }), "soccer/eng.1");
  const home = PB.legFromOffer(soccer, offer(soccer, "moneyline", "home"));
  assert.equal(PB.progress(home, { ...soccer, state: "in", away: { ...soccer.away, score: 0 }, home: { ...soccer.home, score: 1 } }).half, 3);
  assert.equal(PB.progress(PB.legFromOffer(soccer, offer(soccer, "moneyline", "draw")), live(1, 1)), null);
});

test("progress: totals run toward the line as a finish line", () => {
  const over = legOf("total", "over"); // 42.5
  const under = legOf("total", "under");
  assert.deepEqual(PB.progress(over, live(10, 14)), { kind: "total", value: 24, target: 42.5, side: "over", margin: -18.5, max: 51 });
  assert.equal(PB.progress(under, live(10, 14)).margin, 18.5);
  assert.equal(PB.progress(over, live(30, 30)).max, 63);
});

test("progress: a settled leg uses its stored final score; a void one has no bar", () => {
  const leg = { ...legOf("spread", "home"), final: { away: 10, home: 20 } };
  assert.equal(PB.progress(leg, live(0, 0)).margin, 7.5);
  assert.equal(PB.progress({ ...leg, final: { void: true } }, null), null);
});

test("finalSnapshot only once the game is over", () => {
  assert.equal(PB.finalSnapshot(pre), null);
  assert.equal(PB.finalSnapshot(live(3, 0)), null);
  assert.equal(PB.finalSnapshot(null), null);
  assert.deepEqual(PB.finalSnapshot(final(17, 20)), { away: 17, home: 20 });
  assert.deepEqual(PB.finalSnapshot(PB.parseEvent(event({ state: "post", name: "STATUS_CANCELED" }), "football/nfl")), { void: true });
});

const g = (t, final = true) => ({ tone: t, final });

test("straight bets pay at their odds", () => {
  const bet = (odds) => ({ id: "b", stake: 2, legs: [{ odds }] });
  assert.deepEqual(PB.gradeBet(bet(-110), [g("won")]), { tone: "won", final: true, profit: 1.82 });
  assert.deepEqual(PB.gradeBet(bet(150), [g("won")]), { tone: "won", final: true, profit: 3 });
  assert.deepEqual(PB.gradeBet(bet(150), [g("lost")]), { tone: "lost", final: true, profit: -2 });
  assert.deepEqual(PB.gradeBet(bet(150), [g("push")]), { tone: "push", final: true, profit: 0 });
  assert.deepEqual(PB.gradeBet(bet(150), [g("void")]), { tone: "void", final: true, profit: 0 });
  assert.deepEqual(PB.gradeBet(bet(150), [g("winning", false)]), { tone: "winning", final: false });
});

test("parlays: one loss ends it, pushes drop out, the rest multiply", () => {
  const parlay = { id: "p", stake: 1, legs: [{ odds: -110 }, { odds: 150 }, { odds: 100 }] };
  // 1.909 * 2.5 * 2 = 9.545 -> +8.55u
  assert.equal(PB.gradeBet(parlay, [g("won"), g("won"), g("won")]).profit, 8.55);
  assert.equal(PB.toWin(parlay), 8.55);
  // lost leg settles it even with legs still to play
  assert.deepEqual(PB.gradeBet(parlay, [g("lost"), g("pending", false), g("winning", false)]), { tone: "lost", final: true, profit: -1 });
  // pushed leg drops out: 2.5 * 2 = 5 -> +4u
  assert.equal(PB.gradeBet(parlay, [g("push"), g("won"), g("won")]).profit, 4);
  assert.deepEqual(PB.gradeBet(parlay, [g("push"), g("void"), g("push")]), { tone: "push", final: true, profit: 0 });
  assert.deepEqual(PB.gradeBet(parlay, [g("void"), g("void"), g("void")]), { tone: "void", final: true, profit: 0 });
  // still open
  assert.equal(PB.gradeBet(parlay, [g("won"), g("losing", false), g("pending", false)]).tone, "losing");
  assert.equal(PB.gradeBet(parlay, [g("won"), g("winning", false), g("pending", false)]).tone, "winning");
  assert.equal(PB.gradeBet(parlay, [g("pending", false), g("pending", false), g("pending", false)]).tone, "pending");
  assert.equal(PB.gradeBet(parlay, [g("won"), g("pending", false), g("pending", false)]).final, false);
});

test("a hand-set bet result overrides the legs", () => {
  const bet = { id: "b", stake: 1, legs: [{ odds: 120 }], result: "won" };
  assert.deepEqual(PB.gradeBet(bet, [g("lost")]), { tone: "won", final: true, profit: 1.2 });
  assert.equal(PB.gradeBet({ ...bet, result: "void" }, [g("lost")]).profit, 0);
});

test("odds conversions round-trip", () => {
  assert.equal(PB.toAmerican(PB.toDecimal(-110)), -110);
  assert.equal(PB.toAmerican(PB.toDecimal(250)), 250);
  assert.equal(PB.toAmerican(2), 100);
  assert.equal(PB.toAmerican(1), null);
  assert.equal(PB.fmtOdds(-110), "−110");
  assert.equal(PB.fmtUnits(1.5, true), "+1.5u");
  assert.equal(PB.fmtUnits(-2, true), "−2u");
  assert.equal(PB.fmtUnits(0, true), "0u");
});

test("summarize: record, units, ROI without pushes, open exposure, breakdowns", () => {
  const nfl = (id, odds, kind = "spread") => ({ id, stake: 1, legs: [{ league: "football/nfl", kind, odds }] });
  const bets = [
    nfl("a", -110), nfl("b", -110), nfl("c", 150, "moneyline"), nfl("d", -110, "total"), nfl("e", -110),
    { id: "p", stake: 2, legs: [{ league: "football/nfl", kind: "spread", odds: 100 }, { league: "soccer/eng.1", kind: "moneyline", odds: 100 }] },
  ];
  const results = new Map([
    ["a", { tone: "won", final: true, profit: 0.91 }],
    ["b", { tone: "lost", final: true, profit: -1 }],
    ["c", { tone: "won", final: true, profit: 1.5 }],
    ["d", { tone: "push", final: true, profit: 0 }],
    ["e", { tone: "pending", final: false }],
    ["p", { tone: "winning", final: false }],
  ]);
  const s = PB.summarize(bets, results);
  assert.equal(s.total.won, 2);
  assert.equal(s.total.lost, 1);
  assert.equal(s.total.push, 1);
  assert.equal(s.total.profit, 1.41);
  assert.equal(s.total.risked, 3);
  assert.equal(s.total.roi, 1.41 / 3);
  assert.equal(s.total.winRate, 2 / 3);
  assert.equal(s.total.open, 2);
  assert.equal(s.total.openStake, 3);
  assert.equal(s.total.openToWin, 0.91 + 6); // e at -110 + the 2u parlay at +300
  assert.deepEqual(s.byLeague.map(r => r.label), ["NFL"]);
  assert.deepEqual(s.byMarket.map(r => [r.label, r.won, r.lost, r.push]), [["Spread", 1, 1, 0], ["Moneyline", 1, 0, 0], ["Total", 0, 0, 1]]);
});

test("etDate buckets by Eastern time", () => {
  assert.equal(PB.etDate("2026-10-18T00:30Z"), "2026-10-17"); // 8:30 PM EDT
  assert.equal(PB.etDate("2026-10-18T17:00Z"), "2026-10-18");
});

// ---- /api/bets ----------------------------------------------------------------

const HOST = "https://sports.jaredluyster.com";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

async function signer(kid = "k1") {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "RS256", use: "sig" };
  return { privateKey: pair.privateKey, jwk, kid };
}
async function makeToken({ privateKey, kid }, claims, header = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT", ...header }));
  const p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
// One team domain per test => an isolated key cache (the worker caches keys per domain).
let teams = 0;
const freshTeam = () => `team${++teams}.cloudflareaccess.com`;
function mockCerts(byTeam) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u.hostname);
    const keys = byTeam[u.hostname];
    return keys ? new Response(JSON.stringify({ keys }), { status: 200 }) : new Response("nope", { status: 500 });
  };
  return calls;
}

// In-memory R2 with etags and the etagMatches precondition, like the real thing.
function fakeR2(initial) {
  let obj = initial == null ? null : { body: initial, etag: "e0" };
  let n = 0;
  const bucket = {
    reads: 0, writes: 0,
    get body() { return obj && obj.body; },
    async get() { bucket.reads++; return obj && { etag: obj.etag, text: async () => obj.body }; },
    async head() { return obj && { etag: obj.etag }; },
    async put(key, body, opts = {}) {
      if (opts.onlyIf && opts.onlyIf.etagMatches && (!obj || obj.etag !== opts.onlyIf.etagMatches)) return null;
      bucket.writes++;
      obj = { body, etag: "e" + ++n };
      return { etag: obj.etag };
    },
  };
  return bucket;
}

const OWNER = "owner@example.com";
const envFor = (team, r2, extra = {}) => ({ ACCESS_TEAM_DOMAIN: team, BETS_ALLOWED_EMAILS: OWNER, SPORTS_BETS: r2, ...extra });
const claimsFor = (team, extra = {}) => ({ iss: `https://${team}`, exp: now() + 300, email: OWNER, ...extra });
const BET = { id: "x1", placedAt: "2026-10-17T12:00:00Z", stake: 1, legs: [{ gameId: "401872996", kind: "spread", odds: -110, line: 2.5 }] };
const STORED = JSON.stringify({ bets: [BET] });

const call = (env, { method = "GET", headers = {}, body, host = HOST, path = "/api/bets" } = {}) =>
  W.default.fetch(new Request(host + path, { method, headers, body }), { ...env, ASSETS: { fetch: async () => new Response("asset") } });
const put = (env, headers, payload, extra = {}) =>
  call(env, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(payload), ...extra });

async function owner() {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const headers = { "Cf-Access-Jwt-Assertion": await makeToken(k, claimsFor(team)) };
  return { team, k, headers };
}

test("api: the owner reads the bets with their version, uncacheable", async () => {
  const { team, headers } = await owner();
  const res = await call(envFor(team, fakeR2(STORED)), { headers });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { version: "e0", bets: [BET] });
  assert.match(res.headers.get("Cache-Control"), /private/);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
});

test("api: empty store reads as no bets, version null; the cookie works too", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const t = await makeToken(k, claimsFor(team, { email: "OWNER@Example.com" }));
  const res = await call(envFor(team, fakeR2(null)), { headers: { Cookie: `a=b; CF_Authorization=${t}` } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { version: null, bets: [] });
});

test("api: a write needs the current version; a stale one is a 409 and changes nothing", async () => {
  const { team, headers } = await owner();
  const r2 = fakeR2(null);
  const env = envFor(team, r2);
  let res = await put(env, headers, { version: null, bets: [BET] });
  assert.equal(res.status, 200);
  const { version } = await res.json();
  assert.equal(version, "e1");
  assert.deepEqual(JSON.parse(r2.body).bets, [BET]);

  // a second device still holding "no object yet"
  res = await put(env, headers, { version: null, bets: [] });
  assert.equal(res.status, 409);
  // a device holding an old etag
  res = await put(env, headers, { version: "e0", bets: [] });
  assert.equal(res.status, 409);
  assert.deepEqual(JSON.parse(r2.body).bets, [BET]);

  const two = [BET, { ...BET, id: "x2" }];
  res = await put(env, headers, { version, bets: two });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(r2.body).bets.length, 2);
  assert.equal(r2.writes, 2);
});

test("api: malformed writes are refused before touching the store", async () => {
  const { team, headers } = await owner();
  const r2 = fakeR2(STORED);
  const env = envFor(team, r2);
  const bad = [
    { bets: "nope" },
    { bets: [{ ...BET, id: "" }] },
    { bets: [BET, BET] },                               // duplicate id
    { bets: [{ ...BET, stake: 0 }] },
    { bets: [{ ...BET, stake: "1" }] },
    { bets: [{ ...BET, legs: [] }] },
    { bets: [{ ...BET, legs: [{ kind: "spread" }] }] }, // no gameId
    { bets: [{ ...BET, legs: Array(13).fill(BET.legs[0]) }] },
    { bets: [[1]] },
  ];
  for (const payload of bad) assert.equal((await put(env, headers, { version: "e0", ...payload })).status, 400, JSON.stringify(payload));
  assert.equal((await call(env, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: "{not json" })).status, 400);
  assert.equal((await call(env, { method: "PUT", headers: { ...headers, "Content-Type": "text/plain" }, body: "{}" })).status, 415);
  assert.equal((await put(env, { ...headers, Origin: "https://evil.example" }, { version: "e0", bets: [] })).status, 403);
  const huge = { version: "e0", bets: [{ ...BET, note: "x".repeat(1024 * 1024) }] };
  assert.equal((await put(env, headers, huge)).status, 413);
  for (const method of ["POST", "DELETE", "PATCH"]) {
    assert.equal((await call(env, { method, headers, body: "{}" })).status, 405, method);
  }
  assert.equal(r2.writes, 0);
  // same-origin writes are fine
  assert.equal((await put(env, { ...headers, Origin: HOST }, { version: "e0", bets: [] })).status, 200);
});

test("api: a guest with a valid token is refused, and the store is never read or written", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const r2 = fakeR2(STORED);
  const headers = { "Cf-Access-Jwt-Assertion": await makeToken(k, claimsFor(team, { email: "guest@example.com" })) };
  const res = await call(envFor(team, r2), { headers });
  assert.equal(res.status, 403);
  assert.doesNotMatch(await res.text(), /stake/);
  assert.equal((await put(envFor(team, r2), headers, { version: "e0", bets: [] })).status, 403);
  assert.equal(r2.reads, 0);
  assert.equal(r2.writes, 0);
});

test("api: no token, forged tokens, bad claims and service tokens are refused", async () => {
  const team = freshTeam(); const real = await signer(); const attacker = await signer();
  mockCerts({ [team]: [real.jwk] });
  const r2 = fakeR2(STORED);
  const env = envFor(team, r2);
  const as = async (tok) => (await call(env, { headers: { "Cf-Access-Jwt-Assertion": tok } })).status;
  assert.equal((await call(env)).status, 401);
  assert.equal((await call(env, { headers: { "Cf-Access-Authenticated-User-Email": OWNER } })).status, 401);
  assert.equal(await as("not.a.jwt"), 401);
  assert.equal(await as(await makeToken(attacker, claimsFor(team))), 401);
  assert.equal(await as(`${b64u(JSON.stringify({ alg: "none", kid: "k1" }))}.${b64u(JSON.stringify(claimsFor(team)))}.`), 401);
  assert.equal(await as(await makeToken(real, claimsFor(team), { alg: "HS256" })), 401);
  const [h, , s] = (await makeToken(real, claimsFor(team, { email: "guest@example.com" }))).split(".");
  assert.equal(await as(`${h}.${b64u(JSON.stringify(claimsFor(team)))}.${s}`), 401);
  assert.equal(await as(await makeToken(real, claimsFor(team, { iss: "https://evil.cloudflareaccess.com" }))), 401);
  assert.equal(await as(await makeToken(real, claimsFor(team, { exp: now() - 3600 }))), 401);
  assert.equal(await as(await makeToken(real, claimsFor(team, { nbf: now() + 3600 }))), 401);
  assert.equal(await as(await makeToken(real, { ...claimsFor(team), exp: undefined })), 401);
  const { email, ...noEmail } = claimsFor(team);
  assert.equal(await as(await makeToken(real, noEmail)), 403);
  const pinned = envFor(team, r2, { ACCESS_AUD: "sports-aud" });
  const aud = async (a) => (await call(pinned, { headers: { "Cf-Access-Jwt-Assertion": await makeToken(real, claimsFor(team, { aud: a })) } })).status;
  assert.equal(await aud(["sports-aud"]), 200);
  assert.equal(await aud(["redzone-aud"]), 401);
  assert.equal(r2.reads, 1);
});

test("api: fails closed when unconfigured or Access keys are unreachable", async () => {
  const { team, k, headers } = await owner();
  assert.equal((await call(envFor(team, fakeR2(STORED), { BETS_ALLOWED_EMAILS: "" }), { headers })).status, 503);
  assert.equal((await call(envFor(team, undefined), { headers })).status, 503);
  const body = await (await call(envFor(team, undefined), { headers })).json();
  assert.equal(body.error, "not-configured");
  const down = freshTeam(); mockCerts({});
  const res = await call(envFor(down, fakeR2(STORED)), { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, claimsFor(down)) } });
  assert.equal(res.status, 503);
});

test("api: only answers on sports.jaredluyster.com (the ungated pages.dev host gets a 404)", async () => {
  const { team, headers } = await owner();
  for (const host of ["https://mcboop-sports.pages.dev", "https://abc123.mcboop-sports.pages.dev", "http://localhost:8791"]) {
    const r2 = fakeR2(STORED);
    const res = await call(envFor(team, r2), { headers, host });
    assert.equal(res.status, 404, host);
    assert.equal(r2.reads, 0);
  }
});

test("api: the local dev bypass needs both a localhost host and BETS_DEV_EMAIL", async () => {
  const r2 = fakeR2(STORED);
  const dev = { SPORTS_BETS: r2, BETS_DEV_EMAIL: "me@local" };
  assert.equal((await call(dev, { host: "http://localhost:8791" })).status, 200);
  assert.equal((await call(dev, { host: "http://127.0.0.1:8791" })).status, 200);
  // the bypass setting does nothing on the real hostname or the pages.dev one
  const team = freshTeam(); mockCerts({});
  assert.equal((await call({ ...dev, ACCESS_TEAM_DOMAIN: team, BETS_ALLOWED_EMAILS: OWNER }, { host: HOST })).status, 401);
  assert.equal((await call(dev, { host: "https://mcboop-sports.pages.dev" })).status, 404);
});

test("api: other paths still fall through to the static site", async () => {
  const res = await call({}, { path: "/betting/" });
  assert.equal(await res.text(), "asset");
});
