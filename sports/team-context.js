/* Team context for the Betting page: schedule fatigue, road trips, upcoming off
 * days and travel, lineup workload, and the wave-1 fatigue/rest flag.
 *
 * A browser port of BettingEdge's live MLB slate (github.com/McBoop69420/BettingEdge):
 *   - src/preview/compute-slate-metrics.mjs   next off day, next travel, away road days,
 *                                             travel-day flag, lineup summary stats
 *   - sql/010_build_team_game_context_v1.sql  off days, games in prev 3d/7d, road streak
 *   - sql/020_build_team_daily_fatigue_profile.sql   fatigue score and tier
 *   - src/db/wave1-fatigue-rule.mjs           the wave-1 recommendation rule
 * BettingEdge builds these from DuckDB tables; here the same numbers come straight
 * from statsapi.mlb.com schedule rows, so nothing needs a database or a backend.
 * Keep the weights and thresholds in step with those files.
 *
 * DOM-free so tests/team-context.test.mjs can run it in Node. Dates are "YYYY-MM-DD"
 * strings and all date maths is in UTC, so the machine's timezone never shifts a day.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TeamContext = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 86400000;
  // Regular season and the four postseason rounds. Spring training, exhibitions
  // and the All-Star Game never count toward a team's workload.
  const COUNTED_GAME_TYPES = ["R", "F", "D", "L", "W"];
  const HISTORY_DAYS = 30;      // fetchLiveRecentGames horizon
  const FUTURE_DAYS = 21;       // fetchLiveNextOffDays horizon
  const LINEUP_WINDOW_DAYS = 10;

  const WAVE1_RULE_VERSION = "v1_fatigue_rest_rule";
  const WAVE1_MIN_REST_ADVANTAGE_DAYS = 2;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toMs(s) { const p = s.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function fromMs(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function addDays(date, n) { return fromMs(toMs(date) + n * DAY_MS); }
  function daysBetween(start, end) { return Math.round((toMs(end) - toMs(start)) / DAY_MS); }
  function r1(x) { return Math.round(x * 10) / 10; }

  // ---- Schedule rows -------------------------------------------------------
  // Flattens a statsapi /schedule payload into one row per game, oldest first.
  // Postponed and cancelled games stay in the list (today's slate still shows
  // them) but are marked so they never count as a game played or scheduled.
  function scheduleGames(payload) {
    const games = [];
    for (const day of (payload && payload.dates) || []) {
      for (const g of day.games || []) {
        if (COUNTED_GAME_TYPES.indexOf(g.gameType) < 0) continue;
        const status = g.status || {};
        const away = (g.teams && g.teams.away && g.teams.away.team) || {};
        const home = (g.teams && g.teams.home && g.teams.home.team) || {};
        const venue = g.venue || {};
        games.push({
          gamePk: g.gamePk,
          date: g.officialDate || day.date,
          start: g.gameDate || "",
          gameNumber: g.gameNumber || 1,
          gameType: g.gameType,
          awayId: away.id, homeId: home.id,
          awayName: away.name || "", homeName: home.name || "",
          awayAbbr: away.abbreviation || "", homeAbbr: home.abbreviation || "",
          venueKey: venue.id != null ? "id:" + venue.id : String(venue.name || "").trim().toLowerCase(),
          venueName: venue.name || "",
          // Present only when the payload was fetched with hydrate=lineups.
          awayLineup: (g.lineups && g.lineups.awayPlayers) || null,
          homeLineup: (g.lineups && g.lineups.homePlayers) || null,
          status: status.detailedState || "",
          off: /postpon|cancel/i.test(status.detailedState || "") ||
            status.codedGameState === "D" || status.codedGameState === "C",
        });
      }
    }
    games.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 :
      a.start < b.start ? -1 : a.start > b.start ? 1 :
      a.gameNumber - b.gameNumber);
    return games;
  }

  function plays(g, teamId) { return g.awayId === teamId || g.homeId === teamId; }
  function teamGames(games, teamId) { return games.filter(g => !g.off && plays(g, teamId)); }

  // ---- Fatigue profile (sql/010 + sql/020) ---------------------------------
  function fatigueScore(p) {
    let s = 0;
    if (p.offDays === 0) s += 25; else if (p.offDays === 1) s += 10;
    if (p.gamesPrev3d >= 3) s += 22; else if (p.gamesPrev3d === 2) s += 14;
    if (p.gamesPrev7d >= 6) s += 22; else if (p.gamesPrev7d === 5) s += 16; else if (p.gamesPrev7d === 4) s += 8;
    if (p.gamesToday >= 2) s += 22;
    if (p.gamesYesterday >= 2) s += 18; else if (p.gamesYesterday >= 1) s += 10;
    if (p.roadStreak >= 6) s += 16; else if (p.roadStreak >= 3) s += 8;
    return Math.min(100, s);
  }

  function fatigueTier(score) {
    if (score >= 70) return "burnt";
    if (score >= 45) return "stressed";
    if (score >= 25) return "elevated";
    return "fresh";
  }

  // The team's profile anchored on its first game of `date`, or null if it has
  // no game that day. offDays is null when no earlier game is in the window,
  // which (as in the SQL) scores nothing.
  function fatigueProfile(games, teamId, date) {
    const mine = teamGames(games, teamId);
    const today = mine.filter(g => g.date === date);
    if (!today.length) return null;
    const before = mine.filter(g => g.date < date);
    const prev = before[before.length - 1];
    const from3 = addDays(date, -3), from7 = addDays(date, -7), yesterday = addDays(date, -1);

    // Consecutive road games, counting today's first game, back to the last home game.
    let roadStreak = 0;
    if (today[0].homeId !== teamId) {
      roadStreak = 1;
      for (let i = before.length - 1; i >= 0 && before[i].homeId !== teamId; i--) roadStreak++;
    }

    const p = {
      offDays: prev ? Math.max(daysBetween(prev.date, date) - 1, 0) : null,
      gamesPrev3d: before.filter(g => g.date >= from3).length,
      gamesPrev7d: before.filter(g => g.date >= from7).length,
      gamesToday: today.length,
      gamesYesterday: before.filter(g => g.date === yesterday).length,
      isHome: today[0].homeId === teamId,
      roadStreak,
    };
    p.score = fatigueScore(p);
    p.tier = fatigueTier(p.score);
    p.burnout = p.score >= 70;
    return p;
  }

  // ---- Wave-1 rule (src/db/wave1-fatigue-rule.mjs) --------------------------
  // A burnt team facing a fresh one, with the fresh side holding at least two
  // more days of rest, flags the fresh side's moneyline.
  function evaluateWave1(home, away, minRestAdvantageDays) {
    const min = minRestAdvantageDays == null ? WAVE1_MIN_REST_ADVANTAGE_DAYS : minRestAdvantageDays;
    if (!home || !away) return null;
    const homeOff = home.offDays == null ? 0 : home.offDays;
    const awayOff = away.offDays == null ? 0 : away.offDays;
    if (away.tier === "burnt" && home.tier === "fresh" && homeOff - awayOff >= min) {
      return { side: "home", restAdvantageDays: homeOff - awayOff, market: "moneyline", rule: WAVE1_RULE_VERSION };
    }
    if (home.tier === "burnt" && away.tier === "fresh" && awayOff - homeOff >= min) {
      return { side: "away", restAdvantageDays: awayOff - homeOff, market: "moneyline", rule: WAVE1_RULE_VERSION };
    }
    return null;
  }

  // ---- Schedule context (compute-slate-metrics.mjs) -------------------------
  // First date after `date`, within the horizon, the team has no game.
  function nextOffDay(games, teamId, date, horizonDays) {
    const horizon = horizonDays == null ? FUTURE_DAYS : horizonDays;
    const dates = new Set(teamGames(games, teamId).map(g => g.date));
    for (let i = 1; i <= horizon; i++) {
      const d = addDays(date, i);
      if (!dates.has(d)) return { date: d, inDays: i };
    }
    return null; // no off day inside the horizon
  }

  // Days until the team next plays somewhere other than `venueKey`: 0 means it
  // moves on after tonight. BettingEdge counts it as days to that game minus one.
  function nextTravel(games, teamId, date, venueKey, horizonDays) {
    const horizon = horizonDays == null ? FUTURE_DAYS : horizonDays;
    const last = addDays(date, horizon);
    const next = teamGames(games, teamId).find(g => g.date > date && g.date <= last && g.venueKey !== venueKey);
    if (!next) return null;
    return { date: next.date, inDays: Math.max(0, daysBetween(date, next.date) - 1) };
  }

  // Calendar days since the first road game of the current trip, counting today
  // and any off days in between, so "6" is the sixth day away from home.
  function awayRoadDays(games, teamId, date) {
    const mine = teamGames(games, teamId).filter(g => g.date <= date);
    let lastHome = null;
    for (const g of mine) if (g.homeId === teamId && g.date < date) lastHome = g.date;
    const firstAway = mine.find(g => g.awayId === teamId && (!lastHome || g.date > lastHome));
    if (!firstAway) return null;
    return daysBetween(firstAway.date, date) + 1;
  }

  function gamesInWindow(games, teamId, fromDate, toDate) {
    return teamGames(games, teamId).filter(g => g.date >= fromDate && g.date <= toDate).length;
  }

  // "Away only" / "Home only" when exactly one side moves on after tonight.
  function travelDayFlag(awayTravel, homeTravel) {
    const a = !!awayTravel && awayTravel.inDays === 0;
    const h = !!homeTravel && homeTravel.inDays === 0;
    if (a && !h) return "away";
    if (h && !a) return "home";
    return null;
  }

  // ---- Lineup workload ----------------------------------------------------
  // Starts per player from a /people?hydrate=stats(group=[fielding],type=[gameLog])
  // payload. A player who moves position mid-game has one split per position, so
  // starts are counted per distinct game.
  function startsFromPeople(payload) {
    const out = new Map();
    for (const person of (payload && payload.people) || []) {
      const games = new Set();
      for (const block of person.stats || []) {
        for (const split of block.splits || []) {
          if (split.stat && split.stat.gamesStarted > 0 && split.game) games.add(split.game.gamePk);
        }
      }
      out.set(person.id, games.size);
    }
    return out;
  }

  // calculateSummaryStats: mean and median to one decimal, over numbers only.
  function summaryStats(values) {
    const nums = (values || []).filter(v => typeof v === "number" && isFinite(v)).sort((a, b) => a - b);
    if (!nums.length) return { mean: null, median: null, n: 0 };
    const mid = Math.floor(nums.length / 2);
    return {
      mean: r1(nums.reduce((t, v) => t + v, 0) / nums.length),
      median: nums.length % 2 ? nums[mid] : r1((nums[mid - 1] + nums[mid]) / 2),
      n: nums.length,
    };
  }

  // ---- Whole slate ---------------------------------------------------------
  // games: scheduleGames() over [date - 30, date + 21]. slate: the rows for
  // `date` itself (they may carry abbreviations and lineups the range fetch
  // trimmed away). starts: Map playerId -> starts in the 10 days before `date`.
  function buildSlate(games, slate, date, starts) {
    const lineupFrom = addDays(date, -LINEUP_WINDOW_DAYS), lineupTo = addDays(date, -1);

    function side(g, teamId, lineup) {
      // Travel is measured from the team's first venue of the day, as in buildNextTravelMap.
      const venueKey = (slate.find(s => plays(s, teamId)) || g).venueKey;
      const ids = (lineup || []).map(p => p.id);
      const counts = starts ? ids.map(id => starts.get(id)) : [];
      return {
        id: teamId,
        fatigue: fatigueProfile(games, teamId, date),
        games10d: gamesInWindow(games, teamId, addDays(date, -10), addDays(date, -1)),
        nextOff: nextOffDay(games, teamId, date),
        travel: nextTravel(games, teamId, date, venueKey),
        lineup: ids.length ? summaryStats(counts) : null,
        lineupWindow: [lineupFrom, lineupTo],
      };
    }

    return slate.map(g => {
      const away = side(g, g.awayId, g.awayLineup);
      const home = side(g, g.homeId, g.homeLineup);
      away.roadDays = g.off ? null : awayRoadDays(games, g.awayId, date);
      const lineupEdge = away.lineup && home.lineup && away.lineup.mean != null && home.lineup.mean != null
        ? r1(away.lineup.mean - home.lineup.mean) : null;
      return {
        game: g, away, home,
        travelFlag: g.off ? null : travelDayFlag(away.travel, home.travel),
        lineupEdge,                       // away mean starts minus home: + means the away lineup is busier
        flag: g.off ? null : evaluateWave1(home.fatigue, away.fatigue),
      };
    });
  }

  return {
    COUNTED_GAME_TYPES, HISTORY_DAYS, FUTURE_DAYS, LINEUP_WINDOW_DAYS,
    WAVE1_RULE_VERSION, WAVE1_MIN_REST_ADVANTAGE_DAYS,
    addDays, daysBetween, scheduleGames,
    fatigueScore, fatigueTier, fatigueProfile, evaluateWave1,
    nextOffDay, nextTravel, awayRoadDays, gamesInWindow, travelDayFlag,
    startsFromPeople, summaryStats, buildSlate,
  };
});
