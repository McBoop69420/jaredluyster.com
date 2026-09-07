/* McBoop Sports — live scoreboards + standings
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
  // implications" boost (see isPlayoffImplicated below):
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
  const LEAGUES = [
    { key: "baseball/mlb",    label: "MLB",              myTeams: ["Cincinnati Reds"],          standings: "division",
      playoffPoolMode: "confFromDiv", implicationZones: [{ count: 6, fromTop: true }] },
    { key: "soccer/usa.1",    label: "MLS",              myTeams: ["FC Cincinnati"],            standings: "overall",
      playoffPoolMode: "confDirect", implicationZones: [{ count: 9, fromTop: true }] },
    { key: "soccer/mex.1",    label: "Liga MX",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 8, fromTop: true }] },
    { key: "soccer/eng.1",    label: "Premier League",   myTeams: ["Liverpool"],                standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }] },
    { key: "soccer/esp.1",    label: "La Liga",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }] },
    { key: "soccer/ger.1",    label: "Bundesliga",       myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }] },
    { key: "soccer/ita.1",    label: "Serie A",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 6, fromTop: true }, { count: 3, fromTop: false }] },
    { key: "soccer/fra.1",    label: "Ligue 1",          myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 5, fromTop: true }, { count: 3, fromTop: false }] },
    { key: "soccer/uefa.champions", label: "UCL",         myTeams: [],                           standings: null,
      playoffPoolMode: null, implicationZones: [] },
    { key: "soccer/uefa.europa",    label: "UEL",         myTeams: [],                           standings: null,
      playoffPoolMode: null, implicationZones: [] },
    { key: "soccer/ned.1",    label: "Eredivisie",       myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 4, fromTop: true }, { count: 3, fromTop: false }] },
    { key: "soccer/usa.nwsl", label: "NWSL",             myTeams: ["Racing Louisville FC"],     standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 8, fromTop: true }] },
    { key: "soccer/usa.usl.1", label: "USL Championship", myTeams: ["Lexington SC"],             standings: "overall",
      playoffPoolMode: "confDirect", implicationZones: [{ count: 8, fromTop: true }] },
    { key: "football/nfl",    label: "NFL",              myTeams: ["Cincinnati Bengals"],       standings: "division",
      playoffPoolMode: "confFromDiv", implicationZones: [{ count: 7, fromTop: true }] },
    { key: "basketball/wnba", label: "WNBA",             myTeams: [],                           standings: "overall",
      playoffPoolMode: "whole", implicationZones: [{ count: 8, fromTop: true }] },
  ];

  // Substring patterns (lowercased) marking "my" teams, so we catch
  // display-name variants (e.g. "Lexington SC" vs "Lexington Sporting Club").
  const MY_PATTERNS = [
    "cincinnati reds", "fc cincinnati", "racing louisville", "lexington",
    "liverpool", "cincinnati bengals",
  ].map(s => s.toLowerCase());

  const LIVE_SCORE_REFRESH_MS = 5 * 1000;       // current live games: near pitch-by-pitch
  const SCORE_DISCOVERY_REFRESH_MS = 30 * 1000; // discover newly started games
  const STANDINGS_REFRESH_MS = 5 * 60 * 1000;   // standings do not need pitch-level polling
  const STANDINGS_TIMEOUT = 6000;               // give up on a hung standings host
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  const ESPN_CDN = "https://cdn.site.api.espn.com/apis/site/v2/sports/";
  // Standings live on the /apis/v2/ path (NOT /apis/site/v2/) and need a season.
  // Structure: top-level `children[]` are league/conference nodes, each with a
  // `standings.entries` list. Verified working against baseball/mlb + soccer.
  const ESPN_STAND = "https://site.api.espn.com/apis/v2/sports/";
  const SEASON = new Date().getFullYear();

  let activeFilter = "all";
  let liveTimer = null;
  let discoveryTimer = null;
  let standingsTimer = null;
  let valueTimer = null;
  let scoresRefreshInFlight = false;
  let paperBetsData = null;
  let paperBetsLoadError = false;
  let paperBetHistoryFilter = "all";
  let paperBetHistorySearch = "";
  let valueScreen = null;          // { games: [...], fetchedAt } for today (ET)
  let valueScreenLoading = false;
  const gamesByLeague = new Map();
  const paperBetMarkets = new Map();
  const paperBetMarketRequests = new Map();
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

  // ---- Live paper-bet grading -------------------------------------------
  function normalizedTeamName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function teamMatchesSelection(team, selection) {
    const pick = normalizedTeamName(selection);
    if (!pick || !team) return false;
    const names = [team.name, team.abbr].map(normalizedTeamName).filter(Boolean);
    return names.some(name => name === pick || name.includes(pick) || pick.includes(name));
  }
  function americanLineWinUnits(line, stake) {
    const odds = Number(String(line || "").replace(/[^0-9+.-]/g, ""));
    const units = Number.parseFloat(stake) || 1;
    if (!Number.isFinite(odds) || odds === 0) return null;
    const profit = odds > 0 ? units * odds / 100 : units * 100 / Math.abs(odds);
    return Math.round(profit * 100) / 100;
  }
  function formatAmericanOdds(value) {
    const raw = String(value == null ? "" : value).trim().toUpperCase();
    if (!raw) return null;
    if (raw === "OFF" || raw === "SUSPENDED") return "OFF";
    const odds = Number(raw.replace(/[^0-9+.-]/g, ""));
    if (!Number.isFinite(odds) || odds === 0) return null;
    return (odds > 0 ? "+" : "") + String(odds);
  }
  function americanImpliedPercent(value) {
    const odds = Number(String(value == null ? "" : value).replace(/[^0-9+.-]/g, ""));
    if (!Number.isFinite(odds) || odds === 0) return null;
    const probability = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
    return Math.round(probability * 1000) / 10;
  }
  function parsePaperBetMarket(summary, bet, game) {
    if (!summary || !bet || !game || bet.marketType !== "moneyline") return null;
    const pickedSide = teamMatchesSelection(game.away, bet.selection) ? "away"
      : teamMatchesSelection(game.home, bet.selection) ? "home" : null;
    if (!pickedSide) return null;
    const market = (summary.pickcenter || []).find(item => item && item.moneyline);
    if (!market) return null;
    const sideMarket = (market.moneyline && market.moneyline[pickedSide]) || {};
    const phase = game.state === "in" ? "live" : game.state === "post" ? "close" : "current";
    const price = phase === "live" ? sideMarket.live : sideMarket.close;
    const odds = formatAmericanOdds(price && price.odds);

    let winProbability = null;
    const probabilities = summary.winprobability || [];
    const latest = probabilities.length ? probabilities[probabilities.length - 1] : null;
    if (latest && Number.isFinite(Number(latest.homeWinPercentage))) {
      const home = Number(latest.homeWinPercentage);
      const tie = Number(latest.tiePercentage) || 0;
      const picked = pickedSide === "home" ? home : Math.max(0, 1 - home - tie);
      winProbability = Math.round(picked * 1000) / 10;
    } else if (game.state === "pre" && summary.predictor) {
      const projection = summary.predictor[pickedSide + "Team"]
        && summary.predictor[pickedSide + "Team"].gameProjection;
      const parsed = Number(projection);
      if (Number.isFinite(parsed)) winProbability = Math.round(parsed * 10) / 10;
    }
    if (!odds && winProbability == null) return null;
    return {
      provider: (market.provider && market.provider.name) || "Sportsbook",
      phase,
      odds,
      impliedPercent: americanImpliedPercent(odds),
      winProbability,
    };
  }
  function livePaperBetState(bet, game) {
    const recorded = String(bet.status || "Pending").toLowerCase();
    if (recorded !== "pending") {
      const tone = recorded === "win" ? "won" : recorded === "loss" ? "lost" : "push";
      return { label: bet.status, tone, score: bet.result || "", detail: "Tracker settled", netUnits: Number.parseFloat(bet.netUnits) || 0 };
    }
    if (!game) return { label: "Pending", tone: "pending", score: "", detail: "Waiting for game data", netUnits: null };
    const score = game.away.abbr + " " + game.away.score + "–" + game.home.score + " " + game.home.abbr;
    if (game.state === "pre") {
      return { label: "Scheduled", tone: "scheduled", score: "", detail: game.detail || game.statusText || game.startTime || "Scheduled", netUnits: null };
    }
    if (bet.marketType !== "moneyline") {
      return game.state === "post"
        ? { label: "Awaiting grade", tone: "pending", score, detail: game.detail || game.statusText || "Final", netUnits: null }
        : { label: "Live", tone: "live", score, detail: game.detail || game.statusText || "In progress", netUnits: null };
    }
    const picked = teamMatchesSelection(game.away, bet.selection) ? game.away
      : teamMatchesSelection(game.home, bet.selection) ? game.home : null;
    if (!picked) {
      return { label: game.state === "post" ? "Awaiting grade" : "Live", tone: game.state === "post" ? "pending" : "live", score, detail: game.detail || game.statusText || "", netUnits: null };
    }
    const opponent = picked === game.away ? game.home : game.away;
    const pickedScore = Number(picked.score);
    const opponentScore = Number(opponent.score);
    const tied = pickedScore === opponentScore;
    if (game.state === "post") {
      if (tied) return { label: "Push", tone: "push", score, detail: game.detail || game.statusText || "Final", netUnits: 0 };
      const won = pickedScore > opponentScore;
      return {
        label: won ? "Won" : "Lost", tone: won ? "won" : "lost", score,
        detail: game.detail || game.statusText || "Final",
        netUnits: won ? americanLineWinUnits(bet.line, bet.stake) : -(Number.parseFloat(bet.stake) || 1),
      };
    }
    return {
      label: tied ? "Tied" : pickedScore > opponentScore ? "Winning" : "Losing",
      tone: tied ? "tied" : pickedScore > opponentScore ? "winning" : "losing",
      score, detail: game.detail || game.statusText || "In progress", netUnits: null,
    };
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

  // ---- Parse a single scoreboard event ---------------------------------
  function parseEvent(ev, leagueKey) {
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

    const recOf = c => {
      const rec = (c.records && c.records[0] && c.records[0].summary);
      return rec ? "Record " + rec : "";
    };


    return {
      eventId: ev.id,
      leagueKey,
      boxScoreEventId: leagueKey === "baseball/mlb" && state === "post" ? ev.id : null,
      state,
      away: { name: away.team.displayName, abbr: teamAbbr(away), logo: teamLogo(away), rec: recOf(away), score: away.score, winner: !!away.winner },
      home: { name: home.team.displayName, abbr: teamAbbr(home), logo: teamLogo(home), rec: recOf(home), score: home.score, winner: !!home.winner },
      dateET: dt ? dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : null, // YYYY-MM-DD
      startTime,
      statusText: formatGameStatus(status, state, startTime, leagueKey),
      baseballSituation: parseBaseballSituation(comp, state, leagueKey),
      lineScore: parseBaseballLineScore(comp, state, leagueKey),
      isMyGame: isMyTeam(away.team.displayName) || isMyTeam(home.team.displayName),
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
    const card = el("div", "game" + (g.state === "in" ? " game--live" : g.state === "post" ? " game--final" : "") + (g.isMyGame ? " game--me" : ""));
    if (leagueLabel) card.appendChild(el("div", "spotlight-league-tag", esc(leagueLabel)));
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
    // Some leagues' scoreboard endpoints return more than just today's slate
    // (e.g. NFL returns the full week) — Spotlight is "what's happening
    // today," so scope every entry to today's date in Eastern regardless of
    // league, live state, or followed-team status.
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    // Playoff/qualification pools are rebuilt once per league per render
    // (not per game) — cheap, and standings may not have loaded yet for a
    // given league, in which case isPlayoffImplicated() just returns false
    // for it until renderSpotlight() re-runs after that league's standings arrive.
    const poolsCache = new Map();
    const poolsFor = league => {
      if (!poolsCache.has(league.key)) {
        poolsCache.set(league.key, buildPlayoffPools(league, standingsRawByLeague.get(league.key)));
      }
      return poolsCache.get(league.key);
    };
    const entries = [];
    gamesByLeague.forEach((games, key) => {
      const league = LEAGUES.find(l => l.key === key);
      games.forEach(g => {
        if (g.dateET !== todayET) return;
        const big = g.state === "in" || g.isMyGame ||
          (league && isPlayoffImplicated(league, g, poolsFor(league)));
        if (big) entries.push({ g, label: league ? league.label : "" });
      });
    });
    entries.sort((a, b) => gameRank(a.g) - gameRank(b.g));
    grid.innerHTML = "";
    if (!entries.length) {
      grid.appendChild(el("div", "spotlight-empty", "Nothing live and no games today for the teams you follow."));
      return;
    }
    entries.forEach(({ g, label }) => grid.appendChild(gameCard(g, label)));
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

    return standingsRowsTable(blocks[0], league);
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

  function isPlayoffImplicated(league, game, pools) {
    if (!pools || !league.implicationZones || !league.implicationZones.length) return false;
    // "Upcoming" implies not-yet-decided; live games are already covered by
    // the state === "in" check in renderSpotlight, so this only needs to add
    // scheduled games — a game that's already final has no more implications
    // left to play out today.
    if (game.state === "post") return false;
    return [game.away.name, game.home.name].some(name => {
      const info = teamRank(pools, name);
      if (!info || info.gamesPlayed < MIN_GAMES_FOR_IMPLICATIONS) return false;
      return league.implicationZones.some(z => {
        const cutoffRank = z.fromTop ? z.count : (info.poolSize - z.count + 1);
        return Math.abs(info.rank - cutoffRank) <= IMPLICATION_THRESHOLD;
      });
    });
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
      return (data.events || []).map(event => parseEvent(event, league.key)).filter(Boolean);
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

  // ---- Hermes paper-bet tracker -----------------------------------------
  function sideMatches(full, want) {
    if (!want || !full) return false;
    return full.includes(want) || want.includes(full);
  }
  function gameForPaperBet(bet) {
    const allGames = [...gamesByLeague.values()].flat();
    if (bet.eventId) {
      const exact = allGames.find(game => String(game.eventId) === String(bet.eventId));
      if (exact) return exact;
    }
    // Fallback: match away + home sides independently so a missing eventId still
    // resolves. The old path required the whole "Away at Home" string to appear
    // as a contiguous substring of the full "City Away at City Home" name, which
    // failed whenever the full name inserts a city between "at" and the team.
    const parts = String(bet.event || "").split(/\s+at\s+/i);
    if (parts.length !== 2) return null;
    const wantAway = normalizedTeamName(parts[0]);
    const wantHome = normalizedTeamName(parts[1]);
    return allGames.find(game =>
      sideMatches(normalizedTeamName(game.away.name), wantAway) &&
      sideMatches(normalizedTeamName(game.home.name), wantHome)
    ) || null;
  }

  function signedUnits(value) {
    const amount = Math.round((Number(value) || 0) * 100) / 100;
    return (amount > 0 ? "+" : "") + amount.toFixed(2) + "u";
  }

  function paperBetMarketText(market) {
    if (!market) return "Odds unavailable";
    const provider = market.provider === "DraftKings" ? "DK" : market.provider;
    const phase = market.phase === "live" ? "LIVE ML" : market.phase === "close" ? "CLOSE ML" : "CURRENT ML";
    const parts = [provider + " " + phase + " " + (market.odds || "OFF")];
    if (market.impliedPercent != null) parts.push(market.impliedPercent.toFixed(1) + "% implied");
    else if (market.winProbability != null) parts.push("ESPN " + market.winProbability.toFixed(1) + "% win");
    return parts.join(" · ");
  }

  async function fetchPaperBetMarket(bet, game) {
    const eventId = String(bet && bet.eventId || "");
    if (!eventId || !game || bet.marketType !== "moneyline") return null;
    if (paperBetMarketRequests.has(eventId)) return paperBetMarketRequests.get(eventId);
    const pending = (async () => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const leagueKey = game.leagueKey || "baseball/mlb";
        const url = ESPN + leagueKey + "/summary?event=" + encodeURIComponent(eventId) + "&_=" + Date.now();
        const response = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timeout);
        if (!response.ok) throw new Error("live odds " + response.status);
        const summary = await response.json();
        const market = parsePaperBetMarket(summary, bet, game);
        paperBetMarkets.set(eventId, { market, fetchedAt: Date.now() });
        return market;
      } catch (error) {
        paperBetMarkets.set(eventId, { market: null, fetchedAt: Date.now() });
        return null;
      } finally {
        paperBetMarketRequests.delete(eventId);
      }
    })();
    paperBetMarketRequests.set(eventId, pending);
    return pending;
  }

  async function refreshPaperBetMarkets(force) {
    if (!paperBetsData || document.hidden) return;
    const jobs = (paperBetsData.openBets || []).map(bet => {
      const game = gameForPaperBet(bet);
      const cached = paperBetMarkets.get(String(bet.eventId || ""));
      if (!game || (cached && game.state === "post") || (cached && !force)) return null;
      return fetchPaperBetMarket(bet, game);
    }).filter(Boolean);
    if (jobs.length) await Promise.allSettled(jobs);
    renderPaperBets();
  }

  function settledBetGrade(bet) {
    const status = String(bet.status || "").trim().toLowerCase();
    const result = String(bet.result || "").trim().toLowerCase();
    if (["win", "loss", "push", "void"].includes(status)) return status;
    if (["win", "loss", "push", "void"].includes(result)) return result;
    return status || result || "unknown";
  }

  function settledBetFinal(bet) {
    const result = String(bet.result || "").trim();
    if (result && !["win", "loss", "push", "void", "settled"].includes(result.toLowerCase())) return result;
    const notes = String(bet.sourceNotes || "");
    const match = notes.match(/ESPN final:\s*(.+?)(?:\s*\(Final\)|\.\s+\d{1,2}\/\d{1,2}|\.$)/i);
    return match ? match[1].trim() : "See evidence";
  }

  function renderPaperBetSimulation(bets) {
    const node = $("#paperBetSimulation");
    if (!node) return;
    const stake = 2.5;
    let profit = 0;
    let settled = 0;
    bets.forEach(bet => {
      const grade = settledBetGrade(bet);
      const odds = Number.parseFloat(String(bet.line || "").replace(/[^0-9+.-]/g, ""));
      if (!Number.isFinite(odds) || !["win", "loss", "push", "void"].includes(grade)) return;
      settled += 1;
      if (grade === "win") profit += stake * (odds > 0 ? odds / 100 : 100 / Math.abs(odds));
      if (grade === "loss") profit -= stake;
    });
    const funded = settled * stake;
    const ending = funded + profit;
    const roi = funded ? profit / funded * 100 : 0;
    const metrics = [
      ["Starting deposit", "$" + funded.toFixed(2)],
      ["Total staked", "$" + funded.toFixed(2)],
      ["Net profit", (profit >= 0 ? "+" : "−") + "$" + Math.abs(profit).toFixed(2)],
      ["Ending balance", "$" + ending.toFixed(2) + " (" + (roi >= 0 ? "+" : "") + roi.toFixed(1) + "%)"],
    ];
    node.innerHTML = "";
    metrics.forEach(([label, value], index) => {
      const wrapper = document.createElement("div");
      wrapper.appendChild(el("dt", "", label));
      wrapper.appendChild(el("dd", index > 1 && profit >= 0 ? "positive" : "", value));
      node.appendChild(wrapper);
    });
  }

  function renderPaperBetHistory() {
    const body = $("#paperBetHistoryBody");
    const countNode = $("#paperBetHistoryCount");
    const auditNode = $("#paperBetAudit");
    if (!body || !countNode || !auditNode || !paperBetsData) return;
    const bets = paperBetsData.settledBets || [];
    renderPaperBetSimulation(bets);
    const audit = paperBetsData.reconciliation || {};
    auditNode.classList.toggle("paper-bet-audit--warning", !audit.matches);
    auditNode.textContent = audit.matches
      ? "Validated: " + audit.rowCount + " unique rows · "
        + (audit.correctedPayoutRows || 0) + " payouts corrected"
      : "Publication blocked: ledger validation failed";
    auditNode.title = paperBetsData.ledgerSha256
      ? "Ledger SHA-256: " + paperBetsData.ledgerSha256
      : "";

    const query = paperBetHistorySearch.toLowerCase();
    const visible = bets.filter(bet => {
      const grade = settledBetGrade(bet);
      const gradeMatches = paperBetHistoryFilter === "all"
        || grade === paperBetHistoryFilter
        || (paperBetHistoryFilter === "push" && grade === "void");
      const haystack = [
        bet.id, bet.dateLogged, bet.sport, bet.event, bet.pick, bet.result, bet.sourceNotes
      ].join(" ").toLowerCase();
      return gradeMatches && (!query || haystack.includes(query));
    });
    countNode.textContent = "Showing " + visible.length + " of " + bets.length
      + " settled bets. Every row is exported from the same ledger as the headline.";
    body.innerHTML = "";
    visible.forEach(bet => {
      const grade = settledBetGrade(bet);
      const row = document.createElement("tr");
      const date = document.createElement("td");
      date.appendChild(document.createTextNode(bet.dateLogged || "—"));
      date.appendChild(el("span", "paper-bet-history-id", esc(bet.id || "")));
      row.appendChild(date);
      row.appendChild(el("td", "", esc((bet.pick || "—") + " " + (bet.line || "") + " · " + (bet.stake || ""))));
      row.appendChild(el("td", "", esc(settledBetFinal(bet))));
      row.appendChild(el("td", "paper-bet-history-grade paper-bet-history-grade--" + grade, esc(grade)));
      row.appendChild(el("td", "", esc(bet.netUnits || "—")));
      const evidence = document.createElement("td");
      evidence.className = "paper-bet-history-notes";
      const verification = bet.verification || {};
      evidence.appendChild(el(
        "span",
        verification.status === "score-verified" ? "paper-bet-verified" : "paper-bet-recorded",
        verification.status === "score-verified" ? "Score verified" : "Evidence recorded"
      ));
      if (bet.payoutCorrected) {
        evidence.appendChild(el("span", "paper-bet-correction", "Payout corrected from recorded odds"));
      }
      evidence.appendChild(document.createTextNode(bet.sourceNotes || "No source note recorded"));
      row.appendChild(evidence);
      body.appendChild(row);
    });
    if (!visible.length) {
      const row = document.createElement("tr");
      const cell = el("td", "paper-bet-empty", "No settled bets match these filters.");
      cell.colSpan = 6;
      row.appendChild(cell);
      body.appendChild(row);
    }
  }

  function renderPaperBets() {
    const root = $("#paperBets");
    const summaryNode = $("#paperBetSummary");
    const cardNode = $("#paperBetCardSummary");
    const listNode = $("#paperBetList");
    if (!root || !summaryNode || !cardNode || !listNode) return;
    listNode.innerHTML = "";
    if (!paperBetsData) {
      root.classList.toggle("paper-bets--error", paperBetsLoadError);
      summaryNode.textContent = paperBetsLoadError ? "Tracker unavailable" : "Loading tracker…";
      cardNode.textContent = "";
      return;
    }
    root.classList.remove("paper-bets--error");
    const summary = paperBetsData.summary || {};
    const openBets = paperBetsData.openBets || [];
    renderPaperBetHistory();
    const states = openBets.map(bet => {
      const game = gameForPaperBet(bet);
      const marketRecord = paperBetMarkets.get(String(bet.eventId || ""));
      return { bet, game, marketRecord, state: livePaperBetState(bet, game) };
    });
    const count = label => states.filter(item => item.state.label === label).length;
    const won = count("Won");
    const lost = count("Lost");
    const pushes = count("Push");
    const live = states.filter(item => ["Winning", "Losing", "Tied", "Live"].includes(item.state.label)).length;
    const waiting = states.length - won - lost - pushes - live;
    const gradedNet = states.reduce((total, item) => total + (item.state.netUnits == null ? 0 : item.state.netUnits), 0);
    const graded = won + lost + pushes;

    // Recalculate the all-time summary by folding live-graded open bets into
    // the static settled totals from fake-bets.json. This keeps the headline
    // record current as pending bets resolve (e.g. yesterday's slate settling).
    const settledWins = Number(summary.wins) || 0;
    const settledLosses = Number(summary.losses) || 0;
    const settledPushes = Number(summary.pushesVoids) || 0;
    const settledNet = parseFloat(summary.netUnits) || 0;
    const allTimeWins = settledWins + won;
    const allTimeLosses = settledLosses + lost;
    const allTimePushes = settledPushes + pushes;
    const allTimeNet = Math.round((settledNet + gradedNet) * 100) / 100;
    const allTimeSettled = allTimeWins + allTimeLosses + allTimePushes;
    // ROI = net units / total stake (1u per pick). All picks are flat 1u, so
    // total stake equals the number of settled picks.
    const allTimeRoi = allTimeSettled > 0 ? (allTimeNet / allTimeSettled) * 100 : 0;
    summaryNode.textContent = allTimeWins + "–" + allTimeLosses
      + (allTimePushes ? "–" + allTimePushes : "")
      + " all-time · " + signedUnits(allTimeNet)
      + " · " + (allTimeRoi >= 0 ? "+" : "") + allTimeRoi.toFixed(1) + "% ROI";

    cardNode.textContent = openBets.length
      ? "Open card: " + won + "W–" + lost + "L" + (pushes ? "–" + pushes + "P" : "")
        + (graded ? " · " + signedUnits(gradedNet) : "") + " · " + live + " live · " + waiting + " waiting"
      : "No open paper bets";

    states.forEach(({ bet, game, marketRecord, state }) => {
      const row = el("article", "paper-bet paper-bet--" + state.tone);
      row.setAttribute("aria-label", bet.pick + " at " + bet.line + ": " + state.label);
      const copy = el("div", "paper-bet-copy");
      const pick = el("div", "paper-bet-pick");
      pick.appendChild(el("strong", "", esc(bet.pick)));
      pick.appendChild(el("span", "paper-bet-price", esc(bet.line + " · " + bet.stake)));
      copy.appendChild(pick);
      copy.appendChild(el("div", "paper-bet-event", esc(bet.event)));
      const marketText = marketRecord
        ? paperBetMarketText(marketRecord.market)
        : game ? "Odds updating…" : "Odds unavailable";
      copy.appendChild(el("div", "paper-bet-market", esc(marketText)));
      row.appendChild(copy);

      const liveState = el("div", "paper-bet-state");
      liveState.appendChild(el("strong", "paper-bet-label", esc(state.label)));
      if (state.score) liveState.appendChild(el("span", "paper-bet-score", esc(state.score)));
      if (state.detail) liveState.appendChild(el("span", "paper-bet-detail", esc(state.detail)));
      if (state.netUnits != null && ["Won", "Lost", "Push"].includes(state.label)) {
        liveState.appendChild(el("span", "paper-bet-units", signedUnits(state.netUnits)));
      }
      row.appendChild(liveState);
      listNode.appendChild(row);
    });
    if (!states.length) listNode.appendChild(el("div", "paper-bet-empty", "The next eligible paper bets will appear here."));
  }

  async function loadPaperBets() {
    try {
      const response = await fetch("/fake-bets.json?_=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("paper bet feed " + response.status);
      paperBetsData = await response.json();
      paperBetsLoadError = false;
    } catch (error) {
      paperBetsLoadError = !paperBetsData;
    }
    renderPaperBets();
    refreshPaperBetMarkets(false);
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

  // ---- Master render ----------------------------------------------------
  async function render() {
    const board = $("#board");
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
    renderPaperBets();
    renderValueScreen();
    refreshPaperBetMarkets(false);
    stamp();
  }

  function stamp() {
    const now = new Date();
    const txt = now.toLocaleString("en-US", {
      timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit",
      weekday: "short", month: "short", day: "numeric", timeZoneName: "short"
    });
    $("#updated").textContent = "Updated " + txt;
  }

  // ---- Filters ----------------------------------------------------------
  function buildFilters() {
    const nav = $("#filters");
    nav.innerHTML = "";
    const mk = (key, label, pressed) => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.setAttribute("aria-pressed", pressed ? "true" : "false");
      b.addEventListener("click", () => {
        activeFilter = key;
        [...nav.children].forEach(c => c.setAttribute("aria-pressed", c === b ? "true" : "false"));
        // Hide the paper bets panel when drilling into a single league so the
        // focus stays on that league's games and standings. Restore it when
        // the user switches back to "All".
        const bets = $("#paperBets");
        if (bets) bets.style.display = key === "all" ? "" : "none";
        renderValueScreen();
        loadValueScreen();
        render();
      });
      return b;
    };
    nav.appendChild(mk("all", "All", true));
    LEAGUES.forEach(l => nav.appendChild(mk(l.key, l.label, false)));
  }

  // ---- MLB Value Screen (model vs market) -------------------------------
  // Moved here from The McBoop Daily when its Sports tab was retired — this is
  // now the only place the screen exists. Market lines come from /api/odds
  // (the BetExplorer proxy in _worker.js, since the browser can't fetch
  // betexplorer.com). The model is computed IN THE BROWSER from
  // statsapi.mlb.com (CORS-open): the same v2 starter-adjusted model the agent
  // runs at paper time (scripts/daily_mlb_model.py in the live-sports-feeds
  // skill), so the screen and the paper bets above it agree by construction.
  const STATS = "https://statsapi.mlb.com/api/v1";
  const VALUE_REFRESH_MS = 6 * 60 * 1000;
  const HOME_ADJ = 4.0;   // points added to the home team's model%
  const EDGE_MIN = 4.0;   // points of edge required to call VALUE/FADE
  const CHECK_GAP = 10.0; // |edge| above this -> CHECK (model blind spot)
  const MIN_IP = 20.0;    // starter needs this many IP before RA9 is trusted
  const pitcherRa9Cache = new Map();

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
  // starter is unannounced or hasn't thrown MIN_IP yet.
  function pyth(rs, ra) {
    if (!rs || !ra) return null;
    return 1.0 / (1.0 + Math.pow(ra / rs, 1.83));
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
        let awayModel, homeModel;
        if (ar != null && hr != null && sa.rs && sh.rs && sa.g && sh.g) {
          // v2: matchup-adjusted expected runs (mirrored pair, sums to 100%)
          const awayExp = (sa.rs / sa.g) * (hr / lg9);
          const homeExp = (sh.rs / sh.g) * (ar / lg9);
          const pA = 1.0 / (1.0 + Math.pow(homeExp / awayExp, 1.83));
          awayModel = pA * 100 - HOME_ADJ;
          homeModel = (1 - pA) * 100 + HOME_ADJ;
          row.adj = {
            away: row.awaySt.name, awayRa9: r1(ar),
            home: row.homeSt.name, homeRa9: r1(hr), lg: r1(lg9),
          };
        } else {
          // v1 fallback: independent season Pythagorean per team
          const ap = pyth(sa.rs, sa.ra), hp = pyth(sh.rs, sh.ra);
          if (ap == null || hp == null) { row.call = "NO MODEL"; games.push(row); continue; }
          awayModel = ap * 100 - HOME_ADJ;
          homeModel = hp * 100 + HOME_ADJ;
        }

        const awayEdge = r1(awayModel - row.awayFair);
        const homeEdge = r1(homeModel - row.homeFair);
        let call;
        if (Math.max(Math.abs(awayEdge), Math.abs(homeEdge)) >= CHECK_GAP) call = "CHECK";
        else if (awayEdge >= EDGE_MIN) call = "VALUE " + row.awayAbbr;
        else if (homeEdge >= EDGE_MIN) call = "VALUE " + row.homeAbbr;
        else if (awayEdge <= -EDGE_MIN) call = "FADE " + row.awayAbbr;
        else if (homeEdge <= -EDGE_MIN) call = "FADE " + row.homeAbbr;
        else call = "NO EDGE";

        row.awayModel = r1(awayModel);
        row.homeModel = r1(homeModel);
        row.awayEdge = awayEdge;
        row.homeEdge = homeEdge;
        row.call = call;
        games.push(row);
      }
    }
    return games;
  }

  function callClass(call) {
    if (call.indexOf("VALUE") === 0) return "call--value";
    if (call.indexOf("FADE") === 0) return "call--fade";
    if (call === "CHECK") return "call--check";
    return "call--none";
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
      html += '<tr class="value-starters"><td colspan="6"><span class="value-note">' + (r.adj
        ? "starters: " + esc(r.adj.away) + " RA9 " + esc(r.adj.awayRa9) + " vs " +
          esc(r.adj.home) + " RA9 " + esc(r.adj.homeRa9) + " (lg " + esc(r.adj.lg) + ")"
        : "starters: one/both TBA or &lt;" + MIN_IP + " IP &middot; v1 fallback") +
        "</span></td></tr>";
      return html;
    }).join("");
  }

  // The screen is MLB-only, so it rides along with the "All" and MLB filters
  // and hides for every other league — the same rule the paper-bets panel uses.
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
        renderPaperBets();
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

  async function refreshAllScores() {
    await Promise.all([refreshScores(filteredLeagues()), loadPaperBets()]);
    await refreshPaperBetMarkets(true);
  }

  // Odds and season stats move on the order of minutes, not seconds, so the
  // value screen gets its own slow timer rather than riding the score loops.
  function scheduleValueScreenRefresh() {
    if (valueTimer) clearInterval(valueTimer);
    valueTimer = setInterval(() => {
      if (!document.hidden) loadValueScreen();
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

  function selectPaperBetTab(selected) {
    const tabs = [$("#paperBetLiveTab"), $("#paperBetLedgerTab")];
    tabs.forEach(tabNode => {
      const isSelected = tabNode === selected;
      tabNode.setAttribute("aria-selected", isSelected ? "true" : "false");
      tabNode.tabIndex = isSelected ? 0 : -1;
      const panel = $("#" + tabNode.getAttribute("aria-controls"));
      if (panel) panel.hidden = !isSelected;
    });
  }

  function init() {
    buildFilters();
    const paperBetTabs = [$("#paperBetLiveTab"), $("#paperBetLedgerTab")];
    paperBetTabs.forEach((tabNode, index) => {
      tabNode.addEventListener("click", () => selectPaperBetTab(tabNode));
      tabNode.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = paperBetTabs[(index + direction + paperBetTabs.length) % paperBetTabs.length];
        selectPaperBetTab(next);
        next.focus();
      });
    });
    $("#paperBetHistoryFilter").addEventListener("change", event => {
      paperBetHistoryFilter = event.target.value;
      renderPaperBetHistory();
    });
    $("#paperBetHistorySearch").addEventListener("input", event => {
      paperBetHistorySearch = event.target.value.trim();
      renderPaperBetHistory();
    });
    $("#refreshBtn").addEventListener("click", async () => {
      await Promise.all([loadPaperBets(), render(), loadValueScreen()]);
      await refreshPaperBetMarkets(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshAllScores();
    });
    loadPaperBets();
    loadValueScreen();
    render();
    scheduleRefresh();
    scheduleValueScreenRefresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
