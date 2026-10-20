/* Expert Picks history: the graded-pick ledger and the leaderboard built from it.
 *
 * scripts/picks-ledger.mjs runs daily on Jared-Server: it asks /api/picks' builder
 * (sports/_worker.js buildPicks) for the last few days, keeps every graded pick, and
 * writes one file per day under sports/picks-history/days/ plus a summed-up
 * sports/picks-history/leaderboard.json, then commits and pushes them (which
 * redeploys the site). The Betting page reads leaderboard.json and ranks it here.
 *
 *   day file:    { date, leagues: { nfl: [game], ... } }
 *   game:        { id, start, away, home, picks: [pick], consensus: { spread|ml|total:
 *                  { side, line, n, count, result } } }
 *   pick:        { src, expert, market, side, line, result }   (graded only)
 *   leaderboard: { from, to, days, windows: { all|last30: { experts: [row],
 *                  consensus: [row] } } }
 *
 * Consensus is worked out from the graded picks the ledger holds, with the same
 * maths as the live panel (sports/expert-picks.js): the side most experts took, at
 * the line most of them took, graded by how most of those picks graded. A tied
 * market has no consensus and isn't counted.
 *
 * Records and hit rates only: win/loss/push, with the win rate leaving pushes out.
 * No odds, units or ROI are kept (taken out of Expert Picks on 2026-10-16).
 *
 * DOM-free so tests/picks-ledger.test.mjs can run it in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./expert-picks.js"));
  else root.PicksLedger = factory(root.ExpertPicks);
})(typeof self !== "undefined" ? self : this, function (EP) {
  "use strict";

  const LEAGUES = ["nfl", "ncaaf", "mlb", "ncaab", "nba"];
  const MARKETS = ["spread", "ml", "total"];
  const RESULTS = { win: true, loss: true, push: true };
  const WINDOW_DAYS = 30;

  function cleanName(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  // The fields the ledger keeps for a pick (older files and /api/picks carry more).
  function cleanPick(p) {
    return { src: p.src, expert: cleanName(p.expert), market: p.market, side: p.side,
      line: p.line == null ? null : p.line, result: p.result };
  }

  function pickKey(p) {
    return p.src + "|" + p.expert + "|" + p.market + "|" + p.side;
  }

  // One market's consensus among a game's graded picks, or null (nobody on it,
  // a tie, or the leading side not graded).
  function consensusOf(game, market) {
    const c = EP.marketConsensus({ away: { abbr: game.away }, home: { abbr: game.home }, picks: game.picks }, market);
    if (!c || !c.leader || !c.leader.result) return null;
    return { side: c.leader.side, line: c.leader.line, n: c.leader.count, count: c.count, result: c.leader.result };
  }

  function withConsensus(game) {
    const consensus = {};
    for (const m of MARKETS) {
      const c = consensusOf(game, m);
      if (c) consensus[m] = c;
    }
    game.consensus = consensus;
    return game;
  }

  // A /api/picks response -> ledger games: graded picks only, games with none
  // dropped.
  function ledgerGames(data) {
    const out = [];
    for (const g of (data && data.games) || []) {
      const picks = (g.picks || []).filter(p => RESULTS[p.result] && MARKETS.includes(p.market)).map(cleanPick);
      if (!picks.length) continue;
      out.push(withConsensus({
        id: g.id, start: g.start || null,
        away: (g.away && g.away.abbr) || "", home: (g.home && g.home.abbr) || "", picks,
      }));
    }
    return out;
  }

  function byStart(a, b) {
    const ta = a.start ? Date.parse(a.start) : Infinity, tb = b.start ? Date.parse(b.start) : Infinity;
    return ta - tb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  // Folds a fresh day's games into what the ledger already had for that day and
  // league. Nothing is ever dropped: CBS only shows the current week, so once it
  // rolls over a re-run comes back without the CBS picks it recorded earlier. A
  // pick seen again takes its newer grading.
  function mergeGames(oldGames, freshGames) {
    const games = new Map();
    for (const g of oldGames || []) games.set(g.id, { ...g, picks: g.picks.map(cleanPick) });
    for (const g of freshGames || []) {
      const prev = games.get(g.id);
      if (!prev) { games.set(g.id, { ...g, picks: g.picks.slice() }); continue; }
      const picks = new Map(prev.picks.map(p => [pickKey(p), p]));
      for (const p of g.picks) picks.set(pickKey(p), p);
      games.set(g.id, { ...prev, start: g.start || prev.start, away: g.away || prev.away, home: g.home || prev.home,
        picks: [...picks.values()] });
    }
    return [...games.values()].map(withConsensus).sort(byStart);
  }

  function addResult(row, result) {
    if (result === "win") row.w++;
    else if (result === "loss") row.l++;
    else if (result === "push") row.p++;
  }

  function shiftDate(date, days) {
    const d = new Date(Date.parse(date + "T12:00:00Z") + days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // Sums day files into per expert x league x market and per league x market x
  // tier rows, for the whole ledger ("all") and its last 30 days ("last30").
  // Rows are sorted so the same ledger always writes the same file.
  function buildLeaderboard(days) {
    const sorted = (days || []).filter(d => d && d.date).sort((a, b) => (a.date < b.date ? -1 : 1));
    const to = sorted.length ? sorted[sorted.length - 1].date : null;
    const from = sorted.length ? sorted[0].date : null;
    const cutoff = to ? shiftDate(to, -(WINDOW_DAYS - 1)) : null;
    const windows = {};
    for (const name of ["all", "last30"]) {
      const experts = new Map(), consensus = new Map();
      for (const day of sorted) {
        if (name === "last30" && day.date < cutoff) continue;
        for (const league of Object.keys(day.leagues || {})) {
          for (const g of day.leagues[league]) {
            for (const p of g.picks) {
              const k = p.src + "|" + p.expert + "|" + league + "|" + p.market;
              let row = experts.get(k);
              if (!row) {
                row = { src: p.src, expert: p.expert, league, market: p.market, w: 0, l: 0, p: 0 };
                experts.set(k, row);
              }
              addResult(row, p.result);
            }
            for (const m of MARKETS) {
              const c = g.consensus && g.consensus[m];
              if (!c) continue;
              const tiers = ["all"];
              if (c.count >= EP.STRONG_MIN_PICKS && c.n / c.count >= EP.STRONG_MIN_SHARE) tiers.push("strong");
              for (const tier of tiers) {
                const k = league + "|" + m + "|" + tier;
                let row = consensus.get(k);
                if (!row) { row = { league, market: m, tier, w: 0, l: 0, p: 0 }; consensus.set(k, row); }
                addResult(row, c.result);
              }
            }
          }
        }
      }
      const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      windows[name] = {
        experts: [...experts.values()]
          .sort((a, b) => cmp(a.src, b.src) || cmp(a.expert, b.expert) || cmp(a.league, b.league) || cmp(a.market, b.market)),
        consensus: [...consensus.values()]
          .sort((a, b) => cmp(a.league, b.league) || MARKETS.indexOf(a.market) - MARKETS.indexOf(b.market) || cmp(a.tier, b.tier)),
      };
    }
    return { from, to, days: sorted.length, windowDays: WINDOW_DAYS, windows };
  }

  function rate(r) {
    const decided = r.w + r.l;
    return decided ? r.w / decided : null;
  }

  function matches(row, opts) {
    const leagues = opts && opts.leagues;
    const market = (opts && opts.market) || "all";
    return (!leagues || leagues.includes(row.league)) && (market === "all" || row.market === market);
  }

  // Leaderboard rows summed over the chosen leagues (null = all) and market
  // ("all" or one of MARKETS), keeping experts with at least `minPicks` graded
  // picks, best win rate (pushes left out) first, then most decided picks.
  // Returns { rows, hidden }, where
  // hidden counts the experts below the threshold.
  function rankExperts(board, opts) {
    const minPicks = (opts && opts.minPicks) || 1;
    const sums = new Map();
    for (const r of board || []) {
      if (!matches(r, opts)) continue;
      const k = r.src + "|" + r.expert;
      let s = sums.get(k);
      if (!s) { s = { src: r.src, expert: r.expert, w: 0, l: 0, p: 0 }; sums.set(k, s); }
      s.w += r.w; s.l += r.l; s.p += r.p;
    }
    const rows = [];
    let hidden = 0;
    for (const s of sums.values()) {
      const graded = s.w + s.l + s.p;
      if (graded < minPicks) { hidden++; continue; }
      rows.push({ ...s, graded, pct: rate(s) });
    }
    rows.sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct) ||
      (b.w + b.l) - (a.w + a.l) || (a.expert < b.expert ? -1 : 1));
    return { rows, hidden };
  }

  // How the consensus side did over the chosen leagues: { spread, ml, total, all },
  // each { all: rec, strong: rec } with rec = { w, l, p, graded, pct }.
  function consensusRecord(board, opts) {
    const blank = () => ({ w: 0, l: 0, p: 0 });
    const out = {};
    for (const m of MARKETS.concat("all")) out[m] = { all: blank(), strong: blank() };
    for (const r of board || []) {
      if (!matches(r, { leagues: opts && opts.leagues })) continue;
      for (const m of [r.market, "all"]) {
        const rec = out[m][r.tier];
        rec.w += r.w; rec.l += r.l; rec.p += r.p;
      }
    }
    for (const m of Object.keys(out)) {
      for (const tier of ["all", "strong"]) {
        const rec = out[m][tier];
        rec.graded = rec.w + rec.l + rec.p;
        rec.pct = rate(rec);
      }
    }
    return out;
  }

  return {
    LEAGUES, MARKETS, WINDOW_DAYS,
    ledgerGames, mergeGames, buildLeaderboard, rankExperts, consensusRecord,
  };
});
