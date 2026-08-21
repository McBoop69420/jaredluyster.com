/* The McBoop Daily — living news shell
 * No more newspaper runs. Every tab renders live from its own source:
 * Calendar (calendar.json), Local (NWS), news (RSS via /api/feeds) and
 * Sports (BetExplorer odds via /api/odds + an in-browser MLB value model
 * from statsapi.mlb.com + the paper-bet ledger from /sports/fake-bets.json).
 * The old edition.json is ignored; a synthesized "edition" object keeps the
 * legacy render paths working.
 */
(function () {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;        // re-check for a newer edition
  const WEATHER_REFRESH_MS = 10 * 60 * 1000; // NWS data is slow-moving
  const LIVE_FEED_REFRESH_MS = 4 * 60 * 1000; // matches the worker's edge-cache TTL
  const NWS_POINT = "38.0297,-84.4947";     // Lexington, KY (ZIP 40517)
  const UA = "McBoopNews/1.0 (jaredluyster.com)";

  // National/World/Business/Technology/Science & Health are no longer authored
  // by an edition — they're a real RSS feed pulled live from the browser via
  // the /api/feeds worker route (see public/_worker.js).
  const LIVE_NEWS_SECTIONS = [
    { name: "National", short: "National", liveFeed: "national" },
    { name: "World", short: "World", liveFeed: "world" },
    { name: "Business", short: "Business", liveFeed: "business" },
    { name: "Technology", short: "Tech", liveFeed: "tech" },
    { name: "Science & Health", short: "Science", liveFeed: "science" },
  ];

  // The complete tab strip, built once. Calendar = calendar.json, Local =
  // live NWS, the five news tabs = live RSS feeds, Sports = live odds +
  // in-browser model + paper-bet ledger. No per-day authored content exists.
  const SECTIONS = [
    { name: "Calendar & Day Plan", short: "Calendar", calendar: true, planHtml: "" },
    { name: "Local & Weather", short: "Local", liveWeather: true, liveFeed: "local" },
    ...LIVE_NEWS_SECTIONS.map((s) => Object.assign({}, s)),
    { name: "Sports & Betting", short: "Sports", liveSports: true },
  ];

  let data = null;
  let activeTab = 0;
  let refreshTimer = null;
  let weatherTimer = null;
  let liveFeedTimer = null;
  let sportsTimer = null;
  let calEvents = null;   // loaded from /calendar.json (null = not yet fetched)
  let liveFeeds = null;   // { national: [...], world: [...], ... } once loaded
  let liveFeedsLoadedAt = 0;

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---- Edition is retired: synthesize the shell data -------------------
  // There is no edition.json anymore. The "edition" object is built here so
  // every legacy render path (title, dateline, sections, stampUpdated) keeps
  // working unchanged against fully live data.
  function buildData() {
    const now = new Date();
    const dateLine = now.toLocaleDateString("en-US", {
      timeZone: "America/New_York", weekday: "long", month: "long",
      day: "numeric", year: "numeric",
    });
    return {
      title: "The McBoop Daily",
      dateline: dateLine + " · Lexington, Kentucky",
      generatedAt: now.toISOString(),
      sections: SECTIONS.map((s) => Object.assign({}, s)),
    };
  }

  async function loadEdition() {
    return buildData();
  }

  function render() {
    if (!data) return;
    $("title").textContent = data.title || "The McBoop Daily";
    $("dateline").innerHTML = data.dateline
      ? esc(data.dateline)
      : (new Date(data.generatedAt || Date.now())).toLocaleString("en-US",
          { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const tabs = $("tabs");
    tabs.innerHTML = "";
    data.sections.forEach((sec, i) => {
      const b = document.createElement("button");
      b.className = "tab" + (i === activeTab ? " active" : "");
      b.type = "button";
      b.innerHTML = esc(sec.short) + (sec.liveWeather ? ' <span class="live-dot" title="Live weather"></span>' : "");
      b.addEventListener("click", () => { activeTab = i; render(); });
      tabs.appendChild(b);
    });

    const stage = $("stage");
    const sec = data.sections[activeTab];
    if (!sec) {
      stage.innerHTML = '<div class="panel-inner"><p>No section loaded.</p></div>';
      return;
    }
    // The calendar sizes itself to the viewport, so let the stage hug it
    // instead of holding the default 60vh minimum.
    const stageWrap = document.querySelector(".stage");
    if (stageWrap) stageWrap.style.minHeight = sec.calendar ? "0" : "";
    if (sec.calendar) {
      stage.innerHTML = '<div class="panel-inner panel-inner--cal">' +
        '<div class="calendar" id="calRoot"></div>' +
        (sec.planHtml ? '<div class="cal-plan"><h3 class="sub">Day Plan</h3>' + sec.planHtml + '</div>' : '') +
        '</div>';
      renderCalendar();
      stampUpdated();
      return;
    }
    if (sec.liveFeed) {
      if (stageWrap) stageWrap.style.minHeight = "";
      renderLiveFeed(sec);
      if (sec.liveWeather) loadWeather();
      stampUpdated();
      return;
    }
    if (sec.liveSports) {
      if (stageWrap) stageWrap.style.minHeight = "";
      renderSports();
      stampUpdated();
      return;
    }
    let html = '<h2 class="sec-head">' + esc(sec.name) + "</h2>";
    if (sec.liveWeather) html += weatherPlaceholder();
    html += sec.html || "";   // synthesized sections have no authored html
    stage.innerHTML = '<div class="panel-inner">' + html + "</div>";

    if (sec.liveWeather) loadWeather();
    stampUpdated();
  }

  function weatherPlaceholder() {
    return '<div class="weather-live" id="weatherLive"><div class="weather-live-head">' +
      '<div><div class="weather-live-kicker">Live &middot; National Weather Service</div>' +
      '<h3>Local Forecast</h3></div></div>' +
      '<div class="weather-err">Loading live conditions&hellip;</div></div>';
  }

  function stampUpdated() {
    const d = data.generatedAt ? new Date(data.generatedAt) : new Date();
    $("updated").textContent = "updated " + d.toLocaleString("en-US",
      { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }

  // ---- Live news feed (National/World/Business/Technology/Science & Health) --
  // Real RSS items fetched server-side by the /api/feeds worker route (browsers
  // can't fetch most publishers' RSS directly — no CORS header on those feeds),
  // then polled here on a short timer so the tab updates without a new edition.
  function renderLiveFeed(sec) {
    const stage = $("stage");
    let html = '<h2 class="sec-head">' + esc(sec.name) + "</h2>";
    if (sec.liveWeather) html += weatherPlaceholder();
    html += '<div class="feed-live-head"><span class="live-dot" title="Live"></span> ' +
      'Live headlines &middot; refreshes automatically</div>';
    html += '<div class="feed-list" id="feedList">' + feedItemsHtml(sec.liveFeed) + "</div>";
    stage.innerHTML = '<div class="panel-inner">' + html + "</div>";
    loadLiveFeeds();
  }

  function feedItemsHtml(slug) {
    const items = liveFeeds && liveFeeds[slug];
    if (!liveFeeds) return '<p class="feed-loading">Loading live headlines&hellip;</p>';
    if (!items || !items.length) return '<p class="feed-loading">No headlines available right now.</p>';
    return items.map((it) =>
      '<a class="feed-item" href="' + esc(it.link) + '" target="_blank" rel="noopener">' +
        '<div class="feed-item-title">' + esc(it.title) + "</div>" +
        '<div class="feed-item-meta">' + esc(it.source || "") +
        (it.bias ? ' <span class="bias-tag bias-' + esc(it.bias) + '">' + esc(BIAS_LABELS[it.bias] || it.bias) + "</span>" : "") +
        (it.pubDate ? " &middot; " + esc(relTime(it.pubDate)) : "") + "</div>" +
      "</a>"
    ).join("");
  }

  // Rough editorial lean shown next to each source (Ground-News-style), not
  // a scientific rating — see the comment above FEED_SOURCES in _worker.js.
  const BIAS_LABELS = {
    left: "Left", "lean-left": "Lean Left", center: "Center",
    "lean-right": "Lean Right", right: "Right",
  };

  function relTime(iso) {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.round(hrs / 24);
    return days + "d ago";
  }

  async function loadLiveFeeds(force) {
    const now = Date.now();
    if (!force && liveFeeds && (now - liveFeedsLoadedAt) < LIVE_FEED_REFRESH_MS) return;
    try {
      const res = await fetch("/api/feeds", { cache: "no-store" });
      if (!res.ok) throw new Error("feeds " + res.status);
      const j = await res.json();
      liveFeeds = j.sections || {};
      liveFeedsLoadedAt = now;
      const sec = data && data.sections[activeTab];
      if (sec && sec.liveFeed) {
        const list = $("feedList");
        if (list) list.innerHTML = feedItemsHtml(sec.liveFeed);
      }
    } catch (e) {
      // Keep showing the last good feed items; a stale list beats an empty one.
    }
  }

  // ---- Calendar (persistent tab, data from /calendar.json) --------------
  // The events live in /calendar.json (not in the per-edition payload), so the
  // Calendar tab survives every edition refresh and redeploy. Times are ET.
  async function loadCalendar() {
    try {
      const res = await fetch("/calendar.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("calendar.json " + res.status);
      const j = await res.json();
      calEvents = Array.isArray(j.events) ? j.events.slice() : [];
    } catch (e) {
      calEvents = [];
    }
  }

  // Put the Calendar first (top-left), before the edition's news sections (once).
  // The edition's own "Plan" section (from the "Calendar & Day Plan" markdown
  // heading) is folded into this same tab instead of appearing as its own tab,
  // so the grid and the day's written plan live together in one place.
  function ensureCalendarSection() {
    if (!data || !Array.isArray(data.sections)) return;
    if (data.sections.some(s => s && s.calendar)) return;
    const planIdx = data.sections.findIndex(s => s && s.short === "Plan");
    let planHtml = "";
    if (planIdx >= 0) {
      planHtml = data.sections[planIdx].html || "";
      data.sections.splice(planIdx, 1);
    }
    data.sections.unshift({ name: "Calendar & Day Plan", short: "Calendar", calendar: true, planHtml: planHtml });
  }

  // Insert the five live-feed news tabs right after Calendar (their old
  // authored position), and drop any stale LLM-authored duplicate of the same
  // name if a leftover cron prompt ever writes one (defense-in-depth, mirrors
  // the generator's own SKIP_SECTIONS).
  function ensureLiveNewsSections() {
    if (!data || !Array.isArray(data.sections)) return;
    const liveNames = new Set(LIVE_NEWS_SECTIONS.map((s) => s.name));
    data.sections = data.sections.filter((s) => !(s && liveNames.has(s.name) && !s.liveFeed));
    if (data.sections.some((s) => s && s.liveFeed)) return;
    // Editorial order is Local & Weather -> Calendar & Day Plan -> National...
    // -> Sports, but Calendar is already pinned to the very front of the tab
    // strip by ensureCalendarSection(). So slot the live feeds right after
    // Local (or after Calendar if Local is somehow missing) — ahead of Sports.
    const localIdx = data.sections.findIndex((s) => s && s.short === "Local");
    const calIdx = data.sections.findIndex((s) => s && s.calendar);
    const insertAt = localIdx >= 0 ? localIdx + 1 : (calIdx >= 0 ? calIdx + 1 : 0);
    data.sections.splice(insertAt, 0, ...LIVE_NEWS_SECTIONS.map((s) => Object.assign({}, s)));
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
      loadCalendar().then(() => { if ($("calRoot")) renderCalendar(); });
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
    calEvents.forEach(ev => {
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

  // ---- Live NWS weather (in-browser fetch, CORS-enabled) ----------------
  async function loadWeather() {
    const box = $("weatherLive");
    if (!box) return;
    try {
      const [forecast, alerts] = await Promise.all([
        fetchNWS("https://api.weather.gov/gridpoints/LMK/96,70/forecast"),
        fetchNWS("https://api.weather.gov/alerts/active?point=" + NWS_POINT),
      ]);
      let html = "";
      const periods = (forecast && forecast.properties && forecast.properties.periods) || [];
      const today = periods[0];
      if (today) {
        html += '<div class="now"><strong>' + esc(today.name) + ":</strong> " +
          esc(today.shortForecast) + (today.temperature ? " &mdash; " + esc(today.temperature) +
          "&deg;" + esc(today.temperatureUnit || "F") : "") + "</div>";
        html += '<div class="weather-rows">';
        periods.slice(0, 4).forEach(p => {
          html += "<div><strong>" + esc(p.name) + ":</strong> " +
            esc(p.shortForecast) + (p.temperature ? " " + esc(p.temperature) + "&deg;" : "") + "</div>";
        });
        html += "</div>";
      } else {
        html += '<div class="weather-err">Forecast unavailable right now.</div>';
      }
      const feats = (alerts && alerts.features) || [];
      if (feats.length) {
        feats.forEach(a => {
          const p = a.properties || {};
          html += '<div class="weather-alert">' + esc(p.event || "Alert") +
            (p.severity ? " &middot; " + esc(p.severity) : "") +
            (p.expires ? " &middot; expires " + esc(new Date(p.expires).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })) : "") +
            "</div>";
        });
      }
      box.innerHTML = '<div class="weather-live-head">' +
        '<div><div class="weather-live-kicker">Live &middot; National Weather Service</div>' +
        '<h3>Local Forecast</h3></div>' +
        '<div class="weather-live-kicker"><a href="https://forecast.weather.gov/MapClick.php?lat=38.0297&lon=-84.4947" target="_blank" rel="noopener">Open NWS &rarr;</a></div></div>' + html;
    } catch (e) {
      box.innerHTML = '<div class="weather-live-head"><div class="weather-live-kicker">Live &middot; National Weather Service</div>' +
        '<h3>Local Forecast</h3></div>' +
        '<div class="weather-err">Live weather unavailable (offline or NWS blocked). The edition\'s written forecast is below.</div>';
    }
  }

  async function fetchNWS(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/geo+json" }, signal: ctrl.signal });
      if (!r.ok) return null;
      return r.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  // ---- Live Sports tab --------------------------------------------------
  // Odds come from /api/odds (the BetExplorer proxy in _worker.js). The value
  // screen is computed IN THE BROWSER from statsapi.mlb.com (CORS-enabled) —
  // the same v2 starter-adjusted model the agent runs at paper time
  // (scripts/daily_mlb_model.py in the live-sports-feeds skill). The tracker
  // strip mirrors /sports/fake-bets.json (published from the vault ledger).
  const SPORTS_REFRESH_MS = 6 * 60 * 1000;
  const STATS = "https://statsapi.mlb.com/api/v1";
  const HOME_ADJ = 4.0;      // points added to the home team's model%
  const EDGE_MIN = 4.0;      // points of edge required to call VALUE/FADE
  const CHECK_GAP = 10.0;    // |edge| above this -> CHECK (model blind spot)
  const MIN_IP = 20.0;       // starter needs this many IP before RA9 is trusted
  let sports = null;         // { games: [...], fetchedAt } for the active date
  let sportsLoading = false;
  let betSummary = null;     // { trackedPicks, wins, losses, netUnits, roi, ... }

  async function fetchJSON(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) return null;
      return r.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  const pitcherRa9Cache = {};
  async function pitcherRa9(pid) {
    if (pitcherRa9Cache[pid] !== undefined) return pitcherRa9Cache[pid];
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
    pitcherRa9Cache[pid] = ra9;
    return ra9;
  }

  function r1(x) { return Math.round(x * 10) / 10; }

  function pyth(rs, ra) {
    if (!rs || !ra) return null;
    const s = ra / rs;
    return 1.0 / (1.0 + Math.pow(s, 1.83));
  }

  // Full v2 screen for today (ET): market from /api/odds, model from statsapi.
  async function computeScreen() {
    const today = etTodayStr();
    const year = today.slice(0, 4);
    const [sched, stand, odds] = await Promise.all([
      fetchJSON(STATS + "/schedule?sportId=1&date=" + today + "&hydrate=team,probablePitcher"),
      fetchJSON(STATS + "/standings?leagueId=103,104&season=" + year + "&standingsTypes=regularSeason"),
      fetchJSON("/api/odds?date=" + today),
    ]);
    const stMap = {};
    let rsTot = 0, gTot = 0;
    ((stand && stand.records) || []).forEach((rec) => (rec.teamRecords || []).forEach((tr) => {
      const team = tr.team || {};
      stMap[team.id] = { rs: tr.runsScored, ra: tr.runsAllowed, g: tr.gamesPlayed };
      if (tr.runsScored && tr.gamesPlayed) { rsTot += tr.runsScored; gTot += tr.gamesPlayed; }
    }));
    const lg9 = gTot ? rsTot / gTot : 4.50;
    const board = {};
    ((odds && odds.games) || []).forEach((g) => {
      const k = g.away + "|" + g.home;
      if (!(k in board)) board[k] = g;
    });
    const games = [];
    for (const day of (sched && sched.dates) || []) {
      for (const g of day.games || []) {
        const a = g.teams.away, h = g.teams.home;
        const at = a.team || {}, ht = h.team || {};
        const awayName = at.name || "", homeName = ht.name || "";
        const gd = g.gameDate || "";
        const row = {
          away: awayName, home: homeName,
          awayAbbr: at.abbreviation || "", homeAbbr: ht.abbreviation || "",
          time: gd ? new Date(gd).toLocaleTimeString("en-US",
            { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) : "",
          awaySt: (a.probablePitcher && { id: a.probablePitcher.id, name: a.probablePitcher.fullName }) || null,
          homeSt: (h.probablePitcher && { id: h.probablePitcher.id, name: h.probablePitcher.fullName }) || null,
        };
        const mkt = board[awayName + "|" + homeName];
        if (!mkt) { row.call = "NO MARKET LINE"; games.push(row); continue; }
        row.away_ml = mkt.away_ml; row.home_ml = mkt.home_ml;
        const aF = mkt.away_implied_pct, hF = mkt.home_implied_pct;
        const awayFair = aF / (aF + hF) * 100, homeFair = 100 - awayFair;
        row.awayFair = r1(awayFair); row.homeFair = r1(homeFair);
        const sa = stMap[a.team.id] || {}, sh = stMap[h.team.id] || {};
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
          row.adj = { away: row.awaySt.name, awayRa9: r1(ar), home: row.homeSt.name, homeRa9: r1(hr), lg: r1(lg9) };
        } else {
          // v1 fallback: independent season Pythagorean per team
          const ap = pyth(sa.rs, sa.ra), hp = pyth(sh.rs, sh.ra);
          if (ap == null || hp == null) { row.call = "NO MODEL"; games.push(row); continue; }
          awayModel = ap * 100 - HOME_ADJ;
          homeModel = hp * 100 + HOME_ADJ;
        }
        const awayEdge = r1(awayModel - awayFair), homeEdge = r1(homeModel - homeFair);
        let call;
        if (Math.max(Math.abs(awayEdge), Math.abs(homeEdge)) >= CHECK_GAP) call = "CHECK";
        else if (awayEdge >= EDGE_MIN) call = "VALUE " + row.awayAbbr;
        else if (homeEdge >= EDGE_MIN) call = "VALUE " + row.homeAbbr;
        else if (awayEdge <= -EDGE_MIN) call = "FADE " + row.awayAbbr;
        else if (homeEdge <= -EDGE_MIN) call = "FADE " + row.homeAbbr;
        else call = "NO EDGE";
        row.awayModel = r1(awayModel); row.homeModel = r1(homeModel);
        row.awayEdge = awayEdge; row.homeEdge = homeEdge;
        row.call = call;
        games.push(row);
      }
    }
    return games;
  }

  async function loadBetSummary() {
    try {
      const j = await fetchJSON("/sports/fake-bets.json");
      betSummary = (j && j.summary) || null;
    } catch (e) {
      betSummary = null;
    }
  }

  function sportsHtml() {
    const g = sports ? sports.games : null;
    if (!g) {
      return '<p class="feed-loading">' +
        (sportsLoading ? "Loading live slate&hellip;" :
          'Live slate unavailable right now. <a href="https://sports.jaredluyster.com/" target="_blank" rel="noopener">Open Sports</a>.') +
        "</p>";
    }
    const sorted = g.slice().sort((x, y) => {
      const ex = Math.max(Math.abs(x.awayEdge || 0), Math.abs(x.homeEdge || 0));
      const ey = Math.max(Math.abs(y.awayEdge || 0), Math.abs(y.homeEdge || 0));
      return ey - ex;
    });
    let html = '<div class="tracker-strip">';
    let t = "";
    if (betSummary) {
      t += "<strong>Paper bets</strong> &middot; " + esc(betSummary.trackedPicks || 0) + " tracked &middot; " +
        esc(betSummary.wins || 0) + "-" + esc(betSummary.losses || 0) +
        (betSummary.pushesVoids ? "-" + esc(betSummary.pushesVoids) : "") +
        " &middot; <strong>" + esc(betSummary.netUnits || "0u") + "</strong> (" +
        esc(betSummary.roi || "0%") + ")";
    } else {
      t = '<a href="https://sports.jaredluyster.com/" target="_blank" rel="noopener">Paper bets &rarr;</a>';
    }
    html += t + ' &middot; <a href="https://sports.jaredluyster.com/" target="_blank" rel="noopener">full screen</a></div>';
    html += '<div class="live-slate-wrap"><table class="live-slate">';
    html += "<thead><tr><th>MATCH (ET)</th><th>ML</th><th>FAIR%</th><th>MODEL%</th><th>EDGE</th><th>CALL</th></tr></thead><tbody>";
    sorted.forEach((r) => {
      if (!r.away_ml) {
        html += "<tr><td><strong>" + esc(r.awayAbbr) + " @ " + esc(r.homeAbbr) + "</strong>" +
          (r.time ? ' <span class="pos-note">' + esc(r.time) + "</span>" : "") +
          '</td><td colspan="4" class="pos-note">no market line yet</td>' +
          '<td><span class="call call--none">' + esc(r.call) + "</span></td></tr>";
        return;
      }
      const callCls = r.call.indexOf("VALUE") === 0 ? "call--value" :
        (r.call.indexOf("FADE") === 0 ? "call--fade" :
          (r.call === "CHECK" ? "call--check" : "call--none"));
      const edgeTxt = r.awayEdge + "/" + r.homeEdge;
      html += "<tr>";
      html += "<td><strong>" + esc(r.awayAbbr) + " @ " + esc(r.homeAbbr) + "</strong>" +
        (r.time ? ' <span class="pos-note">' + esc(r.time) + "</span>" : "") + "</td>";
      html += "<td>" + esc(r.away_ml) + "/" + esc(r.home_ml) + "</td>";
      html += "<td>" + esc(r.awayFair) + "/" + esc(r.homeFair) + "</td>";
      html += "<td>" + esc(r.awayModel) + "/" + esc(r.homeModel) + "</td>";
      html += "<td class=\"" + (Math.max(Math.abs(r.awayEdge || 0), Math.abs(r.homeEdge || 0)) >= EDGE_MIN ? "edge-hot" : "") + "\">" + esc(edgeTxt) + "</td>";
      html += "<td><span class=\"call " + callCls + "\">" + esc(r.call) + "</span></td>";
      html += "</tr>";
      if (r.adj) {
        html += '<tr class="pos-starter"><td colspan="6"><span class="pos-note">starters: ' +
          esc(r.adj.away) + " RA9 " + esc(r.adj.awayRa9) + " vs " + esc(r.adj.home) +
          " RA9 " + esc(r.adj.homeRa9) + " (lg " + esc(r.adj.lg) + ")</span></td></tr>";
      } else if (r.away_ml) {
        html += '<tr class="pos-starter"><td colspan="6"><span class="pos-note">starters: one/both TBA or &lt;' +
          MIN_IP + " IP &middot; v1 fallback</span></td></tr>";
      }
    });
    html += "</tbody></table></div>";
    html += '<p class="pos-legend"><span class="call call--value">VALUE</span> model edge &ge; +4 &middot; ' +
      '<span class="call call--fade">FADE</span> edge &le; &minus;4 &middot; ' +
      '<span class="call call--check">CHECK</span> |edge| &ge; 10 (model blind spot) &middot; ' +
      "odds BetExplorer &middot; model MLB stats, starters-adjusted &middot; edge = model% &minus; fair%</p>";
    return html;
  }

  async function loadSports() {
    if (sportsLoading) return;
    sportsLoading = true;
    try {
      const games = await computeScreen();
      sports = { games, fetchedAt: Date.now() };
    } catch (e) {
      // keep showing the last good slate
    } finally {
      sportsLoading = false;
    }
    await loadBetSummary();
    const root = $("sportsRoot");
    if (root) root.innerHTML = sportsHtml();
  }

  function renderSports() {
    const stage = $("stage");
    let html = '<h2 class="sec-head">Sports &amp; Betting</h2>';
    html += '<div class="feed-live-head"><span class="live-dot" title="Live"></span> ' +
      "Live MLB slate &middot; odds BetExplorer &middot; model MLB stats &middot; refreshes automatically</div>";
    html += '<div id="sportsRoot"><p class="feed-loading">Loading live slate&hellip;</p></div>';
    stage.innerHTML = '<div class="panel-inner">' + html + "</div>";
    loadSports();
  }

  // ---- Refresh loop -----------------------------------------------------
  async function refresh() {
    const btn = $("refreshBtn");
    if (btn) { btn.disabled = true; }
    try {
      const next = await loadEdition();
      data = next;
      calEvents = null; // Refresh calendar.json too, so newly added commitments appear without a browser reload.
      ensureCalendarSection();
      ensureLiveNewsSections();
      render();
    } catch (e) {
      // Keep showing the last good edition; just note it.
      $("updated").textContent = "refresh failed — showing last edition";
    } finally {
      if (btn) { btn.disabled = false; }
    }
  }

  function startLoops() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (weatherTimer) clearInterval(weatherTimer);
    if (liveFeedTimer) clearInterval(liveFeedTimer);
    if (sportsTimer) clearInterval(sportsTimer);
    refreshTimer = setInterval(refresh, REFRESH_MS);
    // Weather re-poll handled inside render when the Local tab is active; also
    // refresh it on an independent timer so it stays live across tab switches.
    weatherTimer = setInterval(() => {
      const sec = data && data.sections[activeTab];
      if (sec && sec.liveWeather) loadWeather();
    }, WEATHER_REFRESH_MS);
    // Live news feed re-poll, independent of the edition refresh cadence.
    liveFeedTimer = setInterval(() => loadLiveFeeds(true), LIVE_FEED_REFRESH_MS);
    // Live sports slate (odds + model) re-poll while the Sports tab is open.
    sportsTimer = setInterval(() => {
      const sec = data && data.sections[activeTab];
      if (sec && sec.liveSports) loadSports();
    }, SPORTS_REFRESH_MS);
    const btn = $("refreshBtn");
    if (btn) btn.addEventListener("click", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refresh();
        loadLiveFeeds();
      }
    });
    // Keep the calendar grid filling the viewport as it changes size.
    window.addEventListener("resize", () => {
      const sec = data && data.sections[activeTab];
      if (sec && sec.calendar) fitCalendarGrid();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        const sec = data && data.sections[activeTab];
        if (sec && sec.calendar) fitCalendarGrid();
      });
    }
  }

  (function boot() {
      data = buildData();
      ensureCalendarSection();
      ensureLiveNewsSections();
      const ci = data.sections.findIndex(s => s && s.calendar);   // open on Calendar
      if (ci >= 0) activeTab = ci;
      render();
      startLoops();
    })();
})();
