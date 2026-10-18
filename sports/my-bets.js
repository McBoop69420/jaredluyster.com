/* My Bets — paper bets on sports.jaredluyster.com
 *
 * Every upcoming or live game card (Games page) gets a small "+ Bet" button. It
 * opens a form for that one game with DraftKings' lines from ESPN (spread,
 * moneyline, total; soccer's draw too): pick a side, adjust the line or odds if
 * you got a different number, set a stake in units, place it. Once a game has
 * started the lines shown are the pre-game ones (ESPN has no live odds), so an
 * in-game bet is logged at whatever number you type. Cards with a bet
 * on them show it, with its live status. The Betting page's My Bets panel is
 * the record: W-L-P, units, ROI, and every bet, graded from ESPN's scores
 * (live, then final).
 *
 * Storage is private and synced across devices: GET/PUT /api/bets
 * (sports/_worker.js), one R2 object readable and writable only by the owner's
 * Access login. Nothing about the bets is in this public repo. Guests get a 403:
 * no buttons, no panel.
 *
 * Once a game is final its score is written onto the leg (`final`), so a settled
 * bet never needs ESPN again and old results can't change under it.
 *
 *   Bet = { id, placedAt: ISO, stake: units, note?, legs: [Leg],
 *           result?: "won"|"lost"|"push"|"void" }      // set by hand, overrides grading
 *   Leg = { league: ESPN path ("football/nfl"), leagueLabel?, gameId: ESPN event id, start: ISO,
 *           away: { id, abbr }, home: { id, abbr },
 *           kind: "moneyline"|"spread"|"total",
 *           side: "away"|"home"|"draw" (moneyline, spread) | "over"|"under" (total),
 *           line?: number      // spread: the line for that side (-2.5); total: the number
 *           odds: American odds taken, threeWay?: true (soccer: a draw beats either side),
 *           final?: { away, home } | { void: true }   // written once the game is over
 *           result?: "won"|"lost"|"push"|"void" }     // set by hand
 *
 * Bets are placed one game at a time (one leg). Grading still handles
 * multi-leg bets (parlays): a parlay pays the product of its winning legs'
 * decimal odds, a pushed or void leg drops out. A postponed or canceled game is
 * void (no action), as at most books.
 *
 * The pure half (parsing, grading, summaries) is shared with
 * tests/my-bets.test.mjs; the DOM half only runs in a browser.
 */
