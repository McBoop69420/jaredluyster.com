/* System Bets: paper bets a rule places by itself, to test an edge going forward
 * with real prices instead of a backtest's win rate.
 *
 * The one rule so far, "cfb-strong-totals": college football full-game totals
 * where the published experts lean hard one way (Expert Picks' strong lean: 5+
 * experts on the total, 75%+ on one side). It came out of the Expert Leaderboard,
 * where that lean went 24-13 (64.9%) from 2026-08-27 to 2026-10-18 on win rate
 * alone. Each qualifying game is bet 1 unit on the experts' side, at Action
 * Network's Consensus line and price as of the 6:00 AM ET run on game day, and
 * graded from the final score. The closing line is kept too, so the record says
 * whether the bets beat the market's final number (closing-line value), the
 * better test of an edge over a small sample.
 *
 * scripts/system-bets.mjs logs and grades the bets (run daily by
 * scripts/picks-ledger.sh) into sports/system-bets/<rule>.json, a public file:
 * these are a system's paper bets, not anyone's private ledger. On the Betting
 * page this file also draws the "System Bets" panel (#systemBets). The maths is
 * DOM-free so tests/system-bets.test.mjs can run it in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.SystemBets = api;
    if (typeof document !== "undefined") api.mountPanel(document);
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RULE = {
    id: "cfb-strong-totals",
    league: "ncaaf",
    market: "total",
    stake: 1,
    minPicks: 5,
    minShare: 0.75,
    label: "College football totals, strong expert lean",
  };
  const FILE = "/system-bets/" + RULE.id + ".json";

  const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  function etDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : ET_DATE.format(d);
  }
  function round2(x) { return Math.round(x * 100) / 100; }

  // Units won on a 1-unit stake at American odds.
  function toWin(odds) {
    return odds > 0 ? odds / 100 : 100 / -odds;
  }

  // ---- Logging ---------------------------------------------------------------
  // Today's qualifying bets from /api/picks-shaped games (buildPicks). EP is
  // sports/expert-picks.js, whose strong-lean test the Betting page already shows.
  // Only games that haven't started and have a posted price on the lean's side.
  function candidates(games, EP, nowMs) {
    const leans = EP.strongLeans((games || []).map(EP.summarizeGame), { minPicks: RULE.minPicks, minShare: RULE.minShare });
    const out = [];
    for (const { game, consensus } of leans) {
      if (consensus.market !== RULE.market) continue;
      const start = game.start ? Date.parse(game.start) : NaN;
      if (!(start > nowMs)) continue;
      const side = consensus.leader.side;
      const t = game.total;
      const odds = t ? t[side] : null;
      if (!t || t.line == null || odds == null) continue;
      out.push({
        id: RULE.id + ":" + game.id,
        gameId: game.id,
        date: etDate(game.start),
        start: game.start,
        away: game.away.abbr,
        home: game.home.abbr,
        side,
        line: t.line,
        odds,
        stake: RULE.stake,
        experts: { on: consensus.leader.count, of: consensus.count },
        loggedAt: new Date(nowMs).toISOString(),
      });
    }
    return out;
  }

  // A bet, once logged, never changes its line or price: the first logging wins.
  function addBets(bets, fresh) {
    const have = new Set(bets.map(b => b.id));
    const added = fresh.filter(b => !have.has(b.id));
    return { bets: bets.concat(added), added: added.length };
  }

  // ---- Grading ---------------------------------------------------------------
  function gradeTotal(side, line, final) {
    const sum = final.away + final.home;
    if (sum === line) return "push";
    return (sum > line) === (side === "over") ? "won" : "lost";
  }

  function profitOf(bet) {
    if (bet.result === "won") return round2(bet.stake * toWin(bet.odds));
    if (bet.result === "lost") return -bet.stake;
    return 0;
  }

  // Grades open bets whose games are over. games: id -> buildPicks game (with
  // status, final, total). Canceled or postponed games are no action. Graded
  // bets keep the score and the closing line; nothing graded is touched again.
  function gradeBets(bets, games) {
    let graded = 0;
    const out = bets.map(bet => {
      if (bet.result) return bet;
      const g = games.get(bet.gameId);
      if (!g) return bet;
      const status = String(g.status || "").toLowerCase();
      if (/cancel|postpon/.test(status)) {
        graded++;
        return { ...bet, result: "void", profit: 0 };
      }
      if (!g.final) return bet;
      graded++;
      const result = gradeTotal(bet.side, bet.line, g.final);
      const done = { ...bet, result, final: g.final };
      if (g.total && g.total.line != null) done.close = g.total.line;
      done.profit = profitOf(done);
      return done;
    });
    return { bets: out, graded };
  }

  // Points of closing-line value: positive when the bet's line was better than
  // the close (an over at 52.5 that closed at 54.5 is +2).
  function clv(bet) {
    if (bet.close == null) return null;
    return bet.side === "over" ? bet.close - bet.line : bet.line - bet.close;
  }

  function summarize(bets) {
    const s = { won: 0, lost: 0, push: 0, void: 0, open: 0, profit: 0, risked: 0, clvSum: 0, clvN: 0, beatClose: 0 };
    for (const b of bets) {
      if (!b.result) { s.open++; continue; }
      s[b.result]++;
      s.profit = round2(s.profit + (b.profit || 0));
      if (b.result === "won" || b.result === "lost") s.risked += b.stake;
      const c = clv(b);
      if (c != null && b.result !== "void") { s.clvSum += c; s.clvN++; if (c > 0) s.beatClose++; }
    }
    const decided = s.won + s.lost;
    return {
      won: s.won, lost: s.lost, push: s.push, void: s.void, open: s.open,
      profit: s.profit, risked: s.risked,
      winRate: decided ? s.won / decided : null,
      roi: s.risked ? s.profit / s.risked : null,
      avgClv: s.clvN ? round2(s.clvSum / s.clvN) : null,
      beatClose: s.beatClose, clvN: s.clvN,
    };
  }

  // ---- Panel (Betting page) ----------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtOdds(o) { return o > 0 ? "+" + o : String(o).replace("-", "−"); }
  function fmtUnits(u, signed) {
    const v = Math.abs(u).toFixed(2) + "u";
    return signed ? (u > 0 ? "+" : u < 0 ? "−" : "") + v : v;
  }
  function pct(x) { return x == null ? "—" : (x * 100).toFixed(1) + "%"; }
  function signedPct(x) { return x == null ? "—" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%"; }
  function plClass(n) { return n > 0 ? "picks-win" : n < 0 ? "picks-loss" : ""; }
  function fmtDay(date) {
    return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  }

  function panelHtml(doc) {
    const bets = (doc && doc.bets) || [];
    const t = summarize(bets);
    const tile = (label, value, sub, cls) =>
      '<div class="bets-tile"><div class="bets-tile-label">' + label + '</div><div class="bets-tile-value' +
      (cls ? " " + cls : "") + '">' + value + '</div><div class="value-note">' + sub + "</div></div>";
    let html = '<div class="bets-tiles">' +
      tile("Record", t.won + "–" + t.lost + "–" + t.push, "W–L–P · win rate " + pct(t.winRate)) +
      tile("Units", esc(fmtUnits(t.profit, true)), esc(fmtUnits(t.risked) + " risked, 1u a bet"), plClass(t.profit)) +
      tile("ROI", esc(signedPct(t.roi)), "profit ÷ units risked", plClass(t.roi)) +
      tile("vs closing line", t.avgClv == null ? "—" : (t.avgClv > 0 ? "+" : "") + t.avgClv + " pts",
        t.clvN ? t.beatClose + " of " + t.clvN + " beat the close" : "once games close", plClass(t.avgClv || 0)) +
      "</div>";
    if (!bets.length) {
      return html + '<p class="value-empty">No bets yet. The first ones are logged at 6:00 AM ET on the next day with college games.</p>';
    }
    const rows = bets.slice().sort((a, b) => (b.start || "").localeCompare(a.start || "")).map(b => {
      const pick = (b.side === "over" ? "Over " : "Under ") + b.line + " " + '<span class="value-note">' + esc(fmtOdds(b.odds)) + "</span>";
      let result;
      if (!b.result) result = '<span class="value-note">open</span>';
      else if (b.result === "void") result = '<span class="value-note">no action</span>';
      else {
        const sum = b.final ? b.final.away + b.final.home : null;
        result = '<span class="' + plClass(b.profit) + '">' + esc(b.result === "push" ? "Push" : b.result === "won" ? "Won" : "Lost") +
          " " + esc(fmtUnits(b.profit, true)) + "</span>" + (sum != null ? ' <span class="value-note">(' + sum + ")</span>" : "");
      }
      const c = clv(b);
      return "<tr><td>" + esc(fmtDay(b.date)) + "</td><td><strong>" + esc(b.away) + " @ " + esc(b.home) + "</strong></td><td>" +
        pick + "</td><td>" + b.experts.on + "/" + b.experts.of + "</td><td>" +
        (b.close == null ? "—" : esc(b.close) + ' <span class="value-note">(' + (c > 0 ? "+" : "") + c + ")</span>") +
        "</td><td>" + result + "</td></tr>";
    }).join("");
    return html + '<div class="value-slate-wrap"><table class="value-slate"><thead><tr><th>Date</th><th>Game</th>' +
      "<th>Bet (6 AM line)</th><th>Experts</th><th>Close</th><th>Result</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  // The page's league filter (sports.js keeps it in localStorage): the panel is
  // college football only, so it shows under All and NCAAF.
  function visible() {
    let f = "all";
    try { f = localStorage.getItem("sportsActiveFilter") || "all"; } catch (e) { /* private mode */ }
    return f === "all" || f === "football/college-football";
  }

  function mountPanel(document) {
    const start = async () => {
      const panel = document.getElementById("systemBets");
      if (!panel) return;
      const body = document.getElementById("systemBetsBody");
      const meta = document.getElementById("systemBetsMeta");
      const show = () => { panel.hidden = !visible(); };
      show();
      const filters = document.getElementById("filters");
      if (filters) filters.addEventListener("click", () => setTimeout(show, 0));
      let doc = null;
      try {
        const res = await fetch(FILE, { cache: "no-cache" });
        if (res.ok && /json/.test(res.headers.get("Content-Type") || "")) doc = await res.json();
      } catch (e) { /* offline: say so below */ }
      if (!doc) {
        body.innerHTML = '<p class="value-empty">Couldn\'t load the system bets.</p>';
        meta.textContent = "Unavailable";
        return;
      }
      const t = summarize(doc.bets || []);
      meta.textContent = t.won + "–" + t.lost + "–" + t.push + " · " + fmtUnits(t.profit, true) + (t.open ? " · " + t.open + " open" : "");
      body.innerHTML = panelHtml(doc);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  return { RULE, FILE, toWin, etDate, candidates, addBets, gradeTotal, gradeBets, clv, summarize, panelHtml, mountPanel };
});
