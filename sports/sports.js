/* Sports — live scoreboards + standings
 * Fetches ESPN's public JSON (CORS-enabled) directly from the browser.
 * No backend; no redeploy needed to update data. Scoreboard comes from
 * site.api.espn.com; standings are loaded separately (non-blocking) with a
 * fallback between the CDN and the main host so a slow/hung endpoint can
 * never freeze the page.
 */
(function () {
  "use strict";

  // ---- Leagues I follow -------------------------------------------------
  // key = ESPN sport/league path. standings = preferred block type
  // (division for baseball/football, overall for soccer). null = skip.
  // playoffPoolMode + implicationZones drive the Spotlight "playoff/qualification
  // implications" boost (see playoffImplicationDistance below):
  //   confFromDiv = MLB/NFL: wild-card races span every division in a
  //     conference, so the pool is AL/NL or AFC/NFC, not each division alone.
  //   confDirect  = MLS/USL: conference is the top level already (no division
  //     layer beneath it).
  //   whole       = single league-wide table (WNBA/NWSL/Liga MX, and every
  //     top-flight soccer league here).
  // implicationZones: { count, fromTop } — fromTop:true counts down from 1st
  // (playoff/continental-qualification cutoff), fromTop:false counts up from
  // last place (relegation cutoff). Liga MX suspended promotion/relegation
  // through the 2026-27 season, so it uses a playoff cutoff like the US
  // leagues, not a relegation zone. Verified 2026-27 season formats; the
  // continental-qualification zones below are rounded to a stable whole-zone
  // count (covers UCL+UEL+UECL together) rather than tracking the exact
  // competition split, which shifts most seasons on UEFA coefficient swing
  // spots.
  // spotlightRankedOnly: college sports have far more teams playing at once
  // than any pro league (100+ FBS/D-I games some Saturdays), so a live game
  // alone would flood Spotlight. For these leagues a live game only counts as
  // "big" if it's also Top-25 ranked (see `ranked` on the parsed game) —
  // followed-team games still always show via isMyGame regardless of rank, and
  // a `stakes` game (conference championship, bowl, tournament final — see
  // `stakes` in parseEvent) always shows regardless of rank too, live or not.
  // spotlightRank: how a league is ordered against every other league in
  // Spotlight when more than one qualifies at the same tier (live, or
  // followed-team, etc. — see SPOTLIGHT_RANK and the entries.sort() call in
  // renderSpotlight). Lower sorts first. Left off a league (undefined) falls
  // back to SPOTLIGHT_RANK.SOCCER.
  // spotlightExempt: this league's games are never cut by a Spotlight sub-cap
  // or by MAX_SPOTLIGHT_GAMES — see the `mine` exemption in renderSpotlight.
  // Only NFL has this today: a full Sunday slate should always show in full,
  // never lose a slot to a tighter soccer scoreline or a crowded budget.
  const SPOTLIGHT_RANK = { NFL: 10, COLLEGE: 20, SOCCER: 30, WNBA: 40, MLB: 50 };
  // Order below is deliberate, not declaration-convenience: leagues with a
  // followed team come first (roughly by prominence — MLB/NFL, then
  // international/domestic pro, then college, then the smaller domestic
  // leagues), then every other league grouped by sport. This same array
  // order drives both the filter button row and the per-league section
  // order on the "All" view, so reordering here reorders both.
  const LEAGUES = [
    { key: "baseball/mlb",    label: "MLB",              myTeams: ["Cincinnati Reds"],          standings: "division",
      playoffPoolMode: "confFromDiv", implicationZones: [{ count: 6, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.MLB },
    { key: "football/nfl",    label: "NFL",              myTeams: ["Cincinnati Bengals"],       standings: "division",
      playoffPoolMode: "confFromDiv", implicationZones: [{ count: 7, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.NFL, spotlightExempt: true },
    { key: "soccer/eng.1",    label: "Premier League",   myTeams: ["Liverpool", "Arsenal"],    standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/usa.1",    label: "MLS",              myTeams: ["FC Cincinnati"],            standings: "overall",
      playoffPoolMode: "confDirect", implicationZones: [{ count: 9, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "football/college-football", label: "NCAAF",  myTeams: ["Kentucky Wildcats", "Louisville Cardinals"], standings: null,
      playoffPoolMode: null, implicationZones: [], spotlightRankedOnly: true, spotlightRank: SPOTLIGHT_RANK.COLLEGE },
    { key: "basketball/mens-college-basketball", label: "NCAAM", myTeams: ["Kentucky Wildcats", "Louisville Cardinals"], standings: null,
      playoffPoolMode: null, implicationZones: [], spotlightRankedOnly: true, spotlightRank: SPOTLIGHT_RANK.COLLEGE },
    { key: "basketball/womens-college-basketball", label: "NCAAW", myTeams: ["Kentucky Wildcats", "Louisville Cardinals"], standings: null,
      playoffPoolMode: null, implicationZones: [], spotlightRankedOnly: true, spotlightRank: SPOTLIGHT_RANK.COLLEGE },
    { key: "soccer/usa.nwsl", label: "NWSL",             myTeams: ["Racing Louisville FC"],     standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 8, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/usa.usl.1", label: "USL Championship", myTeams: ["Lexington SC"],             standings: "overall",
      playoffPoolMode: "confDirect", implicationZones: [{ count: 8, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/esp.1",    label: "La Liga",          myTeams: ["Athletic Club"],            standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/mex.1",    label: "Liga MX",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 8, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/ger.1",    label: "Bundesliga",       myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/ita.1",    label: "Serie A",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/fra.1",    label: "Ligue 1",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 5, fromTop: true }, { count: 3, fromTop: false }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/uefa.champions", label: "UCL",         myTeams: [],                           standings: null,
      playoffPoolMode: null, implicationZones: [], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/uefa.europa",    label: "UEL",         myTeams: [],                           standings: null,
      playoffPoolMode: null, implicationZones: [], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "soccer/ned.1",    label: "Eredivisie",       myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 4, fromTop: true }, { count: 3, fromTop: false }], spotlightRank: SPOTLIGHT_RANK.SOCCER },
    { key: "basketball/wnba", label: "WNBA",             myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 8, fromTop: true }], spotlightRank: SPOTLIGHT_RANK.WNBA },
  ];

  // Substring patterns (lowercased) marking "my" teams, so we catch
  // display-name variants (e.g. "Lexington SC" vs "Lexington Sporting Club").
  const MY_PATTERNS = [
    "cincinnati reds", "fc cincinnati", "racing louisville", "lexington",
    "liverpool", "arsenal", "cincinnati bengals", "kentucky wildcats", "louisville cardinals",
    "athletic club", // Athletic Bilbao — ESPN's displayName is "Athletic Club", not "Bilbao"
  ].map(s => s.toLowerCase());

  const LIVE_SCORE_REFRESH_MS = 5 * 1000;       // current live games: near pitch-by-pitch
  const SCORE_DISCOVERY_REFRESH_MS = 30 * 1000; // discover newly started games
  const STANDINGS_REFRESH_MS = 5 * 60 * 1000;   // standings do not need pitch-level polling
  const STANDINGS_TIMEOUT = 6000;               // give up on a hung standings host
  const MAX_SPOTLIGHT_GAMES = 10;               // cap Spotlight so a big slate doesn't flood it
  // Standings-implication games (rule 3) are the volatile one — how many
  // qualify swings with how bunched the standings happen to be that week, not
  // with how much is actually happening today. Sub-cap them separately so a
  // tight-race week can't crowd out everything else in the overall budget;
  // when there's overflow, keep the tightest races (see
  // playoffImplicationDistance) rather than whichever came first in league order.
  const MAX_IMPLICATION_SPOTLIGHT_GAMES = 4;
  // Ranked-team-only games (a Top-25 college team playing, not live/stakes/
  // implication) can also flood a busy Saturday — sub-cap and keep the
  // marquee-est matchups by combined rank (see rankScore).
  const MAX_RANKED_SPOTLIGHT_GAMES = 4;
  // Marquee-club-only soccer games (see MARQUEE_CLUBS) — sub-cap the same
  // way; when there's overflow, keep the games with the most marquee clubs
  // involved (two > one), then the closest scores among equal marquee counts.
  const MAX_MARQUEE_SPOTLIGHT_GAMES = 4;
  // Plain live games (in progress, no other qualifying reason — not a
  // followed team, not stakes, not a ranked/implication matchup) rank ahead
  // of followed teams' non-live games, but a busy live slate — several
  // soccer leagues all kicking off around the same time — can otherwise fill
  // the entire overall budget with games from leagues nobody follows and push
  // every followed team off Spotlight outright. Sub-cap them the same way,
  // keeping the closest scores (most competitive right now) when there's
  // overflow. NFL and NCAAF each have their own separate budget below.
  const MAX_LIVE_ONLY_SPOTLIGHT_GAMES = 4;
  // Live college football gets its own budget instead of sharing the one
  // above: Saturdays run a full slate of simultaneous ranked matchups (the
  // only kind that count as "live" for NCAAF — see spotlightRankedOnly), and
  // a shared cap with soccer's own Saturday slate meant close soccer
  // scorelines could crowd every CFB game out of Spotlight entirely.
  const MAX_NCAAF_LIVE_ONLY_SPOTLIGHT_GAMES = 4;
  // NFL games are exempt from every sub-cap and from MAX_SPOTLIGHT_GAMES
  // itself (see the isMyGame-style exemption below) — the NFL is the one
  // league that should never lose a Spotlight slot to a soccer scoreline or
  // a crowded budget, so a full Sunday slate always shows in full.
  // How far ahead of kickoff a not-yet-started game starts counting as
  // Spotlight-worthy at all — regardless of which reason (followed team,
  // stakes, ranked, implication) it would otherwise qualify under. A game
  // still hours out is just schedule noise, no matter how marquee it is.
  const PREGAME_SPOTLIGHT_WINDOW_MS = 60 * 60 * 1000;
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  const ESPN_CDN = "https://cdn.site.api.espn.com/apis/site/v2/sports/";
  // Standings live on the /apis/v2/ path (NOT /apis/site/v2/) and need a season.
  // Structure: top-level `children[]` are league/conference nodes, each with a
  // `standings.entries` list. Verified working against baseball/mlb + soccer.
  const ESPN_STAND = "https://site.api.espn.com/apis/v2/sports/";
  const SEASON = new Date().getFullYear();
  // The league filter is shared across the separate Games (/) and Betting
  // (/betting/) pages via localStorage, so picking MLB on one carries over
  // to the other on the next page load — each is its own static page/full
  // navigation, so there's no in-memory state to share directly.
  const FILTER_STORAGE_KEY = "sportsActiveFilter";

  let activeFilter = "all";
  let liveTimer = null;
  let discoveryTimer = null;
  let standingsTimer = null;
  let valueTimer = null;
  let scoresRefreshInFlight = false;
  let valueScreen = null;          // { games: [...], fetchedAt } for today (ET)
  let valueScreenLoading = false;
  let nflOdds = null;               // { games: [...], fetchedAt } — market only, no model
  let nflOddsLoading = false;
  let restDays = null;              // { games: [...], fetchedAt } — soft-factor tracker, no model
  let restDaysLoading = false;
  // The Spotlight "more from your teams" cycling card: followed-team games
  // that don't hold their own Spotlight slot (finished today, or still more
  // than an hour from kickoff) rotate through this one slot instead of
  // disappearing entirely. Index/timer live at module scope because
  // renderSpotlight() rebuilds the whole grid on every data refresh — the
  // rotation has to survive that, not reset to the first game each time.
  let spotlightCycleGames = [];
  let spotlightCycleIndex = 0;
  let spotlightCycleTimer = null;
  const SPOTLIGHT_CYCLE_INTERVAL_MS = 5000;
  const SPOTLIGHT_CYCLE_FADE_MS = 220; // must match .spotlight-cycle's transition-duration in sports.css
  const gamesByLeague = new Map();
  const detailedBoxScoreCache = new Map();
  const openDetailedBoxScores = new Set();

  // ---- Small DOM helpers ------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function isMyTeam(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return MY_PATTERNS.some(p => n.indexOf(p) !== -1);
  }
  // Traditional big clubs across the soccer leagues above — ESPN has no
  // rivalry/marquee signal to draw on (no curatedRank for soccer, and
  // broadcast/notes data is too inconsistent — e.g. a real Manchester derby
  // and an ordinary midtable fixture can carry the same or even opposite
  // broadcast prominence). This is a hand-curated stand-in for "this game
  // draws a crowd regardless of the table," the soccer equivalent of
  // spotlightRankedOnly's Top-25 check for college sports. Exact ESPN
  // displayName spellings verified against each league's /teams endpoint
  // (e.g. Internazionale, not "Inter Milan"; Ajax Amsterdam, not "Ajax").
  const MARQUEE_CLUBS = [
    "manchester united", "manchester city", "liverpool", "arsenal", "chelsea", "tottenham hotspur",
    "real madrid", "barcelona", "atlético madrid",
    "bayern munich", "borussia dortmund",
    "juventus", "internazionale", "ac milan", "napoli",
    "paris saint-germain", "marseille",
    "ajax amsterdam", "psv eindhoven", "feyenoord rotterdam",
  ].map(s => s.toLowerCase());
  function isMarqueeClub(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return MARQUEE_CLUBS.some(p => n.indexOf(p) !== -1);
  }

  // ---- Team identification ---------------------------------------------
  function teamLogo(c) { return (c && c.team && c.team.logo) || null; }
  function standingsTeamLogo(team) {
    if (!team) return null;
    const logos = Array.isArray(team.logos) ? team.logos : [];
    const preferred = logos.find(logo => Array.isArray(logo.rel) && logo.rel.includes("default"));
    return (preferred && preferred.href) || (logos[0] && logos[0].href) || team.logo || null;
  }
  function teamAbbr(c) {
    const t = c && c.team;
    if (!t) return "?";
    return t.abbreviation || t.shortDisplayName || (t.displayName || "?").slice(0, 3).toUpperCase();
  }
  function monogram(abbr) { return String(abbr || "?").slice(0, 3).toUpperCase(); }

  function inningOrdinal(period) {
    const n = Number(period) || 0;
    const mod100 = n % 100;
    const suffix = mod100 >= 11 && mod100 <= 13
      ? "th"
      : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
    return n + suffix;
  }

  function formatGameStatus(status, state, startTime, leagueKey) {
    const type = (status && status.type) || {};
    if (state === "pre") {
      const exceptional = /POSTPONED|DELAYED|SUSPENDED|CANCELED|CANCELLED/.test(type.name || "");
      return exceptional ? (type.shortDetail || type.description || startTime) : startTime;
    }
    if (state === "post") return type.shortDetail || type.description || "Final";

    if (leagueKey === "baseball/mlb") {
      return type.shortDetail || type.detail
        || (status.period ? inningOrdinal(status.period) + " Inning" : "In Progress");
    }

    const clock = status.displayClock || "";
    const period = status.period || 0;
    return (clock + (period ? " • P" + period : "")).trim()
      || type.shortDetail || type.detail || "In Progress";
  }

  function parseBaseballSituation(comp, state, leagueKey) {
    if (leagueKey !== "baseball/mlb" || state !== "in" || !comp || !comp.situation) return null;
    const situation = comp.situation;
    const athleteName = role => {
      const athlete = role && role.athlete;
      return athlete ? (athlete.shortName || athlete.displayName || athlete.fullName || "") : "";
    };
    const occupied = [];
    if (situation.onFirst) occupied.push("1st");
    if (situation.onSecond) occupied.push("2nd");
    if (situation.onThird) occupied.push("3rd");
    const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0;

    return {
      batter: athleteName(situation.batter),
      pitcher: athleteName(situation.pitcher),
      balls: numberOrZero(situation.balls),
      strikes: numberOrZero(situation.strikes),
      outs: numberOrZero(situation.outs),
      onFirst: !!situation.onFirst,
      onSecond: !!situation.onSecond,
      onThird: !!situation.onThird,
      basesText: occupied.length === 3 ? "Bases loaded" : occupied.length ? occupied.join(" & ") : "Bases empty",
      countText: numberOrZero(situation.balls) + "–" + numberOrZero(situation.strikes),
    };
  }

  function parseBaseballLineScore(comp, state, leagueKey) {
    if (leagueKey !== "baseball/mlb" || state !== "post" || !comp) return null;
    const competitors = comp.competitors || [];
    const away = competitors.find(c => c.homeAway === "away");
    const home = competitors.find(c => c.homeAway === "home");
    if (!away || !home) return null;

    const innings = [...new Set([...(away.linescores || []), ...(home.linescores || [])]
      .map(line => Number(line.period)).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!innings.length) return null;

    const statValue = (competitor, abbreviation) => {
      const stat = (competitor.statistics || []).find(item =>
        String(item.abbreviation || "").toUpperCase() === abbreviation);
      return stat && stat.displayValue != null ? String(stat.displayValue) : "—";
    };
    const row = competitor => {
      const byInning = new Map((competitor.linescores || []).map(line => [Number(line.period), line]));
      return {
        abbreviation: (competitor.team && competitor.team.abbreviation) || "TEAM",
        inningRuns: innings.map(inning => {
          const line = byInning.get(inning);
          if (!line) return "—";
          if (line.displayValue != null) return String(line.displayValue);
          return line.value != null ? String(line.value) : "—";
        }),
        runs: competitor.score != null ? String(competitor.score) : statValue(competitor, "R"),
        hits: statValue(competitor, "H"),
        errors: statValue(competitor, "E"),
      };
    };

    return { innings, away: row(away), home: row(home) };
  }

  function parseDetailedBoxScore(summary) {
    const teamPlayers = summary && summary.boxscore && summary.boxscore.players;
    if (!Array.isArray(teamPlayers) || !teamPlayers.length) return null;
    const fields = {
      batting: [
        ["atBats", "AB"], ["runs", "R"], ["hits", "H"],
        ["RBIs", "RBI"], ["walks", "BB"], ["strikeouts", "K"],
      ],
      pitching: [
        ["fullInnings.partInnings", "IP"], ["hits", "H"], ["runs", "R"],
        ["earnedRuns", "ER"], ["walks", "BB"], ["strikeouts", "K"],
      ],
    };
    const statTable = (groups, type) => {
      const fieldList = fields[type];
      const group = (groups || []).find(item => item.type === type);
      if (!group) return { columns: fieldList.map(field => field[1]), rows: [], totals: fieldList.map(() => "—") };
      const keys = group.keys || [];
      const valuesFor = stats => fieldList.map(([key]) => {
        const index = keys.indexOf(key);
        const value = index >= 0 && stats ? stats[index] : null;
        return value == null || value === "" ? "—" : String(value);
      });
      return {
        columns: fieldList.map(field => field[1]),
        rows: (group.athletes || []).filter(row => Array.isArray(row.stats)).map(row => {
          const athlete = row.athlete || {};
          return {
            name: athlete.shortName || athlete.displayName || athlete.fullName || "Player",
            position: (row.position && row.position.abbreviation) || "",
            values: valuesFor(row.stats),
          };
        }),
        totals: valuesFor(group.totals || []),
      };
    };
    const teams = teamPlayers.map(item => {
      const team = item.team || {};
      return {
        abbreviation: team.abbreviation || "TEAM",
        name: team.displayName || team.shortDisplayName || team.abbreviation || "Team",
        batting: statTable(item.statistics, "batting"),
        pitching: statTable(item.statistics, "pitching"),
      };
    });
    return teams.length ? { teams } : null;
  }

  async function fetchDetailedBoxScore(eventId) {
    if (!eventId) return null;
    if (detailedBoxScoreCache.has(eventId)) return detailedBoxScoreCache.get(eventId);
    const pending = (async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const url = ESPN + "baseball/mlb/summary?event=" + encodeURIComponent(eventId);
        const response = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timeout);
        if (!response.ok) return null;
        return parseDetailedBoxScore(await response.json());
      } catch (e) {
        return null;
      }
    })();
    detailedBoxScoreCache.set(eventId, pending);
    const result = await pending;
    if (!result) detailedBoxScoreCache.delete(eventId);
    return result;
  }

  // ---- Where to watch (mirrors the calendar subdomain's same logic) -----
  // ESPN's own Gamecast page for this event — an official, legal source for
  // where/how to watch (broadcast network, streaming partner) rather than us
  // guessing or linking to any particular streaming service ourselves. ESPN
  // tags this same page differently depending on state, verified directly
  // against the API: "summary" for pre/post games, "live" (sometimes also
  // "gamecast") for in-progress ones — missing "live" would silently drop
  // the link for exactly the games where watching it matters most.
  function gameLinkUrl(ev) {
    const links = Array.isArray(ev.links) ? ev.links : [];
    const l = links.find(x => x && typeof x.href === "string" && /^https?:\/\//.test(x.href) &&
      Array.isArray(x.rel) && !x.rel.includes("app") &&
      (x.rel.includes("summary") || x.rel.includes("live") || x.rel.includes("gamecast")));
    return l ? l.href : null;
  }

  function broadcastNetworks(comp) {
    const bc = Array.isArray(comp.broadcasts) ? comp.broadcasts : [];
    const names = [];
    bc.forEach(b => {
      if (Array.isArray(b.names)) names.push(...b.names);
      else if (b.media && b.media.shortName) names.push(b.media.shortName);
    });
    return names.map(n => String(n || "").trim().toUpperCase()).filter(Boolean);
  }

  // Where a given broadcast network's own live stream actually lives —
  // verified directly (not guessed) against each site: FOX/FS1/FS2/BTN are
  // all bundled into the FOX One app, CBS/CBSSN into Paramount+, the ESPN
  // family (incl. conference networks ESPN produces) into ESPN's watch hub.
  const WATCH_LINK_BY_NETWORK = {
    FOX: "https://www.foxone.com/", FS1: "https://www.foxone.com/",
    FS2: "https://www.foxone.com/", BTN: "https://www.foxone.com/",
    CBS: "https://www.paramountplus.com/live-tv/", CBSSN: "https://www.paramountplus.com/live-tv/",
    ABC: "https://abc.com/watch-live",
    ESPN: "https://www.espn.com/watch/", ESPN2: "https://www.espn.com/watch/",
    ESPNU: "https://www.espn.com/watch/", ESPNEWS: "https://www.espn.com/watch/",
    "ESPN+": "https://www.espn.com/watch/",
    SECN: "https://www.espn.com/watch/", "SECN+": "https://www.espn.com/watch/",
    "SEC NETWORK": "https://www.espn.com/watch/",
    ACCN: "https://www.espn.com/watch/", ACCNX: "https://www.espn.com/watch/",
    "ACC NETWORK": "https://www.espn.com/watch/",
    "LONGHORN NETWORK": "https://www.espn.com/watch/",
    NBC: "https://www.peacocktv.com/channels/nbc-local",
    PEACOCK: "https://www.peacocktv.com/channels/nbc-local",
  };

  // Only for the leagues asked for so far: NFL sticks to exactly the two
  // services actually named (FOX One / Paramount+) rather than assuming
  // every NFL broadcaster should get mapped; NCAAF is fully general since
  // it airs across far more networks. Everything else keeps falling back
  // to gameLinkUrl()'s ESPN Gamecast page.
  function watchLinkFor(label, comp) {
    const networks = broadcastNetworks(comp);
    if (label === "NFL") {
      if (networks.includes("FOX")) return WATCH_LINK_BY_NETWORK.FOX;
      if (networks.includes("CBS")) return WATCH_LINK_BY_NETWORK.CBS;
      return null;
    }
    if (label === "NCAAF") {
      const hit = networks.find(n => WATCH_LINK_BY_NETWORK[n]);
      return hit ? WATCH_LINK_BY_NETWORK[hit] : null;
    }
    return null;
  }

  const MLB_STATS_TEAM_ID = 113; // Cincinnati Reds — MLB Stats API's own id, distinct from ESPN's "17"
  // date (YYYY-MM-DD, ET) -> gamePk. Cached indefinitely (a date's gamePk
  // never changes) so the 5s live-score poll doesn't re-hit MLB's API.
  const mlbGamePkCache = new Map();

  // MLB.tv is the actual place to watch regardless of the (often regional/
  // blacked-out) network ESPN reports, but linking straight to a specific
  // game's web player needs MLB's own gamePk, which ESPN doesn't carry —
  // hence this separate lookup against MLB's public Stats API, same as the
  // calendar subdomain.
  async function fetchMlbGamePks(dates) {
    const missing = dates.filter(d => !mlbGamePkCache.has(d));
    if (!missing.length) return;
    const minDate = missing.reduce((a, b) => (a < b ? a : b));
    const maxDate = missing.reduce((a, b) => (a > b ? a : b));
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=" + MLB_STATS_TEAM_ID +
        "&startDate=" + minDate + "&endDate=" + maxDate;
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      (data.dates || []).forEach(d => {
        (d.games || []).forEach(g => { if (g.gamePk) mlbGamePkCache.set(d.date, g.gamePk); });
      });
    } catch (e) { /* ESPN Gamecast fallback still applies */ }
  }

  // ---- Parse a single scoreboard event ---------------------------------
  function parseEvent(ev, leagueKey, label) {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const cs = comp.competitors || [];
    if (cs.length < 2) return null;
    const away = cs.find(c => c.homeAway === "away") || cs[0];
    const home = cs.find(c => c.homeAway === "home") || cs[1];
    const status = (ev.status || comp.status || {});
    const state = (status.type || {}).state || "pre"; // pre | in | post
    const dt = ev.date ? new Date(ev.date) : null;
    const startTime = dt ? dt.toLocaleString("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
      weekday: "short", timeZoneName: "short"
    }) : "Time TBA";

    // Soccer standings run on points (3 per win, 1 per draw), not win-loss
    // record, and ESPN's own competitor record doesn't include the total —
    // only the W-D-L summary points are derived from. Other sports here
    // (MLB, NFL, NCAAF, ...) don't use points at all, so this only fires for
    // a 3-part record on a soccer league.
    const isSoccer = leagueKey.indexOf("soccer/") === 0;
    const recOf = c => {
      const rec = (c.records && c.records[0] && c.records[0].summary);
      if (!rec) return "";
      if (isSoccer) {
        const parts = rec.split("-").map(Number);
        if (parts.length === 3 && parts.every(Number.isFinite)) {
          const points = parts[0] * 3 + parts[1];
          return "Record " + rec + " (" + points + (points === 1 ? " pt)" : " pts)");
        }
      }
      return "Record " + rec;
    };
    const rankOf = c => {
      const r = c.curatedRank && c.curatedRank.current;
      return (typeof r === "number" && r <= 25) ? r : null;
    };
    const isRanked = c => rankOf(c) != null;
    // ESPN tags championship/bowl/tournament-final games with a notes headline
    // (e.g. "MAC Championship", "Big Ten Tournament - Final", "College Football
    // Playoff Quarterfinal at the Rose Bowl") and leaves it empty for every
    // ordinary game, even marquee rivalries — a ranking-independent "this game
    // has real stakes" signal Spotlight can use alongside isMyGame/isRanked.
    const stakes = (comp.notes && comp.notes[0] && comp.notes[0].headline) || null;
    // ESPN lists one broadcasts[] entry per market (national/home/away), each
    // with a names[] (TV network or streaming service, indistinguishable in
    // this field — e.g. "FOX" vs "Peacock" vs "MLB.TV"). National is what's
    // actually watchable by anyone, so prefer it; local-only entries (a
    // regional RSN) are the fallback when there's no national broadcast.
    const broadcastList = Array.isArray(comp.broadcasts) ? comp.broadcasts : [];
    const broadcastEntry = broadcastList.find(b => b.market === "national") || broadcastList[0];
    const broadcast = (broadcastEntry && Array.isArray(broadcastEntry.names) && broadcastEntry.names.length)
      ? broadcastEntry.names.join("/") : null;
    // ESPN marks postseason events with season.type 3 ("post-season") at the
    // event level, regardless of sport — the one reliable signal that a game
    // is an actual playoff game, as opposed to a regular-season game that
    // merely has playoff *implications* (see playoffImplicationDistance).
    const isPlayoff = !!(ev.season && ev.season.type === 3);

    return {
      eventId: ev.id,
      leagueKey,
      boxScoreEventId: leagueKey === "baseball/mlb" && state === "post" ? ev.id : null,
      state,
      isPlayoff,
      away: { name: away.team.displayName, abbr: teamAbbr(away), logo: teamLogo(away), rec: recOf(away), score: away.score, winner: !!away.winner, rank: rankOf(away) },
      home: { name: home.team.displayName, abbr: teamAbbr(home), logo: teamLogo(home), rec: recOf(home), score: home.score, winner: !!home.winner, rank: rankOf(home) },
      dateET: dt ? dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null, // YYYY-MM-DD
      kickoffMs: dt ? dt.getTime() : null,
      startTime,
      statusText: formatGameStatus(status, state, startTime, leagueKey),
      baseballSituation: parseBaseballSituation(comp, state, leagueKey),
      lineScore: parseBaseballLineScore(comp, state, leagueKey),
      isMyGame: isMyTeam(away.team.displayName) || isMyTeam(home.team.displayName),
      ranked: isRanked(away) || isRanked(home),
      marqueeCount: (isMarqueeClub(away.team.displayName) ? 1 : 0) + (isMarqueeClub(home.team.displayName) ? 1 : 0),
      stakes,
      broadcast,
      gameLink: watchLinkFor(label, comp) || gameLinkUrl(ev),
    };
  }

  function teamCell(t) {
    const wrap = el("div", "team-cell");
    if (t.logo) {
      const img = el("img", "team-logo");
      img.src = t.logo; img.alt = t.name; img.loading = "lazy";
      img.onerror = () => { img.replaceWith(badge(t.abbr)); };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(badge(t.abbr));
    }
    const txt = el("div", "team-text");
    const nameRow = el("div", "team-name-row");
    if (t.rank) nameRow.appendChild(el("span", "team-rank", "#" + t.rank));
    nameRow.appendChild(el("span", "team-name", esc(t.name)));
    if (isMyTeam(t.name)) nameRow.appendChild(el("span", "team-star", "★"));
    txt.appendChild(nameRow);
    if (t.rec) txt.appendChild(el("div", "team-rec", esc(t.rec)));
    wrap.appendChild(txt);
    return wrap;
  }
  function badge(abbr) { return el("span", "team-badge", monogram(abbr)); }

  function scoreNum(t) {
    const s = el("span", "score-num" + (t.winner ? " win" : (t.score != null && t.score !== "") ? " lose" : ""));
    s.textContent = (t.score == null || t.score === "") ? "–" : t.score;
    return s;
  }

  function baseballSituationPanel(situation) {
    const panel = el("div", "baseball-situation");
    const players = el("div", "baseball-players");
    if (situation.batter || situation.pitcher) {
      players.appendChild(el("span", "baseball-label", "At bat "));
      players.appendChild(el("strong", "", esc(situation.batter || "—")));
      players.appendChild(el("span", "baseball-separator", " · "));
      players.appendChild(el("span", "baseball-label", "Pitching "));
      players.appendChild(el("strong", "", esc(situation.pitcher || "—")));
    } else {
      players.appendChild(el("span", "baseball-between", "Between batters"));
    }
    panel.appendChild(players);

    const stateRow = el("div", "baseball-state-row");
    const diamond = el("span", "base-diamond");
    diamond.setAttribute("role", "img");
    diamond.setAttribute("aria-label", situation.basesText);
    [
      ["second", situation.onSecond],
      ["third", situation.onThird],
      ["first", situation.onFirst],
    ].forEach(([base, occupied]) => {
      diamond.appendChild(el("span", "base base--" + base + (occupied ? " base--occupied" : "")));
    });
    stateRow.appendChild(diamond);
    const outLabel = situation.outs + " out" + (situation.outs === 1 ? "" : "s");
    stateRow.appendChild(el("span", "baseball-state-text",
      esc(outLabel + " · " + situation.countText)));
    panel.appendChild(stateRow);
    return panel;
  }

  function finalLineScoreTable(lineScore) {
    const wrap = el("div", "final-line-score");
    wrap.appendChild(el("div", "final-line-title", "LINE SCORE"));
    const scroll = el("div", "final-line-scroll");
    const table = el("table", "final-line-table");
    table.setAttribute("aria-label", "Final line score");

    const head = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "box-team-col", ""));
    lineScore.innings.forEach(inning => headRow.appendChild(el("th", "", esc(inning))));
    ["R", "H", "E"].forEach((label, index) =>
      headRow.appendChild(el("th", index === 0 ? "box-total-start" : "", label)));
    head.appendChild(headRow);
    table.appendChild(head);

    const body = el("tbody");
    [lineScore.away, lineScore.home].forEach(row => {
      const tr = el("tr");
      const teamHead = el("th", "box-team-col", esc(row.abbreviation));
      teamHead.setAttribute("scope", "row");
      tr.appendChild(teamHead);
      row.inningRuns.forEach(value => tr.appendChild(el("td", "", esc(value))));
      [row.runs, row.hits, row.errors].forEach((value, index) =>
        tr.appendChild(el("td", index === 0 ? "box-total-start box-runs" : "", esc(value))));
      body.appendChild(tr);
    });
    table.appendChild(body);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    return wrap;
  }

  function playerStatTable(title, stats) {
    const section = el("section", "player-stat-section");
    section.appendChild(el("div", "player-stat-title", esc(title)));
    const scroll = el("div", "player-stat-scroll");
    const table = el("table", "player-stat-table");
    table.setAttribute("aria-label", title);
    const head = el("thead");
    const headRow = el("tr");
    headRow.appendChild(el("th", "player-name-col", "Player"));
    stats.columns.forEach(column => headRow.appendChild(el("th", "", esc(column))));
    head.appendChild(headRow);
    table.appendChild(head);

    const body = el("tbody");
    stats.rows.forEach(row => {
      const tr = el("tr");
      const name = el("th", "player-name-col");
      name.setAttribute("scope", "row");
      name.appendChild(el("span", "player-name", esc(row.name)));
      if (row.position) name.appendChild(el("span", "player-position", esc(row.position)));
      tr.appendChild(name);
      row.values.forEach(value => tr.appendChild(el("td", "", esc(value))));
      body.appendChild(tr);
    });
    table.appendChild(body);

    const foot = el("tfoot");
    const totalRow = el("tr");
    totalRow.appendChild(el("th", "player-name-col", "TOTALS"));
    stats.totals.forEach(value => totalRow.appendChild(el("td", "", esc(value))));
    foot.appendChild(totalRow);
    table.appendChild(foot);
    scroll.appendChild(table);
    section.appendChild(scroll);
    return section;
  }

  function detailedBoxScoreContent(boxScore) {
    const wrap = el("div", "player-box-grid");
    boxScore.teams.forEach(team => {
      const teamSection = el("section", "player-box-team");
      teamSection.appendChild(el("h4", "player-box-team-name", esc(team.name)));
      teamSection.appendChild(playerStatTable(team.abbreviation + " BATTING", team.batting));
      teamSection.appendChild(playerStatTable(team.abbreviation + " PITCHING", team.pitching));
      wrap.appendChild(teamSection);
    });
    return wrap;
  }

  async function hydrateDetailedBoxScore(eventId, content) {
    if (content.dataset.state === "loading" || content.dataset.state === "loaded") return;
    content.dataset.state = "loading";
    content.textContent = "Loading player box score…";
    const boxScore = await fetchDetailedBoxScore(eventId);
    content.innerHTML = "";
    content.textContent = "";
    if (!boxScore) {
      content.dataset.state = "error";
      content.appendChild(el("div", "player-box-message", "Player box score unavailable."));
      return;
    }
    content.dataset.state = "loaded";
    content.appendChild(detailedBoxScoreContent(boxScore));
  }

  function detailedBoxScoreDetails(eventId) {
    const details = el("details", "player-box-details");
    details.dataset.eventId = eventId;
    details.appendChild(el("summary", "player-box-summary", "BOX SCORE"));
    const content = el("div", "player-box-content", "Open to load player batting and pitching stats.");
    details.appendChild(content);
    details.addEventListener("toggle", () => {
      if (details.open) {
        openDetailedBoxScores.add(eventId);
        hydrateDetailedBoxScore(eventId, content);
      } else {
        openDetailedBoxScores.delete(eventId);
      }
    });
    if (openDetailedBoxScores.has(eventId)) {
      details.open = true;
      hydrateDetailedBoxScore(eventId, content);
    }
    return details;
  }

  function gameCard(g, leagueLabel) {
    // Where to watch only matters before/during a game — once it's final,
    // nobody's tuning in, and the box score below needs its own clickable
    // <details> (which can't nest inside an <a>).
    const linkable = !!g.gameLink && g.state !== "post";
    const card = el(linkable ? "a" : "div", "game" + (g.state === "in" ? " game--live" : g.state === "post" ? " game--final" : "") + (g.isMyGame ? " game--me" : ""));
    if (linkable) {
      card.href = g.gameLink;
      card.target = "_blank";
      card.rel = "noopener";
    }
    if (leagueLabel) {
      const tag = g.stakes ? leagueLabel + " · " + g.stakes : leagueLabel;
      card.appendChild(el("div", "spotlight-league-tag", esc(tag)));
    }
    const m = el("div", "matchup");
    const aT = el("div", "team team--away"); aT.appendChild(teamCell(g.away));
    const hT = el("div", "team team--home"); hT.appendChild(teamCell(g.home));
    const score = el("div", "score");
    if (g.state === "pre") {
      score.appendChild(el("span", "score-vs", "vs"));
    } else {
      score.appendChild(scoreNum(g.away));
      score.appendChild(el("span", "score-vs", "–"));
      score.appendChild(scoreNum(g.home));
    }
    m.appendChild(aT); m.appendChild(score); m.appendChild(hT);
    card.appendChild(m);
    const st = el("div", "status" + (g.state === "in" ? " status--live" : ""));
    if (g.state === "in") st.innerHTML = '<span class="live-dot"></span>' + esc(g.statusText);
    else st.textContent = g.statusText;
    card.appendChild(st);
    if (g.broadcast && g.state !== "post") {
      card.appendChild(el("div", "broadcast", esc(g.broadcast)));
    }
    if (g.baseballSituation) card.appendChild(baseballSituationPanel(g.baseballSituation));
    if (g.lineScore) card.appendChild(finalLineScoreTable(g.lineScore));
    if (g.boxScoreEventId) card.appendChild(detailedBoxScoreDetails(g.boxScoreEventId));
    return card;

  }

  // ---- Spotlight: live games + my-team games, across every league -------
  function renderSpotlight() {
    const section = $("#spotlight");
    const grid = $("#spotlightGrid");
    if (!section || !grid) return;
    if (activeFilter !== "all") {
      section.hidden = true;
      if (spotlightCycleTimer) { clearInterval(spotlightCycleTimer); spotlightCycleTimer = null; }
      return;
    }
    section.hidden = false;
    // Some leagues' scoreboard endpoints return more than just today's slate
    // (e.g. NFL returns the full week) — Spotlight is "what's happening
    // today," so scope every entry to today's date in Eastern regardless of
    // league, live state, or followed-team status.
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    // Playoff/qualification pools are rebuilt once per league per render
    // (not per game) — cheap, and standings may not have loaded yet for a
    // given league, in which case playoffImplicationDistance() just returns
    // null for it until renderSpotlight() re-runs after that league's
    // standings arrive.
    const poolsCache = new Map();
    const poolsFor = league => {
      if (!poolsCache.has(league.key)) {
        poolsCache.set(league.key, buildPlayoffPools(league, standingsRawByLeague.get(league.key)));
      }
      return poolsCache.get(league.key);
    };
    let entries = [];
    const cycleGames = [];
    gamesByLeague.forEach((games, key) => {
      const league = LEAGUES.find(l => l.key === key);
      games.forEach(g => {
        if (g.dateET !== todayET) return;
        const liveCounts = g.state === "in" && (!league || !league.spotlightRankedOnly || g.ranked);
        const stakesCounts = g.stakes && g.state !== "post";
        const implicationDistance = league ? playoffImplicationDistance(league, g, poolsFor(league)) : null;
        // A ranked team playing is its own reason to be "big," separate from
        // liveCounts (which only uses rank to gate whether a *live* college
        // game counts at all). This surfaces marquee pre-game and final
        // matchups too, not just live ones.
        const rankedCounts = !liveCounts && g.ranked && league && league.spotlightRankedOnly;
        const rankScore = (g.away.rank || 26) + (g.home.rank || 26);
        // A marquee club playing is soccer's equivalent of rankedCounts for
        // college — a reason to show the game whether or not it's live, since
        // a traditional big club drawing a crowd isn't conditional on being
        // in progress the way a plain live game is.
        const marqueeCounts = g.marqueeCount > 0;
        const kickoffSoon = g.kickoffMs != null && g.kickoffMs - Date.now() <= PREGAME_SPOTLIGHT_WINDOW_MS;
        // A followed team's game that's already over, or still more than an
        // hour from kickoff, doesn't hold its own Spotlight slot — it rotates
        // through the cycling card at the end instead. Live and imminent
        // (within the hour) followed-team games are unaffected and fall
        // through to the normal handling below.
        if (g.isMyGame && g.state !== "in" && !(g.state === "pre" && kickoffSoon)) {
          cycleGames.push({ g, label: league ? league.label : "" });
          return;
        }
        // None of the non-live reasons (followed team, stakes, ranked team,
        // playoff implications) justify a slot before the game is imminent —
        // a game hours from kickoff is just noise on a busy slate, whichever
        // reason it qualifies under. Once it's live, or already over, or
        // within the window, it counts normally.
        const pregameImminent = g.state !== "pre" || kickoffSoon;
        const big = liveCounts || (pregameImminent && (g.isMyGame || stakesCounts || rankedCounts || marqueeCounts || implicationDistance != null));
        if (!big) return;
        // "Implication-only" / "ranked-only" / "marquee-only" / "live-only" =
        // the sole reason this game qualified is standings implications / a
        // ranked team / a big club / just being in progress — not a followed
        // team, not a championship/bowl game. Those other reasons already
        // guarantee a slot, so only these entries are subject to a sub-cap (a
        // ranked Saturday, a Saturday stacked with marquee kickoffs, or a
        // Saturday with a lot of live games nobody follows, can otherwise
        // flood Spotlight). A live marquee game routes into marqueeOnly, not
        // liveOnly, so it isn't bumped by the closest-score tiebreak the way
        // an ordinary live game is — a marquee blowout still holds its slot.
        const implicationOnly = !liveCounts && !g.isMyGame && !stakesCounts && !rankedCounts && !marqueeCounts && implicationDistance != null;
        const rankedOnly = rankedCounts && !g.isMyGame && !stakesCounts && implicationDistance == null;
        const marqueeOnly = marqueeCounts && !g.isMyGame && !stakesCounts && implicationDistance == null;
        const liveOnly = liveCounts && !g.isMyGame && !stakesCounts && !marqueeCounts && implicationDistance == null;
        const scoreMargin = Math.abs((Number(g.away.score) || 0) - (Number(g.home.score) || 0));
        // A real MLB playoff game is exempt from MLB's normal (lowest)
        // ranking — it ties with soccer instead of sitting below it, the
        // same exception the old hardcoded isNonPlayoffBaseball check made.
        const spotlightRank = key === "baseball/mlb" && g.isPlayoff
          ? SPOTLIGHT_RANK.SOCCER
          : (league && league.spotlightRank != null ? league.spotlightRank : SPOTLIGHT_RANK.SOCCER);
        const spotlightExempt = !!(league && league.spotlightExempt);
        entries.push({ g, label: league ? league.label : "", leagueKey: key, stakesCounts, rankedCounts, rankedOnly, marqueeOnly, marqueeCount: g.marqueeCount, liveOnly, rankScore, scoreMargin, implicationDistance, implicationOnly, spotlightRank, spotlightExempt });
      });
    });

    // A league flagged spotlightExempt (NFL today) is exempt from every
    // sub-cap below and from MAX_SPOTLIGHT_GAMES itself (see the
    // isMyGame-style exemption further down) — it should never lose a
    // Spotlight slot to a tighter soccer scoreline or a crowded budget.
    const implicationOnly = entries.filter(e => e.implicationOnly && !e.spotlightExempt);
    if (implicationOnly.length > MAX_IMPLICATION_SPOTLIGHT_GAMES) {
      implicationOnly.sort((a, b) => a.implicationDistance - b.implicationDistance);
      const keep = new Set(implicationOnly.slice(0, MAX_IMPLICATION_SPOTLIGHT_GAMES));
      entries = entries.filter(e => !e.implicationOnly || e.spotlightExempt || keep.has(e));
    }
    const rankedOnly = entries.filter(e => e.rankedOnly);
    if (rankedOnly.length > MAX_RANKED_SPOTLIGHT_GAMES) {
      rankedOnly.sort((a, b) => a.rankScore - b.rankScore);
      const keep = new Set(rankedOnly.slice(0, MAX_RANKED_SPOTLIGHT_GAMES));
      entries = entries.filter(e => !e.rankedOnly || keep.has(e));
    }
    const marqueeOnly = entries.filter(e => e.marqueeOnly);
    if (marqueeOnly.length > MAX_MARQUEE_SPOTLIGHT_GAMES) {
      marqueeOnly.sort((a, b) => b.marqueeCount - a.marqueeCount || a.scoreMargin - b.scoreMargin);
      const keep = new Set(marqueeOnly.slice(0, MAX_MARQUEE_SPOTLIGHT_GAMES));
      entries = entries.filter(e => !e.marqueeOnly || keep.has(e));
    }
    // NCAAF gets its own live-only budget, separate from every other live
    // sport's shared one — Saturday college football runs a full slate of
    // simultaneous ranked matchups, and sharing one small closest-score cap
    // with soccer (also often live in bulk on Saturdays, and decided by much
    // narrower margins) meant close soccer scorelines could crowd every CFB
    // game out of Spotlight. Exempt leagues (NFL) skip this sub-cap step
    // entirely.
    const liveOnly = entries.filter(e => e.liveOnly && !e.spotlightExempt);
    const ncaafLiveOnly = liveOnly.filter(e => e.leagueKey === "football/college-football");
    const otherLiveOnly = liveOnly.filter(e => e.leagueKey !== "football/college-football");
    if (ncaafLiveOnly.length > MAX_NCAAF_LIVE_ONLY_SPOTLIGHT_GAMES) {
      ncaafLiveOnly.sort((a, b) => a.scoreMargin - b.scoreMargin);
      const keep = new Set(ncaafLiveOnly.slice(0, MAX_NCAAF_LIVE_ONLY_SPOTLIGHT_GAMES));
      entries = entries.filter(e => !(e.liveOnly && e.leagueKey === "football/college-football") || keep.has(e));
    }
    if (otherLiveOnly.length > MAX_LIVE_ONLY_SPOTLIGHT_GAMES) {
      otherLiveOnly.sort((a, b) => a.scoreMargin - b.scoreMargin);
      const keep = new Set(otherLiveOnly.slice(0, MAX_LIVE_ONLY_SPOTLIGHT_GAMES));
      entries = entries.filter(e => !(e.liveOnly && !e.spotlightExempt && e.leagueKey !== "football/college-football") || keep.has(e));
    }

    // Live games first — regardless of followed-team status — then followed
    // teams, then by state (upcoming < final). Within the same tier, leagues
    // are ordered by spotlightRank (see SPOTLIGHT_RANK / the LEAGUES config
    // above) — lower ranks first, so e.g. NFL/college beat soccer, which
    // beats an ordinary regular-season MLB game (a real MLB playoff game is
    // exempt from that last demotion — see the spotlightRank computed above).
    // Beyond that: a stakes game (championship/bowl/tournament final)
    // outranks a ranked-team matchup, which outranks a plain implication
    // game. Ranked matchups are ordered by combined rank (lowest = most
    // marquee, e.g. a Top-5 game beats an unranked-vs-#24 game), and
    // implication games by how tight the race actually is — tightest first —
    // so whichever entries survive the sub-caps above are also shown in a
    // sensible order rather than league/game insertion order.
    const stateOrder = s => s === "in" ? 0 : s === "pre" ? 1 : 2;
    entries.sort((a, b) => {
      // A spotlightExempt league (NFL) supersedes literally everything
      // else — checked before live state, followed-team status, or anything
      // below, so any of its games (live, upcoming, or final) sort ahead of
      // every non-exempt game.
      const exA = a.spotlightExempt ? 0 : 1, exB = b.spotlightExempt ? 0 : 1;
      if (exA !== exB) return exA - exB;
      const liveA = a.g.state === "in" ? 0 : 1, liveB = b.g.state === "in" ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      const myA = a.g.isMyGame ? 0 : 1, myB = b.g.isMyGame ? 0 : 1;
      if (myA !== myB) return myA - myB;
      const sa = stateOrder(a.g.state), sb = stateOrder(b.g.state);
      if (sa !== sb) return sa - sb;
      if (a.spotlightRank !== b.spotlightRank) return a.spotlightRank - b.spotlightRank;
      // rankedOnly (college) and marqueeOnly (soccer) never compete directly
      // here — they only ever tie at this step against another entry with the
      // same spotlightRank, and the two belong to different tiers (20 vs 30)
      // — so tier 1 can safely pick whichever comparator applies.
      const reasonRank = e => e.stakesCounts ? 0 : (e.rankedOnly || e.marqueeOnly) ? 1 : e.implicationDistance != null ? 2 : 3;
      const ra = reasonRank(a), rb = reasonRank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 1) return a.rankedOnly ? a.rankScore - b.rankScore : b.marqueeCount - a.marqueeCount;
      if (ra === 2) return a.implicationDistance - b.implicationDistance;
      return 0;
    });

    grid.innerHTML = "";
    spotlightCycleGames = cycleGames;
    if (!entries.length && !spotlightCycleGames.length) {
      grid.appendChild(el("div", "spotlight-empty", "Nothing live and no games today for the teams you follow."));
      if (spotlightCycleTimer) { clearInterval(spotlightCycleTimer); spotlightCycleTimer = null; }
      return;
    }
    // The cycling card counts against MAX_SPOTLIGHT_GAMES too — it's still
    // one grid slot, so showing it shouldn't push the total to 10.
    const cycleCardSlot = spotlightCycleGames.length ? 1 : 0;
    if (entries.length) {
      // Followed-team games and spotlightExempt leagues (NFL) are both
      // exempt from MAX_SPOTLIGHT_GAMES: it exists to stop a busy slate of
      // *other* games from flooding the section, not to bump a followed
      // team — or a full Sunday NFL slate — off Spotlight once enough games
      // elsewhere fill the budget. Everything else fills whatever room is left.
      const mine = entries.filter(e => e.g.isMyGame || e.spotlightExempt);
      const others = entries.filter(e => !e.g.isMyGame && !e.spotlightExempt)
        .slice(0, Math.max(0, MAX_SPOTLIGHT_GAMES - mine.length - cycleCardSlot));
      mine.concat(others).sort((a, b) => entries.indexOf(a) - entries.indexOf(b))
        .forEach(({ g, label }) => grid.appendChild(gameCard(g, label)));
    }
    // The cycling card always renders last, so it lands in the final grid
    // slot (bottom-right in the normal 2-column layout).
    if (!spotlightCycleGames.length) {
      if (spotlightCycleTimer) { clearInterval(spotlightCycleTimer); spotlightCycleTimer = null; }
      return;
    }
    grid.appendChild(spotlightCycleCard());
    if (!spotlightCycleTimer) {
      spotlightCycleTimer = setInterval(() => {
        if (!spotlightCycleGames.length) return;
        const existing = document.getElementById("spotlightCycleCard");
        if (!existing) return;
        // Fade the current card out, then swap content and fade the next one
        // in — a hard replaceWith() was an instant cut between two unrelated
        // games, which read as a glitch rather than a deliberate rotation.
        existing.style.opacity = "0";
        setTimeout(() => {
          if (!spotlightCycleGames.length) return;
          // The 5s live-score refresh can rebuild the whole grid while this
          // fade is in flight; re-check rather than trust the closed-over node.
          const stillThere = document.getElementById("spotlightCycleCard");
          if (!stillThere) return;
          spotlightCycleIndex = (spotlightCycleIndex + 1) % spotlightCycleGames.length;
          const next = spotlightCycleCard();
          next.style.opacity = "0";
          stillThere.replaceWith(next);
          // Setting opacity 0 then 1 back-to-back gets batched into one style
          // recalc with no paint in between, so the transition has nothing to
          // animate from — force layout to commit the 0 state first.
          void next.offsetWidth;
          next.style.opacity = "1";
        }, SPOTLIGHT_CYCLE_FADE_MS);
      }, SPOTLIGHT_CYCLE_INTERVAL_MS);
    }
  }

  // Builds the one card shown for the current position in spotlightCycleGames
  // — a normal game card with a small kicker/counter header spliced in front,
  // reusing gameCard() so a cycled game looks like any other Spotlight entry.
  function spotlightCycleCard() {
    spotlightCycleIndex = spotlightCycleIndex % spotlightCycleGames.length;
    const { g, label } = spotlightCycleGames[spotlightCycleIndex];
    const card = gameCard(g, label);
    card.id = "spotlightCycleCard";
    card.classList.add("spotlight-cycle");
    const head = el("div", "spotlight-cycle-head");
    head.appendChild(el("span", "spotlight-cycle-kicker", "MORE FROM YOUR TEAMS"));
    if (spotlightCycleGames.length > 1) {
      head.appendChild(el("span", "spotlight-cycle-counter", (spotlightCycleIndex + 1) + " / " + spotlightCycleGames.length));
    }
    card.insertBefore(head, card.firstChild);
    return card;
  }

  // ---- Standings -------------------------------------------------------
  function findStandingsBlock(league, data) {
    // Collect every named node that has standings entries. With `level=3`,
    // ESPN nests division tables under their conference (AL/NL, AFC/NFC).
    const found = [];
    (function walk(node, depth, parentName) {
      if (!node || depth > 5) return;
      if (Array.isArray(node)) {
        node.forEach(n => walk(n, depth + 1, parentName));
        return;
      }
      if (typeof node !== "object") return;
      if (node.standings && Array.isArray(node.standings.entries) && node.standings.entries.length) {
        found.push({
          name: node.name || node.standings.name || "",
          parentName: parentName || "",
          depth,
          entries: node.standings.entries,
        });
      }
      if (Array.isArray(node.entries) && node.entries.length && node.name) {
        found.push({ name: node.name, parentName: parentName || "", depth, entries: node.entries });
      }
      const nextParent = node.name || parentName || "";
      if (Array.isArray(node.children)) node.children.forEach(c => walk(c, depth + 1, nextParent));
      if (Array.isArray(node.standings)) node.standings.forEach(s => walk(s, depth + 1, nextParent));
    })(data, 0, "");

    const blocks = found.filter(b => b.entries.length);
    if (!blocks.length) return [];

    if (league.standings === "division" && blocks.length > 1) {
      // If ESPN returns both conference and division rows, keep only the most
      // specific level. The API currently yields six MLB and eight NFL groups.
      const deepest = Math.max(...blocks.map(b => b.depth));
      return blocks.filter(b => b.depth === deepest);
    }

    // Soccer and other overall tables remain one deduplicated league table.
    const seen = new Set();
    const merged = [];
    blocks.forEach(b => b.entries.forEach(e => {
      const id = e.team && (e.team.id || e.team.displayName);
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      merged.push(e);
    }));
    return [{ name: "", parentName: "", entries: merged }];
  }

  function statGetter(block) {
    const sample = block.entries[0];
    const pools = {
      wins: ["wins", "win"],
      losses: ["losses", "loss", "defeats"],
      ties: ["ties", "tie", "draws", "draw"],
      points: ["points", "pts"],
      pct: ["winPercent", "winpct", "pct", "winningPercentage"],
    };
    const get = namePool => entry => {
      const stats = entry.stats || [];
      for (const n of namePool) {
        const s = stats.find(x => (x.name || "").toLowerCase() === n.toLowerCase()
          || (x.type || "").toLowerCase() === n.toLowerCase());
        if (s && s.displayValue != null && s.displayValue !== "") return s.displayValue;
      }
      return "";
    };
    const g = {};
    for (const k in pools) g[k] = get(pools[k]);
    return g;
  }

  function standingsRowsTable(block, league) {
    const g = statGetter(block);
    const sample = block.entries[0];
    const has = k => g[k](sample) !== "";
    // Some non-soccer leagues (confirmed on WNBA) carry their own internal
    // stat literally named "points" that has nothing to do with a standings
    // points table — it's a wins/losses-derived value ESPN uses for seeding
    // math, and showing or sorting by it produces a nonsense "Pts" column
    // (including negative values for teams under .500). Real points tables
    // only exist for soccer, so gate on that rather than trusting the name.
    const isSoccer = league && league.key.indexOf("soccer/") === 0;
    const usePts = isSoccer && has("points");
    const useTies = has("ties");
    const hasWL = has("wins") && has("losses");

    const entries = block.entries.slice().sort((a, b) => {
      const pa = parseInt(g.points(a) || "0", 10), pb = parseInt(g.points(b) || "0", 10);
      const wa = parseInt(g.wins(a) || "0", 10), wb = parseInt(g.wins(b) || "0", 10);
      const pcta = parseFloat(g.pct(a) || "0"), pctb = parseFloat(g.pct(b) || "0");
      if (usePts && pa !== pb) return pb - pa;
      if (pcta !== pctb) return pctb - pcta;
      return wb - wa;
    });

    // Games behind, computed ourselves against the leader of THIS table
    // rather than trusted from the API: ESPN's own gamesBehind is relative to
    // each team's conference/division, which reads as nonsense (multiple
    // teams showing "-", or numbers that don't reconcile) once several of
    // those groups get merged into one flat table for display.
    const leader = hasWL ? entries[0] : null;
    const leaderWins = leader ? parseInt(g.wins(leader) || "0", 10) : 0;
    const leaderLosses = leader ? parseInt(g.losses(leader) || "0", 10) : 0;
    const gb = e => {
      const w = parseInt(g.wins(e) || "0", 10), l = parseInt(g.losses(e) || "0", 10);
      const val = ((leaderWins - w) + (l - leaderLosses)) / 2;
      return val <= 0 ? "-" : (Number.isInteger(val) ? String(val) : val.toFixed(1));
    };

    const tbl = el("table", "stand");
    const head = el("tr");
    const headCols = ["#", "Team"];
    if (has("wins")) headCols.push("W");
    if (has("losses")) headCols.push("L");
    if (useTies) headCols.push("T");
    if (usePts) headCols.push("Pts");
    if (has("pct")) headCols.push("Pct");
    if (hasWL) headCols.push("GB");
    headCols.forEach((h, i) => head.appendChild(el("th", i === 1 ? "col-team" : "", h)));
    tbl.appendChild(head);

    entries.forEach((e, i) => {
      const tr = el("tr", isMyTeam(e.team.displayName) ? "me" : "");
      tr.appendChild(el("td", "col-rank", String(i + 1)));
      const td = el("td", "col-team");
      td.appendChild(teamCell({ name: e.team.displayName, abbr: e.team.abbreviation, logo: standingsTeamLogo(e.team) }));
      tr.appendChild(td);
      if (has("wins")) tr.appendChild(el("td", "", g.wins(e)));
      if (has("losses")) tr.appendChild(el("td", "", g.losses(e)));
      if (useTies) tr.appendChild(el("td", "", g.ties(e)));
      if (usePts) tr.appendChild(el("td", "", g.points(e)));
      if (has("pct")) tr.appendChild(el("td", "", g.pct(e)));
      if (hasWL) tr.appendChild(el("td", "", gb(e)));
      tbl.appendChild(tr);
    });
    return tbl;
  }

  function standingsTable(league, data) {
    const blocks = findStandingsBlock(league, data);
    if (!blocks.length) return null;

    if (league.standings === "division" && blocks.some(b => b.name)) {
      const wrap = el("div", "standings-conferences");
      const conferences = new Map();
      blocks.forEach(block => {
        const conference = block.parentName || "Standings";
        if (!conferences.has(conference)) conferences.set(conference, []);
        conferences.get(conference).push(block);
      });
      conferences.forEach((groups, conference) => {
        const conferenceBox = el("section", "standings-conference");
        conferenceBox.appendChild(el("div", "conference-head", esc(conference)));
        groups.forEach(block => {
          const divisionBox = el("div", "standings-division");
          const shortName = block.name.indexOf(conference) === 0
            ? block.name.slice(conference.length).trim() + " Division"
            : block.name;
          divisionBox.appendChild(el("div", "division-head", esc(shortName)));
          divisionBox.appendChild(standingsRowsTable(block, league));
          conferenceBox.appendChild(divisionBox);
        });
        wrap.appendChild(conferenceBox);
      });
      return wrap;
    }

    // Single-table leagues (every soccer league, WNBA, NWSL...) still need the
    // .standings-division wrapper, not just the division path above: that class
    // is what carries overflow-x:auto, and table.stand has a min-width at the
    // narrow breakpoints. Returned bare, the table pushed the whole document
    // wider than the viewport on phones instead of scrolling within itself.
    const soloBox = el("div", "standings-division");
    soloBox.appendChild(standingsRowsTable(blocks[0], league));
    return soloBox;
  }

  // ---- Playoff / qualification implications (Spotlight "biggest games") --
  // "In the mix" = within IMPLICATION_THRESHOLD rank positions of a cutoff
  // line (playoff/continental-qualification from the top, relegation from
  // the bottom) — a rank-distance proxy for games/points back that works
  // identically whether the league sorts by win-pct or by points, so one
  // formula covers every league. Standings load non-blocking and separately
  // from the scoreboard (see loadStandings), so this only has an answer once
  // a league's standings have actually arrived; renderSpotlight() re-runs
  // each time a league's standings resolve so it can pick that up.
  const IMPLICATION_THRESHOLD = 3;
  const standingsRawByLeague = new Map();

  function sortedPool(entries, league) {
    if (!entries.length) return [];
    const g = statGetter({ entries });
    // Same "points" caveat as standingsRowsTable: only soccer's points stat
    // is a real standings points table — some other sports (confirmed WNBA)
    // carry their own unrelated stat also named "points".
    const isSoccer = league && league.key.indexOf("soccer/") === 0;
    const usePts = isSoccer && g.points(entries[0]) !== "";
    return entries.slice().sort((a, b) => {
      if (usePts) {
        const pa = parseInt(g.points(a) || "0", 10), pb = parseInt(g.points(b) || "0", 10);
        if (pa !== pb) return pb - pa;
      }
      const pcta = parseFloat(g.pct(a) || "0"), pctb = parseFloat(g.pct(b) || "0");
      if (pcta !== pctb) return pctb - pcta;
      return parseInt(g.wins(b) || "0", 10) - parseInt(g.wins(a) || "0", 10);
    });
  }

  // Builds the pool(s) a league's playoff/qualification cutoff is actually
  // drawn against — independent of how the standings TABLE renders. E.g. MLB's
  // wild card race spans all three divisions in a league, so the pool is
  // AL/NL, not each division's own table.
  function buildPlayoffPools(league, rawData) {
    if (!league.playoffPoolMode || !rawData) return null;
    const pools = new Map(); // groupKey -> deduped raw entries
    const addTo = (key, entries) => {
      if (!pools.has(key)) pools.set(key, []);
      const list = pools.get(key);
      const seen = new Set(list.map(e => e.team && (e.team.id || e.team.displayName)));
      entries.forEach(e => {
        const id = e.team && (e.team.id || e.team.displayName);
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        list.push(e);
      });
    };

    if (league.playoffPoolMode === "whole") {
      findStandingsBlock({ standings: "overall" }, rawData).forEach(b => addTo("", b.entries));
    } else if (league.playoffPoolMode === "confDirect") {
      // MLS/USL: the conference is the top level already (no division layer
      // beneath it). findStandingsBlock() would merge these into one table
      // for an "overall" league, so walk manually and keep them separate —
      // and skip the many "...Playoffs - ..." bracket nodes ESPN also
      // returns alongside the real regular-season conference tables.
      const found = [];
      (function walk(node, depth) {
        if (!node || depth > 5) return;
        if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
        if (typeof node !== "object") return;
        if (node.standings && Array.isArray(node.standings.entries) && node.standings.entries.length && node.name) {
          found.push({ name: node.name, entries: node.standings.entries });
        }
        if (Array.isArray(node.children)) node.children.forEach(c => walk(c, depth + 1));
        if (Array.isArray(node.standings)) node.standings.forEach(s => walk(s, depth + 1));
      })(rawData, 0);
      found.filter(b => /^(Eastern|Western) Conference$/.test(b.name))
        .forEach(b => addTo(b.name, b.entries));
    } else if (league.playoffPoolMode === "confFromDiv") {
      // MLB/NFL: pool by conference (division blocks' parentName), not by division.
      findStandingsBlock({ standings: "division" }, rawData).forEach(b => addTo(b.parentName || "", b.entries));
    }

    const result = new Map();
    pools.forEach((entries, key) => result.set(key, sortedPool(entries, league)));
    return result;
  }

  // Early in a season, 1-2 games played bunches every team near the top of
  // the table by sheer small-sample noise — that's not a real "close to the
  // cutoff" signal, just an artifact of how little data exists yet. Require
  // a team to have played at least this many games before its rank distance
  // means anything.
  const MIN_GAMES_FOR_IMPLICATIONS = 5;

  function teamRank(pools, teamName) {
    if (!pools) return null;
    for (const list of pools.values()) {
      const idx = list.findIndex(e => e.team && e.team.displayName === teamName);
      if (idx < 0) continue;
      const g = statGetter({ entries: list });
      const e = list[idx];
      const gamesPlayed = parseInt(g.wins(e) || "0", 10) + parseInt(g.losses(e) || "0", 10) + parseInt(g.ties(e) || "0", 10);
      return { rank: idx + 1, poolSize: list.length, gamesPlayed };
    }
    return null;
  }

  // Returns the closest rank-distance to a cutoff line across both teams and
  // every implication zone (0 = sitting exactly on the cutoff), or null if
  // neither team is implicated at all. The distance lets Spotlight rank
  // implicated games by how tight the race actually is, rather than treating
  // every implicated game as equally "big" — see MAX_IMPLICATION_SPOTLIGHT_GAMES.
  function playoffImplicationDistance(league, game, pools) {
    if (!pools || !league.implicationZones || !league.implicationZones.length) return null;
    // "Upcoming" implies not-yet-decided; live games are already covered by
    // the state === "in" check in renderSpotlight, so this only needs to add
    // scheduled games — a game that's already final has no more implications
    // left to play out today.
    if (game.state === "post") return null;
    let best = null;
    [game.away.name, game.home.name].forEach(name => {
      const info = teamRank(pools, name);
      if (!info || info.gamesPlayed < MIN_GAMES_FOR_IMPLICATIONS) return;
      league.implicationZones.forEach(z => {
        const cutoffRank = z.fromTop ? z.count : (info.poolSize - z.count + 1);
        const distance = Math.abs(info.rank - cutoffRank);
        if (distance <= IMPLICATION_THRESHOLD && (best == null || distance < best)) best = distance;
      });
    });
    return best;
  }

  async function loadStandings(league) {
    // Best-effort league standings via the /apis/v2/ standings endpoint
    // (needs ?season). Each call is timeout-wrapped so a hung/blocked host can
    // never freeze the page; if nothing comes back the scoreboard (with
    // per-team records) still shows. Try current season, then previous.
    const detailLevel = league.standings === "division" ? "&level=3" : "";
    const paths = [
      ESPN_STAND + league.key + "/standings?season=" + SEASON + detailLevel,
      ESPN_STAND + league.key + "/standings?season=" + (SEASON - 1) + detailLevel,
    ];
    for (const url of paths) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), STANDINGS_TIMEOUT);
        const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) continue;
        const d = await r.json();
        standingsRawByLeague.set(league.key, d);
        const tbl = standingsTable(league, d);
        if (tbl) return tbl;
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // ---- Fetch + render scoreboards ---------------------------------------
  const gameRank = game => (game.isMyGame ? 0 : 1)
    + (game.state === "in" ? 0 : game.state === "pre" ? 1 : 2) * 0.01;

  async function fetchGames(league) {
    const url = ESPN + league.key + "/scoreboard?limit=1000&_=" + Date.now();
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const response = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = await response.json();
      const games = (data.events || []).map(event => parseEvent(event, league.key, league.label)).filter(Boolean);
      if (league.key === "baseball/mlb") {
        const myDates = games.filter(g => g.isMyGame && g.dateET).map(g => g.dateET);
        if (myDates.length) {
          await fetchMlbGamePks(myDates);
          games.forEach(g => {
            if (g.isMyGame && mlbGamePkCache.has(g.dateET)) {
              g.gameLink = "https://www.mlb.com/tv/g" + mlbGamePkCache.get(g.dateET) + "/";
            }
          });
        }
      }
      return games;
    } catch (e) {
      return null;
    }
  }

  function fillGameGrid(grid, games) {
    grid.innerHTML = "";
    if (games.length) {
      games.sort((a, b) => gameRank(a) - gameRank(b));
      games.forEach(game => grid.appendChild(gameCard(game)));
    } else {
      grid.appendChild(el("div", "empty", "No games scheduled right now (offseason or between fixtures)."));
    }
  }

  // ---- Fetch + render one league ---------------------------------------
  async function loadLeague(league) {
    const section = el("section", "league");
    section.dataset.leagueKey = league.key;
    const head = el("div", "league-head");
    head.appendChild(el("div", "league-name", esc(league.label)));
    const sub = league.myTeams.join(", ");
    if (sub) head.appendChild(el("div", "league-sub", "★ " + esc(sub)));
    section.appendChild(head);

    // Scoreboard (the priority — never blocked by standings)
    const fetchedGames = await fetchGames(league);
    const games = fetchedGames == null ? [] : fetchedGames;
    if (fetchedGames != null) gamesByLeague.set(league.key, fetchedGames);

    const grid = el("div", "games-grid");
    grid.dataset.leagueKey = league.key;
    fillGameGrid(grid, games);
    section.appendChild(grid);

    // Standings slot — filled asynchronously, non-blocking.
    const slot = el("div", "standings-slot");
    section.appendChild(slot);
    if (league.standings) {
      loadStandings(league).then(tbl => {
        if (tbl) {
          slot.appendChild(el("div", "standings-head", esc(league.label + " Standings")));
          slot.appendChild(tbl);
        }
        // Standings for this league just became available (or were attempted) —
        // re-check Spotlight's playoff-implications boost, which depends on them.
        renderSpotlight();
      }).catch(() => {});
    }
    return section;
  }

  // On pages with no #board (the Betting page), NFL Odds still needs
  // gamesByLeague("football/nfl") populated, without fetching or building
  // every other league's board section.
  async function refreshNflGamesForOdds() {
    const nfl = LEAGUES.find(l => l.key === "football/nfl");
    const games = await fetchGames(nfl);
    if (games != null) gamesByLeague.set(nfl.key, games);
  }

  // ---- Master render ----------------------------------------------------
  async function render() {
    const board = $("#board");
    if (board) {
      const list = activeFilter === "all"
        ? LEAGUES
        : LEAGUES.filter(l => l.key === activeFilter);

      board.innerHTML = "";
      list.forEach(() => board.appendChild(el("div", "skeleton")));

      const results = await Promise.allSettled(list.map(loadLeague));
      board.innerHTML = "";
      let any = false;
      results.forEach(r => {
        if (r.status === "fulfilled" && r.value) { board.appendChild(r.value); any = true; }
      });
      if (!any) board.appendChild(el("div", "error", "Couldn't load any league. Check your connection and refresh."));
      renderSpotlight();
    } else if ($("#nflOdds")) {
      await refreshNflGamesForOdds();
    }
    renderValueScreen();
    renderRestDays();
    renderNflOdds();
    loadNflOdds(); // gamesByLeague("football/nfl") just refreshed above — pick up new/dropped games
    stamp();
  }

  function stamp() {
    const updated = $("#updated");
    if (!updated) return;
    const now = new Date();
    const txt = now.toLocaleString("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit",
      weekday: "short", month: "short", day: "numeric", timeZoneName: "short"
    });
    updated.textContent = "Updated " + txt;
  }

  // ---- Filters ----------------------------------------------------------
  function buildFilters() {
    const nav = $("#filters");
    if (!nav) return; // no league filter on this page (e.g. Models)
    nav.innerHTML = "";
    const mk = (key, label) => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.setAttribute("aria-pressed", key === activeFilter ? "true" : "false");
      b.addEventListener("click", () => {
        activeFilter = key;
        try { localStorage.setItem(FILTER_STORAGE_KEY, key); } catch (e) { /* private mode, etc. */ }
        [...nav.children].forEach(c => c.setAttribute("aria-pressed", c === b ? "true" : "false"));
        renderValueScreen();
        loadValueScreen();
        renderRestDays();
        loadRestDays();
        renderNflOdds();
        loadNflOdds();
        render();
      });
      return b;
    };
    nav.appendChild(mk("all", "All"));
    LEAGUES.forEach(l => nav.appendChild(mk(l.key, l.label)));
  }

  // ---- MLB Value Screen (model vs market) -------------------------------
  // Moved here from The McBoop Daily when its Sports tab was retired — this is
  // now the only place the screen exists. Market lines come from /api/odds
  // (the BetExplorer proxy in _worker.js, since the browser can't fetch
  // betexplorer.com). The model is computed IN THE BROWSER from
  // statsapi.mlb.com (CORS-open): the same v2 starter- and park-adjusted
  // model scripts/daily_mlb_model.py (in the live-sports-feeds skill) runs.
  const STATS = "https://statsapi.mlb.com/api/v1";
  const VALUE_REFRESH_MS = 6 * 60 * 1000;
  const HOME_ADJ = 4.0;   // points added to the home team's model%
  const EDGE_MIN = 4.0;   // points of edge required to call VALUE/FADE
  const CHECK_GAP = 10.0; // |edge| above this -> CHECK (model blind spot)
  const MIN_IP = 20.0;    // starter needs this many IP before RA9 is trusted
  const pitcherRa9Cache = new Map();

  // Park factors (runs, 100 = neutral), keyed by the HOME team's statsapi
  // abbreviation — a multi-year composite from public park-factor aggregators
  // (FanGraphs Guts / RotoWire), fixed like the Pythagenpat constant below
  // rather than fetched live (no free CORS-open park-factor API exists).
  // Refresh occasionally; not season-recalculated automatically.
  const PARK_FACTOR = {
    ATH: 108, ATL: 98, AZ: 102, BAL: 96, BOS: 105, CHC: 91, CIN: 104, CLE: 102, COL: 133, CWS: 96,
    DET: 105, HOU: 99, KC: 105, LAA: 100, LAD: 98, MIA: 106, MIL: 97, MIN: 106, NYM: 95, NYY: 98,
    PHI: 106, PIT: 101, SD: 95, SEA: 81, SF: 90, STL: 97, TB: 100, TEX: 95, TOR: 99, WSH: 102,
  };

  // Pythagenpat exponent (the Smyth/Patriot refinement over a fixed
  // Pythagorean exponent): exponent = (total expected runs in the game,
  // both teams combined) ^ 0.287, instead of staying fixed at 1.83 — at a
  // neutral park (factor 100) this lands almost exactly back on 1.83, so it
  // only pulls away from that baseline when the park does. A pitcher's park
  // lowers the exponent, compressing win probabilities toward 50/50 (fewer
  // expected runs means more of the outcome is noise); a hitter's park
  // raises it, spreading them apart (more runs to work with means the
  // better team's edge shows up more reliably). This is also the ONLY place
  // park factor can matter here — applying it as a flat multiplier to both
  // teams' expected runs would cancel out in the homeExp/awayExp ratio
  // below, so it has to act on the exponent instead.
  function pythagenpatExp(rpg) {
    return Math.pow(rpg, 0.287);
  }

  async function fetchJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  function r1(x) { return Math.round(x * 10) / 10; }

  function etTodayStr() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
    } catch (e) {
      const d = new Date();
      const p2 = n => (n < 10 ? "0" : "") + n;
      return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
    }
  }

  // Season Pythagorean win expectancy — the v1 fallback used when a probable
  // starter is unannounced or hasn't thrown MIN_IP yet. Exponent is passed in
  // (see pythagenpatExp) rather than a fixed constant.
  function pyth(rs, ra, exp) {
    if (!rs || !ra) return null;
    return 1.0 / (1.0 + Math.pow(ra / rs, exp));
  }

  async function pitcherRa9(pid) {
    if (pitcherRa9Cache.has(pid)) return pitcherRa9Cache.get(pid);
    let ra9 = null;
    const d = await fetchJSON(STATS + "/people/" + pid +
      "/stats?stats=season&group=pitching&season=" + new Date().getFullYear() +
      "&sportId=1&gameType=R");
    try {
      const splits = (d && d.stats && d.stats[0] && d.stats[0].splits) || [];
      if (splits.length) {
        const st = splits[0].stat || {};
        const ip = parseFloat(st.inningsPitched);
        if (isFinite(ip) && ip >= MIN_IP) {
          const runs = st.runs != null ? st.runs : st.earnedRuns;
          if (runs != null) ra9 = runs * 9.0 / ip;
        }
      }
    } catch (e) {
      ra9 = null;
    }
    pitcherRa9Cache.set(pid, ra9);
    return ra9;
  }

  // Full v2 screen for today (ET): market from /api/odds, model from statsapi.
  async function computeValueScreen() {
    const today = etTodayStr();
    const year = today.slice(0, 4);
    const [sched, stand, odds] = await Promise.all([
      fetchJSON(STATS + "/schedule?sportId=1&date=" + today + "&hydrate=team,probablePitcher"),
      fetchJSON(STATS + "/standings?leagueId=103,104&season=" + year + "&standingsTypes=regularSeason"),
      fetchJSON("/api/odds?date=" + today),
    ]);

    const stMap = {};
    let rsTot = 0, gTot = 0;
    ((stand && stand.records) || []).forEach(rec => (rec.teamRecords || []).forEach(tr => {
      const team = tr.team || {};
      stMap[team.id] = { rs: tr.runsScored, ra: tr.runsAllowed, g: tr.gamesPlayed };
      if (tr.runsScored && tr.gamesPlayed) { rsTot += tr.runsScored; gTot += tr.gamesPlayed; }
    }));
    const lg9 = gTot ? rsTot / gTot : 4.50;

    const board = {};
    ((odds && odds.games) || []).forEach(g => {
      const k = g.away + "|" + g.home;
      if (!(k in board)) board[k] = g;
    });

    const games = [];
    for (const day of (sched && sched.dates) || []) {
      for (const g of day.games || []) {
        const a = g.teams.away, h = g.teams.home;
        const at = a.team || {}, ht = h.team || {};
        const gd = g.gameDate || "";
        const row = {
          away: at.name || "", home: ht.name || "",
          awayAbbr: at.abbreviation || "", homeAbbr: ht.abbreviation || "",
          time: gd ? new Date(gd).toLocaleTimeString("en-US",
            { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) : "",
          awaySt: (a.probablePitcher && { id: a.probablePitcher.id, name: a.probablePitcher.fullName }) || null,
          homeSt: (h.probablePitcher && { id: h.probablePitcher.id, name: h.probablePitcher.fullName }) || null,
        };

        const mkt = board[row.away + "|" + row.home];
        if (!mkt) { row.call = "NO MARKET LINE"; games.push(row); continue; }
        row.away_ml = mkt.away_ml;
        row.home_ml = mkt.home_ml;

        // De-vig the market into a fair pair that sums to 100%.
        const aF = mkt.away_implied_pct, hF = mkt.home_implied_pct;
        const awayFair = aF / (aF + hF) * 100;
        row.awayFair = r1(awayFair);
        row.homeFair = r1(100 - awayFair);

        const sa = stMap[at.id] || {}, sh = stMap[ht.id] || {};
        const ar = row.awaySt ? await pitcherRa9(row.awaySt.id) : null;
        const hr = row.homeSt ? await pitcherRa9(row.homeSt.id) : null;
        const pf = (PARK_FACTOR[row.homeAbbr] || 100) / 100;
        let awayModel, homeModel, exp;
        if (ar != null && hr != null && sa.rs && sh.rs && sa.g && sh.g) {
          // v2: matchup-adjusted expected runs (mirrored pair, sums to 100%),
          // scaled by the home park's run-scoring factor
          const awayExp = (sa.rs / sa.g) * (hr / lg9) * pf;
          const homeExp = (sh.rs / sh.g) * (ar / lg9) * pf;
          exp = pythagenpatExp(awayExp + homeExp);
          const pA = 1.0 / (1.0 + Math.pow(homeExp / awayExp, exp));
          awayModel = pA * 100 - HOME_ADJ;
          homeModel = (1 - pA) * 100 + HOME_ADJ;
          row.adj = {
            away: row.awaySt.name, awayRa9: r1(ar),
            home: row.homeSt.name, homeRa9: r1(hr), lg: r1(lg9),
          };
        } else {
          // v1 fallback: independent season Pythagorean per team, using the
          // park factor (via league-average RPG) as the exponent's only input
          exp = pythagenpatExp(2 * lg9 * pf);
          const ap = pyth(sa.rs, sa.ra, exp), hp = pyth(sh.rs, sh.ra, exp);
          if (ap == null || hp == null) { row.call = "NO MODEL"; games.push(row); continue; }
          awayModel = ap * 100 - HOME_ADJ;
          homeModel = hp * 100 + HOME_ADJ;
        }
        row.park = { abbr: row.homeAbbr, factor: Math.round(pf * 100), exp: r1(exp) };

        const awayEdge = r1(awayModel - row.awayFair);
        const homeEdge = r1(homeModel - row.homeFair);
        // callSide records which team the call is about ("away"/"home"/null for
        // CHECK and NO EDGE, which aren't about either side specifically) so
        // explainCall() can pull that team's own numbers without re-parsing
        // the "VALUE CIN" string.
        let call, callSide = null;
        if (Math.max(Math.abs(awayEdge), Math.abs(homeEdge)) >= CHECK_GAP) call = "CHECK";
        else if (awayEdge >= EDGE_MIN) { call = "VALUE " + row.awayAbbr; callSide = "away"; }
        else if (homeEdge >= EDGE_MIN) { call = "VALUE " + row.homeAbbr; callSide = "home"; }
        else if (awayEdge <= -EDGE_MIN) { call = "FADE " + row.awayAbbr; callSide = "away"; }
        else if (homeEdge <= -EDGE_MIN) { call = "FADE " + row.homeAbbr; callSide = "home"; }
        else call = "NO EDGE";

        row.awayModel = r1(awayModel);
        row.homeModel = r1(homeModel);
        row.awayEdge = awayEdge;
        row.homeEdge = homeEdge;
        row.call = call;
        row.callSide = callSide;
        games.push(row);
      }
    }
    return games;
  }

  // ---- MLB Days Rest (soft factor, no model) -----------------------------
  // Lives on the Betting page (the Value Screen model itself is on Models)
  // — this doesn't feed the model, it's just a schedule-fatigue fact worth
  // tracking alongside it. One range fetch over the trailing week covers
  // every team's last game date at once, so no per-team API calls needed.
  const REST_WINDOW_DAYS = 8; // deep enough to bridge a normal off-day or two

  function dateStrAddDays(dateStr, delta) {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  async function computeRestDays() {
    const today = etTodayStr();
    const startDate = dateStrAddDays(today, -REST_WINDOW_DAYS);
    const sched = await fetchJSON(STATS + "/schedule?sportId=1&startDate=" + startDate +
      "&endDate=" + today + "&hydrate=team");

    const lastGame = new Map(); // teamId -> most recent game date before today
    const todayGames = [];
    for (const day of (sched && sched.dates) || []) {
      const gameDate = day.date;
      for (const g of day.games || []) {
        const away = g.teams.away.team || {}, home = g.teams.home.team || {};
        if (gameDate === today) {
          todayGames.push({
            away: away.name || "", home: home.name || "",
            awayAbbr: away.abbreviation || "", homeAbbr: home.abbreviation || "",
            awayId: away.id, homeId: home.id,
          });
          continue;
        }
        if (gameDate > today) continue;
        [away, home].forEach(team => {
          if (team.id == null) return;
          const prev = lastGame.get(team.id);
          if (!prev || gameDate > prev) lastGame.set(team.id, gameDate);
        });
      }
    }

    // Days since that team's last game, minus 1 — played yesterday (1 day
    // apart) means a true back-to-back, i.e. 0 days of rest in between.
    function restFor(teamId) {
      const last = lastGame.get(teamId);
      if (last == null) return null; // no prior game in the window
      const days = Math.round((Date.parse(today) - Date.parse(last)) / 86400000);
      return days - 1;
    }

    return todayGames.map(g => ({
      away: g.away, home: g.home, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
      awayRest: restFor(g.awayId), homeRest: restFor(g.homeId),
    }));
  }

  function restDaysRowsHtml() {
    const games = restDays && restDays.games;
    if (!games) {
      return '<tr><td colspan="3" class="value-empty">' +
        (restDaysLoading ? "Loading live slate&hellip;" : "Live slate unavailable right now.") +
        "</td></tr>";
    }
    if (!games.length) {
      return '<tr><td colspan="3" class="value-empty">No MLB games scheduled today.</td></tr>';
    }
    function cell(rest) {
      if (rest == null) return "—";
      return rest <= 0 ? '<span class="value-note">' + rest + " (back-to-back)</span>" : String(rest);
    }
    return games.map(r => {
      const match = "<strong>" + esc(r.awayAbbr) + " @ " + esc(r.homeAbbr) + "</strong>";
      return "<tr><td>" + match + "</td><td>" + cell(r.awayRest) + "</td><td>" + cell(r.homeRest) +
        "</td></tr>";
    }).join("");
  }

  // Same "rides along with the MLB filter" rule as the Value Screen.
  function restDaysVisible() {
    return activeFilter === "all" || activeFilter === "baseball/mlb";
  }

  function renderRestDays() {
    const panel = $("#restDays");
    if (!panel) return;
    const visible = restDaysVisible();
    panel.style.display = visible ? "" : "none";
    if (!visible) return;

    $("#restDaysBody").innerHTML = restDaysRowsHtml();
    const meta = $("#restDaysMeta");
    const games = restDays && restDays.games;
    if (!games) {
      meta.textContent = restDaysLoading ? "Loading slate…" : "Slate unavailable";
      return;
    }
    const b2b = games.filter(g => g.awayRest === 0 || g.homeRest === 0).length;
    meta.textContent = games.length + " games · " + b2b + " on a back-to-back";
  }

  async function loadRestDays() {
    if (!$("#restDays")) return; // panel doesn't exist on this page (e.g. Games)
    if (restDaysLoading || !restDaysVisible()) return;
    restDaysLoading = true;
    renderRestDays();
    try {
      const games = await computeRestDays();
      restDays = { games, fetchedAt: Date.now() };
    } catch (e) {
      // Keep showing the last good slate rather than blanking the panel.
    } finally {
      restDaysLoading = false;
    }
    renderRestDays();
  }

  function callClass(call) {
    if (call.indexOf("VALUE") === 0) return "call--value";
    if (call.indexOf("FADE") === 0) return "call--fade";
    if (call === "CHECK") return "call--check";
    return "call--none";
  }

  // Plain-language reason for this row's Call, so "VALUE CIN" or "CHECK"
  // doesn't require re-deriving the math by eye.
  function explainCall(row) {
    const driver = row.adj
      ? "starters " + row.adj.away + " (RA9 " + row.adj.awayRa9 + ") vs " +
        row.adj.home + " (RA9 " + row.adj.homeRa9 + ", league avg " + row.adj.lg + ")"
      : "season-long Pythagorean win expectancy — starter data was thin or unannounced";
    const parkNote = row.park
      ? " and " + row.park.abbr + "'s park factor (" + row.park.factor + ", exponent " + row.park.exp + ")"
      : "";
    if (row.callSide) {
      const away = row.callSide === "away";
      const abbr = away ? row.awayAbbr : row.homeAbbr;
      const model = away ? row.awayModel : row.homeModel;
      const fair = away ? row.awayFair : row.homeFair;
      const edge = away ? row.awayEdge : row.homeEdge;
      const isValue = row.call.indexOf("VALUE") === 0;
      return abbr + "'s model% (" + model + ") " + (isValue ? "beats" : "trails") +
        " the market's fair% (" + fair + ") by " + Math.abs(edge).toFixed(1) + " points, past the " +
        (isValue ? "+" : "−") + EDGE_MIN + " threshold, based on " + driver + parkNote + ".";
    }
    if (row.call === "CHECK") {
      const gap = Math.max(Math.abs(row.awayEdge), Math.abs(row.homeEdge)).toFixed(1);
      return "Model and market disagree by " + gap + " points — beyond the ±" + CHECK_GAP +
        " sanity limit, which usually means the model is off (based on " + driver + parkNote +
        ") rather than a real edge. Worth a second look before trusting either number.";
    }
    return "Model (" + row.awayModel + "/" + row.homeModel + ") and market (" + row.awayFair + "/" +
      row.homeFair + ") are within " + EDGE_MIN + " points of each other, based on " + driver + parkNote +
      " — no disagreement worth flagging.";
  }

  function valueSlateRowsHtml() {
    const games = valueScreen && valueScreen.games;
    if (!games) {
      return '<tr><td colspan="6" class="value-empty">' +
        (valueScreenLoading ? "Loading live slate&hellip;" : "Live slate unavailable right now.") +
        "</td></tr>";
    }
    if (!games.length) {
      return '<tr><td colspan="6" class="value-empty">No MLB games scheduled today.</td></tr>';
    }
    // Biggest disagreement with the market first — that is the whole point.
    const sorted = games.slice().sort((x, y) =>
      Math.max(Math.abs(y.awayEdge || 0), Math.abs(y.homeEdge || 0)) -
      Math.max(Math.abs(x.awayEdge || 0), Math.abs(x.homeEdge || 0)));

    return sorted.map(r => {
      const match = "<strong>" + esc(r.awayAbbr) + " @ " + esc(r.homeAbbr) + "</strong>" +
        (r.time ? ' <span class="value-note">' + esc(r.time) + "</span>" : "");
      if (!r.away_ml) {
        return "<tr><td>" + match + '</td><td colspan="4" class="value-note">no market line yet</td>' +
          '<td><span class="call call--none">' + esc(r.call) + "</span></td></tr>";
      }
      const hot = Math.max(Math.abs(r.awayEdge || 0), Math.abs(r.homeEdge || 0)) >= EDGE_MIN;
      let html = "<tr>" +
        "<td>" + match + "</td>" +
        "<td>" + esc(r.away_ml) + "/" + esc(r.home_ml) + "</td>" +
        "<td>" + esc(r.awayFair) + "/" + esc(r.homeFair) + "</td>" +
        "<td>" + esc(r.awayModel) + "/" + esc(r.homeModel) + "</td>" +
        '<td class="' + (hot ? "edge-hot" : "") + '">' + esc(r.awayEdge) + "/" + esc(r.homeEdge) + "</td>" +
        '<td><span class="call ' + callClass(r.call) + '">' + esc(r.call) + "</span></td>" +
        "</tr>";
      html += '<tr class="value-starters"><td colspan="6"><span class="value-note">' +
        esc(explainCall(r)) + "</span></td></tr>";
      return html;
    }).join("");
  }

  // The screen is MLB-only, so it rides along with the "All" and MLB filters
  // and hides for every other league.
  function valueScreenVisible() {
    return activeFilter === "all" || activeFilter === "baseball/mlb";
  }

  function renderValueScreen() {
    const panel = $("#valueScreen");
    if (!panel) return;
    const visible = valueScreenVisible();
    panel.style.display = visible ? "" : "none";
    if (!visible) return;

    $("#valueSlateBody").innerHTML = valueSlateRowsHtml();
    const meta = $("#valueScreenMeta");
    const games = valueScreen && valueScreen.games;
    if (!games) {
      meta.textContent = valueScreenLoading ? "Loading slate…" : "Slate unavailable";
      return;
    }
    const priced = games.filter(g => g.away_ml).length;
    const calls = games.filter(g => g.call &&
      (g.call.indexOf("VALUE") === 0 || g.call.indexOf("FADE") === 0)).length;
    meta.textContent = games.length + " games · " + priced + " priced · " + calls + " calls";
  }

  async function loadValueScreen() {
    if (!$("#valueScreen")) return; // panel doesn't exist on this page (e.g. Games)
    if (valueScreenLoading || !valueScreenVisible()) return;
    valueScreenLoading = true;
    renderValueScreen();
    try {
      const games = await computeValueScreen();
      valueScreen = { games, fetchedAt: Date.now() };
    } catch (e) {
      // Keep showing the last good slate rather than blanking the panel.
    } finally {
      valueScreenLoading = false;
    }
    renderValueScreen();
  }

  // ---- NFL Odds (market only, no model) ----------------------------------
  // No MLB-style model here: there's no equivalent "starter-adjusted" stat to
  // build one from, and BetExplorer (the MLB market source) has no NFL/
  // American football section at all. Odds instead come straight from ESPN's
  // own summary endpoint (site.api.espn.com, CORS-open, confirmed — the same
  // host every other fetch on this page already uses), which carries a
  // DraftKings moneyline via `pickcenter`. Games come from gamesByLeague
  // (already fetched for the NFL board section) rather than a second
  // schedule call.
  function formatAmericanOdds(value) {
    const odds = Number(value);
    if (!Number.isFinite(odds) || odds === 0) return null;
    return (odds > 0 ? "+" : "") + String(odds);
  }
  function americanImpliedPercent(oddsText) {
    const odds = Number(String(oddsText == null ? "" : oddsText).replace(/[^0-9+.-]/g, ""));
    if (!Number.isFinite(odds) || odds === 0) return null;
    return odds > 0 ? 100 / (odds + 100) * 100 : Math.abs(odds) / (Math.abs(odds) + 100) * 100;
  }

  async function computeNflOdds() {
    const games = (gamesByLeague.get("football/nfl") || []).filter(g => g.state !== "post");
    const rows = await Promise.all(games.map(async g => {
      const row = {
        away: g.away.abbr, home: g.home.abbr, kickoffMs: g.kickoffMs,
        time: g.state === "in" ? g.statusText : g.startTime,
      };
      const summary = await fetchJSON(ESPN + "football/nfl/summary?event=" + g.eventId);
      const market = summary && summary.pickcenter && summary.pickcenter[0];
      if (!market) return row;
      row.awayMl = formatAmericanOdds(market.awayTeamOdds && market.awayTeamOdds.moneyLine);
      row.homeMl = formatAmericanOdds(market.homeTeamOdds && market.homeTeamOdds.moneyLine);
      const aImp = americanImpliedPercent(row.awayMl);
      const hImp = americanImpliedPercent(row.homeMl);
      if (aImp != null && hImp != null) {
        // De-vig into a fair pair that sums to 100%, same as the MLB screen.
        row.awayPct = r1(aImp / (aImp + hImp) * 100);
        row.homePct = r1(100 - row.awayPct);
      }
      return row;
    }));
    // Chronological, not ESPN's default order (which groups by something else
    // entirely — a live game and a day-old Thursday game both ended up ahead
    // of Sunday's early slate). Any market-only odds panel added for another
    // sport later should sort the same way.
    return rows.sort((a, b) => (a.kickoffMs || 0) - (b.kickoffMs || 0));
  }

  function nflOddsRowsHtml() {
    const games = nflOdds && nflOdds.games;
    if (!games) {
      return '<tr><td colspan="3" class="value-empty">' +
        (nflOddsLoading ? "Loading live slate&hellip;" : "Live slate unavailable right now.") +
        "</td></tr>";
    }
    if (!games.length) {
      return '<tr><td colspan="3" class="value-empty">No NFL games this week.</td></tr>';
    }
    return games.map(r => {
      const match = "<strong>" + esc(r.away) + " @ " + esc(r.home) + "</strong>" +
        (r.time ? ' <span class="value-note">' + esc(r.time) + "</span>" : "");
      if (!r.awayMl) {
        return "<tr><td>" + match + '</td><td colspan="2" class="value-note">no market line yet</td></tr>';
      }
      return "<tr><td>" + match + "</td><td>" + esc(r.awayMl) + "/" + esc(r.homeMl) + "</td><td>" +
        (r.awayPct != null ? esc(r.awayPct) + "/" + esc(r.homePct) : "—") + "</td></tr>";
    }).join("");
  }

  // Same "rides along with the matching filter" rule as the MLB screen.
  function nflOddsVisible() {
    return activeFilter === "all" || activeFilter === "football/nfl";
  }

  function renderNflOdds() {
    const panel = $("#nflOdds");
    if (!panel) return;
    const visible = nflOddsVisible();
    panel.style.display = visible ? "" : "none";
    if (!visible) return;

    $("#nflOddsBody").innerHTML = nflOddsRowsHtml();
    const meta = $("#nflOddsMeta");
    const games = nflOdds && nflOdds.games;
    if (!games) {
      meta.textContent = nflOddsLoading ? "Loading slate…" : "Slate unavailable";
      return;
    }
    const priced = games.filter(g => g.awayMl).length;
    meta.textContent = games.length + " games · " + priced + " priced";
  }

  async function loadNflOdds() {
    if (!$("#nflOdds")) return; // panel doesn't exist on this page (e.g. Games)
    if (nflOddsLoading || !nflOddsVisible()) return;
    nflOddsLoading = true;
    renderNflOdds();
    try {
      const games = await computeNflOdds();
      nflOdds = { games, fetchedAt: Date.now() };
    } catch (e) {
      // Keep showing the last good slate rather than blanking the panel.
    } finally {
      nflOddsLoading = false;
    }
    renderNflOdds();
  }

  // ---- Adaptive score refresh -------------------------------------------
  function filteredLeagues() {
    return activeFilter === "all" ? LEAGUES : LEAGUES.filter(league => league.key === activeFilter);
  }

  async function refreshScores(leagues) {
    if (scoresRefreshInFlight || document.hidden || !leagues.length) return;
    scoresRefreshInFlight = true;
    try {
      const results = await Promise.allSettled(leagues.map(async league => {
        const grid = [...document.querySelectorAll(".games-grid")]
          .find(node => node.dataset.leagueKey === league.key);
        if (!grid) return false;
        const games = await fetchGames(league);
        if (games == null) return false;
        gamesByLeague.set(league.key, games);
        fillGameGrid(grid, games);
        return true;
      }));
      if (results.some(result => result.status === "fulfilled" && result.value)) {
        renderSpotlight();
        stamp();
      }
    } finally {
      scoresRefreshInFlight = false;
    }
  }

  function refreshLiveScores() {
    const live = filteredLeagues().filter(league =>
      (gamesByLeague.get(league.key) || []).some(game => game.state === "in"));
    return refreshScores(live);
  }

  function refreshAllScores() {
    return refreshScores(filteredLeagues());
  }

  // Odds and season stats move on the order of minutes, not seconds, so the
  // betting panels (MLB Value Screen, Days Rest, NFL Odds) get their own slow
  // timer rather than riding the score loops.
  function scheduleValueScreenRefresh() {
    if (valueTimer) clearInterval(valueTimer);
    valueTimer = setInterval(() => {
      if (!document.hidden) { loadValueScreen(); loadRestDays(); loadNflOdds(); }
    }, VALUE_REFRESH_MS);
  }

  // Live games get rapid, scoreboard-only updates. The slower full render
  // refreshes standings without making six standings requests every 5 seconds.
  function scheduleRefresh() {
    if (liveTimer) clearInterval(liveTimer);
    if (discoveryTimer) clearInterval(discoveryTimer);
    if (standingsTimer) clearInterval(standingsTimer);
    liveTimer = setInterval(refreshLiveScores, LIVE_SCORE_REFRESH_MS);
    discoveryTimer = setInterval(refreshAllScores, SCORE_DISCOVERY_REFRESH_MS);
    standingsTimer = setInterval(render, STANDINGS_REFRESH_MS);
  }

  function init() {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      if (saved && (saved === "all" || LEAGUES.some(l => l.key === saved))) activeFilter = saved;
    } catch (e) { /* private mode, etc. */ }
    buildFilters();
    const refreshBtn = $("#refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", async () => {
      await Promise.all([render(), loadValueScreen(), loadRestDays(), loadNflOdds()]);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshAllScores();
    });
    loadValueScreen();
    loadRestDays();
    render();
    scheduleRefresh();
    scheduleValueScreenRefresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
