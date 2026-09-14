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
  const TEAM_SCHEDULE_TEAMS = [
    { key: "baseball/mlb", id: "17", label: "MLB" },                                   // Cincinnati Reds
    { key: "football/nfl", id: "4", label: "NFL" },                                    // Cincinnati Bengals
    { key: "football/college-football", id: "96", label: "NCAAF" },                    // Kentucky Wildcats
    { key: "football/college-football", id: "97", label: "NCAAF" },                    // Louisville Cardinals
    { key: "basketball/mens-college-basketball", id: "96", label: "NCAAM" },           // Kentucky Wildcats
    { key: "basketball/mens-college-basketball", id: "97", label: "NCAAM" },           // Louisville Cardinals
    { key: "basketball/womens-college-basketball", id: "96", label: "NCAAW" },         // Kentucky Wildcats
    { key: "basketball/womens-college-basketball", id: "97", label: "NCAAW" },         // Louisville Cardinals
  ];
  const SOCCER_LEAGUES = [
    { key: "soccer/usa.1", label: "MLS", patterns: ["fc cincinnati"] },
    { key: "soccer/usa.nwsl", label: "NWSL", patterns: ["racing louisville"] },
    { key: "soccer/usa.usl.1", label: "USL Championship", patterns: ["lexington"] },
    { key: "soccer/eng.1", label: "Premier League", patterns: ["liverpool", "arsenal"] },
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

  function parseGameEvent(ev, leagueLabel) {
    const comp = ev && ev.competitions && ev.competitions[0];
    if (!comp) return null;
    const competitors = comp.competitors || [];
    const away = competitors.find(c => c.homeAway === "away");
    const home = competitors.find(c => c.homeAway === "home");
    if (!away || !home) return null;
    const et = toET(ev.date || comp.date);
    const state = comp.status && comp.status.type && comp.status.type.state;
    const awayName = (away.team && (away.team.shortDisplayName || away.team.displayName)) || "?";
    const homeName = (home.team && (home.team.shortDisplayName || home.team.displayName)) || "?";
    const scoreOf = c => c.score && (c.score.displayValue || c.score.value);
    let title;
    if (state === "post" || state === "in") {
      const as = scoreOf(away), hs = scoreOf(home);
      title = leagueLabel + " · " + awayName + " " + (as != null ? as : "0") +
        ", " + homeName + " " + (hs != null ? hs : "0") + (state === "post" ? " (Final)" : " (Live)");
    } else {
      title = leagueLabel + " · " + awayName + " @ " + homeName;
    }
    return { date: et.date, start: et.time, title: title, type: "sports" };
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
      return events.map(ev => parseGameEvent(ev, entry.label)).filter(Boolean)
        .filter(g => g.date >= minDate && g.date <= maxDate);
    } catch (e) {
      return [];
    }
  }

  async function fetchSoccerLeagueEvents(entry, minDate, maxDate) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const range = minDate.replace(/-/g, "") + "-" + maxDate.replace(/-/g, "");
      const url = ESPN + entry.key + "/scoreboard?dates=" + range + "&limit=1000";
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) return [];
      const data = await res.json();
      const events = Array.isArray(data.events) ? data.events : [];
      return events.filter(ev => {
        const comp = ev.competitions && ev.competitions[0];
        const names = ((comp && comp.competitors) || []).map(c =>
          ((c.team && c.team.displayName) || "").toLowerCase());
        return entry.patterns.some(p => names.some(n => n.includes(p)));
      }).map(ev => parseGameEvent(ev, entry.label)).filter(Boolean);
    } catch (e) {
      return [];
    }
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
          return '<span class="cal-today-item">' +
            (label ? '<strong>' + esc(label) + '</strong> ' : '') +
            (rng && !sameAsLabel ? '<strong>' + esc(rng) + '</strong> ' : '') +
            esc(ev.title || '') + '</span>';
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
      evs.forEach(ev => {
        const rng = fmtRange(ev);
        const clock = fmtTime(ev.start);   // real HH:MM only — never freetext
        const start = clock || rng;
        html += '<div class="cal-ev' + eventClass(ev) + '" title="' +
          esc((ev.title || "") + (rng ? " · " + rng : "")) + '">' +
          (start ? '<span class="cal-ev-s">' + esc(start) + '</span> ' : '') +
          (rng && rng !== start ? '<span class="cal-ev-t">' + esc(rng) + '</span> ' : '') +
          '<span class="cal-ev-mobile">' + esc(clock || "•") + '</span>' +
          '<span class="cal-ev-title">' + esc(ev.title || "") + '</span></div>';
      });
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
        agenda.push('<li class="cal-agenda-item">' +
          '<span class="cal-agenda-date">' + esc(featuredLabel(ds)) + '</span>' +
          '<span class="cal-agenda-title">' + esc(ev.title || "") + '</span>' +
          (rng ? '<span class="cal-agenda-time">' + esc(rng) + '</span>' : '') +
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
