/* RedZone — bet tracker
 *
 * Picks live in a private R2 object served by functions/redzone/api (NOT a file
 * in this public repo), added from slip screenshots. This file grades each leg
 * against live ESPN scores and shows the results in a "My bets" section plus a
 * small chip on the matching game tiles/rows. Nothing is stored in the browser.
 *
 * Grading (gradeLeg/gradeBet/summarize) is pure and shared with the Node tests
 * in tests/bets.test.js; the DOM half below only runs in a browser.
 *
 * The stored document: { "bets": [ Bet, ... ] }
 *   Bet = {
 *     id, placed?: "YYYY-MM-DD", book?, note?,
 *     stake: number, odds?: American odds for the whole bet, toWin?: number (overrides odds),
 *     result?: "won"|"lost"|"push"  // manual settle, overrides grading
 *     profit?: number               // settled profit override (e.g. reduced parlay payout)
 *     legs: [ Leg, ... ]            // one leg = straight bet, several = parlay
 *   }
 *   Leg = {
 *     gameId: ESPN event id (string), league?: "football/college-football" (default),
 *     kind: "spread" | "moneyline" | "total" | "prop",
 *     teamId: ESPN team id            // spread, moneyline: the team you took
 *     line: number                    // spread: the line for that team (-7.5 / +3); total: the number
 *     side: "over" | "under"          // total
 *     label?: text                    // prop description / display fallback
 *     result?: "won"|"lost"|"push"    // manual grade (props are never auto-graded)
 *   }
 */
