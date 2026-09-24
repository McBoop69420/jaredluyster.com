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
  let lastCalendarHtml = null; // what #calRoot currently shows (see renderCalendar)

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
    { key: "soccer/usa.w.usl.1", label: "USL Super League", order: "home-away", patterns: ["lexington"] },
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
  const CALENDAR_WEEKS = 3;               // rows shown in the rolling grid
  const SPORTS_WINDOW_DAYS_BEHIND = 7;   // covers the display's Sunday-of-this-week start
  const SPORTS_WINDOW_DAYS_AHEAD = 45;   // covers the rolling 3-week display (plenty of slack)
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
      generatedAt = Date.now();
    } catch (e) {
      // A failed refresh keeps the last good events (and their "updated" time)
      // rather than blanking the calendar; only a failed first load starts empty.
      if (calEvents === null) { calEvents = []; generatedAt = Date.now(); }
    }
  }

  // ---- Todos ------------------------------------------------------------
  // Read from /todos.json: { "todos": [ { "title": "...", "date": "YYYY-MM-DD" } ] },
  // date optional. That file is committed to this repo, so it is public (its own
  // "note" says so). A page can't write back to git, so ticking a todo is
  // remembered per device in localStorage instead; once a todo is dropped from
  // the file its tick is forgotten too (pruneTodoDone), so nothing piles up.
  //   dated todo   -> drawn on its day, and once that day has passed on today:
  //                   unlike an event, an unticked todo is still owed.
  //   undated todo -> only in the "To do" strip.
  const TODO_DONE_KEY = "calendar.todos.done";
  const TODO_UNDO_MS = 6000;
  const TODO_EXIT_MS = 320;   // matches the .cal-todo--done transition in calendar.css

  let todoList = [];               // [{ key, title, date }] from /todos.json
  let todoDone = readTodoDone();   // { key: tickedAtMs } — this device only
  let todoSeen = null;             // keys drawn by the last render; null until the first, so page load doesn't pop everything in
  let todoUndoTimer = null;
  let todoUndoFn = null;           // restores whatever the Undo bar last acted on

  // Page-made todos: added from the "+ Add todo" sheet and kept in this browser's
  // localStorage. Unlike todos.json they are private, but they belong to this device
  // only. { id, title, due: "YYYY-MM-DD" | "", repeat: null | a TodoRepeat rule }.
  // A repeating todo is ONE live item that jumps to its next date when ticked (it never
  // piles up overdue copies); a one-off is removed when ticked.
  const LOCAL_TODOS_KEY = "calendar.todos.local";
  const REPEAT = window.TodoRepeat || null;   // ./todo-repeat.js; without it todos just can't repeat
  let localTodos = readLocalTodos();

  function readTodoDone() {
    try {
      const raw = JSON.parse(localStorage.getItem(TODO_DONE_KEY) || "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function saveTodoDone() {
    // Storage can be blocked (private mode, kiosk lockdown); ticks then last
    // until the page reloads instead of throwing.
    try { localStorage.setItem(TODO_DONE_KEY, JSON.stringify(todoDone)); } catch (e) { /* in-memory only */ }
  }

  async function loadTodos() {
    try {
      const res = await fetch("/todos.json?v=" + Date.now(), { cache: "no-store" });
      // A todos.json that isn't deployed yet comes back as the site's HTML
      // fallback page with a 200, so it's the JSON parse below that rejects it.
      // Any failure keeps the last good list rather than blanking the todos or
      // forgetting which ones were ticked.
      if (!res.ok) throw new Error("todos.json " + res.status);
      const j = await res.json();
      if (!j || !Array.isArray(j.todos)) throw new Error("todos.json has no todos array");
      todoList = j.todos.filter(t => t && typeof t.title === "string" && t.title.trim()).map(t => {
        const title = t.title.trim();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : "";
        return { key: date + "|" + title, title: title, date: date };
      });
      pruneTodoDone();
    } catch (e) { /* keep the last good list */ }
  }

  function pruneTodoDone() {
    const live = new Set(todoList.map(t => t.key));
    let changed = false;
    Object.keys(todoDone).forEach(k => {
      if (!live.has(k)) { delete todoDone[k]; changed = true; }
    });
    if (changed) saveTodoDone();
  }

  // ---- Movies -----------------------------------------------------------
  // Read from /movies.json: { "movies": [ { "title", "date", "end", "start",
  // "venue", "kind": "screening" | "release", "year", "series", "url" } ] }.
  // Public like todos.json (published showtimes only, nothing private), and
  // rewritten each week by the "lexington-marquee-refresh" scheduled task from
  // the Lexington Marquee tracker. Two kinds:
  //   screening -> an old film playing at a theater near Lexington, drawn on
  //                its day at its showtime; a multi-day run is ONE chip on the
  //                opening day labelled "thru <end>", not a chip every day,
  //                which would bury the rest of the month.
  //   release   -> a new film's opening date, drawn as an untimed chip.
  // A failed fetch keeps the last good list, like the todos above.
  let movieList = [];
  // Films never shown on the calendar, even if the tracker keeps adding them.
  const MOVIE_HIDE = /^(the )?rocky horror picture show$/i;

  async function loadMovies() {
    try {
      const res = await fetch("/movies.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("movies.json " + res.status);
      const j = await res.json();
      if (!j || !Array.isArray(j.movies)) throw new Error("movies.json has no movies array");
      movieList = j.movies.filter(m => m && typeof m.title === "string" && m.title.trim() &&
        !MOVIE_HIDE.test(m.title) && /^\d{4}-\d{2}-\d{2}$/.test(m.date || ""));
    } catch (e) { /* keep the last good list */ }
  }

  // "2026-10-14" -> "Oct 14", for the run label on a multi-day engagement.
  function shortDate(dateStr) {
    const p = String(dateStr || "").split("-").map(Number);
    if (p.length !== 3 || !p[0]) return "";
    return new Date(p[0], p[1] - 1, p[2], 12)
      .toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Movies you've dismissed with the little x on a chip. movies.json is rewritten
  // weekly by the tracker, so a dismissal can't live in the file: like a ticked
  // todo it's remembered per device in localStorage. Keyed by title + year, so
  // every screening of that film stays hidden, including ones added later.
  const MOVIE_DISMISSED_KEY = "calendar.movies.dismissed";
  let movieDismissed = readMovieDismissed();   // Set of movieKey()s

  function movieKey(m) {
    return String(m.title || "").trim().toLowerCase() + "|" + String(m.year || "").trim();
  }
  function readMovieDismissed() {
    try {
      const raw = JSON.parse(localStorage.getItem(MOVIE_DISMISSED_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw.filter(k => typeof k === "string") : []);
    } catch (e) { return new Set(); }
  }
  function saveMovieDismissed() {
    try { localStorage.setItem(MOVIE_DISMISSED_KEY, JSON.stringify(Array.from(movieDismissed))); } catch (e) { /* in-memory only */ }
  }
  // Returns { title, restore } for the Undo bar.
  function dismissMovie(key, title) {
    movieDismissed.add(key);
    saveMovieDismissed();
    return { title: title, restore() { movieDismissed.delete(key); saveMovieDismissed(); } };
  }
  function dismissButtonHtml(ev) {
    return '<button type="button" class="cal-dismiss" data-dismiss-movie="' + esc(ev.movieKey) +
      '" aria-label="Dismiss ' + esc(ev.movieTitle) + ' for good" title="Dismiss for good">&times;</button>';
  }

  function movieEvents() {
    return movieList.filter(m => !movieDismissed.has(movieKey(m))).map(m => {
      const release = String(m.kind || "").toLowerCase() === "release";
      const year = m.year ? " (" + m.year + ")" : "";
      const venue = !release && m.venue ? " \u00b7 " + m.venue : "";
      const run = m.end && m.end > m.date ? "thru " + shortDate(m.end) : "";
      const url = movieTicketUrl(m);
      return {
        type: "movie",
        movieKey: movieKey(m),
        movieTitle: m.title,
        title: m.title + year + (release ? " opens" : venue),
        date: m.date,
        start: release ? "" : (m.start || ""),
        // A dated run or an untimed screening still says something useful;
        // fmtRange prefers timeLabel, so only set it when there's no showtime.
        timeLabel: m.start && !run ? "" : (run || m.timeLabel || ""),
        url: url,
        // Nothing specific to link to: offer each home theatre's own page instead.
        // The tracker may add film-specific regal_url / cinemark_url; use them when present.
        theatres: url ? null : [
          { name: "Regal", url: m.regal_url || HOME_THEATRES[0].url },
          { name: "Cinemark", url: m.cinemark_url || HOME_THEATRES[1].url },
        ],
      };
    });
  }

  // Where a movie chip sends you. A screening keeps the link the tracker found
  // for its own venue (the Kentucky Theatre's ticketing page for that showing,
  // Fathom's page for that event) and the whole chip is one link. Regal's bare
  // homepage is no use, so it becomes the Hamburg Pavilion page. An entry with
  // no link at all (most new releases) gets one link per home theatre, since
  // it may be showing at either chain.
  const REGAL_HAMBURG_URL = "https://www.regmovies.com/theatres/regal-hamburg-pavilion-0728";
  const HOME_THEATRES = [
    { name: "Regal", url: REGAL_HAMBURG_URL },
    { name: "Cinemark", url: "https://www.cinemark.com/theatres/ky-lexington/cinemark-fayette-mall-and-xd" },
  ];
  function movieTicketUrl(m) {
    const u = String(m.url || "").trim();
    if (!/^https?:\/\//i.test(u)) return "";
    return /^https?:\/\/(www\.)?regmovies\.com\/?$/i.test(u) ? REGAL_HAMBURG_URL : u;
  }

  // "Tickets: Regal · Cinemark" for a movie chip that has no single link.
  function theatreLinksHtml(ev) {
    if (!ev.theatres) return "";
    return '<span class="cal-ev-theatres">' + ev.theatres.map(t =>
      '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">' + esc(t.name) + '</a>').join(" &middot; ") + '</span>';
  }

  // Unticked todos as calendar events. An overdue one is pinned to today; an
  // undated one gets no date, which renderCalendar's byDate pass skips, so only
  // the strip shows it.
  function todoEvents(todayStr) {
    const fromFile = todoList.filter(t => !todoDone[t.key]).map(t => ({
      type: "todo", title: t.title, todoKey: t.key,
      date: t.date && t.date < todayStr ? todayStr : t.date,
      overdue: !!t.date && t.date < todayStr,
      repeat: "",
    }));
    const fromPage = localTodos.map(t => ({
      type: "todo", title: t.title, todoKey: "L:" + t.id,   // repo keys are "date|title", so never clash
      date: t.due && t.due < todayStr ? todayStr : t.due,
      overdue: !!t.due && t.due < todayStr,
      repeat: t.repeat && REPEAT ? REPEAT.describe(t.repeat) : "",
    }));
    return fromFile.concat(fromPage);
  }

  // The whole chip is the tap target. `when` is a short tag ("overdue", "today").
  function todoChipHtml(ev, when) {
    const isNew = todoSeen && !todoSeen.has(ev.todoKey);
    return '<button type="button" class="cal-todo' + (ev.overdue ? " cal-todo--overdue" : "") +
      (isNew ? " cal-todo--new" : "") + '" data-todo-key="' + esc(ev.todoKey) +
      '" aria-label="Mark done: ' + esc(ev.title) + (ev.repeat ? " (" + esc(ev.repeat.toLowerCase()) + ")" : "") + '">' +
      '<span class="cal-todo-box" aria-hidden="true"></span>' +
      '<span class="cal-todo-text">' + esc(ev.title) + '</span>' +
      (ev.repeat ? '<span class="cal-todo-rep" aria-hidden="true" title="' + esc(ev.repeat) + '">&#8635;</span>' : '') +
      (when ? '<span class="cal-todo-tag">' + esc(when) + '</span>' : '') +
      '</button>';
  }

  // ---- Page-made todos: storage, add, tick, delete ----------------------
  function cleanLocalTodo(t) {
    if (!t || typeof t.id !== "string" || typeof t.title !== "string" || !t.title.trim()) return null;
    const repeat = t.repeat ? (REPEAT ? REPEAT.validate(t.repeat) : t.repeat) : null;
    let due = /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : "";
    if (repeat && !due) due = etTodayStr();   // a repeating todo always has a next date
    return { id: t.id, title: t.title.trim(), due: due, repeat: repeat };
  }

  function readLocalTodos() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_TODOS_KEY) || "[]");
      return Array.isArray(raw) ? raw.map(cleanLocalTodo).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalTodos() {
    try { localStorage.setItem(LOCAL_TODOS_KEY, JSON.stringify(localTodos)); } catch (e) { /* in-memory only */ }
  }

  function storageWorks() {
    try {
      localStorage.setItem("calendar.todos.probe", "1");
      localStorage.removeItem("calendar.todos.probe");
      return true;
    } catch (e) {
      return false;
    }
  }

  // `freq` is "" (one-off) or a TodoRepeat frequency. A repeating todo starts on its
  // first matching day on or after the chosen date (today when none was chosen).
  function addLocalTodo(title, due, freq, days) {
    title = String(title || "").trim().slice(0, 120);
    if (!title) return null;
    due = /^\d{4}-\d{2}-\d{2}$/.test(due || "") ? due : "";
    let repeat = null;
    if (freq && REPEAT) {
      const anchor = due || etTodayStr();
      repeat = REPEAT.make(freq, anchor, days);
      if (repeat) due = REPEAT.startOn(repeat, anchor);
    }
    const t = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title, due: due, repeat: repeat };
    localTodos.push(t);
    saveLocalTodos();
    return t;
  }

  // Each of these returns { title, restore } for the Undo bar, or null if the todo is gone.
  // restore() puts back just that one todo, so it can't clobber anything added since.
  function completeLocalTodo(id) {
    const idx = localTodos.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const t = localTodos[idx];
    if (t.repeat && REPEAT) {
      const prevDue = t.due, today = etTodayStr();
      // Strictly after today or the current due date, whichever is later: ticking early
      // skips the occurrence you just did, and an overdue one doesn't come straight back.
      t.due = REPEAT.nextAfter(t.repeat, prevDue && prevDue > today ? prevDue : today) || prevDue;
      saveLocalTodos();
      return { title: t.title, restore() {
        const cur = localTodos.find(x => x.id === id);
        if (cur) { cur.due = prevDue; saveLocalTodos(); }
      } };
    }
    return removeLocalTodo(idx);
  }

  function removeLocalTodo(idx) {
    const t = localTodos[idx];
    localTodos.splice(idx, 1);
    saveLocalTodos();
    return { title: t.title, restore() {
      if (!localTodos.some(x => x.id === t.id)) localTodos.splice(Math.min(idx, localTodos.length), 0, t);
      saveLocalTodos();
    } };
  }

  function deleteLocalTodo(id) {
    const idx = localTodos.findIndex(x => x.id === id);
    return idx < 0 ? null : removeLocalTodo(idx);
  }

  function completeTodo(key) {
    let result;
    if (key.indexOf("L:") === 0) {
      result = completeLocalTodo(key.slice(2));
      if (!result) return;
    } else {
      if (todoDone[key]) return;
      const t = todoList.find(x => x.key === key);
      todoDone[key] = Date.now();
      saveTodoDone();
      result = { title: t ? t.title : "Todo", restore() { delete todoDone[key]; saveTodoDone(); } };
    }
    // Every copy on screen (strip, grid, agenda) fades out together; the redraw
    // then drops it. The tick is already saved, so an interrupted animation is fine.
    document.querySelectorAll("[data-todo-key]").forEach(el => {
      if (el.dataset.todoKey === key) el.classList.add("cal-todo--done");
    });
    showTodoUndo("Done", result.title, result.restore);
    setTimeout(() => { renderCalendar(); renderTodoSheetList(); }, TODO_EXIT_MS);
  }

  // A wall display gets brushed by accident; give the last change a short undo.
  function showTodoUndo(verb, title, restore) {
    const bar = $("todoUndo");
    if (!bar) return;
    todoUndoFn = restore;
    bar.innerHTML = '<span class="todo-undo-text">' + esc(verb) + ': ' + esc(title) + '</span>' +
      '<button type="button" class="todo-undo-btn" data-undo>Undo</button>';
    bar.classList.add("is-open");
    clearTimeout(todoUndoTimer);
    todoUndoTimer = setTimeout(hideTodoUndo, TODO_UNDO_MS);
  }

  function hideTodoUndo() {
    const bar = $("todoUndo");
    if (bar) bar.classList.remove("is-open");
  }

  function undoLast() {
    const fn = todoUndoFn;
    todoUndoFn = null;
    hideTodoUndo();
    if (!fn) return;
    fn();
    renderCalendar();
    renderTodoSheetList();
  }

  // ---- The "+ Add todo" sheet -------------------------------------------
  function todoDueLabel(due) {
    if (!due) return "";
    const p = due.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12)
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function renderTodoSheetList() {
    const ul = $("todoList");
    if (!ul) return;
    const items = localTodos.slice().sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    ul.innerHTML = items.length ? items.map(t => {
      const meta = t.repeat && REPEAT
        ? REPEAT.describe(t.repeat) + " · next " + todoDueLabel(t.due)
        : (t.due ? "Due " + todoDueLabel(t.due) : "No date");
      return '<li class="todo-list-item"><span class="todo-list-main">' +
        '<span class="todo-list-title">' + esc(t.title) + '</span>' +
        '<span class="todo-list-meta">' + esc(meta) + '</span></span>' +
        '<button type="button" class="todo-del" data-del="' + esc(t.id) + '" aria-label="Delete ' + esc(t.title) + '">Delete</button></li>';
    }).join("") : '<li class="todo-list-empty">Nothing here yet. Todos added on this page are kept in this browser only.</li>';
  }

  function todoFormDays() {
    return Array.prototype.map.call(document.querySelectorAll("#todoDays [aria-pressed='true']"), b => b.dataset.day);
  }

  // The day picker only applies to weekly; the first time it appears it starts on the
  // weekday of the chosen date (or today), which is also what an empty pick means.
  function syncTodoRepeatUi() {
    const weekly = $("todoRepeat").value === "weekly";
    $("todoDays").hidden = !weekly;
    if (weekly && REPEAT && !todoFormDays().length) {
      const code = REPEAT.make("weekly", $("todoDue").value || etTodayStr()).days[0];
      const b = document.querySelector('#todoDays [data-day="' + code + '"]');
      if (b) b.setAttribute("aria-pressed", "true");
    }
  }

  function openTodoSheet() {
    const sheet = $("todoSheet");
    if (!sheet) return;
    sheet.hidden = false;
    $("todoNote").textContent = storageWorks() ? "" :
      "This browser is blocking storage, so todos added here will be gone when the page reloads.";
    renderTodoSheetList();
    $("todoTitle").focus();
  }

  function closeTodoSheet() {
    const sheet = $("todoSheet");
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    // The button lives in the redrawn strip, so look it up now rather than holding a reference.
    const opener = document.querySelector("[data-add-todo]");
    if (opener) opener.focus();
  }

  function initTodoSheet() {
    const sheet = $("todoSheet");
    if (!sheet) return;
    if (!REPEAT) { const f = $("todoRepeatField"); if (f) f.hidden = true; }
    $("todoClose").addEventListener("click", closeTodoSheet);
    sheet.addEventListener("click", e => { if (e.target === sheet) closeTodoSheet(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeTodoSheet(); });
    $("todoRepeat").addEventListener("change", syncTodoRepeatUi);
    $("todoDays").addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("[data-day]");
      if (b) b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
    $("todoForm").addEventListener("submit", e => {
      e.preventDefault();
      const t = addLocalTodo($("todoTitle").value, $("todoDue").value, REPEAT ? $("todoRepeat").value : "", todoFormDays());
      if (!t) { $("todoTitle").focus(); return; }
      $("todoForm").reset();
      Array.prototype.forEach.call(document.querySelectorAll("#todoDays [data-day]"), b => b.setAttribute("aria-pressed", "false"));
      $("todoDays").hidden = true;
      $("todoNote").textContent = "Added: " + t.title;
      $("todoTitle").focus();
      renderCalendar();
      renderTodoSheetList();
    });
    $("todoList").addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("[data-del]");
      if (!b) return;
      const r = deleteLocalTodo(b.dataset.del);
      if (!r) return;
      showTodoUndo("Deleted", r.title, r.restore);
      renderCalendar();
      renderTodoSheetList();
    });
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

  // ESPN reports a game's broadcast network two different ways depending on
  // the endpoint: `broadcasts[].names` (scoreboard, e.g. NFL) or
  // `broadcasts[].media.shortName` (team-schedule, e.g. college football).
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
  function watchLinkFor(entry, comp) {
    const networks = broadcastNetworks(comp);
    if (entry.label === "NFL") {
      if (networks.includes("FOX")) return WATCH_LINK_BY_NETWORK.FOX;
      if (networks.includes("CBS")) return WATCH_LINK_BY_NETWORK.CBS;
      return null;
    }
    if (entry.label === "NCAAF") {
      const hit = networks.find(n => WATCH_LINK_BY_NETWORK[n]);
      return hit ? WATCH_LINK_BY_NETWORK[hit] : null;
    }
    return null;
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

  // US pro/college sports nest the score in an object ({displayValue|value});
  // soccer competitors carry it as a bare string/number instead.
  function scoreOf(c) {
    const s = c && c.score;
    if (s == null) return null;
    return typeof s === "object" ? (s.displayValue || s.value) : s;
  }

  function gameTitle(label, awayName, awayScore, homeName, homeScore, state) {
    if ((state === "post" || state === "in") && awayScore != null && homeScore != null) {
      return label + " · " + awayName + " " + awayScore + ", " + homeName + " " + homeScore +
        (state === "post" ? " (Final)" : " (Live)");
    }
    return label + " · " + awayName + " @ " + homeName + (state === "in" ? " (Live)" : "");
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
    const live = state === "post" || state === "in";
    // ESPN's team-schedule endpoint reports a game as "in" progress but with NO
    // score until it's final, so a missing score stays null (the chip then shows
    // the start time) rather than being faked as 0-0; refreshLiveGames() below
    // fills in the real score from the per-game summary endpoint.
    const awayScore = live ? scoreOf(away) : null;
    const homeScore = live ? scoreOf(home) : null;
    const title = gameTitle(entry.label, awayName, awayScore, homeName, homeScore, state);
    // Fixture placement follows each sport's own convention (see TEAM_SCHEDULE_TEAMS/
    // SOCCER_LEAGUES comment): American sports show away first, soccer shows home first.
    const homeFirst = entry.order === "home-away";
    return {
      date: et.date, start: timeValid ? et.time : null,
      timeLabel: timeValid ? null : "TBD", title: title, type: "sports",
      league: entry.label, leagueLogo: entry.logo, state: state || "pre",
      id: ev.id, srcKey: entry.key, homeFirst: homeFirst,   // for refreshLiveGames()
      gameLink: watchLinkFor(entry, comp) || gameLinkUrl(ev),
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

  const MLB_STATS_TEAM_ID = 113; // Cincinnati Reds — MLB Stats API's own id, distinct from ESPN's "17"

  // MLB.tv is the actual place to watch regardless of the (often regional/
  // blacked-out) network ESPN reports, but linking straight to a specific
  // game's web player needs MLB's own gamePk, which ESPN doesn't carry —
  // hence this separate lookup against MLB's public Stats API.
  async function fetchMlbGamePks(minDate, maxDate) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const url = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=" + MLB_STATS_TEAM_ID +
        "&startDate=" + minDate + "&endDate=" + maxDate;
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) return {};
      const data = await res.json();
      const byDate = {};
      (data.dates || []).forEach(d => {
        (d.games || []).forEach(g => { if (g.gamePk) byDate[d.date] = g.gamePk; });
      });
      return byDate;
    } catch (e) {
      return {};
    }
  }

  async function loadSportsEvents() {
    const todayStr = etTodayStr();
    const minDate = addDaysToDateStr(todayStr, -SPORTS_WINDOW_DAYS_BEHIND);
    const maxDate = addDaysToDateStr(todayStr, SPORTS_WINDOW_DAYS_AHEAD);
    const jobs = TEAM_SCHEDULE_TEAMS.map(t => fetchTeamScheduleEvents(t, minDate, maxDate))
      .concat(SOCCER_LEAGUES.map(l => fetchSoccerLeagueEvents(l, minDate, maxDate)));
    const [results, mlbGamePks] = await Promise.all([
      Promise.all(jobs), fetchMlbGamePks(minDate, maxDate),
    ]);
    const prevLive = new Map(sportsEvents.filter(e => e.id && e.state === "in" && e.leftScore != null)
      .map(e => [e.id, e]));
    sportsEvents = results.flat();
    sportsEvents.forEach(ev => {
      if (ev.league === "MLB" && mlbGamePks[ev.date]) {
        ev.gameLink = "https://www.mlb.com/tv/g" + mlbGamePks[ev.date] + "/";
      }
      // The schedule feed has no live score; keep the last one we polled so a
      // full reload doesn't blank it back to the start time.
      const prev = ev.state === "in" && ev.leftScore == null && prevLive.get(ev.id);
      if (prev) {
        ev.leftScore = prev.leftScore; ev.rightScore = prev.rightScore; ev.title = prev.title;
      }
    });
    sportsLastFetch = Date.now();
    refreshLiveGames();
  }

  // ---- Live scores ------------------------------------------------------
  // Full sports loads are heavy (dozens of requests) so they run every few
  // minutes to hourly. In-progress games instead get a light poll of ESPN's
  // per-game summary endpoint — one request per live game, nothing when no
  // game is on — which carries the real running score.
  const LIVE_POLL_MS = 30 * 1000;
  const LIVE_PRESTART_WINDOW_MIN = 300; // a "pre" game this long past kickoff is likely postponed, stop polling
  let liveInFlight = false;

  function etNowMinutes() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const get = t => Number((parts.find(p => p.type === t) || {}).value);
    return get("hour") * 60 + get("minute");
  }

  function needsLivePoll(ev) {
    if (ev.type !== "sports" || !ev.id || !ev.srcKey) return false;
    if (ev.state === "in") return true;
    // Kickoff has passed but the schedule still says "pre": it has probably
    // started, so poll to catch the pre -> live flip.
    if (ev.state === "pre" && ev.start && ev.date === etTodayStr()) {
      const [h, m] = ev.start.split(":").map(Number);
      const sinceStart = etNowMinutes() - (h * 60 + m);
      return sinceStart >= 0 && sinceStart <= LIVE_PRESTART_WINDOW_MIN;
    }
    return false;
  }

  async function fetchLiveComp(ev) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(ESPN + ev.srcKey + "/summary?event=" + encodeURIComponent(ev.id),
        { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.header && data.header.competitions && data.header.competitions[0]) || null;
    } catch (e) {
      return null;
    }
  }

  // Returns true when the chip's state or score changed.
  function applyLiveComp(ev, comp) {
    const state = comp.status && comp.status.type && comp.status.type.state;
    const competitors = comp.competitors || [];
    const home = competitors.find(c => c.homeAway === "home");
    const away = competitors.find(c => c.homeAway === "away");
    if (!state || !home || !away) return false;
    const live = state === "in" || state === "post";
    const left = ev.homeFirst ? home : away, right = ev.homeFirst ? away : home;
    const leftScore = live ? scoreOf(left) : null, rightScore = live ? scoreOf(right) : null;
    if (ev.state === state && ev.leftScore === leftScore && ev.rightScore === rightScore) return false;
    ev.state = state; ev.leftScore = leftScore; ev.rightScore = rightScore;
    const awayName = ev.homeFirst ? ev.rightName : ev.leftName;
    const homeName = ev.homeFirst ? ev.leftName : ev.rightName;
    ev.title = gameTitle(ev.league, awayName, ev.homeFirst ? rightScore : leftScore,
      homeName, ev.homeFirst ? leftScore : rightScore, state);
    return true;
  }

  async function refreshLiveGames() {
    if (liveInFlight || document.hidden) return;
    const targets = sportsEvents.filter(needsLivePoll);
    if (!targets.length) return;
    liveInFlight = true;
    try {
      const changed = await Promise.all(targets.map(async ev => {
        const comp = await fetchLiveComp(ev);
        return comp ? applyLiveComp(ev, comp) : false;
      }));
      // renderCalendar() skips the DOM swap when the markup is identical, so
      // this only redraws when a score/state actually moved.
      if (changed.some(Boolean)) renderCalendar();
    } finally {
      liveInFlight = false;
    }
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

  // Generic event link (e.g. a registry, a ticket page) — same idea as the
  // sports Gamecast link below, just for arbitrary non-sports events that
  // carry their own `url`.
  function eventTitleHtml(ev) {
    const t = esc(ev.title || "");
    if (!ev.url) return t;
    return '<a class="cal-ev-link" href="' + esc(ev.url) + '" target="_blank" rel="noopener">' + t + '</a>';
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
  // team logo is missing, e.g. an ESPN response with no team art. When ESPN
  // gives us a Gamecast link, the whole chip becomes a link there — the
  // legal, official source for where/how to watch, never a direct stream.
  function sportsMatchHtml(ev, size) {
    if (ev.type !== "sports" || !ev.leftLogo || !ev.rightLogo) return null;
    const sizeClass = size && size !== "sm" ? " cal-ev-match--" + size : "";
    const hasScore = (ev.state === "in" || ev.state === "post") &&
      ev.leftScore != null && ev.rightScore != null;
    // The grid chips are only ~50px wide, too narrow for LOGO 27–33 LOGO in one
    // row (the score wrapped digit-by-digit). With a score, stack it as a
    // mini scoreboard instead: one logo+score line per team, winner emphasized.
    if (hasScore && (!size || size === "sm")) {
      const final = ev.state === "post";
      const l = parseFloat(ev.leftScore), r = parseFloat(ev.rightScore);
      const line = (logo, name, score, cls) =>
        '<span class="cal-ev-line' + cls + '">' +
          '<img class="cal-ev-logo cal-ev-logo--team" src="' + esc(logo) + '" alt="' + esc(name) + '" decoding="async">' +
          '<span class="cal-ev-pts">' + esc(score) + '</span></span>';
      const win = (a, b) => final && a > b ? " cal-ev-line--win" : final && a < b ? " cal-ev-line--lose" : "";
      const tag = ev.gameLink ? "a" : "span";
      const linkAttrs = ev.gameLink
        ? ' href="' + esc(ev.gameLink) + '" target="_blank" rel="noopener"' : "";
      return '<' + tag + ' class="cal-ev-match cal-ev-match--board' + (final ? "" : " cal-ev-match--live") + '"' + linkAttrs + '>' +
        line(ev.leftLogo, ev.leftName, ev.leftScore, win(l, r)) +
        line(ev.rightLogo, ev.rightName, ev.rightScore, win(r, l)) +
        '<span class="cal-ev-state">' + (final ? "Final" : "Live") + '</span>' +
        '</' + tag + '>';
    }
    const centerHtml = hasScore
      ? '<span class="cal-ev-score' + (ev.state === "in" ? " cal-ev-score--live" : "") + '">' +
        esc(ev.leftScore) + '–' + esc(ev.rightScore) + '</span>'
      : '<span class="cal-ev-match-time">' + esc(fmtRange(ev)) + '</span>';
    const tag = ev.gameLink ? "a" : "span";
    const linkAttrs = ev.gameLink
      ? ' href="' + esc(ev.gameLink) + '" target="_blank" rel="noopener"' : "";
    return '<' + tag + ' class="cal-ev-match' + sizeClass + '"' + linkAttrs + '>' +
      '<span class="cal-ev-match-teams">' +
        '<img class="cal-ev-logo cal-ev-logo--team" src="' + esc(ev.leftLogo) + '" alt="' + esc(ev.leftName) + '" decoding="async">' +
        centerHtml +
        '<img class="cal-ev-logo cal-ev-logo--team" src="' + esc(ev.rightLogo) + '" alt="' + esc(ev.rightName) + '" decoding="async">' +
      '</span>' +
      '</' + tag + '>';
  }

  function renderCalendar() {
    const root = $("calRoot");
    if (!root) return;
    if (calEvents === null) {
      // First load only — refresh() no longer nulls calEvents, so an
      // already-drawn calendar stays up while new data is fetched.
      root.innerHTML = '<p class="cal-loading">Loading calendar&hellip;</p>';
      lastCalendarHtml = null;
      Promise.all([loadCalendar(), loadTodos(), loadMovies()]).then(() => { renderCalendar(); stampUpdated(); });
      return;
    }

    const todayStr = etTodayStr();
    const todoEvts = todoEvents(todayStr);
    const tp = todayStr.split("-").map(Number);
    const dow = new Date(tp[0], tp[1] - 1, tp[2], 12).getDay();   // 0 = Sun
    // Rolling window: start on the Sunday of the current week, then run enough
    // whole weeks to cover three weeks. Days flow continuously across month
    // boundaries (bleedthrough); there's no navigation into the past.
    const start = new Date(tp[0], tp[1] - 1, tp[2] - dow, 12);
    const totalDays = CALENDAR_WEEKS * 7;

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
    calEvents.concat(sportsEvents, todoEvts, movieEvents()).forEach(ev => {
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
    // Events with no confirmed start time (TBD kickoffs, timeLabel-only
    // entries) sort after every timed event in the day — an empty start
    // would otherwise sort first, but a TBD college football game is far
    // more likely to kick off in the afternoon/evening than a soccer match
    // that already has a confirmed 7:30a start.
    Object.keys(byDate).forEach(k =>
      byDate[k].sort((a, b) => {
        const as = a.start || "", bs = b.start || "";
        if (!as && !bs) return 0;
        if (!as) return 1;
        if (!bs) return -1;
        return as.localeCompare(bs);
      }));

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
        // Todos have their own strip below.
        if (!isWorkEvent(ev) && ev.type !== "todo") featuredEvents.push(Object.assign({}, ev, { _dateLabel: featuredLabel(ds) }));
      });
    });

    const sM = start.toLocaleDateString("en-US", { month: "long" });
    const lM = last.toLocaleDateString("en-US", { month: "long" });
    const sy = start.getFullYear(), ly = last.getFullYear();
    let range;
    if (sy === ly) range = (sM === lM) ? (sM + " " + sy) : (sM + " – " + lM + " " + sy);
    else range = sM + " " + sy + " – " + lM + " " + ly;

    let html = '<div class="cal-range">' + esc(range) + '</div>';
    // The strip always renders: it carries the link to the news subdomain even
    // when there's nothing today or tomorrow.
    html += '<div class="cal-today-strip">' +
      (featuredEvents.length ? '<span class="cal-today-label">Upcoming</span>' : '') +
        featuredEvents.map(ev => {
          const label = ev._dateLabel || "";
          const rng = fmtRange(ev);
          const sameAsLabel = rng && label && rng.toLowerCase() === label.toLowerCase();
          const matchHtml = sportsMatchHtml(ev, "md"); // already carries the time/score, so skip the plain-text rng below
          return '<span class="cal-today-item">' +
            (label ? '<strong>' + esc(label) + '</strong> ' : '') +
            (!matchHtml && rng && !sameAsLabel ? '<strong>' + esc(rng) + '</strong> ' : '') +
            (matchHtml || eventTitleHtml(ev)) + '</span>';
        }).join('') +
      '<div class="daily-link-row"><button type="button" class="add-todo-btn" data-add-todo>+ Add todo</button>' +
      '<a class="daily-link" href="https://news.jaredluyster.com/">News &rarr;</a>' +
      '<a class="daily-link" href="https://social.jaredluyster.com/">Create social/LinkedIn post &rarr;</a></div></div>';
    // What's owed now: overdue, due today, or undated. Anything later only sits on its
    // own day, so a repeating todo you just ticked doesn't bounce straight back in as
    // "tomorrow". Overdue first, then by date, undated last.
    function todoWhen(ev) {
      if (ev.overdue) return "overdue";
      if (ev.date === todayStr) return "today";
      return "";
    }
    const stripTodos = todoEvts.filter(ev => !ev.date || ev.date <= todayStr)
      .sort((a, b) => (a.overdue ? 0 : a.date ? 1 : 2) - (b.overdue ? 0 : b.date ? 1 : 2) ||
        (a.date || "").localeCompare(b.date || ""));
    if (stripTodos.length) {
      html += '<div class="cal-todo-strip"><span class="cal-todo-label">To do</span>' +
        stripTodos.map(ev => todoChipHtml(ev, todoWhen(ev))).join('') + '</div>';
    }
    html += '<div class="cal-grid" data-weeks="' + (totalDays / 7) + '">';
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d =>
      html += '<div class="cal-dow">' + d + '</div>');

    days.forEach((d, i) => {
      const Mo = d.getMonth() + 1, day = d.getDate();
      const ds = d.getFullYear() + "-" + pad2(Mo) + "-" + pad2(day);
      const isToday = ds === todayStr;
      const isPast = ds < todayStr;
      const evs = isPast ? [] : (byDate[ds] || []);   // days already gone show empty
      const showMon = day === 1 || i === 0;   // mark each new month for bleedthrough
      html += '<div class="cal-cell' +
        (isToday ? " cal-cell--today" : "") +
        (isPast ? " cal-cell--past" : "") +
        (evs.length ? " cal-cell--has" : "") + '">';
      html += '<div class="cal-daynum">' +
        (showMon ? '<span class="cal-mon">' + esc(d.toLocaleDateString("en-US", { month: "short" })) + '</span> ' : '') +
        day + '</div>';
      function evChipHtml(ev) {
        if (ev.type === "todo") {
          return '<div class="cal-ev cal-ev--todo">' + todoChipHtml(ev, ev.overdue ? "overdue" : "") + '</div>';
        }
        const rng = fmtRange(ev);
        const clock = fmtTime(ev.start);   // real HH:MM only — never freetext
        const start = clock || rng;
        // A movie chip is one big link to its tickets: the whole purple box is
        // the tap target, not just the title text inside it.
        const wholeLink = ev.type === "movie" && ev.url;
        const tag = wholeLink ? "a" : "div";
        const chip = '<' + tag + ' class="cal-ev' + eventClass(ev) + (wholeLink ? ' cal-ev--linked' : '') + '"' +
          (wholeLink ? ' href="' + esc(ev.url) + '" target="_blank" rel="noopener"' : '') +
          ' title="' + esc((ev.title || "") + (rng ? " · " + rng : "")) + '">' +
          (start ? '<span class="cal-ev-s">' + esc(start) + '</span> ' : '') +
          (rng && rng !== start ? '<span class="cal-ev-t">' + esc(rng) + '</span> ' : '') +
          '<span class="cal-ev-mobile">' + esc(clock || "•") + '</span>' +
          '<span class="cal-ev-title">' + (wholeLink ? esc(ev.title || "") : (sportsMatchHtml(ev) || eventTitleHtml(ev))) +
          '</span>' + theatreLinksHtml(ev) + '</' + tag + '>';
        // The x is a sibling of the chip, not inside it: a button can't live in
        // the chip's link, and a click on it mustn't follow the ticket link.
        return ev.type === "movie" ? '<div class="cal-ev-wrap">' + chip + dismissButtonHtml(ev) + '</div>' : chip;
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
        if (ev.type === "todo") {
          agenda.push('<li class="cal-agenda-item">' +
            '<span class="cal-agenda-date">' + esc(featuredLabel(ds)) + '</span>' +
            '<span class="cal-agenda-title">' + todoChipHtml(ev, ev.overdue ? "overdue" : "") + '</span></li>');
          return;
        }
        const rng = fmtRange(ev);
        const matchHtml = sportsMatchHtml(ev, "lg"); // already carries the time/score, so skip the plain-text rng below
        agenda.push('<li class="cal-agenda-item">' +
          '<span class="cal-agenda-date">' + esc(featuredLabel(ds)) + '</span>' +
          '<span class="cal-agenda-title">' + (matchHtml || eventTitleHtml(ev)) + theatreLinksHtml(ev) + '</span>' +
          (!matchHtml && rng ? '<span class="cal-agenda-time">' + esc(rng) + '</span>' : '') +
          (ev.type === "movie" ? dismissButtonHtml(ev) : '') +
          '</li>');
      });
    });
    if (agenda.length) {
      html += '<div class="cal-agenda-wrap"><h3 class="sub">Full Schedule</h3>' +
        '<ul class="cal-agenda">' + agenda.join("") + '</ul></div>';
    }

    // Only a todo that wasn't in the previous draw gets the pop-in, so a redraw
    // for some other reason (a live score) doesn't replay it on every chip.
    todoSeen = new Set(todoEvts.map(ev => ev.todoKey));

    // Most refreshes produce identical markup. Skip the swap then: rebuilding
    // the DOM re-creates every logo <img> and can blink the whole grid.
    if (html === lastCalendarHtml) return;
    lastCalendarHtml = html;
    root.innerHTML = html;
    fitCalendarGrid();
    requestAnimationFrame(fitCalendarGrid);
  }

  // Give the month grid's week rows a floor tall enough to fill the
  // remaining viewport on a light week — never a ceiling. A row's own
  // content (a wrapped event title, a stacked sports grid) can always push
  // it taller than that; the page scrolls instead of anything getting
  // clipped, which is why .cal-cell has no overflow:hidden either.
  function fitCalendarGrid() {
    const grid = document.querySelector(".cal-grid");
    if (!grid) return;
    const weeks = Number(grid.getAttribute("data-weeks")) || 5;
    const gr = grid.getBoundingClientRect();
    const top = gr.top;
    const minWeekRow = window.innerWidth <= 680 ? 116 : 150;
    const belowChrome = document.documentElement.scrollHeight - (gr.bottom + window.scrollY);
    const viewportFit = Math.round(window.innerHeight - top - belowChrome - 12);
    const rowFloor = Math.max(minWeekRow, Math.floor((viewportFit - 28) / weeks));
    grid.style.removeProperty("height");
    grid.style.gridTemplateRows = "auto repeat(" + weeks + ", minmax(" + rowFloor + "px, auto))";
  }

  async function refresh() {
    const btn = $("refreshBtn");
    if (btn) btn.disabled = true;
    if (Date.now() - sportsLastFetch > SPORTS_MIN_REFETCH_MS) {
      loadSportsEvents().then(renderCalendar);
    }
    stampDateline(); // re-stamp in case the page has been open across a midnight rollover
    // Fetch fresh /calendar.json so new commitments appear, but keep the
    // current grid on screen meanwhile and only redraw once it arrives.
    try {
      await Promise.all([loadCalendar(), loadTodos(), loadMovies()]);
      renderCalendar();
      stampUpdated();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function startLoops() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, REFRESH_MS);
    setInterval(() => { loadSportsEvents().then(renderCalendar); }, SPORTS_REFRESH_MS);
    setInterval(refreshLiveGames, LIVE_POLL_MS);
    const btn = $("refreshBtn");
    if (btn) btn.addEventListener("click", refresh);
    // The grid is rebuilt on every redraw, so listen once on the stable parents.
    const calRoot = $("calRoot");
    if (calRoot) calRoot.addEventListener("click", e => {
      if (e.target.closest && e.target.closest("[data-add-todo]")) { openTodoSheet(); return; }
      const x = e.target.closest && e.target.closest("[data-dismiss-movie]");
      if (x) {
        const key = x.dataset.dismissMovie;
        const m = movieList.find(f => movieKey(f) === key);
        const r = dismissMovie(key, m ? m.title : "Movie");
        showTodoUndo("Dismissed", r.title, r.restore);
        renderCalendar();
        return;
      }
      const chip = e.target.closest && e.target.closest("[data-todo-key]");
      if (chip) completeTodo(chip.dataset.todoKey);
    });
    const undoBar = $("todoUndo");
    if (undoBar) undoBar.addEventListener("click", e => {
      if (e.target.closest && e.target.closest("[data-undo]")) undoLast();
    });
    initTodoSheet();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { refresh(); refreshLiveGames(); requestWakeLock(); }
    });
    window.addEventListener("resize", fitCalendarGrid);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitCalendarGrid);
    }
    requestWakeLock();
  }

  // Keeps a mounted-iPad display from auto-dimming/locking while this page
  // is open (Screen Wake Lock API — Safari 16.4+). The OS releases the lock
  // whenever the tab is backgrounded, so it has to be re-requested on every
  // return to visibility (handled in startLoops' visibilitychange listener),
  // not just once at boot. Silently no-ops on unsupported browsers/OSes.
  let wakeLock = null;
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch (e) {
      wakeLock = null;
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
