/* Calendar & Day Plan — standalone page.
 * Split out from The McBoop Daily (news.jaredluyster.com) so the personal
 * calendar has its own domain. Data comes from /calendar.json (same file the
 * news app used to read), fetched no-cache so newly added commitments show up
 * without a redeploy. Times are ET.
 */
(function () {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;

  let calEvents = null; // loaded from /calendar.json (null = not yet fetched)
  let generatedAt = null;
  let refreshTimer = null;

  // ---- Sports: games for the teams I follow ------------------------------
  // Pulled live from ESPN's public JSON (CORS-enabled), same source and same
  // "my teams" as sports.jaredluyster.com (sports/sports.js LEAGUES) — keep
  // this list in sync with that file by hand if a followed team changes.
  // Two fetch strategies, picked per-sport by what ESPN actually returns:
  //   - Team schedule endpoint (small payload, whole season) works for the
  //     US pro/college leagues below and reliably includes future games.
  //   - It does NOT include future fixtures for soccer (verified against
  //     MLS/NWSL/USL/EPL), so those leagues instead scan the league
  //     scoreboard over a date range and filter to my team by name.
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  // order: "away-home" follows the American broadcast convention (visitor
  // listed first, e.g. "away @ home"); "home-away" follows the international
  // football/soccer convention (host club listed first, e.g. "home vs away").
  // League logos are ESPN CDN assets, hand-resolved once from each league's
  // /scoreboard response (its top-level `leagues[0].logos`) since the team
  // schedule endpoint used below doesn't include one. NCAAM/NCAAW share ESPN's
  // one generic basketball icon — ESPN doesn't publish separate league marks
  // for the men's/women's tournaments.
  const TEAM_SCHEDULE_TEAMS = [
    { key: "baseball/mlb", id: "17", label: "MLB", order: "away-home",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png" },                 // Cincinnati Reds
    { key: "football/nfl", id: "4", label: "NFL", order: "away-home",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },                 // Cincinnati Bengals
    { key: "football/college-football", id: "96", label: "NCAAF", order: "away-home",
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-football-college.png" },  // Kentucky Wildcats
    { key: "football/college-football", id: "97", label: "NCAAF", order: "away-home",
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-football-college.png" },  // Louisville Cardinals
    { key: "basketball/mens-college-basketball", id: "96", label: "NCAAM", order: "away-home",
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png" },        // Kentucky Wildcats
    { key: "basketball/mens-college-basketball", id: "97", label: "NCAAM", order: "away-home",
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png" },        // Louisville Cardinals
    { key: "basketball/womens-college-basketball", id: "96", label: "NCAAW", order: "away-home",
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png" },        // Kentucky Wildcats
    { key: "basketball/womens-college-basketball", id: "97", label: "NCAAW", order: "away-home",
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png" },        // Louisville Cardinals
  ];
  const SOCCER_LEAGUES = [
    { key: "soccer/usa.1", label: "MLS", order: "home-away", patterns: ["fc cincinnati"],
      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/19.png" },
    { key: "soccer/usa.nwsl", label: "NWSL", order: "home-away", patterns: ["racing louisville"],
      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2323.png" },
    { key: "soccer/usa.usl.1", label: "USL Championship", order: "home-away", patterns: ["lexington"],
      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2292.png" },
    { key: "soccer/eng.1", label: "Premier League", order: "home-away", patterns: ["liverpool", "arsenal"],
      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png" },
    { key: "soccer/esp.1", label: "La Liga", order: "home-away", patterns: ["athletic club"],  // Athletic Bilbao
      logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png" },
    // Cup/continental competitions layered on top of each club's domestic
    // league above — these are what actually produce the midweek fixtures a
    // domestic-only scoreboard misses (Champions/Europa League matchdays,
    // domestic cup rounds, Leagues Cup/US Open Cup ties). No `logo` here: the
    // matchup chip only ever shows team logos now, never the league mark.
    { key: "soccer/uefa.champions", label: "Champions League", order: "home-away", patterns: ["liverpool", "arsenal"] },
    { key: "soccer/uefa.europa", label: "Europa League", order: "home-away", patterns: ["athletic club"] },
    { key: "soccer/eng.fa", label: "FA Cup", order: "home-away", patterns: ["liverpool", "arsenal"] },
    { key: "soccer/eng.league_cup", label: "Carabao Cup", order: "home-away", patterns: ["liverpool", "arsenal"] },
    { key: "soccer/esp.copa_del_rey", label: "Copa del Rey", order: "home-away", patterns: ["athletic club"] },
    { key: "soccer/usa.open", label: "US Open Cup", order: "home-away", patterns: ["fc cincinnati", "lexington"] },
    { key: "soccer/concacaf.leagues.cup", label: "Leagues Cup", order: "home-away", patterns: ["fc cincinnati"] },
  ];
  const SPORTS_WINDOW_DAYS_BEHIND = 7;   // covers the display's Sunday-of-this-week start
  const SPORTS_WINDOW_DAYS_AHEAD = 45;   // covers the rolling ~5-6 week display
  const SPORTS_REFRESH_MS = 60 * 60 * 1000;      // schedules rarely change; poll hourly
  const SPORTS_MIN_REFETCH_MS = 10 * 60 * 1000;  // floor so manual refresh can't hammer ESPN

  let sportsEvents = [];
  let sportsLastFetch = 0;

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function stampUpdated() {
    const d = generatedAt ? new Date(generatedAt) : new Date();
    $("updated").textContent = "updated " + d.toLocaleString("en-US",
      { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }

  function stampDateline() {
    const now = new Date();
    $("dateline").textContent = now.toLocaleDateString("en-US", {
      timeZone: "America/New_York", weekday: "long", month: "long",
      day: "numeric", year: "numeric",
    }) + " · Lexington, Kentucky";
  }

  async function loadCalendar() {
    try {
      const res = await fetch("/calendar.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("calendar.json " + res.status);
      const j = await res.json();
      calEvents = Array.isArray(j.events) ? j.events.slice() : [];
    } catch (e) {
      calEvents = [];
    }
    generatedAt = Date.now();
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function etTodayStr() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date());
    } catch (e) {
      const d = new Date();
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }
  }

  function addDaysToDateStr(dateStr, days) {
    const p = dateStr.split("-").map(Number);
    const d = new Date(p[0], p[1] - 1, p[2] + days, 12);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // ISO instant -> ET calendar date + 24h clock time, matching the shape
  // etTodayStr()/renderCalendar() already key everything else off of.
  function toET(isoStr) {
    const d = new Date(isoStr);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const hh = map.hour === "24" ? "00" : map.hour; // Intl quirk at midnight
    return { date: map.year + "-" + map.month + "-" + map.day, time: hh + ":" + map.minute };
  }

  // Picks a display logo URL off an ESPN competitor's team object. Soccer
  // competitors carry a single `team.logo` string; US pro/college sports
  // carry a `team.logos` array of variants (light/dark/scoreboard) instead.
  function teamLogoUrl(team) {
    if (!team) return null;
    if (team.logo) return team.logo;
    if (Array.isArray(team.logos) && team.logos.length) {
      const def = team.logos.find(l => Array.isArray(l.rel) && l.rel.includes("default") && !l.rel.includes("dark"));
      return (def || team.logos[0]).href;
    }
    return null;
  }

  function parseGameEvent(ev, entry) {
    const comp = ev && ev.competitions && ev.competitions[0];
    if (!comp) return null;
    const competitors = comp.competitors || [];
    const away = competitors.find(c => c.homeAway === "away");
    const home = competitors.find(c => c.homeAway === "home");
    if (!away || !home) return null;
    const et = toET(ev.date || comp.date);
    // ESPN sets timeValid:false when a kickoff hasn't been announced yet — the
    // date's time-of-day is then just a placeholder (often midnight ET), not
    // the real start time, so show "TBD" instead of a made-up clock reading.
    const timeValid = ev.timeValid !== false && comp.timeValid !== false;
    const state = comp.status && comp.status.type && comp.status.type.state;
    const awayName = (away.team && (away.team.shortDisplayName || away.team.displayName)) || "?";
    const homeName = (home.team && (home.team.shortDisplayName || home.team.displayName)) || "?";
    const scoreOf = c => c.score && (c.score.displayValue || c.score.value);
    const live = state === "post" || state === "in";
    const awayScore = live ? (scoreOf(away) != null ? scoreOf(away) : "0") : null;
    const homeScore = live ? (scoreOf(home) != null ? scoreOf(home) : "0") : null;
    let title;
    if (live) {
      title = entry.label + " · " + awayName + " " + awayScore +
        ", " + homeName + " " + homeScore + (state === "post" ? " (Final)" : " (Live)");
    } else {
      title = entry.label + " · " + awayName + " @ " + homeName;
    }
    // Fixture placement follows each sport's own convention (see TEAM_SCHEDULE_TEAMS/
    // SOCCER_LEAGUES comment): American sports show away first, soccer shows home first.
    const homeFirst = entry.order === "home-away";
    return {
      date: et.date, start: timeValid ? et.time : null,
      timeLabel: timeValid ? null : "TBD", title: title, type: "sports",
      league: entry.label, leagueLogo: entry.logo, state: state || "pre",
      leftName: homeFirst ? homeName : awayName,
      rightName: homeFirst ? awayName : homeName,
      leftLogo: teamLogoUrl((homeFirst ? home : away).team),
      rightLogo: teamLogoUrl((homeFirst ? away : home).team),
      leftScore: homeFirst ? homeScore : awayScore,
      rightScore: homeFirst ? awayScore : homeScore,
    };
  }

  async function fetchTeamScheduleEvents(entry, minDate, maxDate) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const url = ESPN + entry.key + "/teams/" + entry.id + "/schedule";
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];
      const data = await res.json();
      const events = Array.isArray(data.events) ? data.events : [];
      return events.map(ev => parseGameEvent(ev, entry)).filter(Boolean)
        .filter(g => g.date >= minDate && g.date <= maxDate);
    } catch (e) {
      return [];
    }
  }

  // ESPN's scoreboard endpoint currently rejects the hyphenated range form
  // (`dates=YYYYMMDD-YYYYMMDD` → 400 "Failed to get events endpoint.", verified
  // directly against the API, not a local artifact) that this used to rely on
  // for its whole window in one request. A `dates=YYYYMM` (month) query still
  // works, so fetch one request per month the window touches and trim the
  // overshoot at the edges client-side.
  function monthsBetween(minDate, maxDate) {
    let [y, m] = minDate.split("-").map(Number);
    const [y2, m2] = maxDate.split("-").map(Number);
    const months = [];
    while (y < y2 || (y === y2 && m <= m2)) {
      months.push(y + pad2(m));
      m++; if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  async function fetchSoccerLeagueEvents(entry, minDate, maxDate) {
    async function fetchMonth(ym) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const url = ESPN + entry.key + "/scoreboard?dates=" + ym;
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.events) ? data.events : [];
      } catch (e) {
        return [];
      }
    }
    const monthJobs = monthsBetween(minDate, maxDate).map(fetchMonth);
    const events = (await Promise.all(monthJobs)).flat();
    return events.filter(ev => {
      const comp = ev.competitions && ev.competitions[0];
      const names = ((comp && comp.competitors) || []).map(c =>
        ((c.team && c.team.displayName) || "").toLowerCase());
      return entry.patterns.some(p => names.some(n => n.includes(p)));
    }).map(ev => parseGameEvent(ev, entry)).filter(Boolean)
      .filter(g => g.date >= minDate && g.date <= maxDate);
  }

  async function loadSportsEvents() {
    const todayStr = etTodayStr();
    const minDate = addDaysToDateStr(todayStr, -SPORTS_WINDOW_DAYS_BEHIND);
    const maxDate = addDaysToDateStr(todayStr, SPORTS_WINDOW_DAYS_AHEAD);
    const jobs = TEAM_SCHEDULE_TEAMS.map(t => fetchTeamScheduleEvents(t, minDate, maxDate))
      .concat(SOCCER_LEAGUES.map(l => fetchSoccerLeagueEvents(l, minDate, maxDate)));
    const results = await Promise.all(jobs);
    sportsEvents = results.flat();
    sportsLastFetch = Date.now();
  }

  function fmtTime(hhmm) {
    if (!hhmm) return "";
    const p = String(hhmm).split(":");
    let h = parseInt(p[0], 10);
    const m = p[1] || "00";
    if (isNaN(h)) return esc(hhmm);
    if (h === 12 && m === "00") return "Noon";
    const per = h < 12 ? "a" : "p";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + (m === "00" ? "" : ":" + m) + per;
  }

  function fmtRange(ev) {
    if (ev.timeLabel) return String(ev.timeLabel);
    const s = fmtTime(ev.start), e = fmtTime(ev.end);
    if (s && e) return s + "–" + e;   // en dash
    return s || e || "";
  }

  function eventClass(ev) {
    const kind = String(ev.type || ev.kind || ev.category || "").toLowerCase();
    if (!kind) return "";
    const safe = kind.replace(/[^a-z0-9_-]/g, "");
    return safe ? " cal-ev--" + safe : "";
  }

  // TEAMLOGO TIME TEAMLOGO, in each sport's own home/away fixture order (see
  // parseGameEvent). Once the game is live or final, the time slot switches
  // to the score. `size` picks a CSS modifier for the three contexts this
  // renders in: "sm" grid chips (default), "md" the upcoming strip, "lg" the
  // full-schedule agenda. Falls back to null (caller uses text) when either
  // team logo is missing, e.g. an ESPN response with no team art.
  function sportsMatchHtml(ev, size) {
    if (ev.type !== "sports" || !ev.leftLogo || !ev.rightLogo) return null;
    const sizeClass = size && size !== "sm" ? " cal-ev-match--" + size : "";
    const hasScore = (ev.state === "in" || ev.state === "post") &&
      ev.leftScore != null && ev.rightScore != null;
    const centerHtml = hasScore
      ? '<span class="cal-ev-score' + (ev.state === "in" ? " cal-ev-score--live" : "") + '">' +
        esc(ev.leftScore) + '–' + esc(ev.rightScore) + '</span>'
      : '<span class="cal-ev-match-time">' + esc(fmtRange(ev)) + '</span>';
    return '<span class="cal-ev-match' + sizeClass + '">' +
      '<span class="cal-ev-match-teams">' +
        '<img class="cal-ev-logo cal-ev-logo--team" src="' + esc(ev.leftLogo) + '" alt="' + esc(ev.leftName) + '" loading="lazy" decoding="async">' +
        centerHtml +
        '<img class="cal-ev-logo cal-ev-logo--team" src="' + esc(ev.rightLogo) + '" alt="' + esc(ev.rightName) + '" loading="lazy" decoding="async">' +
      '</span>' +
      '</span>';
  }

  function renderCalendar() {
    const root = $("calRoot");
    if (!root) return;
    if (calEvents === null) {
      root.innerHTML = '<p class="cal-loading">Loading calendar&hellip;</p>';
      loadCalendar().then(() => { renderCalendar(); stampUpdated(); });
      return;
    }

    const todayStr = etTodayStr();
    const tp = todayStr.split("-").map(Number);
    const dow = new Date(tp[0], tp[1] - 1, tp[2], 12).getDay();   // 0 = Sun
    // Rolling window: start on the Sunday of the current week, then run enough
    // whole weeks to cover ~a month ahead. Days flow continuously across month
    // boundaries (bleedthrough); there's no navigation into the past.
    const start = new Date(tp[0], tp[1] - 1, tp[2] - dow, 12);
    const totalDays = Math.ceil((dow + 31) / 7) * 7;

    const days = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12));
    }
    const last = days[days.length - 1];

    const byDate = {};
    const dowCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    function addByDate(dateStr, ev) {
      const copy = Object.assign({}, ev, { date: dateStr });
      (byDate[dateStr] = byDate[dateStr] || []).push(copy);
    }
    calEvents.concat(sportsEvents).forEach(ev => {
      if (!ev || !ev.date) return;
      const recur = ev.recurrence || {};
      const freq = String(recur.freq || "").toLowerCase();
      if (freq === "weekly") {
        let byDay = recur.byDay || dowCodes[new Date(ev.date + "T12:00:00").getDay()];
        if (typeof byDay === "string") byDay = byDay.split(",");
        const wanted = new Set((Array.isArray(byDay) ? byDay : [byDay])
          .map(s => String(s || "").trim().toUpperCase()).filter(Boolean));
        const until = recur.until || "";
        const exclusions = new Set((Array.isArray(recur.exclude) ? recur.exclude : [recur.exclude])
          .map(s => String(s || "").trim()).filter(Boolean));
        days.forEach(d => {
          const ds = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
          if (ds < ev.date) return;
          if (until && ds > until) return;
          if (exclusions.has(ds)) return;
          if (!wanted.has(dowCodes[d.getDay()])) return;
          addByDate(ds, ev);
        });
        return;
      }
      addByDate(ev.date, ev);
    });
    Object.keys(byDate).forEach(k =>
      byDate[k].sort((a, b) => String(a.start || "").localeCompare(String(b.start || ""))));

    function isWorkEvent(ev) {
      return String(ev.type || ev.kind || ev.category || "").toLowerCase() === "work";
    }
    const tomorrow = new Date(tp[0], tp[1] - 1, tp[2] + 1, 12);
    const tomorrowStr = tomorrow.getFullYear() + "-" + pad2(tomorrow.getMonth() + 1) + "-" + pad2(tomorrow.getDate());
    function featuredLabel(dateStr) {
      if (dateStr === todayStr) return "Today";
      if (dateStr === tomorrowStr) return "Tomorrow";
      const parts = dateStr.split("-").map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2], 12)
        .toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
    }
    const featuredEvents = [];
    [todayStr, tomorrowStr].forEach(ds => {
      (byDate[ds] || []).forEach(ev => {
        if (!isWorkEvent(ev)) featuredEvents.push(Object.assign({}, ev, { _dateLabel: featuredLabel(ds) }));
      });
    });

    const sM = start.toLocaleDateString("en-US", { month: "long" });
    const lM = last.toLocaleDateString("en-US", { month: "long" });
    const sy = start.getFullYear(), ly = last.getFullYear();
    let range;
    if (sy === ly) range = (sM === lM) ? (sM + " " + sy) : (sM + " – " + lM + " " + sy);
    else range = sM + " " + sy + " – " + lM + " " + ly;

    let html = '<div class="cal-range">' + esc(range) + '</div>';
    if (featuredEvents.length) {
      html += '<div class="cal-today-strip"><span class="cal-today-label">Upcoming</span>' +
        featuredEvents.map(ev => {
          const label = ev._dateLabel || "";
          const rng = fmtRange(ev);
          const sameAsLabel = rng && label && rng.toLowerCase() === label.toLowerCase();
          const matchHtml = sportsMatchHtml(ev, "md"); // already carries the time/score, so skip the plain-text rng below
          return '<span class="cal-today-item">' +
            (label ? '<strong>' + esc(label) + '</strong> ' : '') +
            (!matchHtml && rng && !sameAsLabel ? '<strong>' + esc(rng) + '</strong> ' : '') +
            (matchHtml || esc(ev.title || '')) + '</span>';
        }).join('') + '</div>';
    }
    html += '<div class="cal-grid" data-weeks="' + (totalDays / 7) + '">';
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d =>
      html += '<div class="cal-dow">' + d + '</div>');

    days.forEach((d, i) => {
      const Mo = d.getMonth() + 1, day = d.getDate();
      const ds = d.getFullYear() + "-" + pad2(Mo) + "-" + pad2(day);
      const isToday = ds === todayStr;
      const isPast = ds < todayStr;
      const evs = byDate[ds] || [];
      const showMon = day === 1 || i === 0;   // mark each new month for bleedthrough
      html += '<div class="cal-cell' +
        (isToday ? " cal-cell--today" : "") +
        (isPast ? " cal-cell--past" : "") +
        (evs.length ? " cal-cell--has" : "") + '">';
      html += '<div class="cal-daynum">' +
        (showMon ? '<span class="cal-mon">' + esc(d.toLocaleDateString("en-US", { month: "short" })) + '</span> ' : '') +
        day + '</div>';
      function evChipHtml(ev) {
        const rng = fmtRange(ev);
        const clock = fmtTime(ev.start);   // real HH:MM only — never freetext
        const start = clock || rng;
        return '<div class="cal-ev' + eventClass(ev) + '" title="' +
          esc((ev.title || "") + (rng ? " · " + rng : "")) + '">' +
          (start ? '<span class="cal-ev-s">' + esc(start) + '</span> ' : '') +
          (rng && rng !== start ? '<span class="cal-ev-t">' + esc(rng) + '</span> ' : '') +
          '<span class="cal-ev-mobile">' + esc(clock || "•") + '</span>' +
          '<span class="cal-ev-title">' + (sportsMatchHtml(ev) || esc(ev.title || "")) + '</span></div>';
      }
      // Sports fixtures get their own 2-column grid (square-ish cards, more
      // vertical room per card) instead of stacking full-width like other
      // event types — a day with four games reads as 2x2, not a 4-row list.
      const sportsEvs = evs.filter(ev => ev.type === "sports");
      const otherEvs = evs.filter(ev => ev.type !== "sports");
      otherEvs.forEach(ev => { html += evChipHtml(ev); });
      if (sportsEvs.length) {
        html += '<div class="cal-ev-grid">' + sportsEvs.map(evChipHtml).join('') + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';

    // Readable agenda for the whole displayed range — the mobile companion to
    // the grid (the grid chips compress to time pills on small screens; this
    // list is where the full titles live, for every day in view, not just the
    // next 7). Rendered always, shown via CSS on mobile.
    const agenda = [];
    days.forEach(d => {
      const ds = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      if (ds < todayStr) return;
      const evs = byDate[ds] || [];
      if (!evs.length) return;
      evs.forEach(ev => {
        const rng = fmtRange(ev);
        const matchHtml = sportsMatchHtml(ev, "lg"); // already carries the time/score, so skip the plain-text rng below
        agenda.push('<li class="cal-agenda-item">' +
          '<span class="cal-agenda-date">' + esc(featuredLabel(ds)) + '</span>' +
          '<span class="cal-agenda-title">' + (matchHtml || esc(ev.title || "")) + '</span>' +
          (!matchHtml && rng ? '<span class="cal-agenda-time">' + esc(rng) + '</span>' : '') +
          '</li>');
      });
    });
    if (agenda.length) {
      html += '<div class="cal-agenda-wrap"><h3 class="sub">Full Schedule</h3>' +
        '<ul class="cal-agenda">' + agenda.join("") + '</ul></div>';
    }

    root.innerHTML = html;
    fitCalendarGrid();
    requestAnimationFrame(fitCalendarGrid);
  }

  // Size the month grid to fill the remaining viewport height so the whole
  // calendar sits on one screen — the week rows share the space equally.
  function fitCalendarGrid() {
    const grid = document.querySelector(".cal-grid");
    if (!grid) return;
    const weeks = Number(grid.getAttribute("data-weeks")) || 5;
    const gr = grid.getBoundingClientRect();
    const top = gr.top;
    // Keep enough vertical room for at least three event chips per day. If the
    // viewport is shorter, let the calendar scroll instead of compressing rows.
    const minWeekRow = window.innerWidth <= 680 ? 116 : 150;
    const minGridHeight = 28 + (weeks * minWeekRow); // weekday header + week rows
    const belowChrome = document.documentElement.scrollHeight - (gr.bottom + window.scrollY);
    const viewportFit = Math.round(window.innerHeight - top - belowChrome - 12);
    const avail = Math.min(1080, Math.max(minGridHeight, viewportFit, 360));
    grid.style.height = avail + "px";
    grid.style.gridTemplateRows = "auto repeat(" + weeks + ", minmax(" + minWeekRow + "px, 1fr))";
  }

  async function refresh() {
    const btn = $("refreshBtn");
    if (btn) btn.disabled = true;
    calEvents = null; // force a fresh /calendar.json fetch so new commitments appear
    if (Date.now() - sportsLastFetch > SPORTS_MIN_REFETCH_MS) {
      loadSportsEvents().then(renderCalendar);
    }
    renderCalendar();
    stampUpdated();
    if (btn) btn.disabled = false;
  }

  function startLoops() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, REFRESH_MS);
    setInterval(() => { loadSportsEvents().then(renderCalendar); }, SPORTS_REFRESH_MS);
    const btn = $("refreshBtn");
    if (btn) btn.addEventListener("click", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
    window.addEventListener("resize", fitCalendarGrid);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitCalendarGrid);
    }
  }

  (function boot() {
    stampDateline();
    renderCalendar();
    stampUpdated();
    startLoops();
    loadSportsEvents().then(renderCalendar);
  })();
})();
