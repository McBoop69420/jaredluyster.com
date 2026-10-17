/* My Bets — paper bets on the Betting page (sports.jaredluyster.com/betting/)
 *
 * Pick a league and day, click a DraftKings price from ESPN's scoreboard to put
 * it on the slip, and place it as one or more straight bets or a parlay, staked
 * in units. Bets are graded here against ESPN's scores (live, then final).
 *
 * Storage is private and synced across devices: GET/PUT /api/bets
 * (sports/_worker.js), one R2 object readable and writable only by the owner's
 * Access login. Nothing about the bets is in this public repo. Guests get a 403
 * and never see the panel.
 *
 * Once a game is final its score is written onto the leg (`final`), so a settled
 * bet never needs ESPN again and old results can't change under it.
 *
 *   Bet = { id, placedAt: ISO, stake: units, note?, legs: [Leg],
 *           result?: "won"|"lost"|"push"|"void" }      // set by hand, overrides grading
 *   Leg = { league: ESPN path ("football/nfl"), gameId: ESPN event id, start: ISO,
 *           away: { id, abbr }, home: { id, abbr },
 *           kind: "moneyline"|"spread"|"total",
 *           side: "away"|"home"|"draw" (moneyline, spread) | "over"|"under" (total),
 *           line?: number      // spread: the line for that side (-2.5); total: the number
 *           odds: American odds taken, threeWay?: true (soccer: a draw beats either side),
 *           final?: { away, home } | { void: true }   // written once the game is over
 *           result?: "won"|"lost"|"push"|"void" }     // set by hand
 *
 * A parlay pays the product of its winning legs' decimal odds; a pushed or void
 * leg drops out, and a parlay with no winning legs left is a push. A postponed or
 * canceled game is void (no action), as at most books.
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

  // ESPN path, label, and the scoreboard query that returns the whole slate
  // (college sports need `groups`, see LEAGUES in sports.js). weekly: football
  // is bet by the week, so the board's default view is the current week's
  // slate (ESPN's scoreboard without a date) rather than just today.
  const LEAGUES = [
    { key: "football/nfl", label: "NFL", weekly: true },
    { key: "football/college-football", label: "NCAAF", query: "groups=80&limit=500", weekly: true },
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

  // One ESPN scoreboard event (or a summary's header, same shape) -> game.
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
    return { league: league ? league.label : leg.league, market: KINDS[leg.kind] || leg.kind };
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
    parseOffers, parseEvent, finalSnapshot, legFromOffer, offerKey, legLabel, gameLabel,
    margin, gradeLeg, gradeBet, betDecimal, toWin, summarize, etDate,
  };
});

// ---- DOM ---------------------------------------------------------------------
function mountMyBets(PB) {
  "use strict";

  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  const REFRESH_MS = 60 * 1000;
  const MAX_STAKE = 1000;
  const LS = { league: "myBets.league", stake: "myBets.stake" };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  const S = {
    status: "loading",      // loading | ready | not-configured | unauthenticated | error | hidden
    version: null,
    bets: [],
    games: new Map(),       // ESPN event id -> parsed game (board + grading)
    board: null,            // parsed games for the chosen league/day
    boardLoading: false,
    boardSeq: 0,
    league: PB.LEAGUE_BY_KEY.has(lsGet(LS.league)) ? lsGet(LS.league) : "football/nfl",
    date: null,             // null = today (ET)
    filter: "",
    slip: [],               // legs
    mode: "straight",
    stake: Number(lsGet(LS.stake)) > 0 ? Number(lsGet(LS.stake)) : 1,
    note: "",
    view: "open",
    open: new Set(),        // expanded bet ids
    saving: false,
    message: "",
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = () => S.date || PB.etDate();
  const weekly = () => !S.date && !!PB.LEAGUE_BY_KEY.get(S.league).weekly;
  // What the board shows: a chosen day, today, or (football) this week.
  const boardKey = () => S.date || (weekly() ? "week" : PB.etDate());
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
  // apply fn again to the newer list, once.
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
          return true;
        }
        if (res && res.status === 409) {
          await loadStore();
          if (S.status !== "ready") break;
          continue;
        }
        S.message = "Couldn't save" + (res ? " (HTTP " + res.status + ")" : " (offline?)") + ". Try again.";
        return false;
      }
      S.message = "Couldn't save: the bet list changed on another device. Try again.";
      return false;
    } finally {
      S.saving = false;
    }
  }

  // ---- ESPN ----------------------------------------------------------------

  // date null = ESPN's current slate (this week, for football).
  async function fetchScoreboard(leagueKey, date) {
    const league = PB.LEAGUE_BY_KEY.get(leagueKey);
    const url = ESPN + leagueKey + "/scoreboard?" + ((league && league.query) || "limit=1000") +
      (date ? "&dates=" + date.replace(/-/g, "") : "") + "&_=" + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const games = (data.events || []).map(ev => PB.parseEvent(ev, leagueKey)).filter(Boolean);
    for (const g of games) S.games.set(g.id, g);
    return games;
  }

  async function fetchSummaryGame(leagueKey, gameId) {
    const res = await fetch(ESPN + leagueKey + "/summary?event=" + encodeURIComponent(gameId));
    if (!res.ok) return null;
    const data = await res.json();
    const h = data && data.header;
    const c = h && h.competitions && h.competitions[0];
    if (!c) return null;
    const g = PB.parseEvent({ id: h.id || gameId, date: c.date, status: c.status, competitions: [c] }, leagueKey);
    if (g) S.games.set(g.id, g);
    return g;
  }

  async function loadBoard() {
    const seq = ++S.boardSeq;
    S.boardLoading = true;
    renderBoard();
    let games = null;
    try {
      games = await fetchScoreboard(S.league, weekly() ? null : day());
    } catch (e) { /* keep the last good board */ }
    if (seq !== S.boardSeq) return;
    S.boardLoading = false;
    if (games) S.board = { league: S.league, key: boardKey(), games };
    renderBoard();
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
  const chip = (tone) => '<span class="call ' + (TONE_CLASS[tone] || "call--none") + '">' + esc(PB.TONES[tone] || tone) + "</span>";

  // ---- Rendering -----------------------------------------------------------

  function render() {
    const panel = $("myBets");
    if (!panel) return;
    panel.hidden = S.status === "hidden" || S.status === "loading";
    const status = $("myBetsStatus");
    const body = $("myBetsBody");
    const note = {
      "not-configured": "The private bet store isn't set up yet, so bets can't be saved. Setup steps are in DEPLOY.md (\"Sports My Bets — private store setup\").",
      unauthenticated: "Couldn't confirm your login to the bet store (HTTP 401). Reload the page; if it persists, check the Access settings in DEPLOY.md.",
      error: "Couldn't reach the bet store. Hit Refresh to try again.",
    }[S.status];
    status.innerHTML = note ? '<p class="value-empty">' + esc(note) + "</p>" : "";
    body.hidden = S.status !== "ready";
    if (S.status !== "ready") {
      $("myBetsMeta").textContent = S.status === "loading" ? "Loading bets…" : "Unavailable";
      return;
    }
    renderSummary();
    renderBoard();
    renderSlip();
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

  function offerButton(game, offer) {
    const leg = PB.legFromOffer(game, offer);
    const key = PB.offerKey(leg);
    const on = S.slip.some(l => PB.offerKey(l) === key);
    const label = offer.kind === "total" ? (offer.side === "over" ? "O " : "U ") + PB.fmtNum(offer.line)
      : offer.side === "draw" ? "Draw"
        : game[offer.side].abbr + (offer.kind === "spread" ? " " + PB.fmtLine(offer.line) : "");
    return '<button type="button" class="bet-offer' + (on ? " bet-offer--on" : "") + '" data-offer="' + esc(key) + '"' +
      (game.state !== "pre" ? " disabled" : "") + ' aria-pressed="' + on + '">' + esc(label) +
      " <small>" + esc(PB.fmtOdds(offer.odds)) + "</small></button>";
  }

  function boardRowHtml(g) {
    const cell = (kind) => {
      const offers = g.offers.filter(o => o.kind === kind);
      return offers.length ? '<td><div class="bet-offers">' + offers.map(o => offerButton(g, o)).join("") + "</div></td>"
        : '<td class="value-note">—</td>';
    };
    const when = g.state === "in"
      ? g.away.abbr + " " + g.away.score + "–" + g.home.score + " " + g.home.abbr + " · " + g.statusText
      : weekly() ? fmtWhen(g.start) : fmtWhen(g.start).split(" ").slice(1).join(" ");
    return "<tr><td><strong>" + esc(g.away.abbr + " @ " + g.home.abbr) + '</strong><div class="value-note">' + esc(when) +
      "</div></td>" + cell("spread") + cell("moneyline") + cell("total") + "</tr>";
  }

  function renderBoard() {
    const tbody = $("myBetsBoardBody");
    if (!tbody || S.status !== "ready") return;
    const board = S.board && S.board.league === S.league && S.board.key === boardKey() ? S.board : null;
    if (!board) {
      tbody.innerHTML = '<tr><td colspan="4" class="value-empty">' +
        (S.boardLoading ? "Loading games&hellip;" : "Games unavailable right now.") + "</td></tr>";
      return;
    }
    const q = S.filter.trim().toLowerCase();
    const games = board.games
      .filter(g => g.state !== "post")
      .filter(g => !q || [g.away.abbr, g.away.name, g.home.abbr, g.home.name].some(s => String(s).toLowerCase().includes(q)))
      .sort((a, b) => (a.state === "in") - (b.state === "in") || String(a.start).localeCompare(String(b.start)));
    const label = PB.LEAGUE_BY_KEY.get(S.league).label;
    if (!games.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="value-empty">' + (q ? "No games match “" + esc(S.filter) + "”."
        : "No upcoming " + esc(label) + " games " + (weekly() ? "this week." : "on this day.")) + "</td></tr>";
      return;
    }
    tbody.innerHTML = games.map(boardRowHtml).join("");
  }

  function slipCheck() {
    const legs = S.slip;
    if (!legs.length) return { ok: false };
    for (const leg of legs) {
      if (PB.parseAmerican(leg.odds) == null) return { ok: false, why: "Odds must be American odds, like −110 or +150." };
      if ((leg.kind === "spread" || leg.kind === "total") && !Number.isFinite(leg.line)) return { ok: false, why: "Every spread and total needs a line." };
    }
    if (!(S.stake > 0 && S.stake <= MAX_STAKE)) return { ok: false, why: "Stake must be between 0 and " + MAX_STAKE + " units." };
    if (S.mode === "parlay") {
      if (legs.length < 2) return { ok: false, why: "A parlay needs at least two legs." };
      if (new Set(legs.map(l => l.gameId)).size < legs.length) return { ok: false, why: "Parlay legs must come from different games." };
    }
    return { ok: true };
  }

  function slipTotalsHtml() {
    const check = slipCheck();
    if (!S.slip.length) return "";
    let line;
    if (S.mode === "parlay" && S.slip.length > 1) {
      const dec = check.ok ? PB.betDecimal(S.slip) : null;
      line = dec ? "Parlay at " + PB.fmtOdds(PB.toAmerican(dec)) + " · risk " + PB.fmtUnits(S.stake) + " to win " +
        PB.fmtUnits(Math.round(S.stake * (dec - 1) * 100) / 100) : "";
    } else {
      const win = check.ok ? S.slip.reduce((s, l) => s + S.stake * (PB.toDecimal(l.odds) - 1), 0) : null;
      line = win != null ? S.slip.length + (S.slip.length === 1 ? " bet" : " bets") + " · risk " +
        PB.fmtUnits(S.stake * S.slip.length) + " to win " + PB.fmtUnits(Math.round(win * 100) / 100) : "";
    }
    return (line ? "<p>" + esc(line) + "</p>" : "") + (check.why ? '<p class="picks-loss">' + esc(check.why) + "</p>" : "") +
      (S.message ? '<p class="picks-loss">' + esc(S.message) + "</p>" : "");
  }

  function renderSlip() {
    const box = $("myBetsSlip");
    if (!box) return;
    box.classList.toggle("bets-slip--filled", S.slip.length > 0);
    if (!S.slip.length) {
      box.innerHTML = '<h3>Bet slip</h3><p class="value-note">Click a price to add it to the slip.</p>' +
        (S.message ? '<p class="picks-loss">' + esc(S.message) + "</p>" : "");
      return;
    }
    const legs = S.slip.map((leg, i) => {
      const hasLine = leg.kind === "spread" || leg.kind === "total";
      return '<div class="slip-leg"><div class="slip-leg-head"><div><strong>' + esc(PB.legLabel(leg)) +
        '</strong><div class="value-note">' + esc(PB.gameLabel(leg) + " · " + fmtWhen(leg.start)) + "</div></div>" +
        '<button type="button" class="slip-remove" data-slip-remove="' + i + '" aria-label="Remove">&times;</button></div>' +
        '<div class="slip-inputs">' +
        (hasLine ? '<label>Line <input type="number" step="0.5" inputmode="decimal" data-slip-line="' + i + '" value="' + esc(leg.line) + '"></label>' : "") +
        '<label>Odds <input type="text" inputmode="numeric" data-slip-odds="' + i + '" value="' + esc(leg.odds > 0 ? "+" + leg.odds : leg.odds) + '"></label>' +
        "</div></div>";
    }).join("");
    const modes = S.slip.length > 1
      ? '<div class="slip-modes" role="radiogroup" aria-label="Bet type">' +
        ["straight", "parlay"].map(m => '<button type="button" class="picks-toggle" data-slip-mode="' + m + '" aria-pressed="' + (S.mode === m) + '">' + (m === "straight" ? "Straight bets" : "Parlay") + "</button>").join("") + "</div>"
      : "";
    box.innerHTML = '<h3>Bet slip</h3>' + legs + modes +
      '<div class="slip-inputs"><label>Stake' + (S.mode === "straight" && S.slip.length > 1 ? " (each)" : "") +
      ' <input type="number" min="0.1" step="0.5" inputmode="decimal" id="myBetsStake" value="' + esc(S.stake) + '"> units</label></div>' +
      '<div class="slip-inputs"><input type="text" id="myBetsNote" maxlength="200" placeholder="Note (optional)" value="' + esc(S.note) + '"></div>' +
      '<div id="myBetsSlipTotals" class="slip-totals">' + slipTotalsHtml() + "</div>" +
      '<div class="slip-actions"><button type="button" class="ctx-btn" id="myBetsPlace"' + (S.saving ? " disabled" : "") + ">" +
      (S.mode === "parlay" && S.slip.length > 1 ? "Place parlay" : S.slip.length > 1 ? "Place " + S.slip.length + " bets" : "Place bet") +
      '</button><button type="button" class="picks-toggle" id="myBetsClear">Clear</button></div>';
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
    let html = "<tr><td>" + esc(fmtPlaced(bet.placedAt)) + "</td><td class=\"bet-cell\">" +
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
      : '<tr><td colspan="7" class="value-empty">' + (S.view === "open" ? "No open bets." : S.view === "settled" ? "No settled bets yet." : "No bets yet.") + "</td></tr>";
  }

  // ---- Actions -------------------------------------------------------------

  function toggleOffer(key) {
    const i = S.slip.findIndex(l => PB.offerKey(l) === key);
    S.message = "";
    if (i >= 0) {
      S.slip.splice(i, 1);
    } else {
      const [gameId] = key.split("|");
      const game = S.games.get(gameId);
      const offer = game && game.offers.find(o => PB.offerKey({ gameId, kind: o.kind, side: o.side }) === key);
      if (!offer || game.state !== "pre") return;
      // One side of a market per slip: picking the other side replaces it.
      S.slip = S.slip.filter(l => !(l.gameId === gameId && l.kind === offer.kind));
      S.slip.push(PB.legFromOffer(game, offer));
    }
    if (S.slip.length < 2) S.mode = "straight";
    renderBoard();
    renderSlip();
  }

  async function place() {
    const check = slipCheck();
    if (!check.ok || S.saving) return;
    const started = S.slip.find(l => {
      const g = S.games.get(l.gameId);
      return (g && g.state !== "pre") || (l.start && Date.parse(l.start) <= Date.now());
    });
    if (started) {
      S.message = PB.gameLabel(started) + " has already started; take it off the slip.";
      renderSlip();
      return;
    }
    const placedAt = new Date().toISOString();
    const note = S.note.trim().slice(0, 200);
    const legs = clone(S.slip);
    const fresh = S.mode === "parlay" && legs.length > 1
      ? [{ id: newId(), placedAt, stake: S.stake, legs }]
      : legs.map(leg => ({ id: newId(), placedAt, stake: S.stake, legs: [leg] }));
    if (note) fresh.forEach(b => { b.note = note; });
    S.message = "";
    renderSlip();
    const ok = await mutate(bets => bets.concat(fresh));
    if (ok) {
      lsSet(LS.stake, String(S.stake));
      S.slip = [];
      S.note = "";
      S.mode = "straight";
      S.view = "open";
    }
    render();
  }

  async function setResult(id, result) {
    await mutate(bets => {
      const bet = bets.find(b => b.id === id);
      if (bet) { if (result) bet.result = result; else delete bet.result; }
      return bets;
    });
    render();
  }

  async function remove(id) {
    const bet = S.bets.find(b => b.id === id);
    if (!bet || !confirm("Delete this bet (" + bet.legs.map(PB.legLabel).join(", ") + ")? This can't be undone.")) return;
    await mutate(bets => bets.filter(b => b.id !== id));
    S.open.delete(id);
    render();
  }

  function bind() {
    const panel = $("myBets");
    const leagueSel = $("myBetsLeague");
    leagueSel.innerHTML = PB.LEAGUES.map(l => '<option value="' + esc(l.key) + '"' + (l.key === S.league ? " selected" : "") + ">" + esc(l.label) + "</option>").join("");
    leagueSel.addEventListener("change", () => {
      S.league = leagueSel.value;
      lsSet(LS.league, S.league);
      syncDay();
      loadBoard();
    });
    const dateInput = $("myBetsDate");
    const todayBtn = panel.querySelector("[data-bets-today]");
    // Football's default is the whole week: the day box stays empty until a day is picked.
    const syncDay = () => {
      dateInput.value = weekly() ? "" : day();
      todayBtn.textContent = PB.LEAGUE_BY_KEY.get(S.league).weekly ? "This week" : "Today";
    };
    syncDay();
    dateInput.addEventListener("change", () => {
      S.date = /^\d{4}-\d{2}-\d{2}$/.test(dateInput.value) ? dateInput.value : null;
      syncDay();
      loadBoard();
    });
    $("myBetsFilter").addEventListener("input", (e) => {
      S.filter = e.target.value;
      renderBoard();
    });

    panel.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t || !panel.contains(t)) return;
      if (t.hasAttribute("data-offer")) return toggleOffer(t.getAttribute("data-offer"));
      if (t.hasAttribute("data-slip-remove")) {
        S.slip.splice(Number(t.getAttribute("data-slip-remove")), 1);
        if (S.slip.length < 2) S.mode = "straight";
        S.message = "";
        renderBoard();
        return renderSlip();
      }
      if (t.hasAttribute("data-slip-mode")) {
        S.mode = t.getAttribute("data-slip-mode");
        return renderSlip();
      }
      if (t.id === "myBetsPlace") return place();
      if (t.id === "myBetsClear") {
        S.slip = [];
        S.mode = "straight";
        S.message = "";
        renderBoard();
        return renderSlip();
      }
      if (t.hasAttribute("data-bets-today")) {
        S.date = null;
        syncDay();
        return loadBoard();
      }
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

    // Typing into the slip updates the totals only, so the field keeps focus.
    panel.addEventListener("input", (e) => {
      const t = e.target;
      if (t.hasAttribute("data-slip-odds")) {
        const leg = S.slip[Number(t.getAttribute("data-slip-odds"))];
        if (leg) leg.odds = PB.parseAmerican(t.value.replace("−", "-"));
      } else if (t.hasAttribute("data-slip-line")) {
        const leg = S.slip[Number(t.getAttribute("data-slip-line"))];
        if (leg) leg.line = t.value === "" ? NaN : Number(t.value);
      } else if (t.id === "myBetsStake") {
        S.stake = Number(t.value);
      } else if (t.id === "myBetsNote") {
        S.note = t.value;
        return;
      } else return;
      S.message = "";
      const totals = $("myBetsSlipTotals");
      if (totals) totals.innerHTML = slipTotalsHtml();
    });

    const refreshBtn = $("refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", start);

    setInterval(() => {
      if (document.hidden || S.status !== "ready") return;
      refreshGrades().then(render);
      if (!S.date || S.date === PB.etDate()) loadBoard();
    }, REFRESH_MS);
  }

  async function start() {
    await loadStore();
    render();
    if (S.status !== "ready") return;
    loadBoard();
    await refreshGrades();
    render();
  }

  function init() {
    if (!$("myBets")) return;
    bind();
    start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