(function (root, factory) {
  const PB = factory();
  if (typeof module === "object" && module.exports) module.exports = PB;
  else {
    root.PaperBets = PB;
    if (typeof document !== "undefined") mountMyBets(PB);
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Labels, and the scoreboard query grading needs for a whole day's slate
  // (college sports need `groups`, see LEAGUES in sports.js). Any other ESPN
  // league works too, with a plain scoreboard query.
  const LEAGUES = [
    { key: "football/nfl", label: "NFL" },
    { key: "football/college-football", label: "NCAAF", query: "groups=80&limit=500" },
    { key: "baseball/mlb", label: "MLB" },
    { key: "basketball/nba", label: "NBA" },
    { key: "hockey/nhl", label: "NHL" },
    { key: "basketball/mens-college-basketball", label: "NCAAM", query: "groups=50&limit=500" },
    { key: "basketball/womens-college-basketball", label: "NCAAW", query: "groups=50&limit=500" },
    { key: "basketball/wnba", label: "WNBA" },
    { key: "soccer/eng.1", label: "Premier League" },
    { key: "soccer/usa.1", label: "MLS" },
    { key: "soccer/esp.1", label: "La Liga" },
    { key: "soccer/uefa.champions", label: "Champions League" },
  ];
  const LEAGUE_BY_KEY = new Map(LEAGUES.map(l => [l.key, l]));
  const KINDS = { spread: "Spread", moneyline: "Moneyline", total: "Total" };
  const MANUAL = new Set(["won", "lost", "push", "void"]);

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const round2 = (n) => Math.round(n * 100) / 100;

  // "+124" / "-148" / "EVEN" / 124 -> 124. Anything that isn't a real American
  // price (|odds| < 100, "OFF", blank) -> null.
  function parseAmerican(v) {
    if (v == null) return null;
    if (/^\s*even\s*$/i.test(String(v))) return 100;
    const n = num(String(v).trim());
    return n != null && Math.abs(n) >= 100 ? n : null;
  }
  const toDecimal = (odds) => (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds);
  function toAmerican(dec) {
    if (!(dec > 1)) return null;
    return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  }
  const fmtOdds = (o) => (o == null ? "—" : o > 0 ? "+" + o : String(o).replace("-", "−"));
  const fmtNum = (n) => String(+(+n).toFixed(2));
  const fmtLine = (n) => (n === 0 ? "PK" : (n > 0 ? "+" : "−") + fmtNum(Math.abs(n)));
  function fmtUnits(n, signed) {
    if (n == null) return "—";
    const body = fmtNum(Math.abs(n)) + "u";
    if (!signed) return (n < 0 ? "−" : "") + body;
    return n > 0 ? "+" + body : n < 0 ? "−" + body : "0u";
  }

  // ---- ESPN parsing --------------------------------------------------------

  // DraftKings' current ("close") price on ESPN's scoreboard odds object; the
  // older flat fields (awayTeamOdds.moneyLine, spread, overUnder) are the
  // fallback, which is also all a summary's pickcenter carries.
  function parseOffers(o) {
    if (!o) return [];
    const out = [];
    const cur = (node) => node && node.close ? node.close : null;
    const add = (kind, side, odds, line, extra) => {
      if (odds == null) return;
      if ((kind === "spread" || kind === "total") && line == null) return;
      out.push(Object.assign({ kind, side, odds }, line == null ? {} : { line }, extra || {}));
    };
    const ml = o.moneyline || {};
    const threeWay = !!((ml.draw && cur(ml.draw)) || (o.drawOdds && o.drawOdds.moneyLine != null));
    const extra = threeWay ? { threeWay: true } : null;
    const mlPrice = (side) => {
      const c = cur(ml[side]);
      const legacy = side === "draw" ? o.drawOdds && o.drawOdds.moneyLine
        : (o[side + "TeamOdds"] || {}).moneyLine;
      return parseAmerican(c ? c.odds : legacy);
    };

    const ps = o.pointSpread || {};
    const spread = (side) => {
      const c = cur(ps[side]);
      if (c) return { line: num(c.line), odds: parseAmerican(c.odds) };
      const home = num(o.spread);
      if (home == null) return { line: null, odds: null };
      const legacy = (o[side + "TeamOdds"] || {}).spreadOdds;
      return { line: side === "home" ? home : -home, odds: parseAmerican(legacy) || -110 };
    };
    const tot = o.total || {};
    const total = (side) => {
      const c = cur(tot[side]);
      if (c) return { line: num(String(c.line || "").replace(/^[ou]/i, "")), odds: parseAmerican(c.odds) };
      const line = num(o.overUnder);
      return { line: line && line > 0 ? line : null, odds: parseAmerican(o[side + "Odds"]) || -110 };
    };

    for (const side of ["away", "home"]) {
      const s = spread(side);
      add("spread", side, s.odds, s.line);
    }
    add("moneyline", "away", mlPrice("away"), null, extra);
    if (threeWay) add("moneyline", "draw", mlPrice("draw"), null, extra);
    add("moneyline", "home", mlPrice("home"), null, extra);
    for (const side of ["over", "under"]) {
      const t = total(side);
      add("total", side, t.odds, t.line);
    }
    return out;
  }

  // One ESPN scoreboard event -> game.
  function parseEvent(ev, league) {
    const c = ev && ev.competitions && ev.competitions[0];
    if (!c || !Array.isArray(c.competitors)) return null;
    const teams = {};
    for (const comp of c.competitors) {
      const t = comp.team || {};
      teams[comp.homeAway] = {
        id: String(t.id), abbr: t.abbreviation || t.shortDisplayName || t.displayName || "?",
        name: t.displayName || t.name || t.abbreviation || "", score: num(comp.score),
      };
    }
    if (!teams.away || !teams.home) return null;
    const type = ((ev.status || c.status) || {}).type || {};
    return {
      id: String(ev.id || c.id), league, start: ev.date || c.date || null,
      state: type.state || "pre", completed: !!type.completed,
      voided: /POSTPONED|CANCEL/i.test(type.name || ""),
      statusText: type.shortDetail || type.detail || "",
      away: teams.away, home: teams.home,
      offers: parseOffers(c.odds && c.odds[0]),
    };
  }

  // An ESPN game summary (summary?event=) -> game: its header has the teams and
  // status, its pickcenter the same odds object the scoreboard carries.
  function parseSummary(data, league) {
    const h = data && data.header;
    const c = h && h.competitions && h.competitions[0];
    if (!c) return null;
    const odds = Array.isArray(data.pickcenter) && data.pickcenter.length ? data.pickcenter : c.odds;
    return parseEvent({ id: h.id || c.id, date: c.date, status: c.status, competitions: [Object.assign({}, c, { odds })] }, league);
  }

  // What gets written onto a leg once its game can't change any more.
  function finalSnapshot(game) {
    if (!game) return null;
    if (game.voided) return { void: true };
    if (game.state === "post" && game.completed && game.away.score != null && game.home.score != null) {
      return { away: game.away.score, home: game.home.score };
    }
    return null;
  }

  function legFromOffer(game, offer) {
    const leg = {
      league: game.league, gameId: game.id, start: game.start,
      ...(game.leagueLabel ? { leagueLabel: game.leagueLabel } : {}),
      away: { id: game.away.id, abbr: game.away.abbr }, home: { id: game.home.id, abbr: game.home.abbr },
      kind: offer.kind, side: offer.side, odds: offer.odds,
    };
    if (offer.line != null) leg.line = offer.line;
    if (offer.threeWay) leg.threeWay = true;
    return leg;
  }

  const offerKey = (x) => (x.gameId || x.id) + "|" + x.kind + "|" + x.side;

  function legLabel(leg) {
    if (leg.kind === "total") return (leg.side === "over" ? "Over " : "Under ") + fmtNum(leg.line);
    if (leg.side === "draw") return "Draw";
    const abbr = (leg[leg.side] || {}).abbr || leg.side;
    return leg.kind === "spread" ? abbr + " " + fmtLine(leg.line) : abbr + " ML";
  }
  const gameLabel = (leg) => (leg.away || {}).abbr + " @ " + (leg.home || {}).abbr;

  // ---- Grading -------------------------------------------------------------

  // > 0 the leg is ahead, < 0 behind, 0 on the number, at this score.
  function margin(leg, away, home) {
    if (leg.kind === "total") {
      const sum = away + home;
      return leg.side === "over" ? sum - leg.line : leg.line - sum;
    }
    if (leg.side === "draw") return away === home ? 1 : -1;
    const diff = leg.side === "away" ? away - home : home - away;
    if (leg.kind === "spread") return diff + leg.line;
    // Moneyline: a tie is a push on a two-way line, a loss when the draw was on offer.
    return diff === 0 && leg.threeWay ? -1 : diff;
  }

  const TONES = {
    won: "Won", lost: "Lost", push: "Push", void: "No action", winning: "Winning", losing: "Losing",
    pushing: "On the number", pending: "Not started", unknown: "No score yet",
  };

  // -> { tone, final, detail }. won/lost/push/void are final; winning/losing/
  // pushing are as things stand in a live game.
  function gradeLeg(leg, game, now = Date.now()) {
    if (MANUAL.has(leg.result)) return { tone: leg.result, final: true, detail: "Graded by hand" };
    const snap = leg.final || finalSnapshot(game);
    if (snap && snap.void) return { tone: "void", final: true, detail: "Postponed or canceled" };
    if (snap) {
      const m = margin(leg, snap.away, snap.home);
      return {
        tone: m > 0 ? "won" : m < 0 ? "lost" : "push", final: true,
        detail: "Final " + leg.away.abbr + " " + snap.away + "–" + snap.home + " " + leg.home.abbr,
      };
    }
    if (!game) {
      const future = leg.start && Date.parse(leg.start) > now;
      return { tone: future ? "pending" : "unknown", final: false, detail: "" };
    }
    if (game.state === "in" && game.away.score != null && game.home.score != null) {
      const m = margin(leg, game.away.score, game.home.score);
      return {
        tone: m > 0 ? "winning" : m < 0 ? "losing" : "pushing", final: false,
        detail: leg.away.abbr + " " + game.away.score + "–" + game.home.score + " " + leg.home.abbr +
          (game.statusText ? " · " + game.statusText : ""),
      };
    }
    if (game.state === "pre") return { tone: "pending", final: false, detail: "" };
    return { tone: "unknown", final: false, detail: game.statusText || "" };
  }

  const betDecimal = (legs) => legs.reduce((d, l) => d * toDecimal(l.odds), 1);
  const toWin = (bet) => round2(bet.stake * (betDecimal(bet.legs) - 1));

  // legGrades: gradeLeg() for each of bet.legs, in order.
  // -> { tone, final, profit (final only) }
  function gradeBet(bet, legGrades) {
    if (MANUAL.has(bet.result)) {
      const profit = bet.result === "won" ? toWin(bet) : bet.result === "lost" ? -bet.stake : 0;
      return { tone: bet.result, final: true, profit };
    }
    if (legGrades.some(g => g.final && g.tone === "lost")) return { tone: "lost", final: true, profit: -bet.stake };
    if (legGrades.every(g => g.final)) {
      const winners = bet.legs.filter((l, i) => legGrades[i].tone === "won");
      if (!winners.length) {
        return { tone: legGrades.every(g => g.tone === "void") ? "void" : "push", final: true, profit: 0 };
      }
      return { tone: "won", final: true, profit: round2(bet.stake * (betDecimal(winners) - 1)) };
    }
    if (legGrades.length === 1) return { tone: legGrades[0].tone, final: false };
    const live = legGrades.filter(g => !g.final);
    const tone = live.some(g => g.tone === "losing") ? "losing"
      : live.some(g => g.tone === "winning" || g.tone === "pushing") ? "winning" : "pending";
    return { tone, final: false };
  }

  function groupOf(bet) {
    if (bet.legs.length > 1) return { league: "Parlays", market: "Parlay" };
    const leg = bet.legs[0];
    const league = LEAGUE_BY_KEY.get(leg.league);
    return { league: leg.leagueLabel || (league ? league.label : leg.league), market: KINDS[leg.kind] || leg.kind };
  }

  // results: Map bet id -> gradeBet(). Win rate and ROI leave pushes and voids out.
  function summarize(bets, results) {
    const blank = (label) => ({ label, won: 0, lost: 0, push: 0, profit: 0, risked: 0 });
    const total = Object.assign(blank("All"), { open: 0, openStake: 0, openToWin: 0 });
    const byLeague = new Map();
    const byMarket = new Map();
    const tally = (row, r, stake) => {
      if (r.tone === "won") row.won++;
      else if (r.tone === "lost") row.lost++;
      else row.push++;
      if (r.tone === "won" || r.tone === "lost") row.risked += stake;
      row.profit = round2(row.profit + r.profit);
    };
    for (const bet of bets) {
      const r = results.get(bet.id);
      if (!r) continue;
      if (!r.final) {
        total.open++;
        total.openStake = round2(total.openStake + bet.stake);
        total.openToWin = round2(total.openToWin + toWin(bet));
        continue;
      }
      const g = groupOf(bet);
      if (!byLeague.has(g.league)) byLeague.set(g.league, blank(g.league));
      if (!byMarket.has(g.market)) byMarket.set(g.market, blank(g.market));
      tally(total, r, bet.stake);
      tally(byLeague.get(g.league), r, bet.stake);
      tally(byMarket.get(g.market), r, bet.stake);
    }
    const finish = (row) => Object.assign(row, {
      winRate: row.won + row.lost ? row.won / (row.won + row.lost) : null,
      roi: row.risked ? row.profit / row.risked : null,
    });
    const sorted = (m) => [...m.values()].map(finish).sort((a, b) => b.won + b.lost + b.push - (a.won + a.lost + a.push));
    return { total: finish(total), byLeague: sorted(byLeague), byMarket: sorted(byMarket) };
  }

  const ET_DAY = (() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
    } catch (e) { return null; }
  })();
  // "YYYY-MM-DD" in Eastern time (ESPN's scoreboard days are Eastern).
  const etDate = (iso) => (ET_DAY ? ET_DAY.format(iso ? new Date(iso) : new Date()) : new Date(iso || Date.now()).toISOString().slice(0, 10));

  return {
    LEAGUES, LEAGUE_BY_KEY, KINDS, TONES,
    parseAmerican, toDecimal, toAmerican, fmtOdds, fmtLine, fmtUnits, fmtNum,
    parseOffers, parseEvent, parseSummary, finalSnapshot, legFromOffer, offerKey, legLabel, gameLabel,
    margin, gradeLeg, gradeBet, betDecimal, toWin, summarize, etDate,
  };
});


