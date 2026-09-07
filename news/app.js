/* The McBoop Daily — living news shell
 *
 * A living page, not a newspaper run: there is no edition, no build step and
 * no authored content. Every tab renders straight from a live source.
 *
 *   Local & Weather  NWS forecast + alerts (api.weather.gov, CORS-open) and
 *                    the LFUCG traffic feeds, both fetched in-browser.
 *   National / World / Business / Technology / Science & Health
 *                    Real RSS, fetched and merged server-side by the
 *                    /api/feeds route in _worker.js (most publishers' feeds
 *                    send no CORS header, so the browser can't read them).
 *
 * Sports lives at sports.jaredluyster.com and the calendar at
 * calendar.jaredluyster.com — neither is rendered here.
 */
(function () {
  "use strict";

  const WEATHER_REFRESH_MS = 10 * 60 * 1000;  // NWS data is slow-moving
  const TRAFFIC_REFRESH_MS = 10 * 60 * 1000;  // matches the LFUCG feed's own 10-min cache
  const LIVE_FEED_REFRESH_MS = 4 * 60 * 1000; // matches the worker's edge-cache TTL
  const NWS_POINT = "38.0297,-84.4947";       // Lexington, KY (ZIP 40517)
  const UA = "McBoopNews/1.0 (jaredluyster.com)";

  // The whole tab strip. `liveFeed` is the /api/feeds section slug; `liveWeather`
  // additionally injects the NWS + traffic blocks above that tab's headlines.
  const SECTIONS = [
    { name: "Local & Weather",  short: "Local",    liveFeed: "local", liveWeather: true },
    { name: "National",         short: "National", liveFeed: "national" },
    { name: "World",            short: "World",    liveFeed: "world" },
    { name: "Business",         short: "Business", liveFeed: "business" },
    { name: "Technology",       short: "Tech",     liveFeed: "tech" },
    { name: "Science & Health", short: "Science",  liveFeed: "science" },
  ];

  let activeTab = 0;
  let liveFeeds = null;      // { national: [...], world: [...], ... } once loaded
  let liveFeedsLoadedAt = 0;
  let weatherTimer = null;
  let trafficTimer = null;
  let liveFeedTimer = null;

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function activeSection() {
    return SECTIONS[activeTab] || null;
  }

  // ---- Shell ------------------------------------------------------------
  function renderMasthead() {
    $("title").textContent = "The McBoop Daily";
    $("dateline").textContent = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York", weekday: "long", month: "long",
      day: "numeric", year: "numeric",
    }) + " · Lexington, Kentucky";
  }

  function renderTabs() {
    const tabs = $("tabs");
    tabs.innerHTML = "";
    SECTIONS.forEach((sec, i) => {
      const b = document.createElement("button");
      b.className = "tab" + (i === activeTab ? " active" : "");
      b.type = "button";
      b.textContent = sec.short;
      b.addEventListener("click", () => { activeTab = i; render(); });
      tabs.appendChild(b);
    });
  }

  function render() {
    renderMasthead();
    renderTabs();

    const sec = activeSection();
    const stage = $("stage");
    if (!sec) {
      stage.innerHTML = '<div class="panel-inner"><p>No section loaded.</p></div>';
      return;
    }

    let html = '<h2 class="sec-head">' + esc(sec.name) + "</h2>";
    if (sec.liveWeather) html += weatherPlaceholder() + trafficPlaceholder();
    html += '<div class="feed-live-head"><span class="live-dot" title="Live"></span> ' +
      "Live headlines &middot; refreshes automatically</div>";
    html += '<div class="feed-list" id="feedList">' + feedItemsHtml(sec.liveFeed) + "</div>";
    stage.innerHTML = '<div class="panel-inner">' + html + "</div>";

    if (sec.liveWeather) { loadWeather(); loadTraffic(); }
    loadLiveFeeds();
    stampUpdated();
  }

  function stampUpdated() {
    $("updated").textContent = "updated " + new Date().toLocaleString("en-US",
      { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }

  // ---- Live news feed ---------------------------------------------------
  // Real RSS items fetched server-side by the /api/feeds worker route, then
  // polled here on a short timer so a tab updates without a page reload.
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
    return Math.round(hrs / 24) + "d ago";
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
      const sec = activeSection();
      const list = $("feedList");
      if (sec && list) list.innerHTML = feedItemsHtml(sec.liveFeed);
      stampUpdated();
    } catch (e) {
      // Keep showing the last good feed items; a stale list beats an empty one.
    }
  }

  // ---- Live NWS weather (in-browser fetch, CORS-enabled) ----------------
  function weatherPlaceholder() {
    return '<div class="weather-live" id="weatherLive">' + weatherHead() +
      '<div class="weather-err">Loading live conditions&hellip;</div></div>';
  }

  function weatherHead(trailing) {
    return '<div class="weather-live-head">' +
      '<div><div class="weather-live-kicker">Live &middot; National Weather Service</div>' +
      "<h3>Local Forecast</h3></div>" + (trailing || "") + "</div>";
  }

  async function fetchNWS(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, "Accept": "application/geo+json" },
        signal: ctrl.signal,
      });
      if (!r.ok) return null;
      return r.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

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
      ((alerts && alerts.features) || []).forEach(a => {
        const p = a.properties || {};
        html += '<div class="weather-alert">' + esc(p.event || "Alert") +
          (p.severity ? " &middot; " + esc(p.severity) : "") +
          (p.expires ? " &middot; expires " + esc(new Date(p.expires).toLocaleTimeString("en-US",
            { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })) : "") +
          "</div>";
      });
      box.innerHTML = weatherHead('<div class="weather-live-kicker">' +
        '<a href="https://forecast.weather.gov/MapClick.php?lat=38.0297&lon=-84.4947" ' +
        'target="_blank" rel="noopener">Open NWS &rarr;</a></div>') + html;
    } catch (e) {
      box.innerHTML = weatherHead() +
        '<div class="weather-err">Live weather unavailable (offline, or NWS blocked).</div>';
    }
  }

  // ---- Live local traffic (LFUCG Traffic Engineering) -------------------
  // The city's own real-time traffic ticker (lexingtonky.gov) is a JS-rendered
  // widget with no documented API, but its bundle fetches three CORS-open CSVs
  // published by LFUCG on GitHub Pages — the same data the city page shows.
  // Fetched client-side (like NWS weather above), no worker involved.
  const TRAFFIC_BASE = "https://lfucg.github.io/traffic-data";

  function trafficPlaceholder() {
    return '<div class="traffic-live" id="trafficLive">' + trafficHead() +
      '<div class="weather-err">Loading live traffic&hellip;</div></div>';
  }

  function trafficHead(trailing) {
    return '<div class="weather-live-head">' +
      '<div><div class="weather-live-kicker">Live &middot; LFUCG Traffic Engineering</div>' +
      "<h3>Local Traffic</h3></div>" + (trailing || "") + "</div>";
  }

  // Minimal CSV line splitter — handles double-quoted fields that may contain
  // commas (e.g. event descriptions like "Love, Broadway 2026: ..."). These
  // feeds are simple exports with no embedded newlines-in-quotes or escaped
  // quotes, so a full RFC 4180 parser isn't needed.
  function splitCsvLine(line) {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') { inQ = false; } else { cur += c; }
      } else if (c === '"') {
        inQ = true;
      } else if (c === ",") {
        out.push(cur); cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (!lines.length) return [];
    const header = splitCsvLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      const row = {};
      header.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
      return row;
    });
  }

  async function fetchTrafficCsv(name) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try {
      const r = await fetch(TRAFFIC_BASE + "/" + name + "?breakcache=" + Date.now(), { signal: ctrl.signal });
      if (!r.ok) return [];
      return parseCsv(await r.text());
    } catch (e) {
      return [];
    } finally {
      clearTimeout(t);
    }
  }

  // Every feed is an Excel export via Jekyll: real rows are mixed with blank
  // spacer rows and a trailing "Cells.EntireColumn.AutoFit" artifact row left
  // over from the spreadsheet macro that generates these files.
  function isCsvJunkRow(row) {
    return Object.values(row).some((v) => v.indexOf("Cells.EntireColumn.AutoFit") >= 0);
  }

  async function loadTraffic() {
    const box = $("trafficLive");
    if (!box) return;
    try {
      const [incidents, closures, weekend] = await Promise.all([
        fetchTrafficCsv("traffic-incidents.csv"),
        fetchTrafficCsv("scheduled-closures.csv"),
        fetchTrafficCsv("weekend-impacts.csv"),
      ]);

      const liveIncidents = incidents.filter((r) => !isCsvJunkRow(r) && r.location);
      const liveClosures = closures.filter((r) => !isCsvJunkRow(r) && r.location);
      const liveEvents = weekend.filter((r) => !isCsvJunkRow(r) && r.event && r.day && r.day !== "Note:");

      let html = trafficHead('<div class="weather-live-kicker"><a href="' +
        "https://www.lexingtonky.gov/government/departments-programs/environmental-quality-public-works/traffic-engineering/real-time-traffic-ticker" +
        '" target="_blank" rel="noopener">Full ticker &rarr;</a></div>');

      html += '<div class="traffic-section"><h4>Current Incidents</h4>';
      html += liveIncidents.length
        ? '<ul class="traffic-list">' + liveIncidents.map((r) =>
            "<li><strong>" + esc(r.incidentType.replace(/:$/, "")) + ":</strong> " + esc(r.location) +
            (r.description ? " &mdash; " + esc(r.description) : "") + "</li>"
          ).join("") + "</ul>"
        : '<div class="traffic-empty">No incidents currently reported.</div>';
      html += "</div>";

      html += '<div class="traffic-section"><h4>Scheduled Closures</h4>';
      html += liveClosures.length
        ? '<div class="traffic-scroll"><ul class="traffic-list">' + liveClosures.map((r) =>
            "<li>" + (r.isNew ? '<span class="traffic-new">New</span> ' : "") +
            "<strong>" + esc(r.location) + ":</strong> " + esc(r.impact) +
            (r.closureBegin ? ' <span class="traffic-meta">(' + esc(r.closureBegin.replace(/:$/, "")) + ")</span>" : "") +
            (r.closedUntil ? ' <span class="traffic-meta">until ' + esc(r.closedUntil.replace(/\.$/, "")) + "</span>" : "") +
            "</li>"
          ).join("") + "</ul></div>"
        : '<div class="traffic-empty">No scheduled closures posted.</div>';
      html += "</div>";

      if (liveEvents.length) {
        html += '<div class="traffic-section"><h4>Weekend Events &amp; Impacts</h4>';
        html += '<ul class="traffic-list">' + liveEvents.map((r) =>
          "<li><strong>" + esc(r.day.replace(/:$/, "")) + ":</strong> " + esc(r.event) + "</li>"
        ).join("") + "</ul></div>";
      }

      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = trafficHead() +
        '<div class="weather-err">Live traffic data unavailable right now.</div>';
    }
  }

  // ---- Refresh ----------------------------------------------------------
  // There is no edition to re-fetch at the shell level anymore, so a refresh
  // just re-pulls whatever the visible tab is actually showing.
  async function refresh() {
    const btn = $("refreshBtn");
    if (btn) btn.disabled = true;
    try {
      const sec = activeSection();
      const jobs = [loadLiveFeeds(true)];
      if (sec && sec.liveWeather) jobs.push(loadWeather(), loadTraffic());
      await Promise.all(jobs);
      renderMasthead();
      stampUpdated();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function startLoops() {
    if (weatherTimer) clearInterval(weatherTimer);
    if (trafficTimer) clearInterval(trafficTimer);
    if (liveFeedTimer) clearInterval(liveFeedTimer);

    // Weather/traffic only poll while their tab is actually on screen.
    weatherTimer = setInterval(() => {
      const sec = activeSection();
      if (sec && sec.liveWeather) loadWeather();
    }, WEATHER_REFRESH_MS);
    trafficTimer = setInterval(() => {
      const sec = activeSection();
      if (sec && sec.liveWeather) loadTraffic();
    }, TRAFFIC_REFRESH_MS);
    // Headlines back every tab, so they poll unconditionally.
    liveFeedTimer = setInterval(() => loadLiveFeeds(true), LIVE_FEED_REFRESH_MS);

    const btn = $("refreshBtn");
    if (btn) btn.addEventListener("click", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
  }

  (function boot() {
    render();
    startLoops();
  })();
})();
