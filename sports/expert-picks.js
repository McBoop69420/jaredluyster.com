/* Expert picks consensus for the Betting page.
 *
 * /api/picks (sports/_worker.js) returns each game's picks from Action Network's
 * expert feed and CBS Sports' staff picks, one entry per expert per market and
 * side: { src, expert, market: "spread" | "ml" | "total", side: "away" | "home" |
 * "over" | "under", line, odds, result, rec, recLabel }. This file turns those into
 * a per-market consensus (who the experts are on, how lopsided, the line most of
 * them took, and how the majority side did once graded) and the slate's strongest
 * leans.
 *
 * DOM-free so tests/expert-picks.test.mjs can run it in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ExpertPicks = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MARKETS = ["spread", "ml", "total"];
  const MARKET_SIDES = { spread: ["away", "home"], ml: ["away", "home"], total: ["over", "under"] };
  const MARKET_LABEL = { spread: "Spread", ml: "Winner", total: "Total" };
  // A lean worth calling out: at least this many experts on the market and at
  // least this share of them on one side.
  const STRONG_MIN_PICKS = 5;
  const STRONG_MIN_SHARE = 0.75;

  // "+2.5" / "−3" (true minus, as the NFL Odds panel prints it) / "PK".
  function formatLine(line) {
    if (line == null || !Number.isFinite(line)) return "";
    if (line === 0) return "PK";
    return (line > 0 ? "+" : "−") + Math.abs(line);
  }

  // The value most of `values` share (nulls ignored); ties go to the first seen.
  function mode(values) {
    const counts = new Map();
    let best = null, bestN = 0;
    for (const v of values) {
      if (v == null) continue;
      const n = (counts.get(v) || 0) + 1;
      counts.set(v, n);
      if (n > bestN) { best = v; bestN = n; }
    }
    return best;
  }

  // How the picks on one side graded: "win" / "loss" / "push" by majority of the
  // graded ones, null while ungraded. Different experts can take different
  // lines, so the same side can split (e.g. -2.5 wins while -3 pushes).
  function sideResult(picks) {
    return mode(picks.map(p => p.result || null));
  }

  function sideLabel(market, side, game, line) {
    if (market === "total") return (side === "over" ? "Over" : "Under") + (line != null ? " " + line : "");
    const abbr = game[side] ? game[side].abbr : side;
    if (market === "spread" && line != null) return abbr + " " + formatLine(line);
    return abbr;
  }

  // One market's consensus: { market, label, count, sides: [{ side, label, line,
  // picks, count, result }] (most picked first), leader (null on a tie), share }.
  // null when nobody picked this market.
  function marketConsensus(game, market) {
    const picks = (game.picks || []).filter(p => p.market === market);
    if (!picks.length) return null;
    const sides = MARKET_SIDES[market].map(side => {
      const on = picks.filter(p => p.side === side);
      const line = mode(on.map(p => p.line));
      return { side, line, label: sideLabel(market, side, game, line), picks: on, count: on.length, result: sideResult(on) };
    }).sort((a, b) => b.count - a.count);
    const leader = sides[0].count > sides[1].count ? sides[0] : null;
    return {
      market, label: MARKET_LABEL[market], count: picks.length, sides, leader,
      share: leader ? leader.count / picks.length : 0.5,
    };
  }

  function summarizeGame(game) {
    const markets = {};
    for (const m of MARKETS) markets[m] = marketConsensus(game, m);
    const experts = new Set((game.picks || []).map(p => p.src + "|" + p.expert));
    return { game, markets, experts: experts.size, picks: (game.picks || []).length };
  }

  // Spread and total markets across the slate where the experts lean hard one
  // way, most lopsided first (then most picks): [{ game, consensus }]. Winner
  // picks are left out: a unanimous straight-up pick is usually just the
  // favorite, which says nothing the moneyline doesn't.
  const LEAN_MARKETS = ["spread", "total"];
  function strongLeans(summaries, opts) {
    const minPicks = (opts && opts.minPicks) || STRONG_MIN_PICKS;
    const minShare = (opts && opts.minShare) || STRONG_MIN_SHARE;
    const out = [];
    for (const s of summaries) {
      for (const m of LEAN_MARKETS) {
        const c = s.markets[m];
        if (c && c.leader && c.count >= minPicks && c.share >= minShare) out.push({ game: s.game, consensus: c });
      }
    }
    return out.sort((a, b) => b.consensus.share - a.consensus.share || b.consensus.count - a.consensus.count);
  }

  return {
    MARKETS, MARKET_LABEL, STRONG_MIN_PICKS, STRONG_MIN_SHARE,
    formatLine, mode, marketConsensus, summarizeGame, strongLeans,
  };
});