// ---- DOM ---------------------------------------------------------------------
function mountMyBets(PB) {
  "use strict";

  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  const REFRESH_MS = 60 * 1000;
  const MAX_STAKE = 1000;
  const LS_STAKE = "myBets.stake";
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  // The International board merges a dozen tournaments; its cards carry the real
  // ESPN competition (sports.js), but anything still keyed to the merged id
  // can't be looked up, so it gets no button.
  const UNBETTABLE = new Set(["soccer/international"]);

  const S = {
    status: "loading",      // loading | ready | not-configured | unauthenticated | error | hidden
    version: null,
    bets: [],
    games: new Map(),       // ESPN event id -> parsed game, for grading
    view: "open",
    open: new Set(),        // expanded bet ids in the panel
    saving: false,
    stake: Number(lsGet(LS_STAKE)) > 0 ? Number(lsGet(LS_STAKE)) : 1,
    form: null,             // the bet form for one game, while it's open
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit",
  }) : "TBD";
  const fmtPlaced = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---- Store ---------------------------------------------------------------

  async function loadStore() {
    let res;
    try {
      res = await fetch("/api/bets", { credentials: "same-origin", cache: "no-store" });
    } catch (e) {
      S.status = "error";
      return;
    }
    const body = await res.json().catch(() => null);
    if (res.ok && body && Array.isArray(body.bets)) {
      S.status = "ready";
      S.version = body.version || null;
      S.bets = body.bets;
    } else if (res.status === 503 && body && body.error === "not-configured") S.status = "not-configured";
    else if (res.status === 401) S.status = "unauthenticated";
    else if (res.status === 403 || res.status === 404) S.status = "hidden"; // a guest, or an ungated host
    else S.status = "error";
    if (S.status !== "ready") console.warn("My Bets: bet store answered HTTP " + res.status, body);
  }

  // fn(bets) -> new bets. On a 409 (another device saved first) reload and
  // apply fn again to the newer list, once. -> "" on success, else an error.
  async function mutate(fn) {
    S.saving = true;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const next = fn(clone(S.bets));
        const res = await fetch("/api/bets", {
          method: "PUT", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: S.version, bets: next }),
        }).catch(() => null);
        if (res && res.ok) {
          const body = await res.json();
          S.bets = next;
          S.version = body.version;
          return "";
        }
        if (res && res.status === 409) {
          await loadStore();
          if (S.status !== "ready") break;
          continue;
        }
        return "Couldn't save" + (res ? " (HTTP " + res.status + ")" : " (offline?)") + ". Try again.";
      }
      return "Couldn't save: the bet list changed on another device. Try again.";
    } finally {
      S.saving = false;
    }
  }

  // ---- ESPN ----------------------------------------------------------------

  async function fetchScoreboard(leagueKey, date) {
    const league = PB.LEAGUE_BY_KEY.get(leagueKey);
    const url = ESPN + leagueKey + "/scoreboard?" + ((league && league.query) || "limit=1000") +
      "&dates=" + date.replace(/-/g, "") + "&_=" + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const games = (data.events || []).map(ev => PB.parseEvent(ev, leagueKey)).filter(Boolean);
    for (const g of games) S.games.set(g.id, g);
    return games;
  }

  async function fetchSummaryGame(leagueKey, gameId) {
    const res = await fetch(ESPN + leagueKey + "/summary?event=" + encodeURIComponent(gameId) + "&_=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const g = PB.parseSummary(await res.json(), leagueKey);
    if (g) S.games.set(g.id, g);
    return g;
  }

  // Scores for every leg that isn't settled yet: one scoreboard per league and
  // ET day, then a summary for any game that wasn't on it.
  async function refreshGrades() {
    const wanted = new Map(); // "league|date" -> Set(gameId)
    for (const bet of S.bets) {
      if (bet.result) continue;
      for (const leg of bet.legs) {
        if (leg.final || leg.result) continue;
        // Not started yet: nothing to grade (the first load still looks, to show the matchup's state).
        if (S.games.has(leg.gameId) && leg.start && Date.parse(leg.start) > Date.now()) continue;
        const key = leg.league + "|" + PB.etDate(leg.start);
        if (!wanted.has(key)) wanted.set(key, new Set());
        wanted.get(key).add(leg.gameId);
      }
    }
    if (!wanted.size) return;
    const found = new Set();
    await Promise.all([...wanted.keys()].map(async key => {
      const [league, date] = key.split("|");
      try {
        for (const g of await fetchScoreboard(league, date)) found.add(g.id);
      } catch (e) { /* summary fallback below */ }
    }));
    const missing = [];
    for (const [key, ids] of wanted) {
      for (const id of ids) if (!found.has(id)) missing.push([key.split("|")[0], id]);
    }
    await Promise.all(missing.slice(0, 20).map(([league, id]) => fetchSummaryGame(league, id).catch(() => null)));
    await recordFinals();
  }

  // Write final scores onto legs whose games just ended (see the header).
  async function recordFinals() {
    const updates = [];
    S.bets.forEach(bet => {
      if (bet.result) return;
      bet.legs.forEach((leg, i) => {
        if (leg.final || leg.result) return;
        const snap = PB.finalSnapshot(S.games.get(leg.gameId));
        if (snap) updates.push({ id: bet.id, i, snap });
      });
    });
    if (!updates.length) return;
    await mutate(bets => {
      for (const u of updates) {
        const bet = bets.find(b => b.id === u.id);
        if (bet && bet.legs[u.i] && !bet.legs[u.i].final) bet.legs[u.i].final = u.snap;
      }
      return bets;
    });
  }

  // ---- Grading view --------------------------------------------------------

  function grade(bet) {
    const legs = bet.legs.map(leg => PB.gradeLeg(leg, S.games.get(leg.gameId)));
    return { legs, bet: PB.gradeBet(bet, legs) };
  }

  const TONE_CLASS = {
    won: "call--value", winning: "call--value", lost: "call--fade", losing: "call--fade",
    push: "call--none", void: "call--none", pushing: "call--check", pending: "call--none", unknown: "call--none",
  };
  const chip = (tone, text) => '<span class="call ' + (TONE_CLASS[tone] || "call--none") + '">' + esc(text || PB.TONES[tone] || tone) + "</span>";

  // ---- Game cards: "+ Bet" and the bets already on the game ---------------

  function cardStripHtml(card) {
    const id = card.dataset.eventId;
    // Upcoming and live games; a finished one only shows the bets on it.
    const canBet = card.dataset.state !== "post" && !UNBETTABLE.has(card.dataset.league);
    const mine = S.bets.filter(b => b.legs.some(l => l.gameId === id));
    if (!canBet && !mine.length) return "";
    const tags = mine.map(bet => {
      const g = grade(bet);
      const leg = bet.legs.find(l => l.gameId === id);
      const label = (bet.legs.length > 1 ? "Parlay: " : "") + PB.legLabel(leg) + " · " + PB.fmtUnits(bet.stake);
      const shown = g.bet.final || g.bet.tone !== "pending";
      return chip(shown ? g.bet.tone : "pending", label + (shown ? " · " + PB.TONES[g.bet.tone] : ""));
    }).join("");
    return tags + (canBet ? '<button type="button" class="bet-chip" data-bet-open>+ Bet</button>' : "");
  }

  // sports.js rebuilds cards on every refresh, so this runs after each change;
  // a card whose strip is already current is left alone.
  function decorateCards() {
    if (S.status !== "ready") return;
    document.querySelectorAll(".game[data-event-id]").forEach(card => {
      const html = cardStripHtml(card);
      let strip = card.querySelector(":scope > .bet-strip");
      if (card.dataset.betStrip === html && (strip || !html)) return;
      card.dataset.betStrip = html;
      if (!html) { if (strip) strip.remove(); return; }
      if (!strip) {
        strip = document.createElement("div");
        strip.className = "bet-strip";
        card.appendChild(strip);
      }
      strip.innerHTML = html;
    });
  }

  let decorateQueued = false;
  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    // A timer, not requestAnimationFrame: that never fires in a background tab.
    setTimeout(() => { decorateQueued = false; decorateCards(); }, 30);
  }

  // ---- The bet form (one game) --------------------------------------------

  let dialog = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "bet-dialog";
    dialog.setAttribute("aria-label", "Place a paper bet");
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) return dialog.close(); // the backdrop
      const t = e.target.closest("button");
      if (!t) return;
      if (t.hasAttribute("data-bet-close")) return dialog.close();
      if (t.hasAttribute("data-pick")) return pick(t.getAttribute("data-pick"));
      if (t.hasAttribute("data-bet-place")) return place();
    });
    dialog.addEventListener("input", (e) => {
      const f = S.form;
      const t = e.target;
      if (!f) return;
      if (t.name === "line") f.line = t.value === "" ? NaN : Number(t.value);
      else if (t.name === "odds") f.odds = PB.parseAmerican(t.value.replace("−", "-"));
      else if (t.name === "stake") f.stake = Number(t.value);
      else if (t.name === "note") { f.note = t.value; return; }
      f.message = "";
      const totals = dialog.querySelector(".bet-form-totals");
      if (totals) totals.innerHTML = formTotalsHtml();
    });
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); place(); }
    });
    dialog.addEventListener("close", () => { S.form = null; });
    return dialog;
  }

  function openForm(card) {
    const id = card.dataset.eventId;
    const league = card.dataset.league;
    S.form = { id, league, leagueLabel: card.dataset.leagueLabel || null, game: null, loading: true, failed: false,
      pick: null, line: NaN, odds: null, stake: S.stake, note: "", message: "" };
    ensureDialog();
    renderForm();
    if (!dialog.open) dialog.showModal();
    fetchSummaryGame(league, id).then(g => {
      if (!S.form || S.form.id !== id) return;
      S.form.game = g;
      S.form.loading = false;
      S.form.failed = !g;
      renderForm();
    }).catch(() => {
      if (!S.form || S.form.id !== id) return;
      S.form.loading = false;
      S.form.failed = true;
      renderForm();
    });
  }

  const SIDES = { spread: ["away", "home"], moneyline: ["away", "draw", "home"], total: ["over", "under"] };

  const offerFor = (g, kind, side) => g.offers.find(o => o.kind === kind && o.side === side) || null;
  const threeWay = (g) => g.offers.some(o => o.threeWay) || /^soccer\//.test(g.league);

  function sideLabel(g, kind, side, line) {
    if (kind === "total") return (side === "over" ? "Over" : "Under") + (line != null ? " " + PB.fmtNum(line) : "");
    if (side === "draw") return "Draw";
    return g[side].abbr + (kind === "spread" && line != null ? " " + PB.fmtLine(line) : kind === "moneyline" ? " ML" : "");
  }

  function pick(key) {
    const f = S.form;
    if (!f || !f.game) return;
    const [kind, side] = key.split("|");
    const g = f.game;
    const offer = offerFor(g, kind, side);
    f.pick = { kind, side };
    let line = NaN;
    if (kind !== "moneyline") {
      if (offer) line = offer.line;
      else {
        // No price on this side: borrow the line from the other side if there is one.
        const other = g.offers.find(o => o.kind === kind && o.side !== side);
        if (other) line = kind === "spread" ? -other.line : other.line;
      }
    }
    // Before kickoff the posted price is the one you'd get, so it's filled in. Once
    // the game has started it's stale (ESPN only has pre-game lines): the boxes
    // start empty, with the pre-game number as a placeholder, so a live bet is
    // always logged at the number actually taken.
    f.pre = { line, odds: offer ? offer.odds : null };
    const live = g.state !== "pre";
    f.odds = live ? null : f.pre.odds;
    f.line = live ? NaN : line;
    f.message = "";
    renderForm();
    const first = dialog.querySelector(kind !== "moneyline" && !Number.isFinite(f.line) ? 'input[name="line"]'
      : f.odds == null ? 'input[name="odds"]' : 'input[name="stake"]');
    if (first) first.focus();
  }

  function formCheck() {
    const f = S.form;
    if (!f || !f.pick) return { ok: false };
    if (f.pick.kind !== "moneyline" && !Number.isFinite(f.line)) return { ok: false, why: "Enter the line you got." };
    if (f.odds == null) return { ok: false, why: "Enter the odds you got, like −110 or +150." };
    if (!(f.stake > 0 && f.stake <= MAX_STAKE)) return { ok: false, why: "Stake must be between 0 and " + MAX_STAKE + " units." };
    return { ok: true };
  }

  function formTotalsHtml() {
    const f = S.form;
    const check = formCheck();
    const win = check.ok ? Math.round(f.stake * (PB.toDecimal(f.odds) - 1) * 100) / 100 : null;
    return (win != null ? "<p>Risk " + esc(PB.fmtUnits(f.stake)) + " to win <strong>" + esc(PB.fmtUnits(win)) + "</strong></p>" : "") +
      (f.pick && check.why ? '<p class="picks-loss">' + esc(check.why) + "</p>" : "") +
      (f.message ? '<p class="picks-loss">' + esc(f.message) + "</p>" : "");
  }

  function renderForm() {
    const f = S.form;
    if (!dialog || !f) return;
    const close = '<button type="button" class="bet-dialog-close" data-bet-close aria-label="Close">&times;</button>';
    if (f.loading || f.failed || !f.game) {
      dialog.innerHTML = '<div class="bet-form">' + close + '<p class="value-empty">' +
        (f.loading ? "Loading lines&hellip;" : "Couldn't load this game from ESPN. Try again in a minute.") + "</p></div>";
      return;
    }
    const g = f.game;
    const started = g.state !== "pre";
    const rows = Object.keys(SIDES).map(kind => {
      const sides = SIDES[kind].filter(side => side !== "draw" || threeWay(g));
      const buttons = sides.map(side => {
        const offer = offerFor(g, kind, side);
        const on = !!(f.pick && f.pick.kind === kind && f.pick.side === side);
        return '<button type="button" class="bet-offer' + (on ? " bet-offer--on" : "") + '" data-pick="' + kind + "|" + side + '" aria-pressed="' + on + '"' +
          ">" + esc(sideLabel(g, kind, side, offer ? offer.line : null)) +
          " <small>" + esc(offer ? PB.fmtOdds(offer.odds) : "—") + "</small></button>";
      }).join("");
      return '<div class="bet-market"><span class="bet-market-label">' + esc(PB.KINDS[kind]) + '</span><div class="bet-market-sides">' + buttons + "</div></div>";
    }).join("");
    let inputs = "";
    if (f.pick) {
      const hasLine = f.pick.kind !== "moneyline";
      inputs = '<div class="slip-inputs bet-form-inputs">' +
        (hasLine ? '<label>Line <input name="line" type="number" step="0.5" inputmode="decimal" value="' + (Number.isFinite(f.line) ? esc(f.line) : "") + '"' +
          (f.pre && Number.isFinite(f.pre.line) ? ' placeholder="' + esc(f.pre.line) + '"' : "") + "></label>" : "") +
        '<label>Odds <input name="odds" type="text" inputmode="numeric" value="' + (f.odds != null ? esc(f.odds > 0 ? "+" + f.odds : f.odds) : "") + '"' +
          (f.pre && f.pre.odds != null ? ' placeholder="' + esc(f.pre.odds > 0 ? "+" + f.pre.odds : f.pre.odds) + '"' : "") + "></label>" +
        '<label>Stake <input name="stake" type="number" min="0.1" step="0.5" inputmode="decimal" value="' + esc(f.stake) + '"> units</label></div>' +
        '<div class="slip-inputs"><input name="note" type="text" maxlength="200" placeholder="Note (optional)" value="' + esc(f.note) + '"></div>' +
        '<div class="bet-form-totals">' + formTotalsHtml() + "</div>" +
        '<div class="slip-actions"><button type="button" class="ctx-btn" data-bet-place' + (S.saving ? " disabled" : "") + ">Place bet</button>" +
        '<button type="button" class="picks-toggle" data-bet-close>Cancel</button></div>';
    }
    const mine = S.bets.filter(b => b.legs.some(l => l.gameId === g.id));
    const existing = mine.length
      ? '<div class="bet-form-existing"><span class="bet-market-label">Your bets on this game</span>' + mine.map(bet => {
        const gr = grade(bet);
        const leg = bet.legs.find(l => l.gameId === g.id);
        return "<div>" + esc((bet.legs.length > 1 ? "Parlay: " : "") + PB.legLabel(leg) + " " + PB.fmtOdds(leg.odds) + " · " + PB.fmtUnits(bet.stake)) + " " + chip(gr.bet.tone) + "</div>";
      }).join("") + "</div>"
      : "";
    const hint = started
      ? (g.state === "in" ? "In progress" + (g.statusText ? " (" + g.statusText + ")" : "") : "Started") +
        ": the prices shown are pre-game. Tap the side you bet, then type the line and odds you got."
      : g.offers.length ? "Tap a line. Change the number if yours was different."
        : "No line posted yet: tap a side and enter the line and odds you got.";
    dialog.innerHTML = '<div class="bet-form">' + close +
      '<div class="value-screen-kicker">Paper bet' + (f.leagueLabel ? " · " + esc(f.leagueLabel) : "") + "</div>" +
      "<h3>" + esc(g.away.name || g.away.abbr) + " @ " + esc(g.home.name || g.home.abbr) + "</h3>" +
      '<p class="value-note">' + esc(fmtWhen(g.start)) + " ET · " + esc(hint) + "</p>" +
      '<div class="bet-markets">' + rows + "</div>" + inputs + existing + "</div>";
  }

  async function place() {
    const f = S.form;
    const check = formCheck();
    if (!f || !check.ok || S.saving) return;
    const g = f.game;
    const offer = { kind: f.pick.kind, side: f.pick.side, odds: f.odds };
    if (f.pick.kind !== "moneyline") offer.line = f.line;
    if (f.pick.kind === "moneyline" && threeWay(g)) offer.threeWay = true;
    const leg = PB.legFromOffer(Object.assign({}, g, { leagueLabel: f.leagueLabel }), offer);
    const bet = { id: newId(), placedAt: new Date().toISOString(), stake: f.stake, legs: [leg] };
    const note = f.note.trim().slice(0, 200);
    if (note) bet.note = note;
    renderForm();
    const err = await mutate(bets => bets.concat([bet]));
    if (err) {
      if (S.form) { S.form.message = err; renderForm(); }
      return;
    }
    S.stake = f.stake;
    lsSet(LS_STAKE, String(f.stake));
    dialog.close();
    decorateCards();
    renderPanel();
  }

  // ---- The My Bets panel (Betting page) ------------------------------------

  function renderPanel() {
    const panel = $("myBets");
    if (!panel) return;
    panel.hidden = S.status === "hidden" || S.status === "loading";
    const note = {
      "not-configured": "The private bet store isn't set up yet, so bets can't be saved. Setup steps are in DEPLOY.md (\"Sports My Bets — private store setup\").",
      unauthenticated: "Couldn't confirm your login to the bet store (HTTP 401). Reload the page; if it persists, check the Access settings in DEPLOY.md.",
      error: "Couldn't reach the bet store. Hit Refresh to try again.",
    }[S.status];
    $("myBetsStatus").innerHTML = note ? '<p class="value-empty">' + esc(note) + "</p>" : "";
    $("myBetsBody").hidden = S.status !== "ready";
    if (S.status !== "ready") {
      $("myBetsMeta").textContent = S.status === "loading" ? "Loading bets…" : "Unavailable";
      return;
    }
    renderSummary();
    renderList();
  }

  function renderSummary() {
    const results = new Map(S.bets.map(b => [b.id, grade(b).bet]));
    const sum = PB.summarize(S.bets, results);
    const t = sum.total;
    const record = t.won + "–" + t.lost + "–" + t.push;
    $("myBetsMeta").textContent = S.bets.length
      ? record + " · " + PB.fmtUnits(t.profit, true) + (t.open ? " · " + t.open + " open" : "")
      : "No bets yet";
    const pct = (x) => x == null ? "—" : (x * 100).toFixed(1) + "%";
    const signedPct = (x) => x == null ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
    const tile = (label, value, sub, cls) =>
      '<div class="bets-tile"><div class="bets-tile-label">' + label + '</div><div class="bets-tile-value' +
      (cls ? " " + cls : "") + '">' + value + '</div><div class="value-note">' + sub + "</div></div>";
    const plClass = (n) => n > 0 ? "picks-win" : n < 0 ? "picks-loss" : "";
    let html = '<div class="bets-tiles">' +
      tile("Record", esc(record), "W–L–P · win rate " + pct(t.winRate)) +
      tile("Units", esc(PB.fmtUnits(t.profit, true)), esc(PB.fmtUnits(t.risked) + " risked on settled bets"), plClass(t.profit)) +
      tile("ROI", esc(signedPct(t.roi)), "profit ÷ units risked", plClass(t.roi)) +
      tile("Open", String(t.open), esc(PB.fmtUnits(t.openStake) + " at stake · to win " + PB.fmtUnits(t.openToWin))) +
      "</div>";
    const line = (rows) => rows.map(r =>
      "<span><strong>" + esc(r.label) + "</strong> " + r.won + "–" + r.lost + "–" + r.push + ' <span class="' +
      plClass(r.profit) + '">' + esc(PB.fmtUnits(r.profit, true)) + "</span></span>").join("");
    if (sum.byLeague.length) {
      html += '<div class="bets-breakdown"><div><span class="bets-breakdown-label">By league</span>' + line(sum.byLeague) +
        '</div><div><span class="bets-breakdown-label">By market</span>' + line(sum.byMarket) + "</div></div>";
    }
    $("myBetsSummary").innerHTML = html;
  }

  // A leg's own status chip only on parlays: a straight bet's is the Status column.
  function legLineHtml(leg, g, parlay) {
    const detail = g.detail ? ' <span class="value-note">' + esc(g.detail) + "</span>" : "";
    return '<div class="bet-leg"><strong>' + esc(PB.legLabel(leg)) + '</strong> <span class="value-note">' +
      esc(PB.fmtOdds(leg.odds)) + " · " + esc(PB.gameLabel(leg)) + (leg.final ? "" : " · " + esc(fmtWhen(leg.start))) +
      "</span>" + (parlay && g.tone !== "pending" ? " " + chip(g.tone) : "") + detail + "</div>";
  }

  function betRowHtml(bet) {
    const g = grade(bet);
    const parlay = bet.legs.length > 1;
    const dec = PB.betDecimal(bet.legs);
    const pl = g.bet.final
      ? '<span class="' + (g.bet.profit > 0 ? "picks-win" : g.bet.profit < 0 ? "picks-loss" : "") + '">' + esc(PB.fmtUnits(g.bet.profit, true)) + "</span>"
      : '<span class="value-note">to win ' + esc(PB.fmtUnits(PB.toWin(bet))) + "</span>";
    const open = S.open.has(bet.id);
    let html = "<tr><td>" + esc(fmtPlaced(bet.placedAt)) + '</td><td class="bet-cell">' +
      (parlay ? '<div class="bet-parlay">' + bet.legs.length + "-leg parlay</div>" : "") +
      bet.legs.map((leg, i) => legLineHtml(leg, g.legs[i], parlay)).join("") +
      (bet.note ? '<div class="value-note">' + esc(bet.note) + "</div>" : "") + "</td>" +
      "<td>" + esc(PB.fmtUnits(bet.stake)) + "</td><td>" + esc(PB.fmtOdds(PB.toAmerican(dec))) + "</td>" +
      "<td>" + chip(g.bet.tone) + (bet.result ? ' <span class="value-note">by hand</span>' : "") + "</td><td>" + pl + "</td>" +
      '<td><button type="button" class="picks-toggle" data-bet-toggle="' + esc(bet.id) + '" aria-expanded="' + open + '" aria-label="Bet options">' +
      (open ? "▾" : "▸") + "</button></td></tr>";
    if (open) {
      const btn = (r, label) => '<button type="button" class="picks-toggle" data-bet-grade="' + esc(bet.id) + '" data-grade="' + r +
        '" aria-pressed="' + ((bet.result || "") === r) + '">' + label + "</button>";
      html += '<tr class="picks-detail"><td colspan="7"><div class="bet-actions"><span class="value-note">Placed ' +
        esc(new Date(bet.placedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })) +
        " ET · settle by hand:</span> " + btn("won", "Won") + btn("lost", "Lost") + btn("push", "Push") + btn("void", "No action") +
        btn("", "Auto") + ' <button type="button" class="picks-toggle bet-delete" data-bet-delete="' + esc(bet.id) + '">Delete bet</button></div></td></tr>';
    }
    return html;
  }

  function renderList() {
    const graded = S.bets.map(b => ({ bet: b, final: grade(b).bet.final }));
    const counts = { open: graded.filter(x => !x.final).length, settled: graded.filter(x => x.final).length, all: graded.length };
    document.querySelectorAll("[data-bets-view]").forEach(b => {
      const v = b.getAttribute("data-bets-view");
      b.setAttribute("aria-pressed", String(v === S.view));
      b.textContent = { open: "Open", settled: "Settled", all: "All" }[v] + " (" + counts[v] + ")";
    });
    const rows = graded
      .filter(x => S.view === "all" || (S.view === "open") === !x.final)
      .map(x => x.bet)
      .sort((a, b) => S.view === "open"
        ? String(a.legs[0].start).localeCompare(String(b.legs[0].start))
        : String(b.placedAt).localeCompare(String(a.placedAt)));
    $("myBetsListBody").innerHTML = rows.length ? rows.map(betRowHtml).join("")
      : '<tr><td colspan="7" class="value-empty">' + (S.view === "open"
        ? 'No open bets. Tap <strong>+ Bet</strong> on any upcoming game on <a href="/">Games</a>.'
        : S.view === "settled" ? "No settled bets yet." : "No bets yet.") + "</td></tr>";
  }

  async function setResult(id, result) {
    await mutate(bets => {
      const bet = bets.find(b => b.id === id);
      if (bet) { if (result) bet.result = result; else delete bet.result; }
      return bets;
    });
    renderPanel();
    decorateCards();
  }

  async function remove(id) {
    const bet = S.bets.find(b => b.id === id);
    if (!bet || !confirm("Delete this bet (" + bet.legs.map(PB.legLabel).join(", ") + ")? This can't be undone.")) return;
    await mutate(bets => bets.filter(b => b.id !== id));
    S.open.delete(id);
    renderPanel();
    decorateCards();
  }

  // ---- Wiring --------------------------------------------------------------

  function bind() {
    // Capture phase: a card is often a link to the broadcast, and the button
    // must not follow it.
    document.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest("[data-bet-open]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest(".game[data-event-id]");
      if (card && S.status === "ready") openForm(card);
    }, true);

    const panel = $("myBets");
    if (panel) {
      panel.addEventListener("click", (e) => {
        const t = e.target.closest("button");
        if (!t || !panel.contains(t)) return;
        if (t.hasAttribute("data-bets-view")) {
          S.view = t.getAttribute("data-bets-view");
          return renderList();
        }
        if (t.hasAttribute("data-bet-toggle")) {
          const id = t.getAttribute("data-bet-toggle");
          if (S.open.has(id)) S.open.delete(id); else S.open.add(id);
          return renderList();
        }
        if (t.hasAttribute("data-bet-grade")) return setResult(t.getAttribute("data-bet-grade"), t.getAttribute("data-grade"));
        if (t.hasAttribute("data-bet-delete")) return remove(t.getAttribute("data-bet-delete"));
      });
    }

    // Freshly rebuilt cards get their strip in the observer callback itself (a
    // microtask, so before the next paint); waiting on the timer let every
    // live refresh draw the cards strip-less for a frame, so they jumped.
    const addsCard = r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches(".game") || n.querySelector(".game")));
    new MutationObserver(records => {
      if (records.some(addsCard)) decorateCards(); else queueDecorate();
    }).observe(document.querySelector(".paper") || document.body, { childList: true, subtree: true });

    const refreshBtn = $("refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", start);

    setInterval(() => {
      if (document.hidden || S.status !== "ready") return;
      refreshGrades().then(() => { renderPanel(); decorateCards(); });
    }, REFRESH_MS);
  }

  async function start() {
    await loadStore();
    renderPanel();
    if (S.status !== "ready") return;
    decorateCards();
    await refreshGrades();
    renderPanel();
    decorateCards();
  }

  function init() {
    bind();
    start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