(function (root) {
  "use strict";

  const SETTLED = new Set(["won", "lost", "push"]);
  const MANUAL = new Set(["won", "lost", "push"]);
  const TONE_LABEL = {
    won: "Won", lost: "Lost", push: "Push", winning: "Winning", losing: "Losing",
    pushing: "On the number", live: "Live", pending: "Not started", unknown: "Unknown",
  };
  const DEFAULT_LEAGUE = "football/college-football";

  // ---- Pure grading -------------------------------------------------------

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const fmtNum = (n) => String(+n.toFixed(2));
  const fmtLine = (n) => (n === 0 ? "PK" : (n > 0 ? "+" : "-") + fmtNum(Math.abs(n)));
  const fmtMoney = (n) => {
    if (n == null) return "—";
    const whole = Number.isInteger(n);
    return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  };
  const fmtPL = (n) => (n === 0 ? "$0" : (n > 0 ? "+" : "-") + fmtMoney(n));

  // Profit if the bet wins: an explicit toWin from the slip wins over the odds math.
  function toWin(bet) {
    if (num(bet.toWin) != null) return num(bet.toWin);
    const stake = num(bet.stake);
    const odds = num(bet.odds);
    if (stake == null || odds == null || odds === 0) return null;
    return Math.round((odds > 0 ? (stake * odds) / 100 : (stake * 100) / -odds) * 100) / 100;
  }

  function scoresFor(game, teamId) {
    const { away, home } = game;
    let us = null;
    let them = null;
    if (String(away.id) === String(teamId)) { us = away; them = home; }
    else if (String(home.id) === String(teamId)) { us = home; them = away; }
    if (!us) return null;
    const a = num(us.score);
    const b = num(them.score);
    return a == null || b == null ? null : { us: a, them: b };
  }

  // -> { tone, detail, clinched? }. tone is one of TONE_LABEL's keys.
  // won/lost/push are final; winning/losing/pushing are "as things stand now".
  function gradeLeg(leg, game) {
    if (MANUAL.has(leg.result)) return { tone: leg.result, detail: "Graded manually" };

    // Props (player stats etc.) can't be derived from a score, so they only
    // resolve when a result is entered by hand.
    if (leg.kind === "prop") {
      return game && game.state === "post"
        ? { tone: "unknown", detail: "Game is final — grade this prop by hand" }
        : { tone: game && game.state === "in" ? "live" : "pending", detail: "Props are graded by hand" };
    }
    if (!game) return { tone: "unknown", detail: "Game data unavailable" };
    if (game.state === "pre") return { tone: "pending", detail: game.statusText || "Not started" };

    const final = game.state === "post";

    if (leg.kind === "spread" || leg.kind === "moneyline") {
      const s = scoresFor(game, leg.teamId);
      if (!s) return { tone: "unknown", detail: "Team not found in this game" };
      const margin = s.us - s.them;
      if (leg.kind === "moneyline") {
        if (margin > 0) return final ? { tone: "won", detail: "Won outright" } : { tone: "winning", detail: "Leading by " + fmtNum(margin) };
        if (margin < 0) return final ? { tone: "lost", detail: "Lost outright" } : { tone: "losing", detail: "Trailing by " + fmtNum(-margin) };
        return final ? { tone: "push", detail: "Tied — push" } : { tone: "live", detail: "Tied" };
      }
      const line = num(leg.line);
      if (line == null) return { tone: "unknown", detail: "Spread leg is missing its line" };
      const cover = margin + line;
      if (cover > 0) return final ? { tone: "won", detail: "Covered by " + fmtNum(cover) } : { tone: "winning", detail: "Covering by " + fmtNum(cover) };
      if (cover < 0) return final ? { tone: "lost", detail: "Missed by " + fmtNum(-cover) } : { tone: "losing", detail: "Short by " + fmtNum(-cover) };
      return final ? { tone: "push", detail: "Landed on the number" } : { tone: "pushing", detail: "Right on the number" };
    }

    if (leg.kind === "total") {
      const line = num(leg.line);
      const a = num(game.away.score);
      const h = num(game.home.score);
      if (line == null || (leg.side !== "over" && leg.side !== "under")) {
        return { tone: "unknown", detail: "Total leg needs a line and over/under" };
      }
      if (a == null || h == null) return { tone: "unknown", detail: "Scores unavailable" };
      const total = a + h;
      const over = leg.side === "over";
      // Points only go up, so an over that has cleared the number (or an under
      // that has blown through it) is decided before the game ends.
      if (total > line) {
        const tone = over ? "won" : "lost";
        const detail = "Total " + fmtNum(total) + " is over " + fmtNum(line);
        return final ? { tone, detail } : { tone, detail, clinched: true };
      }
      if (final) {
        if (total === line) return { tone: "push", detail: "Total landed on " + fmtNum(line) };
        return over ? { tone: "lost", detail: "Total " + fmtNum(total) + " stayed under " + fmtNum(line) } : { tone: "won", detail: "Total " + fmtNum(total) + " stayed under " + fmtNum(line) };
      }
      return { tone: "live", detail: "Total " + fmtNum(total) + " · line " + fmtNum(line) };
    }

    return { tone: "unknown", detail: "Unsupported bet type" };
  }

  // getGame(leg) -> game|null. Returns the graded legs plus the bet-level
  // tone, money figures, and (once settled) profit.
  function gradeBet(bet, getGame) {
    const legsIn = Array.isArray(bet.legs) ? bet.legs : [];
    const legs = legsIn.map((leg) => {
      const game = getGame(leg);
      return Object.assign({ leg, game }, gradeLeg(leg, game));
    });
    const stake = num(bet.stake);
    const win = toWin(bet);
    const out = { bet, legs, stake, toWin: win, isParlay: legs.length > 1, profit: null };

    let tone;
    let detail;
    if (!legs.length) {
      tone = "unknown";
      detail = "Bet has no legs";
    } else if (MANUAL.has(bet.result)) {
      tone = bet.result;
      detail = "Settled manually";
    } else if (legs.some((l) => l.tone === "lost")) {
      // One dead leg kills a parlay no matter what the others do.
      tone = "lost";
      detail = legs.length > 1 ? "A leg lost" : legs[0].detail;
    } else if (legs.every((l) => SETTLED.has(l.tone))) {
      const wins = legs.filter((l) => l.tone === "won").length;
      if (!wins) {
        tone = "push";
        detail = "Every leg pushed";
      } else {
        tone = "won";
        detail = wins < legs.length ? "Won — a leg pushed, payout may be reduced" : legs.length > 1 ? "All legs won" : legs[0].detail;
      }
    } else if (legs.some((l) => l.tone === "unknown")) {
      tone = "unknown";
      detail = legs.find((l) => l.tone === "unknown").detail;
    } else if (legs.some((l) => l.tone === "losing")) {
      tone = "losing";
    } else if (legs.every((l) => l.tone === "won" || l.tone === "winning" || l.tone === "push")) {
      tone = "winning";
    } else if (legs.every((l) => l.tone === "pending")) {
      tone = "pending";
    } else {
      tone = "live";
    }

    if (detail == null) {
      if (legs.length === 1) detail = legs[0].detail;
      else {
        const good = legs.filter((l) => l.tone === "won" || l.tone === "winning").length;
        const waiting = legs.filter((l) => l.tone === "pending").length;
        detail = good + " of " + legs.length + " legs winning" + (waiting ? " · " + waiting + " not started" : "");
      }
    }

    out.tone = tone;
    out.detail = detail;
    out.settled = SETTLED.has(tone);
    if (tone === "won") out.profit = num(bet.profit) != null ? num(bet.profit) : win;
    else if (tone === "lost") out.profit = stake != null ? -stake : null;
    else if (tone === "push") out.profit = 0;
    return out;
  }

  function summarize(gradedBets) {
    const s = { open: 0, atRisk: 0, potential: 0, winning: 0, losing: 0, won: 0, lost: 0, push: 0, net: 0 };
    gradedBets.forEach((b) => {
      if (b.settled) {
        s[b.tone] += 1;
        s.net += b.profit || 0;
        return;
      }
      s.open += 1;
      s.atRisk += b.stake || 0;
      s.potential += b.toWin || 0;
      if (b.tone === "winning") s.winning += 1;
      if (b.tone === "losing") s.losing += 1;
    });
    s.net = Math.round(s.net * 100) / 100;
    return s;
  }

  const api = { gradeLeg, gradeBet, summarize, toWin, fmtLine, fmtMoney, fmtPL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined" || !root.RedZone) return;

  // ---- DOM ----------------------------------------------------------------
  const RZ = root.RedZone;
  const { el, teamMark, logoUrls } = RZ;

  const state = { bets: null, error: null };
  const extra = new Map(); // gameId -> { game, error } for games no longer on the board
  const inflight = new Set();
  let fetchingBets = false;
  let settledOpen = false;

  function getGame(leg) {
    const id = String(leg.gameId);
    const entry = extra.get(id);
    return RZ.game(id) || (entry && entry.game) || null;
  }

  // ESPN's scoreboard only covers the current week, so a leg on an older game
  // (or another league) is fetched from the per-game summary instead.
  function parseSummaryGame(id, sum) {
    const comp = ((sum.header || {}).competitions || [])[0];
    const cs = (comp && comp.competitors) || [];
    const away = cs.find((c) => c.homeAway === "away");
    const home = cs.find((c) => c.homeAway === "home");
    if (!away || !home) return null;
    const type = (comp.status || {}).type || {};
    const side = (c) => {
      const t = c.team || {};
      const def = (t.logos || []).find((l) => Array.isArray(l.rel) && l.rel.includes("default"));
      return Object.assign(
        { id: t.id, name: t.displayName || t.name || "", abbr: t.abbreviation || (t.displayName || "?").slice(0, 3).toUpperCase(), score: c.score, winner: !!c.winner, rank: null },
        logoUrls({ logo: def && def.href })
      );
    };
    return {
      id, state: type.state || "pre", away: side(away), home: side(home),
      statusText: type.shortDetail || type.description || "",
    };
  }

  async function fetchExtra(leg) {
    const id = String(leg.gameId);
    const cur = extra.get(id);
    if (inflight.has(id) || (cur && cur.game && cur.game.state === "post")) return;
    inflight.add(id);
    try {
      const league = /^[a-z]+\/[a-z0-9-]+$/.test(leg.league || "") ? leg.league : DEFAULT_LEAGUE;
      const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/" + league + "/summary?event=" + encodeURIComponent(id) + "&_=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      const game = parseSummaryGame(id, await res.json());
      if (!game) throw new Error("unrecognized summary for game " + id);
      extra.set(id, { game, error: null });
    } catch (err) {
      console.error("RedZone bets: couldn't load game " + id, err);
      extra.set(id, { game: cur ? cur.game : null, error: String(err.message || err) });
    } finally {
      inflight.delete(id);
    }
    paint();
  }

  // Legs whose game isn't on the board: fetch now, and keep refetching until final.
  function ensureGames() {
    (state.bets || []).forEach((bet) => {
      (Array.isArray(bet.legs) ? bet.legs : []).forEach((leg) => {
        if (leg.kind !== "prop" && leg.gameId != null && !RZ.game(leg.gameId)) fetchExtra(leg);
      });
    });
  }

  // The endpoint only answers the owner, on redzone.jaredluyster.com. Everyone else gets
  // 401/403 (a guest Access lets in, no Access session) or 404 (any other hostname, or a
  // dev server with no Function) — all of which just mean "no bets for you", not an error,
  // so the section stays hidden instead of hinting that something is there.
  const BETS_URL = "/redzone/api/bets";

  async function fetchBets() {
    if (fetchingBets) return;
    fetchingBets = true;
    try {
      const res = await fetch(BETS_URL + "?_=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        // Logged, not shown: this is also what a guest sees, and the owner can spot it here
        // (401 = Access token rejected, 403 = signed in but not on the allowlist).
        console.info("RedZone bets: no access to the bet store (HTTP " + res.status + ")");
        state.bets = [];
        state.error = null;
        return;
      }
      if (res.status === 503) throw new Error("the bet store isn't set up yet");
      if (!res.ok) throw new Error("HTTP " + res.status);
      // Pages answers an unknown path with its HTML catch-all and a 200, which is what a
      // missing Function looks like; say so instead of failing inside res.json().
      if (!/json/i.test(res.headers.get("Content-Type") || "")) throw new Error("the bet endpoint isn't deployed");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data && data.bets;
      if (!Array.isArray(list)) throw new Error("expected an array or { \"bets\": [...] }");
      state.bets = list;
      state.error = null;
    } catch (err) {
      console.error("RedZone bets: couldn't load bets", err);
      state.error = String(err.message || err);
    } finally {
      fetchingBets = false;
    }
  }

  function legLabel(g) {
    const { leg, game } = g;
    if (leg.kind === "total") return (leg.side === "under" ? "Under " : "Over ") + (num(leg.line) != null ? fmtNum(num(leg.line)) : "?");
    if (leg.kind === "spread" || leg.kind === "moneyline") {
      const team = game && (String(game.away.id) === String(leg.teamId) ? game.away : String(game.home.id) === String(leg.teamId) ? game.home : null);
      const name = team ? team.abbr : leg.label || "Team";
      return leg.kind === "moneyline" ? name + " ML" : name + " " + (num(leg.line) != null ? fmtLine(num(leg.line)) : "?");
    }
    return leg.label || "Prop";
  }

  function betTitle(b) {
    if (b.isParlay) return b.legs.length + "-leg parlay";
    return b.legs.length ? legLabel(b.legs[0]) : b.bet.id || "Bet";
  }

  function pill(tone, text) {
    return el("span", "bet-pill tone-" + tone, text || TONE_LABEL[tone] || tone);
  }

  function gameLine(g) {
    const line = el("div", "bet-leg-game");
    if (!g.game) {
      line.textContent = "Game " + g.leg.gameId;
      return line;
    }
    const side = (t) => {
      const s = el("span", "bet-side");
      s.appendChild(teamMark(t, "sm"));
      if (g.game.state !== "pre") s.appendChild(el("span", "bet-score", String(t.score == null ? "" : t.score)));
      return s;
    };
    line.appendChild(side(g.game.away));
    line.appendChild(el("span", "bet-at", "@"));
    line.appendChild(side(g.game.home));
    if (g.game.statusText) line.appendChild(el("span", "bet-status", g.game.statusText));
    return line;
  }

  function betCard(b) {
    const card = el("article", "bet-card tone-" + b.tone);

    const head = el("div", "bet-head");
    head.appendChild(el("div", "bet-title", betTitle(b)));
    head.appendChild(pill(b.tone));
    card.appendChild(head);

    const money = el("div", "bet-money");
    if (b.settled && b.profit != null) {
      money.appendChild(el("span", "bet-pl tone-" + b.tone, fmtPL(b.profit)));
      money.appendChild(el("span", "", "on " + fmtMoney(b.stake) + " risked"));
    } else {
      money.appendChild(el("span", "", "Risk " + fmtMoney(b.stake)));
      money.appendChild(el("span", "", "To win " + fmtMoney(b.toWin)));
    }
    card.appendChild(money);

    // A straight bet's one leg already says this; only parlays (and legless
    // bets, which have no leg to say anything) need the bet-level line.
    if (b.detail && (b.isParlay || !b.legs.length)) card.appendChild(el("div", "bet-detail", b.detail));

    const legs = el("div", "bet-legs");
    b.legs.forEach((g) => {
      const row = el("div", "bet-leg");
      if (b.isParlay) {
        const main = el("div", "bet-leg-main");
        main.appendChild(el("span", "bet-leg-label", legLabel(g)));
        main.appendChild(pill(g.tone));
        row.appendChild(main);
      }
      if (g.leg.kind !== "prop" || g.game) row.appendChild(gameLine(g));
      const inflightNow = !g.game && g.leg.kind !== "prop" && inflight.has(String(g.leg.gameId));
      // A not-started leg's detail is its kickoff time, which the game line above already shows.
      const redundant = g.tone === "pending" && g.game && g.detail === g.game.statusText;
      if (!redundant) row.appendChild(el("div", "bet-leg-detail", (inflightNow ? "Loading game…" : g.detail) + (g.clinched ? " (clinched)" : "")));
      legs.appendChild(row);
    });
    card.appendChild(legs);

    const foot = [b.bet.placed, b.bet.book, b.bet.note].filter(Boolean);
    if (foot.length) card.appendChild(el("div", "bet-foot", foot.join(" · ")));
    return card;
  }

  function summaryStrip(s) {
    const strip = el("div", "bet-summary");
    const item = (label, value, cls) => {
      const d = el("div", "bet-stat");
      d.appendChild(el("div", "bet-stat-label", label));
      d.appendChild(el("div", "bet-stat-value" + (cls ? " " + cls : ""), value));
      strip.appendChild(d);
    };
    item("Open", String(s.open));
    item("At risk", fmtMoney(s.atRisk));
    item("To win", fmtMoney(s.potential));
    if (s.open) item("Right now", s.winning + " winning · " + s.losing + " losing");
    const settled = s.won + s.lost + s.push;
    if (settled) {
      item("Record", s.won + "-" + s.lost + (s.push ? "-" + s.push : ""));
      item("Net", fmtPL(s.net), s.net > 0 ? "tone-won" : s.net < 0 ? "tone-lost" : "");
    }
    return strip;
  }

  const order = { losing: 0, winning: 0, live: 0, pushing: 0, pending: 1, unknown: 1 };

  function renderSection(graded) {
    const section = document.getElementById("betsSection");
    const body = document.getElementById("betsBody");
    if (!section || !body) return;
    body.textContent = "";
    if (state.error) {
      body.appendChild(el("p", "bets-error", "Couldn't load bets: " + state.error));
    }
    if (!graded.length) {
      section.hidden = !state.error;
      return;
    }
    section.hidden = false;

    body.appendChild(summaryStrip(summarize(graded)));

    const open = graded.filter((b) => !b.settled).sort((a, b) => (order[a.tone] ?? 1) - (order[b.tone] ?? 1));
    const settled = graded.filter((b) => b.settled).reverse(); // newest entries first

    if (open.length) {
      const grid = el("div", "bet-grid");
      open.forEach((b) => grid.appendChild(betCard(b)));
      body.appendChild(grid);
    }
    if (settled.length) {
      const det = el("details", "bet-settled");
      det.open = settledOpen || !open.length;
      det.appendChild(el("summary", "", "Settled (" + settled.length + ")"));
      const grid = el("div", "bet-grid");
      settled.forEach((b) => grid.appendChild(betCard(b)));
      det.appendChild(grid);
      det.addEventListener("toggle", () => { settledOpen = det.open; });
      body.appendChild(det);
    }
  }

  // One chip per game tile/row that has a bet on it, so a bet is visible in
  // the whiparound view without opening the bets section.
  function decorate(graded) {
    document.querySelectorAll(".bet-chip").forEach((n) => n.remove());
    const byGame = new Map();
    graded.forEach((b) => {
      b.legs.forEach((l) => {
        const id = String(l.leg.gameId);
        if (!byGame.has(id)) byGame.set(id, { bets: new Set(), tones: [] });
        const e = byGame.get(id);
        e.bets.add(b);
        e.tones.push(l.tone);
      });
    });
    byGame.forEach((e, id) => {
      const host = document.querySelector('[data-game-id="' + CSS.escape(id) + '"]');
      if (!host) return;
      const tones = new Set(e.tones);
      const all = (set) => e.tones.every((t) => set.has(t));
      let tone = "mixed";
      if (all(new Set(["won", "winning"]))) tone = tones.has("won") && !tones.has("winning") ? "won" : "winning";
      else if (all(new Set(["lost", "losing"]))) tone = tones.has("lost") && !tones.has("losing") ? "lost" : "losing";
      else if (tones.size === 1) tone = [...tones][0];
      const n = e.bets.size;
      const word = tone === "mixed" ? "Mixed" : TONE_LABEL[tone] || tone;
      const chip = el("span", "bet-chip tone-" + tone, (n > 1 ? n + " bets" : "Bet") + " · " + word);
      chip.title = [...e.bets].map((b) => betTitle(b) + " — " + b.detail).join("\n");
      const foot = host.querySelector(":scope > .tile-foot");
      if (foot) foot.insertBefore(chip, foot.children[1] || null);
      else host.insertBefore(chip, host.querySelector(":scope > .row-time"));
    });
  }

  function paint() {
    if (!state.bets) return;
    const graded = state.bets.map((bet) => gradeBet(bet, getGame));
    renderSection(graded);
    decorate(graded);
  }

  function refresh() {
    paint();
    ensureGames();
    fetchBets().then(() => {
      paint();
      ensureGames();
    });
  }

  RZ.onBoard(refresh);
})(typeof window !== "undefined" ? window : globalThis);
