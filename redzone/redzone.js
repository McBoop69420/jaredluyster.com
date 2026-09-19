/* RedZone — NCAAF whiparound board (schedule/priority shell, no video)
 *
 * Pulls today's college football scoreboard from ESPN's public,
 * CORS-open site API (same endpoint sports.js already relies on) and ranks
 * live games by how close/urgent they are, whiparound-style. Network badges
 * link out to that broadcaster's own homepage — nothing here streams,
 * proxies, or embeds any video.
 *
 * Any game can be expanded in place into a detail panel (field position,
 * play-by-play, win probability, scoring, team stats) built from ESPN's
 * public summary endpoint. Expanded panels refresh with the board.
 */
(function () {
  "use strict";

  // groups=80 is FBS. Dateless, it returns the whole current game week (Thu-Sun
  // plus late-night kickoffs; identical to passing week=N), ~75 games. Two ESPN
  // gotchas found by measuring: with no groups it returns only a ~22-game
  // "featured" subset, and limit=1000 silently truncates to 25 (limit works up
  // to at least 500), so keep the limit at 500.
  const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=500";
  const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=";
  const REFRESH_MS = 20000;
  const MAX_PLAYS = 8;

  // [ESPN boxscore stat name, label] in display order.
  const STAT_ROWS = [
    ["totalYards", "Total yards"], ["firstDowns", "1st downs"],
    ["netPassingYards", "Passing yards"], ["rushingYards", "Rushing yards"],
    ["thirdDownEff", "3rd down"], ["turnovers", "Turnovers"],
    ["totalPenaltiesYards", "Penalties"], ["possessionTime", "Possession"],
  ];

  // Root domains only (never a guessed deep "watch live" path) for the
  // networks ESPN most commonly lists on NCAAF broadcasts. Unmapped names
  // still show as a plain badge with no link.
  const NETWORK_LINKS = {
    "ESPN": "https://www.espn.com", "ESPN2": "https://www.espn.com",
    "ESPNU": "https://www.espn.com", "ESPNEWS": "https://www.espn.com",
    "SEC Network": "https://www.espn.com", "SECN": "https://www.espn.com",
    "ACC Network": "https://www.espn.com", "ACCN": "https://www.espn.com",
    "ABC": "https://www.abc.com",
    "FOX": "https://www.foxsports.com", "FS1": "https://www.foxsports.com", "FS2": "https://www.foxsports.com",
    "Big Ten Network": "https://www.btn.com", "BTN": "https://www.btn.com",
    "CBS": "https://www.cbssports.com", "CBS Sports Network": "https://www.cbssports.com", "CBSSN": "https://www.cbssports.com",
    "NBC": "https://www.nbc.com", "Peacock": "https://www.peacocktv.com",
    "The CW": "https://www.cwtv.com", "CW": "https://www.cwtv.com",
    "ESPN+": "https://www.espn.com", "SECN+": "https://www.espn.com", "ACCN+": "https://www.espn.com",
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const esc = (s) => String(s == null ? "" : s);

  function teamAbbr(c) {
    const t = c && c.team;
    if (!t) return "?";
    return t.abbreviation || t.shortDisplayName || (t.displayName || "?").slice(0, 3).toUpperCase();
  }
  function rankOf(c) {
    const r = c.curatedRank && c.curatedRank.current;
    return typeof r === "number" && r <= 25 ? r : null;
  }

  // Team logos come from ESPN's image CDN (only that host is accepted). The
  // scoreboard's `logo` is the default, light-background version; ESPN also
  // publishes a dark-background one at the same path with /500/ -> /500-dark/
  // (listed as rel "dark" in the summary payload's logos[]), which suits this
  // UI. Fallback chain if an image fails: dark -> default -> abbreviation text.
  const LOGO_HOST = /^https:\/\/a\.espncdn\.com\//;
  // The full logos are 500px PNGs (measured: ~34 KB each, up to 95 KB), and an
  // FBS board shows ~150 of them. ESPN's own resizer serves the same image at
  // 72px for ~3 KB (measured: ~13x lighter, CORS-open), which still covers the
  // largest slot (34px) at 2x. Tried first; the full-size images stay as fallbacks.
  const LOGO_PX = 72;
  function logoUrls(team) {
    const base = team && typeof team.logo === "string" && LOGO_HOST.test(team.logo) ? team.logo : null;
    if (!base) return { logo: null, logoDark: null, logoSmall: null };
    const dark = base.replace("/teamlogos/ncaa/500/", "/teamlogos/ncaa/500-dark/");
    if (dark === base) return { logo: base, logoDark: null, logoSmall: null };
    const path = dark.replace(LOGO_HOST, "/");
    return { logo: base, logoDark: dark, logoSmall: "https://a.espncdn.com/combiner/i?img=" + path + "&w=" + LOGO_PX + "&h=" + LOGO_PX };
  }

  // A team's visual mark: its logo at size sm|md|lg, or its abbreviation as
  // text if it has no usable logo. alt carries the full name for screen readers.
  function teamMark(t, size) {
    const mark = el("span", "team-mark team-mark-" + size);
    const asText = () => {
      mark.textContent = t.abbr;
      mark.classList.add("is-text");
    };
    // resized dark -> full dark -> default; each failure advances one step.
    const sources = [t.logoSmall, t.logoDark, t.logo].filter((u, i, a) => u && a.indexOf(u) === i);
    if (!sources.length) {
      asText();
      return mark;
    }
    const img = el("img", "logo");
    img.alt = t.name;
    img.title = t.name;
    img.decoding = "async";
    // Row logos sit below the fold on a 75-game board; tile/ticker ones are on screen at once.
    if (size === "md") img.loading = "lazy";
    let step = 0;
    img.onerror = () => {
      step += 1;
      if (step < sources.length) img.src = sources[step];
      else asText();
    };
    img.src = sources[0];
    mark.appendChild(img);
    return mark;
  }

  // ESPN's own Gamecast page. ESPN tags it "summary" for pre/post games and
  // "live" (sometimes "gamecast") while in progress — same check sports.js uses.
  function gameLinkUrl(ev) {
    const links = Array.isArray(ev.links) ? ev.links : [];
    const l = links.find((x) => x && typeof x.href === "string" && /^https?:\/\//.test(x.href) &&
      Array.isArray(x.rel) && !x.rel.includes("app") &&
      (x.rel.includes("summary") || x.rel.includes("live") || x.rel.includes("gamecast")));
    return l ? l.href : null;
  }

  function parseEvent(ev) {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const cs = comp.competitors || [];
    if (cs.length < 2) return null;
    const away = cs.find((c) => c.homeAway === "away") || cs[0];
    const home = cs.find((c) => c.homeAway === "home") || cs[1];
    const status = ev.status || comp.status || {};
    const state = (status.type || {}).state || "pre"; // pre | in | post
    const dt = ev.date ? new Date(ev.date) : null;
    const startTime = dt
      ? dt.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", weekday: "short", timeZoneName: "short" })
      : "Time TBA";

    const broadcastList = Array.isArray(comp.broadcasts) ? comp.broadcasts : [];
    const broadcastEntry = broadcastList.find((b) => b.market === "national") || broadcastList[0];
    const broadcast = broadcastEntry && Array.isArray(broadcastEntry.names) && broadcastEntry.names.length
      ? broadcastEntry.names.join("/")
      : null;

    const period = status.period || 0;
    const clock = status.displayClock || "";
    const type = status.type || {};

    const awayScore = Number(away.score) || 0;
    const homeScore = Number(home.score) || 0;
    const margin = Math.abs(awayScore - homeScore);

    return {
      id: ev.id,
      state,
      away: { id: away.team.id, name: away.team.displayName, abbr: teamAbbr(away), ...logoUrls(away.team), score: away.score, winner: !!away.winner, rank: rankOf(away) },
      home: { id: home.team.id, name: home.team.displayName, abbr: teamAbbr(home), ...logoUrls(home.team), score: home.score, winner: !!home.winner, rank: rankOf(home) },
      situation: state === "in" ? comp.situation || null : null,
      link: gameLinkUrl(ev),
      kickoffMs: dt ? dt.getTime() : Infinity,
      startTime,
      period,
      clock,
      margin,
      isRanked: rankOf(away) != null || rankOf(home) != null,
      statusText:
        state === "pre" ? startTime
        : state === "post" ? (type.shortDetail || type.description || "Final")
        : (clock + (period ? " • Q" + period : "")).trim() || type.shortDetail || "In Progress",
      broadcast,
    };
  }

  // Whiparound-style urgency score for live games: close scores and late
  // periods (4th quarter, overtime) float to the top, ranked matchups get a
  // small bump so a blowout between top-25 teams still surfaces early.
  function liveScore(g) {
    let score = 0;
    score += Math.max(0, 40 - g.margin * 3); // closer game = more points
    score += Math.min(g.period, 5) * 12; // later period = more points (OT = period 5+)
    if (g.period >= 4) score += 15; // 4th quarter/OT urgency bump
    if (g.isRanked) score += 8;
    return score;
  }

  function networkBadge(broadcast) {
    if (!broadcast) return null;
    const href = NETWORK_LINKS[broadcast];
    const badge = el(href ? "a" : "span", "net-badge" + (href ? "" : " no-link"), broadcast);
    if (href) {
      badge.href = href;
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
      badge.title = "Open " + broadcast + "'s site";
    }
    return badge;
  }

  function teamRow(t) {
    const row = el("div", "tile-team" + (t.winner ? " is-winner" : ""));
    const nameWrap = el("div", "tile-team-name");
    if (t.rank) nameWrap.appendChild(el("span", "rank", "#" + t.rank + " "));
    nameWrap.appendChild(teamMark(t, "lg"));
    row.appendChild(nameWrap);
    row.appendChild(el("div", "tile-score", esc(t.score)));
    return row;
  }

  function renderLiveTile(g, rank) {
    const tile = el("div", "tile tile-live");
    tile.appendChild(el("div", "tile-rank", "#" + rank));
    tile.appendChild(el("div", "tile-status is-live", g.statusText));
    const matchup = el("div", "tile-matchup");
    matchup.appendChild(teamRow(g.away));
    matchup.appendChild(teamRow(g.home));
    tile.appendChild(matchup);
    const foot = el("div", "tile-foot");
    foot.appendChild(el("div", "tile-margin", g.margin === 0 ? "Tied" : "Margin " + g.margin));
    const badge = networkBadge(g.broadcast);
    if (badge) foot.appendChild(badge);
    tile.appendChild(foot);
    makeExpandable(tile, g, foot);
    return tile;
  }

  function renderRow(g, isFinal) {
    const row = el("div", "row" + (isFinal ? " row-final" : ""));
    const teams = el("div", "row-teams");
    const nameSpan = (t) => {
      const s = el("span", "row-team" + (isFinal && t.winner ? " winner" : ""));
      if (t.rank) s.appendChild(el("span", "rank", "#" + t.rank));
      s.appendChild(teamMark(t, "md"));
      if (isFinal) s.appendChild(el("span", "row-score", esc(t.score)));
      return s;
    };
    teams.appendChild(nameSpan(g.away));
    teams.appendChild(el("span", "row-vs", "@"));
    teams.appendChild(nameSpan(g.home));
    row.appendChild(teams);
    const badge = networkBadge(g.broadcast);
    if (badge) row.appendChild(badge);
    row.appendChild(el("div", "row-time", g.statusText));
    makeExpandable(row, g, row);
    return row;
  }

  // ---- Inline game detail panels ----------------------------------------
  // State lives outside the DOM because render() rebuilds every tile/row each
  // refresh: which games are expanded, the last parsed summary per game, and
  // the latest parsed scoreboard games (so a late summary response paints
  // against current data, not whatever was on screen when it was requested).
  const expanded = new Set();
  const detailCache = new Map(); // id -> { status: loading|ready|error, data, fetchedState }
  const inflight = new Set();
  let lastGames = new Map();

  // Small surface for bets.js (loaded after this file): shared helpers, the
  // current board's games by ESPN event id, and a callback fired after every
  // board render (render() rebuilds every tile/row, so anything layered on top
  // of them has to be re-applied each time).
  const boardHooks = [];
  let hasRendered = false;
  function runHook(fn) {
    try { fn(); } catch (err) { console.error("RedZone: board hook failed", err); }
  }
  window.RedZone = {
    el, esc, teamMark, logoUrls,
    game: (id) => lastGames.get(String(id)) || null,
    onBoard(fn) {
      boardHooks.push(fn);
      if (hasRendered) runHook(fn);
    },
  };

  const periodLabel = (n) => (n <= 4 ? "Q" + n : n === 5 ? "OT" : (n - 4) + "OT");
  const pct = (p) => Math.round(p * 100) + "%";

  function parseDetail(sum) {
    const comp = ((sum.header || {}).competitions || [])[0] || {};
    const side = (arr, ha) => (arr || []).find((x) => x.homeAway === ha);

    const lines = {};
    const stats = {};
    ["away", "home"].forEach((ha) => {
      const c = side(comp.competitors, ha);
      lines[ha] = c && Array.isArray(c.linescores) ? c.linescores.map((l) => l.displayValue) : [];
      const t = side((sum.boxscore || {}).teams, ha);
      stats[ha] = {};
      ((t && t.statistics) || []).forEach((s) => { stats[ha][s.name] = s.displayValue; });
    });

    const drives = sum.drives || {};
    const driveList = [...(drives.previous || []), ...(drives.current ? [drives.current] : [])];
    const plays = [];
    driveList.forEach((d) => {
      const teamId = d.team && d.team.id;
      (d.plays || []).forEach((p) => {
        if (!p.text) return;
        plays.push({
          period: p.period && p.period.number, clock: p.clock && p.clock.displayValue,
          text: p.text, teamId, scoring: !!p.scoringPlay, turnover: !!p.isTurnover,
        });
      });
    });
    const cur = drives.current;

    const wp = (sum.winprobability || []).slice(-1)[0];
    let win = null;
    if (wp && typeof wp.homeWinPercentage === "number") {
      const tie = wp.tiePercentage || 0;
      win = { home: wp.homeWinPercentage, tie, away: Math.max(0, 1 - wp.homeWinPercentage - tie) };
    }

    const pick = (sum.pickcenter || [])[0];
    const venue = ((sum.gameInfo || {}).venue) || {};
    const addr = venue.address || {};

    return {
      lines, stats, win,
      plays: plays.slice(-MAX_PLAYS).reverse(),
      currentDrive: cur ? {
        teamId: cur.team && cur.team.id,
        startYardLine: cur.start && cur.start.yardLine,
      } : null,
      scoring: (sum.scoringPlays || []).map((p) => ({
        period: p.period && p.period.number, clock: p.clock && p.clock.displayValue,
        teamId: p.team && p.team.id, type: p.type && (p.type.abbreviation || p.type.text),
        text: p.text, away: p.awayScore, home: p.homeScore,
      })),
      odds: pick ? { details: pick.details, overUnder: pick.overUnder } : null,
      venue: venue.fullName ? venue.fullName + (addr.city ? ", " + addr.city + (addr.state ? " " + addr.state : "") : "") : null,
      attendance: (sum.gameInfo || {}).attendance || null,
    };
  }

  const teamOf = (g, id) => (id === g.away.id ? g.away : id === g.home.id ? g.home : null);

  function panelSection(title) {
    const sec = el("section", "p-sec");
    sec.appendChild(el("h3", "p-title", title));
    return sec;
  }

  // ESPN's yardLine (situation, drive start) is a fixed frame: yards from the
  // HOME team's goal line, whoever has the ball. Checked against 63 play states
  // and 22 drive starts from a finished game (TEX home: "TEX 4" -> 4,
  // "OSU 1" -> 99) and a live one ("PRST 25" with home ORE on offense -> 75).
  // The field is drawn away end zone left, home right, so position from the
  // left goal line is simply 100 - yardLine.
  const fieldX = (yardLine) => 100 - yardLine;
  const fieldPct = (x) => ((10 + x) / 120) * 100; // 10-yd end zones on each side

  function situationBlock(g, detail) {
    const s = g.situation;
    if (!s) return null;
    const poss = s.possession === g.away.id ? g.away : s.possession === g.home.id ? g.home : null;
    const block = el("div", "p-situ");

    const strip = el("div", "p-situ-strip");
    const left = el("div", "p-situ-main");
    if (poss) {
      const label = el("span", "p-poss");
      label.appendChild(teamMark(poss, "sm"));
      label.appendChild(el("span", "", "ball"));
      left.appendChild(label);
    }
    if (s.downDistanceText) left.appendChild(el("span", "p-down", s.downDistanceText));
    // No down/possession (e.g. right after a conversion try): ESPN still sends
    // the last play, so show that rather than an empty strip.
    else if (s.lastPlay && s.lastPlay.text) left.appendChild(el("span", "p-lastplay", s.lastPlay.text));
    strip.appendChild(left);
    const right = el("div", "p-situ-side");
    if (s.isRedZone) right.appendChild(el("span", "p-rz", "Red zone"));
    if (typeof s.awayTimeouts === "number" && typeof s.homeTimeouts === "number") {
      const to = el("span", "p-to");
      to.appendChild(el("span", "", "Timeouts"));
      to.appendChild(teamMark(g.away, "sm"));
      to.appendChild(el("span", "p-to-n", String(s.awayTimeouts)));
      to.appendChild(teamMark(g.home, "sm"));
      to.appendChild(el("span", "p-to-n", String(s.homeTimeouts)));
      to.setAttribute("aria-label", "Timeouts remaining: " + g.away.abbr + " " + s.awayTimeouts + ", " + g.home.abbr + " " + s.homeTimeouts);
      right.appendChild(to);
    }
    strip.appendChild(right);
    block.appendChild(strip);

    if (poss && typeof s.yardLine === "number") {
      const field = el("div", "field");
      field.setAttribute("role", "img");
      field.setAttribute("aria-label", (s.downDistanceText || "Ball position") + (poss ? ", " + poss.abbr + " on offense" : ""));
      const ez = (cls, team) => {
        const z = el("div", "field-ez " + cls);
        z.appendChild(teamMark(team, "ez"));
        field.appendChild(z);
      };
      ez("field-ez-away", g.away);
      ez("field-ez-home", g.home);
      for (let yd = 10; yd <= 90; yd += 10) {
        const line = el("div", "field-line" + (yd === 50 ? " field-line-50" : ""));
        line.style.left = fieldPct(yd) + "%";
        field.appendChild(line);
      }

      const ballX = fieldX(s.yardLine);
      // Away attacks right (toward the home end zone), home attacks left.
      const dir = s.possession === g.away.id ? 1 : -1;
      const yardsToGoal = dir > 0 ? s.yardLine : 100 - s.yardLine;

      const d = detail && detail.currentDrive;
      if (d && d.teamId === s.possession && typeof d.startYardLine === "number") {
        const x0 = fieldX(d.startYardLine);
        const bar = el("div", "field-drive");
        bar.style.left = fieldPct(Math.min(x0, ballX)) + "%";
        bar.style.width = (fieldPct(Math.max(x0, ballX)) - fieldPct(Math.min(x0, ballX))) + "%";
        field.appendChild(bar);
      }
      // Goal-to-go (distance reaches the goal line) has no first-down marker.
      if (typeof s.distance === "number" && s.distance > 0 && s.distance < yardsToGoal) {
        const fd = el("div", "field-first");
        fd.style.left = fieldPct(ballX + dir * s.distance) + "%";
        field.appendChild(fd);
      }
      const ball = el("div", "field-ball" + (s.isRedZone ? " is-rz" : ""), dir > 0 ? "▶" : "◀");
      ball.style.left = fieldPct(ballX) + "%";
      field.appendChild(ball);
      block.appendChild(field);
    }
    return block;
  }

  function linescoreTable(g, lines) {
    const n = Math.max(lines.away.length, lines.home.length);
    if (!n) return null;
    const cols = Math.max(n, g.state === "in" ? 4 : 0);
    const table = el("table", "p-lines");
    const head = el("tr");
    head.appendChild(el("th", "", ""));
    for (let i = 0; i < cols; i++) head.appendChild(el("th", "", periodLabel(i + 1).replace(/^Q/, "")));
    head.appendChild(el("th", "p-total", "T"));
    table.appendChild(head);
    [["away", g.away], ["home", g.home]].forEach(([ha, t]) => {
      const tr = el("tr");
      const teamCell = el("td", "p-line-team");
      teamCell.appendChild(teamMark(t, "sm"));
      tr.appendChild(teamCell);
      for (let i = 0; i < cols; i++) tr.appendChild(el("td", "", lines[ha][i] != null ? lines[ha][i] : "–"));
      tr.appendChild(el("td", "p-total", esc(t.score)));
      table.appendChild(tr);
    });
    return table;
  }

  function winProbBar(g, win) {
    const sec = panelSection("Win probability");
    const bar = el("div", "p-wp");
    const a = el("div", "p-wp-away");
    const h = el("div", "p-wp-home");
    // A tie slice is 0 outside overtime; folding it into the leader would misstate it.
    a.style.flexGrow = String(win.away);
    h.style.flexGrow = String(win.home);
    bar.appendChild(a);
    if (win.tie > 0.005) {
      const t = el("div", "p-wp-tie");
      t.style.flexGrow = String(win.tie);
      bar.appendChild(t);
    }
    bar.appendChild(h);
    sec.appendChild(bar);
    const labels = el("div", "p-wp-labels");
    [[g.away, win.away], [g.home, win.home]].forEach(([t, p]) => {
      const label = el("span", "p-wp-label");
      label.appendChild(teamMark(t, "sm"));
      label.appendChild(el("span", "", pct(p)));
      labels.appendChild(label);
    });
    sec.appendChild(labels);
    return sec;
  }

  function playsBlock(g, plays) {
    const sec = panelSection("Latest plays");
    const list = el("ol", "p-plays");
    plays.forEach((p) => {
      const li = el("li", "p-play" + (p.scoring ? " is-scoring" : "") + (p.turnover ? " is-turnover" : ""));
      const when = (p.period ? periodLabel(p.period) : "") + (p.clock ? " " + p.clock : "");
      li.appendChild(el("span", "p-play-when", when.trim()));
      const body = el("span", "p-play-text");
      const team = teamOf(g, p.teamId);
      if (team) body.appendChild(teamMark(team, "sm"));
      body.appendChild(document.createTextNode(p.text));
      li.appendChild(body);
      list.appendChild(li);
    });
    sec.appendChild(list);
    return sec;
  }

  function scoringBlock(g, scoring) {
    const sec = panelSection("Scoring");
    const list = el("ol", "p-scoring");
    scoring.forEach((p) => {
      const li = el("li", "p-score");
      const when = (p.period ? periodLabel(p.period) : "") + (p.clock ? " " + p.clock : "");
      const head = el("div", "p-score-head");
      head.appendChild(el("span", "p-play-when", when.trim()));
      const tally = el("span", "p-score-tally");
      tally.appendChild(teamMark(g.away, "sm"));
      tally.appendChild(el("span", "", esc(p.away)));
      tally.appendChild(el("span", "p-score-dash", "–"));
      tally.appendChild(teamMark(g.home, "sm"));
      tally.appendChild(el("span", "", esc(p.home)));
      head.appendChild(tally);
      li.appendChild(head);
      const body = el("div", "p-play-text");
      const team = teamOf(g, p.teamId);
      if (team) body.appendChild(teamMark(team, "sm"));
      body.appendChild(document.createTextNode((p.type ? p.type + " — " : "") + (p.text || "")));
      li.appendChild(body);
      list.appendChild(li);
    });
    sec.appendChild(list);
    return sec;
  }

  function statsBlock(g, stats) {
    const rows = STAT_ROWS.filter(([k]) => stats.away[k] != null || stats.home[k] != null);
    if (!rows.length) return null;
    const sec = panelSection("Team stats");
    const table = el("table", "p-stats");
    const head = el("tr");
    [g.away, null, g.home].forEach((t) => {
      const th = el("th", t ? "p-stat-val" : "");
      if (t) th.appendChild(teamMark(t, "sm"));
      head.appendChild(th);
    });
    table.appendChild(head);
    rows.forEach(([k, label]) => {
      const tr = el("tr");
      tr.appendChild(el("td", "p-stat-val", stats.away[k] != null ? stats.away[k] : "–"));
      tr.appendChild(el("td", "p-stat-label", label));
      tr.appendChild(el("td", "p-stat-val", stats.home[k] != null ? stats.home[k] : "–"));
      table.appendChild(tr);
    });
    sec.appendChild(table);
    return sec;
  }

  function fillPanel(panel, g) {
    panel.textContent = "";
    const entry = detailCache.get(g.id);
    const data = entry && entry.data;

    // The situation strip and field come from the scoreboard, so they show
    // immediately even while the summary is still loading.
    const situ = situationBlock(g, data);
    if (situ) panel.appendChild(situ);

    if (!data) {
      panel.appendChild(el("p", "p-note", entry && entry.status === "error"
        ? "Couldn't load game details — will retry on the next refresh."
        : "Loading game details…"));
    } else {
      const lines = linescoreTable(g, data.lines);
      if (lines) panel.appendChild(lines);

      const grid = el("div", "p-grid");
      const colA = el("div", "p-col");
      const colB = el("div", "p-col");
      if (g.state !== "pre" && data.plays.length) colA.appendChild(playsBlock(g, data.plays));
      if (g.state === "in" && data.win) colB.appendChild(winProbBar(g, data.win));
      if (data.scoring.length) colB.appendChild(scoringBlock(g, data.scoring));
      if (g.state !== "pre") {
        const st = statsBlock(g, data.stats);
        if (st) colB.appendChild(st);
      }
      if (colA.childNodes.length) grid.appendChild(colA);
      if (colB.childNodes.length) grid.appendChild(colB);
      if (grid.childNodes.length) panel.appendChild(grid);

      if (entry.status === "error") panel.appendChild(el("p", "p-note", "Update failed — showing the last data received."));
    }

    const foot = el("div", "p-foot");
    const bits = [];
    if (data && data.venue) bits.push(data.venue);
    if (data && data.attendance) bits.push(data.attendance.toLocaleString("en-US") + " attendance");
    if (data && data.odds && data.odds.details) {
      bits.push(data.odds.details + (data.odds.overUnder ? " · O/U " + data.odds.overUnder : ""));
    }
    if (bits.length) foot.appendChild(el("span", "p-foot-info", bits.join("  •  ")));
    if (g.link) {
      const a = el("a", "p-gamecast", "ESPN Gamecast ↗");
      a.href = g.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset.focusKey = g.id + ":gc";
      foot.appendChild(a);
    }
    if (foot.childNodes.length) panel.appendChild(foot);
  }

  // render() and late fetches replace nodes wholesale; without this a
  // keyboard user's focus (a Details button, the Gamecast link) would drop to
  // <body> every refresh.
  function keepFocus(fn) {
    const active = document.activeElement;
    const key = active && active.dataset ? active.dataset.focusKey : null;
    fn();
    if (!key) return;
    const next = document.querySelector('[data-focus-key="' + key + '"]');
    if (next && next !== document.activeElement) next.focus({ preventScroll: true });
  }

  function hostFor(id) {
    return document.querySelector('[data-game-id="' + id + '"]');
  }

  function repaint(id) {
    if (!expanded.has(id)) return;
    const host = hostFor(id);
    const g = lastGames.get(id);
    const panel = host && host.querySelector(":scope > .panel");
    if (panel && g) keepFocus(() => fillPanel(panel, g));
  }

  async function fetchDetail(g) {
    if (inflight.has(g.id)) return;
    inflight.add(g.id);
    const prev = detailCache.get(g.id);
    if (!prev) {
      detailCache.set(g.id, { status: "loading", data: null, fetchedState: null });
      repaint(g.id);
    }
    try {
      const res = await fetch(SUMMARY_URL + encodeURIComponent(g.id) + "&_=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      detailCache.set(g.id, { status: "ready", data: parseDetail(await res.json()), fetchedState: g.state });
    } catch (err) {
      console.error("RedZone: failed to load game " + g.id, err);
      detailCache.set(g.id, { status: "error", data: prev ? prev.data : null, fetchedState: prev ? prev.fetchedState : null });
    } finally {
      inflight.delete(g.id);
    }
    repaint(g.id);
  }

  // Live games always refetch; finished/upcoming ones only when uncached, after
  // a failure, or once the game has moved to a new state (pre -> in -> post).
  function refreshDetail(g) {
    const entry = detailCache.get(g.id);
    if (!entry || entry.status !== "ready" || g.state === "in" || entry.fetchedState !== g.state) fetchDetail(g);
  }

  function setOpen(host, g, open) {
    host.classList.toggle("is-open", open);
    const btn = host.querySelector(".detail-btn");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Hide ▴" : "Details ▾";
    let panel = host.querySelector(":scope > .panel");
    if (!open) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = el("div", "panel");
      panel.id = "panel-" + g.id;
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", "Game details: " + g.away.abbr + " at " + g.home.abbr);
      host.appendChild(panel);
    }
    fillPanel(panel, g);
  }

  // Wires a tile/row up as an expandable game: id hook for the click handler,
  // a real <button> for keyboard/screen-reader users, and panel restoration
  // after a refresh rebuilt the node.
  function makeExpandable(host, g, btnParent) {
    host.dataset.gameId = g.id;
    host.classList.add("is-expandable");
    const btn = el("button", "detail-btn", "Details ▾");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "panel-" + g.id);
    btn.dataset.focusKey = g.id + ":btn";
    btnParent.appendChild(btn);
    if (expanded.has(g.id)) setOpen(host, g, true);
  }

  function onBoardClick(e) {
    // Links (network badge, Gamecast) and the panel's own content never toggle.
    if (e.target.closest("a, .panel")) return;
    const host = e.target.closest("[data-game-id]");
    if (!host) return;
    const g = lastGames.get(host.dataset.gameId);
    if (!g) return;
    const open = !expanded.has(g.id);
    if (open) expanded.add(g.id);
    else expanded.delete(g.id);
    setOpen(host, g, open);
    if (open) refreshDetail(g);
  }

  function renderTicker(liveGames) {
    const ticker = $("ticker");
    if (!liveGames.length) {
      ticker.innerHTML = "";
      ticker.hidden = true;
      return;
    }
    ticker.hidden = false;
    const track = el("div", "ticker-track");
    const buildItem = (g) => {
      const item = el("span", "ticker-item");
      const side = (t) => {
        const b = el("b", "tk-side");
        b.appendChild(teamMark(t, "sm"));
        b.appendChild(el("span", "", esc(t.score)));
        return b;
      };
      item.appendChild(side(g.away));
      item.appendChild(el("span", "tk-dash", "—"));
      item.appendChild(side(g.home));
      item.appendChild(el("span", "tk-live", g.statusText));
      return item;
    };
    // Duplicate the run so the CSS marquee (translateX -50%) loops seamlessly.
    // Built twice rather than cloned: cloneNode doesn't carry the logo error
    // handlers, so a failed image in the copy would show as a broken icon.
    [...liveGames, ...liveGames].forEach((g) => track.appendChild(buildItem(g)));
    ticker.innerHTML = "";
    ticker.appendChild(track);
  }

  function render(games) {
    // The FBS scoreboard call (see SCOREBOARD_URL) already returns the whole
    // current game week, so no extra date filtering is needed here — that
    // would just make the board look empty on off days.
    const live = games.filter((g) => g.state === "in").sort((a, b) => liveScore(b) - liveScore(a));
    const upcoming = games.filter((g) => g.state === "pre").sort((a, b) => a.kickoffMs - b.kickoffMs);
    const final = games.filter((g) => g.state === "post").sort((a, b) => b.kickoffMs - a.kickoffMs);

    lastGames = new Map(games.map((g) => [g.id, g]));

    keepFocus(() => {
      renderTicker(live);

      const liveTiles = $("liveTiles");
      liveTiles.innerHTML = "";
      live.forEach((g, i) => liveTiles.appendChild(renderLiveTile(g, i + 1)));
      $("liveEmpty").hidden = live.length > 0;

      const upcomingRows = $("upcomingRows");
      upcomingRows.innerHTML = "";
      upcoming.forEach((g) => upcomingRows.appendChild(renderRow(g, false)));
      $("upcomingEmpty").hidden = upcoming.length > 0;

      const finalRows = $("finalRows");
      finalRows.innerHTML = "";
      final.forEach((g) => finalRows.appendChild(renderRow(g, true)));
      $("finalEmpty").hidden = final.length > 0;
    });

    // Panels just repainted from cache; pull fresh summaries for the open ones.
    // A game that dropped off the scoreboard simply isn't in lastGames anymore.
    expanded.forEach((id) => {
      const g = lastGames.get(id);
      if (g) refreshDetail(g);
    });

    hasRendered = true;
    boardHooks.forEach(runHook);
  }

  function updateClock() {
    $("clock").textContent = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    const btn = $("refreshBtn");
    btn.disabled = true;
    try {
      const res = await fetch(SCOREBOARD_URL + "&_=" + Date.now());
      const data = await res.json();
      const games = (data.events || []).map(parseEvent).filter(Boolean);
      render(games);
    } catch (err) {
      console.error("RedZone: failed to load scoreboard", err);
    } finally {
      btn.disabled = false;
      loading = false;
    }
  }

  $("refreshBtn").addEventListener("click", load);
  ["liveTiles", "upcomingRows", "finalRows"].forEach((id) => $(id).addEventListener("click", onBoardClick));
  updateClock();
  setInterval(updateClock, 1000);
  load();
  setInterval(load, REFRESH_MS);
})();
