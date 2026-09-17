/* RedZone — NCAAF whiparound board (schedule/priority shell, no video)
 *
 * Pulls today's college football scoreboard from ESPN's public,
 * CORS-open site API (same endpoint sports.js already relies on) and ranks
 * live games by how close/urgent they are, whiparound-style. Network badges
 * link out to that broadcaster's own homepage — nothing here streams,
 * proxies, or embeds any video.
 */
(function () {
  "use strict";

  const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?limit=1000";
  const REFRESH_MS = 20000;

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
      away: { name: away.team.displayName, abbr: teamAbbr(away), score: away.score, winner: !!away.winner, rank: rankOf(away) },
      home: { name: home.team.displayName, abbr: teamAbbr(home), score: home.score, winner: !!home.winner, rank: rankOf(home) },
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
    nameWrap.appendChild(el("span", "abbr", t.abbr));
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
    return tile;
  }

  function renderRow(g, isFinal) {
    const row = el("div", "row" + (isFinal ? " row-final" : ""));
    const teams = el("div", "row-teams");
    const nameSpan = (t) => {
      const s = el("span", isFinal && t.winner ? "winner" : "");
      s.textContent = (t.rank ? "#" + t.rank + " " : "") + t.abbr + (isFinal ? " " + t.score : "");
      return s;
    };
    teams.appendChild(nameSpan(g.away));
    teams.appendChild(el("span", "row-vs", "@"));
    teams.appendChild(nameSpan(g.home));
    row.appendChild(teams);
    const badge = networkBadge(g.broadcast);
    if (badge) row.appendChild(badge);
    row.appendChild(el("div", "row-time", g.statusText));
    return row;
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
    const items = liveGames.map((g) => {
      const item = el("span", "ticker-item");
      item.innerHTML =
        "<b>" + esc(g.away.abbr) + " " + esc(g.away.score) + "</b> — <b>" + esc(g.home.abbr) + " " + esc(g.home.score) + "</b> " +
        "<span class=\"tk-live\">" + esc(g.statusText) + "</span>";
      return item;
    });
    // Duplicate the run so the CSS marquee (translateX -50%) loops seamlessly.
    [...items, ...items.map((n) => n.cloneNode(true))].forEach((n) => track.appendChild(n));
    ticker.innerHTML = "";
    ticker.appendChild(track);
  }

  function render(games) {
    // ESPN's default (dateless) scoreboard call already scopes to the
    // current game week (roughly Tue-Mon), so no extra date filtering is
    // needed here — that would just make the board look empty on off days.
    const live = games.filter((g) => g.state === "in").sort((a, b) => liveScore(b) - liveScore(a));
    const upcoming = games.filter((g) => g.state === "pre").sort((a, b) => a.kickoffMs - b.kickoffMs);
    const final = games.filter((g) => g.state === "post").sort((a, b) => b.kickoffMs - a.kickoffMs);

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
  updateClock();
  setInterval(updateClock, 1000);
  load();
  setInterval(load, REFRESH_MS);
})();
