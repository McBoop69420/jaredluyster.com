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
  let selectedDate = null;     // day tapped in the phone grid; null = today

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
    // postseason: the rest of the MLS Cup playoffs come back as featured cards.
    { key: "soccer/usa.1", label: "MLS", order: "home-away", patterns: ["fc cincinnati"], postseason: true,
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
    // slate: every other match in the competition is shown too, folded into
    // one expandable matchday card per day (see groupSlates()).
    { key: "soccer/uefa.champions", label: "Champions League", short: "UCL", order: "home-away",
      patterns: ["liverpool", "arsenal"], slate: true },
    { key: "soccer/uefa.europa", label: "Europa League", order: "home-away", patterns: ["athletic club"] },
    { key: "soccer/eng.fa", label: "FA Cup", order: "home-away", patterns: ["liverpool", "arsenal"] },
    { key: "soccer/eng.league_cup", label: "Carabao Cup", order: "home-away", patterns: ["liverpool", "arsenal"] },
    { key: "soccer/esp.copa_del_rey", label: "Copa del Rey", order: "home-away", patterns: ["athletic club"] },
    { key: "soccer/usa.open", label: "US Open Cup", order: "home-away", patterns: ["fc cincinnati", "lexington"] },
    { key: "soccer/concacaf.leagues.cup", label: "Leagues Cup", order: "home-away", patterns: ["fc cincinnati"] },
  ];
  // League-wide games beyond my own teams. These come back marked `featured`
  // and render as quieter cards listed after my teams' games.
  //   - NBA and NHL: nationally televised games only. NBA TV and NHL Network
  //     are left out on purpose: they carry a couple of games most nights and
  //     would swamp the grid. ESPN tags nearly every NHL game "national" for
  //     its out-of-market ESPN+ stream, so ESPN+ doesn't count either; the
  //     Hulu/Disney+ games are ESPN's national exclusives, so those do.
  //   - NFL: primetime games only (kickoff 7 pm ET or later: Thursday,
  //     Sunday and Monday night, plus late-season Saturday nights). ESPN tags
  //     every NFL game "national", so the network can't tell them apart.
  //   - College basketball: games where both teams are in the top 25. ESPN's default
  //     scoreboard (no `groups`) is already limited to games with a ranked
  //     team, so the filter only has to check that both sides are ranked.
  //     It also carries every NCAA tournament game, which `postseason` picks
  //     out by ESPN's game note (leaving out the NIT, WBIT and CBC).
  const NATIONAL_LEAGUES = [
    { key: "basketball/nba", label: "NBA", order: "away-home",
      networks: new Set(["ABC", "ESPN", "ESPN2", "NBC", "NBCSN", "PEACOCK", "PRIME VIDEO"]),
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" },
    { key: "hockey/nhl", label: "NHL", order: "away-home",
      networks: new Set(["ABC", "ESPN", "ESPN2", "TNT", "TRUTV", "HULU", "DISNEY+"]),
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png" },
    { key: "football/nfl", label: "NFL", order: "away-home", primetime: "19:00",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
  ];
  //   - Postseason: every playoff game in these leagues (ESPN's season type 3),
  //     e.g. the whole World Series. College football's postseason is ~40
  //     bowls, so `only` keeps it to the Playoff by ESPN's game note. The NBA and
  //     NHL playoffs, March Madness and the MLS Cup playoffs ride along with the fetches
  //     that already pull those leagues (national games, ranked matchups, MLS).
  const POSTSEASON_LEAGUES = [
    { key: "baseball/mlb", label: "MLB", order: "away-home",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png" },
    { key: "football/nfl", label: "NFL", order: "away-home",
      logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png" },
    { key: "football/college-football", label: "NCAAF", order: "away-home", only: /college football playoff/i,
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-football-college.png" },
  ];
  const RANKED_MATCHUP_LEAGUES = [
    { key: "basketball/mens-college-basketball", label: "NCAAM", order: "away-home",
      postseason: /^NCAA Men's Basketball Championship/i,
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png" },
    { key: "basketball/womens-college-basketball", label: "NCAAW", order: "away-home",
      postseason: /^NCAA Women's Basketball Championship/i,
      logo: "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png" },
  ];
  const CALENDAR_WEEKS = 3;               // rows shown in the rolling grid
  const MAX_DOTS = 4;                     // per day in the phone grid, then "+N"
  const PHONE_QUERY = "(max-width:680px)"; // must match the phone @media in calendar.css
  const SPORTS_WINDOW_DAYS_BEHIND = 14;  // covers the display's last-week's-Sunday start
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
      todoList = readTodoArray(j.todos, "");
      todosLoaded = true;
      pruneTodoDone();
    } catch (e) { /* keep the last good list */ }
  }

  // { title, date } entries -> { key, title, date }. `prefix` keeps keys from
  // different files apart.
  function readTodoArray(arr, prefix) {
    return arr.filter(t => t && typeof t.title === "string" && t.title.trim()).map(t => {
      const title = t.title.trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : "";
      return { key: prefix + date + "|" + title, title: title, date: date };
    });
  }

  // ---- Comics -----------------------------------------------------------
  // Read from /comics.json, same { "todos": [...] } shape as todos.json: one todo
  // per new issue of my comic reading orders that still needs getting and adding
  // to its Kavita reading list, on its release day, so each ticks off on its own. Generated on the comic server
  // by make-comic-reminders.py from its "Missing Issues" checklists, so an issue
  // drops out of the file once it's filed there. Until then it's a normal todo:
  // drawn on its release day, carried to today if that passes, and tickable.
  let comicList = [];
  let todosLoaded = false, comicsLoaded = false;

  async function loadComics() {
    try {
      const res = await fetch("/comics.json?v=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("comics.json " + res.status);
      const j = await res.json();
      if (!j || !Array.isArray(j.todos)) throw new Error("comics.json has no todos array");
      comicList = readTodoArray(j.todos, "C:");
      comicsLoaded = true;
      pruneTodoDone();
    } catch (e) { /* keep the last good list */ }
  }

  function pruneTodoDone() {
    // Ticks for both files share one store, so only prune once both have loaded;
    // otherwise whichever arrives first would forget the other's ticks.
    if (!todosLoaded || !comicsLoaded) return;
    const live = new Set(todoList.concat(comicList).map(t => t.key));
    let changed = false;
    Object.keys(todoDone).forEach(k => {
      if (live.has(k)) return;
      // The shared store forgets it too, but only once the tick is a while old: a
      // device still holding last deploy's files mustn't untick a todo just added.
      if (Date.now() - todoDone[k] > PRUNE_SHARED_AFTER_MS) queueTickOp("untick", k, { send: false });
      delete todoDone[k];
      changed = true;
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
    queueTickOp("dismiss", key);
    return { title: title, restore() {
      movieDismissed.delete(key);
      saveMovieDismissed();
      queueTickOp("undismiss", key);
    } };
  }

  // ---- Shared ticks -----------------------------------------------------
  // Ticked todos and dismissed movies are also kept in one private store,
  // /api/ticks (news/_worker.js: an R2 file behind calendar.jaredluyster.com's
  // Access login), so a tick on the phone clears the wall display at its next
  // refresh. localStorage stays as this device's copy: the page draws from it
  // straight away, keeps working offline, and it's all there is where the API
  // isn't (jaredluyster.com/calendar/, local previews), which is just how it
  // worked before. Each change is queued as an op and sent in order; the server
  // applies the ops to what it holds and answers with the whole merged state,
  // which becomes this device's copy (with anything still unsent laid on top).
  // Page-made todos are not shared; they stay in this browser only.
  const TICKS_API = "/api/ticks";
  const SYNC_PENDING_KEY = "calendar.sync.pending";
  const SYNC_SEEDED_KEY = "calendar.sync.seeded";
  const SYNC_MAX_PENDING = 500;
  const PRUNE_SHARED_AFTER_MS = 2 * 24 * 60 * 60 * 1000;
  let syncPending = readSyncPending();   // [{ op, key, at }] not yet accepted by the server
  let syncRunning = null;
  let syncAgain = false;

  function readSyncPending() {
    try {
      const raw = JSON.parse(localStorage.getItem(SYNC_PENDING_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter(o => o && typeof o.op === "string" && typeof o.key === "string") : [];
    } catch (e) { return []; }
  }
  function saveSyncPending() {
    try { localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify(syncPending)); } catch (e) { /* in-memory only */ }
  }
  function syncSeeded() {
    try { return localStorage.getItem(SYNC_SEEDED_KEY) === "1"; } catch (e) { return false; }
  }

  // `send: false` just queues it for the next sync (pruning happens mid-load).
  function queueTickOp(op, key, opts) {
    syncPending.push({ op: op, key: key, at: Date.now() });
    // Where there's no API the queue never drains; keep only the newest.
    if (syncPending.length > SYNC_MAX_PENDING) syncPending.splice(0, syncPending.length - SYNC_MAX_PENDING);
    saveSyncPending();
    if (!opts || opts.send !== false) syncTicks().then(changed => { if (changed) renderCalendar(); });
  }

  function applyTickOpLocally(o) {
    if (o.op === "tick") { if (!todoDone[o.key]) todoDone[o.key] = o.at || Date.now(); }
    else if (o.op === "untick") delete todoDone[o.key];
    else if (o.op === "dismiss") movieDismissed.add(o.key);
    else if (o.op === "undismiss") movieDismissed.delete(o.key);
  }

  // Resolves true if what's ticked or dismissed changed, so the caller redraws.
  // One sync at a time; a change made meanwhile runs one more round after it.
  function syncTicks() {
    if (syncRunning) { syncAgain = true; return syncRunning; }
    syncRunning = (async () => {
      let changed = false;
      try {
        do {
          syncAgain = false;
          if (await syncOnce()) changed = true;
        } while (syncAgain);
      } finally {
        syncRunning = null;
      }
      return changed;
    })();
    return syncRunning;
  }

  async function syncOnce() {
    const sent = syncPending.slice();
    let state;
    try {
      const res = await fetch(TICKS_API, sent.length
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: sent }), cache: "no-store" }
        : { cache: "no-store" });
      if (!res.ok) return false;
      // No API here: the site's HTML fallback page fails this parse.
      state = await res.json();
    } catch (e) {
      return false;   // offline, signed out of Access, or no API: keep the local copy and the queue
    }
    if (!state || !state.done || typeof state.done !== "object" || !state.dismissed || typeof state.dismissed !== "object") return false;
    const sentSet = new Set(sent);
    syncPending = syncPending.filter(o => !sentSet.has(o));
    if (!syncSeeded()) {
      // This device's first contact: share the ticks it made before syncing existed.
      Object.keys(todoDone).forEach(k => {
        if (!(k in state.done)) syncPending.push({ op: "tick", key: k, at: todoDone[k] });
      });
      movieDismissed.forEach(k => {
        if (!(k in state.dismissed)) syncPending.push({ op: "dismiss", key: k, at: Date.now() });
      });
      try { localStorage.setItem(SYNC_SEEDED_KEY, "1"); } catch (e) { /* tries again next load */ }
      if (syncPending.length) syncAgain = true;
    }
    saveSyncPending();

    const before = JSON.stringify([todoDone, Array.from(movieDismissed).sort()]);
    todoDone = {};
    Object.keys(state.done).forEach(k => { if (typeof state.done[k] === "number") todoDone[k] = state.done[k]; });
    movieDismissed = new Set(Object.keys(state.dismissed));
    syncPending.forEach(applyTickOpLocally);
    saveTodoDone();
    saveMovieDismissed();
    return JSON.stringify([todoDone, Array.from(movieDismissed).sort()]) !== before;
  }
  function dismissButtonHtml(ev) {
    return '<button type="button" class="cal-dismiss" data-dismiss-movie="' + esc(ev.movieKey) +
      '" aria-label="Dismiss ' + esc(ev.movieTitle) + ' for good" title="Dismiss for good">&times;</button>';
  }

  function movieEvents() {
    return movieList.filter(m => !movieDismissed.has(movieKey(m))).map(m => {
      const release = String(m.kind || "").toLowerCase() === "release";
      const year = m.year ? " (" + m.year + ")" : "";
      const where = movieVenue(m);
      const venue = !release && where ? " \u00b7 " + where : "";
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

  // "Fathom" is the distributor, not a theatre. Its events play at the chains,
  // and the tracker only writes regal_url / cinemark_url once it has checked
  // that the film is on that theatre's schedule, so name the theatre(s) from those.
  function movieVenue(m) {
    const v = String(m.venue || "").trim();
    if (!/^fathom\b/i.test(v)) return v;
    const at = [];
    if (m.regal_url) at.push("Regal Hamburg");
    if (m.cinemark_url) at.push(at.length ? "Cinemark" : "Cinemark Fayette Mall");
    return at.length ? at.join(" & ") : "Fathom, theater TBA";
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
  // the strip shows it. A comic reminder stays off the calendar until its
  // release day: there's nothing to do about an issue that isn't out yet.
  function todoEvents(todayStr) {
    // `due` keeps the real date after an overdue todo is moved to today, so
    // duplicatesEvent() still matches it against its own day's events.
    const released = comicList.filter(t => !t.date || t.date <= todayStr);
    const fromFile = todoList.concat(released).filter(t => !todoDone[t.key]).map(t => ({
      type: "todo", title: t.title, todoKey: t.key, due: t.date, comic: t.key.indexOf("C:") === 0,
      date: t.date && t.date < todayStr ? todayStr : t.date,
      overdue: !!t.date && t.date < todayStr,
      repeat: "",
    }));
    const fromPage = localTodos.map(t => ({
      type: "todo", title: t.title, todoKey: "L:" + t.id,   // repo keys are "date|title", so never clash
      due: t.due,
      date: t.due && t.due < todayStr ? todayStr : t.due,
      overdue: !!t.due && t.due < todayStr,
      repeat: t.repeat && REPEAT ? REPEAT.describe(t.repeat) : "",
    }));
    return fromFile.concat(fromPage);
  }

  // A dated todo that's also on the calendar as an event that day ("Lunch —
  // 12:30" beside a 12:30p "Lunch" event) would show twice; the event, with its
  // proper time, wins. Titles match once a trailing " — 12:30" is dropped. An
  // overdue todo is matched on its own date, not the today it was moved to, so
  // it stays hidden after the day passes instead of resurfacing as overdue.
  function duplicatesEvent(todo) {
    const day = todo.due || todo.date;
    if (!day) return false;
    const key = s => String(s || "").replace(/\s+[—–-]\s*\d{1,2}(:\d{2})?\s*([ap]\.?m\.?)?\s*$/i, "")
      .trim().toLowerCase();
    const k = key(todo.title);
    return allCalEvents().some(ev => ev.date === day && key(ev.title) === k);
  }

  // The whole chip is the tap target. `when` is a short tag ("overdue", "today").
  // Comic reminders arrive as "Comics: Absolute Batman #25 → Absolute Universe
  // list". The chip shows just the issue; the book mark says it's a comic, and
  // the full text stays in the tooltip and aria-label. Display only: the stored
  // title is the tick key, so changing it in comics.json would un-tick issues.
  function comicLabel(title) {
    const short = String(title || "").replace(/^comics:\s*/i, "").replace(/\s*(→|->)\s*.*$/, "").trim();
    return short || title;
  }

  const BOOK_ICON = '<svg class="cal-todo-book" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M2 3.2C3.8 2.4 5.9 2.5 8 3.6c2.1-1.1 4.2-1.2 6-.4v9.6c-1.8-.8-3.9-.7-6 .4-2.1-1.1-4.2-1.2-6-.4z' +
    'M8 3.6v9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  function todoChipHtml(ev, when) {
    const isNew = todoSeen && !todoSeen.has(ev.todoKey);
    const text = ev.comic ? comicLabel(ev.title) : ev.title;
    return '<button type="button" class="cal-todo' + (ev.overdue ? " cal-todo--overdue" : "") +
      (ev.comic ? " cal-todo--comic" : "") +
      (isNew ? " cal-todo--new" : "") + '" data-todo-key="' + esc(ev.todoKey) + '"' +
      (ev.comic ? ' title="' + esc(ev.title) + '"' : '') +
      ' aria-label="Mark done: ' + esc(ev.title) + (ev.repeat ? " (" + esc(ev.repeat.toLowerCase()) + ")" : "") + '">' +
      '<span class="cal-todo-box" aria-hidden="true"></span>' +
      (ev.comic ? BOOK_ICON : '') +
      '<span class="cal-todo-text">' + esc(text) + '</span>' +
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
      const t = todoList.concat(comicList).find(x => x.key === key);
      todoDone[key] = Date.now();
      saveTodoDone();
      queueTickOp("tick", key);
      result = { title: t ? t.title : "Todo", restore() {
        delete todoDone[key];
        saveTodoDone();
        queueTickOp("untick", key);
      } };
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

  // ---- Page-made events -------------------------------------------------
  // Added from the "+ Add event" sheet and kept in /api/events (news/_worker.js:
  // events.json in R2, behind the same Access login as the ticks), so unlike
  // page-made todos they reach every device. They draw exactly like calendar.json
  // events. Where there's no API (local previews, jaredluyster.com/calendar/) the
  // sheet says it can't save rather than pretending to.
  const EVENTS_API = "/api/events";
  let webEvents = [];

  function allCalEvents() {
    return (calEvents || []).concat(webEvents);
  }

  function takeWebEvents(j) {
    if (!j || !Array.isArray(j.events)) return false;
    webEvents = j.events.filter(ev => ev && ev.id && ev.title && ev.date);
    return true;
  }

  async function loadWebEvents() {
    try {
      const res = await fetch(EVENTS_API, { cache: "no-store" });
      if (res.ok) takeWebEvents(await res.json());
    } catch (e) { /* offline, signed out or no API: keep the last list */ }
  }

  // Resolves once the server has the change; rejects with something to show.
  async function postEvents(body) {
    let res, j = null;
    try {
      res = await fetch(EVENTS_API, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store" });
      j = await res.json();
    } catch (e) {
      // Access's login redirect and the no-API HTML page both land here.
      throw new Error("Couldn't reach the calendar. Reload the page (it may need you to sign in again) and try once more.");
    }
    if (!res.ok || !takeWebEvents(j)) throw new Error("Couldn't save that (" + ((j && j.error) || res.status) + ").");
  }

  function newEventId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function eventFormDays() {
    return Array.prototype.map.call(document.querySelectorAll("#eventDays [aria-pressed='true']"), b => b.dataset.day);
  }

  // Like the todo sheet: the day picker starts on the chosen date's weekday.
  function syncEventRepeatUi() {
    const weekly = $("eventRepeat").value === "weekly";
    $("eventDays").hidden = !weekly;
    if (weekly && !eventFormDays().length) {
      const ds = $("eventDate").value || etTodayStr();
      const code = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(ds + "T12:00:00").getDay()];
      const b = document.querySelector('#eventDays [data-day="' + code + '"]');
      if (b) b.setAttribute("aria-pressed", "true");
    }
  }

  // Upcoming ones only: a one-off that's over has nothing left to change.
  function renderEventSheetList() {
    const ul = $("eventList");
    if (!ul) return;
    const today = etTodayStr();
    const dayNames = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
    const items = webEvents.filter(ev => ev.date >= today ||
      (ev.recurrence && (!ev.recurrence.until || ev.recurrence.until >= today)))
      .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
    ul.innerHTML = items.length ? items.map(ev => {
      const when = ev.recurrence
        ? "Every " + ev.recurrence.byDay.split(",").map(d => dayNames[d] || d).join(", ") + " from " + todoDueLabel(ev.date)
        : todoDueLabel(ev.date);
      const meta = [when, fmtRange(ev), ev.location].filter(Boolean).join(" · ");
      return '<li class="todo-list-item"><span class="todo-list-main">' +
        '<span class="todo-list-title">' + esc(ev.title) + '</span>' +
        '<span class="todo-list-meta">' + esc(meta) + '</span></span>' +
        '<button type="button" class="todo-del" data-del-event="' + esc(ev.id) + '" aria-label="Delete ' + esc(ev.title) + '">Delete</button></li>';
    }).join("") : '<li class="todo-list-empty">Nothing coming up yet.</li>';
  }

  function openEventSheet() {
    const sheet = $("eventSheet");
    if (!sheet) return;
    sheet.hidden = false;
    $("eventNote").textContent = "";
    if (!$("eventDate").value) $("eventDate").value = etTodayStr();
    renderEventSheetList();
    $("eventTitle").focus();
    loadWebEvents().then(renderEventSheetList);
  }

  function closeEventSheet() {
    const sheet = $("eventSheet");
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    const opener = document.querySelector("[data-add-event]");
    if (opener) opener.focus();
  }

  function initEventSheet() {
    const sheet = $("eventSheet");
    if (!sheet) return;
    $("eventClose").addEventListener("click", closeEventSheet);
    sheet.addEventListener("click", e => { if (e.target === sheet) closeEventSheet(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeEventSheet(); });
    $("eventRepeat").addEventListener("change", syncEventRepeatUi);
    $("eventDays").addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("[data-day]");
      if (b) b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
    $("eventForm").addEventListener("submit", async e => {
      e.preventDefault();
      const note = $("eventNote");
      const ev = { id: newEventId(), title: $("eventTitle").value.trim(), date: $("eventDate").value };
      const start = $("eventStart").value, end = $("eventEnd").value, loc = $("eventLocation").value.trim();
      if (!ev.title) { $("eventTitle").focus(); return; }
      if (!ev.date) { $("eventDate").focus(); return; }
      if (end && !start) { note.textContent = "Add a start time to go with the end time."; $("eventStart").focus(); return; }
      if (start) ev.start = start;
      if (end) ev.end = end;
      if (loc) ev.location = loc;
      if ($("eventRepeat").value === "weekly") {
        const days = eventFormDays();
        if (!days.length) { note.textContent = "Pick at least one day for it to repeat on."; return; }
        ev.recurrence = { freq: "weekly", byDay: days.join(",") };
      }
      const btn = $("eventAddBtn");
      btn.disabled = true;
      note.textContent = "Saving…";
      try {
        await postEvents({ op: "add", event: ev });
      } catch (err) {
        note.textContent = err.message;
        return;
      } finally {
        btn.disabled = false;
      }
      $("eventForm").reset();
      Array.prototype.forEach.call(document.querySelectorAll("#eventDays [data-day]"), b => b.setAttribute("aria-pressed", "false"));
      $("eventDays").hidden = true;
      $("eventDate").value = ev.date;   // the next one is likely the same day
      note.textContent = "Added: " + ev.title + " (" + todoDueLabel(ev.date) + ")";
      $("eventTitle").focus();
      renderCalendar();
      renderEventSheetList();
    });
    $("eventList").addEventListener("click", async e => {
      const b = e.target.closest && e.target.closest("[data-del-event]");
      if (!b) return;
      const ev = webEvents.find(x => x.id === b.dataset.delEvent);
      if (!ev) return;
      b.disabled = true;
      try {
        await postEvents({ op: "delete", id: ev.id });
      } catch (err) {
        $("eventNote").textContent = err.message;
        b.disabled = false;
        return;
      }
      const restore = Object.assign({}, ev);
      delete restore.added;
      showTodoUndo("Deleted", ev.title, () => {
        postEvents({ op: "add", event: restore }).then(() => { renderCalendar(); renderEventSheetList(); },
          err => { $("eventNote").textContent = err.message; });
      });
      renderCalendar();
      renderEventSheetList();
    });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dateStr(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

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
      leftAbbr: ((homeFirst ? home : away).team || {}).abbreviation || "",
      rightAbbr: ((homeFirst ? away : home).team || {}).abbreviation || "",
      leftScore: homeFirst ? homeScore : awayScore,
      rightScore: homeFirst ? awayScore : homeScore,
    };
  }

  async function fetchTeamScheduleEvents(entry, minDate, maxDate) {
    async function fetchSchedule(query) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const url = ESPN + entry.key + "/teams/" + entry.id + "/schedule" + query;
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.events) ? data.events : [];
      } catch (e) {
        return [];
      }
    }
    // Before tip-off ESPN defaults a team's schedule to the season's empty
    // "Preseason" type (seen for UK men's basketball in October), so fall back
    // to asking for the regular season explicitly when the default has nothing.
    let events = await fetchSchedule("");
    if (!events.length) events = await fetchSchedule("?seasontype=2");
    return events.map(ev => parseGameEvent(ev, entry)).filter(Boolean)
      .filter(g => g.date >= minDate && g.date <= maxDate);
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

  async function fetchJson(url) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timeout);
      return res.ok ? await res.json() : null;
    } catch (e) {
      return null;
    }
  }

  function eventsOf(data) {
    return data && Array.isArray(data.events) ? data.events : [];
  }

  // `limit` matters here: without it a busy month (NBA) is cut off at 100.
  async function fetchScoreboardMonths(key, minDate, maxDate) {
    const pages = await Promise.all(monthsBetween(minDate, maxDate).map(ym =>
      fetchJson(ESPN + key + "/scoreboard?limit=1000&dates=" + ym)));
    return pages.flatMap(eventsOf);
  }

  function inWindow(minDate, maxDate) {
    return g => g && g.date >= minDate && g.date <= maxDate;
  }

  // My teams' matches in the league. For a `slate` league, every other match
  // comes back too, flagged `slate` for groupSlates() to fold together.
  async function fetchSoccerLeagueEvents(entry, minDate, maxDate) {
    const events = await fetchScoreboardMonths(entry.key, minDate, maxDate);
    const games = [];
    events.forEach(ev => {
      const comp = ev.competitions && ev.competitions[0];
      const names = ((comp && comp.competitors) || []).map(c =>
        ((c.team && c.team.displayName) || "").toLowerCase());
      const mine = entry.patterns.some(p => names.some(n => n.includes(p)));
      const playoff = !mine && entry.postseason && isPostseason(ev);
      if (!mine && !entry.slate && !playoff) return;
      const g = parseGameEvent(ev, entry);
      if (!inWindow(minDate, maxDate)(g)) return;
      if (playoff) g.featured = true;
      else if (!mine) g.slate = true;
      games.push(g);
    });
    return games;
  }

  // ESPN's season type 3 for US leagues. MLS instead gives each playoff round
  // its own season type, so it's recognised by the round's slug
  // ("eastern-conference-playoffs---round-one", "mls-cup").
  function isPostseason(ev) {
    const s = ev && ev.season;
    return !!s && (s.type === 3 || /playoffs|mls-cup/.test(s.slug || ""));
  }

  function hasNote(ev, re) {
    const comp = ev.competitions && ev.competitions[0];
    return ((comp && comp.notes) || []).some(n => re.test(n.headline || ""));
  }

  async function fetchNationalEvents(entry, minDate, maxDate) {
    const events = await fetchScoreboardMonths(entry.key, minDate, maxDate);
    if (entry.primetime) {
      return events.filter(ev => !isPostseason(ev)).map(ev => parseGameEvent(ev, entry))
        .filter(g => inWindow(minDate, maxDate)(g) && g.start && g.start >= entry.primetime)
        .map(g => Object.assign(g, { featured: true }));
    }
    return events.filter(ev => {
      const comp = ev.competitions && ev.competitions[0];
      return isPostseason(ev) || ((comp && comp.broadcasts) || []).some(b => b.market === "national" &&
        (b.names || []).some(n => entry.networks.has(String(n).trim().toUpperCase())));
    }).map(ev => parseGameEvent(ev, entry)).filter(inWindow(minDate, maxDate))
      .map(g => Object.assign(g, { featured: true }));
  }

  async function fetchPostseasonEvents(entry, minDate, maxDate) {
    const events = await fetchScoreboardMonths(entry.key, minDate, maxDate);
    return events.filter(ev => isPostseason(ev) && (!entry.only || hasNote(ev, entry.only)))
      .map(ev => parseGameEvent(ev, entry)).filter(inWindow(minDate, maxDate))
      .map(g => Object.assign(g, { featured: true }));
  }

  function bothTop25(ev) {
    const comp = ev.competitions && ev.competitions[0];
    const cs = (comp && comp.competitors) || [];
    return cs.length === 2 && cs.every(c => {
      const r = c.curatedRank && c.curatedRank.current;
      return r >= 1 && r <= 25;   // ESPN uses 99 for unranked
    });
  }

  async function fetchRankedMatchups(entry, minDate, maxDate) {
    const events = await fetchScoreboardMonths(entry.key, minDate, maxDate);
    return events.filter(ev => bothTop25(ev) || (isPostseason(ev) && hasNote(ev, entry.postseason)))
      .map(ev => parseGameEvent(ev, entry))
      .filter(inWindow(minDate, maxDate)).map(g => Object.assign(g, { featured: true }));
  }

  // Folds a league's `slate` matches into one card per day. `mine` counts my
  // own teams' matches in that league that day, which keep their own cards.
  function groupSlates(games) {
    const groups = new Map();
    games.forEach(g => {
      if (!g.slate) return;
      const k = g.srcKey + "|" + g.date;
      if (!groups.has(k)) groups.set(k, { type: "sports", slate: true, slateKey: k, date: g.date,
        league: g.league, srcKey: g.srcKey, games: [], mine: 0 });
      groups.get(k).games.push(g);
    });
    games.forEach(g => {
      const grp = !g.slate && !g.featured && groups.get(g.srcKey + "|" + g.date);
      if (grp) grp.mine++;
    });
    return Array.from(groups.values()).map(grp => {
      grp.games.sort((a, b) => (a.start || "99").localeCompare(b.start || "99"));
      grp.start = grp.games[0].start;
      const entry = SOCCER_LEAGUES.find(l => l.key === grp.srcKey);
      grp.short = (entry && entry.short) || grp.league;
      const n = grp.games.length;
      grp.title = grp.short + " · " + (grp.mine ? n + " more" : n + (n === 1 ? " match" : " matches"));
      return grp;
    });
  }

  // UK and Louisville basketball exhibitions, which ESPN doesn't list. The
  // calendar's Worker scrapes them from the schools' own sites (see
  // /api/exhibitions in news/_worker.js); jaredluyster.com/calendar/ has no
  // Worker, so there the fetch just fails and they're left out.
  async function fetchExhibitionEvents(minDate, maxDate) {
    const data = await fetchJson("/api/exhibitions");
    const games = (data && Array.isArray(data.games)) ? data.games : [];
    return games.filter(inWindow(minDate, maxDate)).map(x => {
      const entry = TEAM_SCHEDULE_TEAMS.find(t => t.label === x.league) || {};
      const away = x.home ? x.opponent : x.team, home = x.home ? x.team : x.opponent;
      return {
        date: x.date, start: x.start || null, timeLabel: x.start ? null : "TBD",
        title: gameTitle(x.league, away, null, home, null, "pre") + " (Exhibition)",
        type: "sports", league: x.league, leagueLogo: entry.logo, state: "pre",
        homeFirst: false, gameLink: x.url || null,
        leftName: away, rightName: home,
        leftLogo: x.home ? x.opponentLogo : x.teamLogo,
        rightLogo: x.home ? x.teamLogo : x.opponentLogo,
        leftScore: null, rightScore: null,
      };
    });
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
      .concat(SOCCER_LEAGUES.map(l => fetchSoccerLeagueEvents(l, minDate, maxDate)))
      .concat(NATIONAL_LEAGUES.map(l => fetchNationalEvents(l, minDate, maxDate)))
      .concat(RANKED_MATCHUP_LEAGUES.map(l => fetchRankedMatchups(l, minDate, maxDate)))
      .concat(POSTSEASON_LEAGUES.map(l => fetchPostseasonEvents(l, minDate, maxDate)))
      .concat([fetchExhibitionEvents(minDate, maxDate)]);
    const [results, mlbGamePks] = await Promise.all([
      Promise.all(jobs), fetchMlbGamePks(minDate, maxDate),
    ]);
    const prevLive = new Map(sportsEvents.filter(e => e.id && e.state === "in" && e.leftScore != null)
      .map(e => [e.id, e]));
    // A ranked matchup involving one of my teams already has its own card.
    const all = results.flat();
    const mineIds = new Set(all.filter(g => !g.featured && !g.slate).map(g => g.srcKey + "|" + g.id));
    const games = all.filter(g => !g.featured || !mineIds.has(g.srcKey + "|" + g.id));
    sportsEvents = games.filter(g => !g.slate).concat(groupSlates(games));
    sportsEvents.forEach(ev => {
      if (ev.league === "MLB" && !ev.featured && mlbGamePks[ev.date]) {   // the Reds' game that day, not a league-wide one
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

  // A matchday card's games are polled with one scoreboard request for the
  // whole day rather than one summary request per match.
  async function refreshSlate(grp) {
    const data = await fetchJson(ESPN + grp.srcKey + "/scoreboard?dates=" + grp.date.replace(/-/g, ""));
    const byId = new Map(eventsOf(data).map(ev => [String(ev.id), ev.competitions && ev.competitions[0]]));
    let changed = false;
    grp.games.forEach(g => {
      const comp = byId.get(String(g.id));
      if (comp && applyLiveComp(g, comp)) changed = true;
    });
    return changed;
  }

  async function refreshLiveGames() {
    if (liveInFlight || document.hidden) return;
    const targets = sportsEvents.filter(needsLivePoll);
    const slates = sportsEvents.filter(ev => ev.slate && ev.games.some(needsLivePoll));
    if (!targets.length && !slates.length) return;
    liveInFlight = true;
    try {
      const changed = await Promise.all(targets.map(async ev => {
        const comp = await fetchLiveComp(ev);
        return comp ? applyLiveComp(ev, comp) : false;
      }).concat(slates.map(refreshSlate)));
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
    if (!safe) return "";
    return " cal-ev--" + safe + (ev.featured ? " cal-ev--featured" : "") + (ev.slate ? " cal-ev--slate" : "");
  }

  // League-wide games (featured cards, matchday cards) rather than my own.
  function isLeagueWide(ev) {
    return !!(ev.featured || ev.slate);
  }

  // Matchday card: "UCL · 8 more" that opens to every other match that day.
  // Which cards are open survives a redraw (see the toggle listener).
  const openSlates = new Set();
  function slateHtml(ev, size) {
    return '<details class="cal-slate" data-slate="' + esc(ev.slateKey) + '"' +
      (openSlates.has(ev.slateKey) ? " open" : "") + '>' +
      '<summary class="cal-slate-sum">' + esc(ev.title) + '</summary>' +
      '<ul class="cal-slate-list">' + ev.games.map(g =>
        '<li>' + (sportsMatchHtml(g, size === "lg" ? "md" : "slate") || esc(g.title)) + '</li>').join("") +
      '</ul></details>';
  }

  // TEAMLOGO TIME TEAMLOGO, in each sport's own home/away fixture order (see
  // parseGameEvent). Once the game is live or final, the time slot switches
  // to the score. `size` picks a CSS modifier for the three contexts this
  // renders in: "sm" grid chips (default), "md" the upcoming strip, "lg" the
  // full-schedule agenda. A team ESPN has no art for (lower-division Copa del
  // Rey sides, say) gets an abbreviation badge in the logo's place; only a
  // side with neither logo nor name falls back to null (caller uses text).
  // When ESPN gives us a Gamecast link, the whole chip becomes a link there —
  // the legal, official source for where/how to watch, never a direct stream.
  function teamMarkHtml(logo, name, abbr) {
    if (logo) {
      return '<img class="cal-ev-logo cal-ev-logo--team" src="' + esc(logo) + '" alt="' + esc(name) + '" decoding="async">';
    }
    const words = String(name || "").split(/\s+/).filter(Boolean);
    const short = abbr || (words.length > 1 ? words.map(w => w[0]).join("").slice(0, 3)
      : String(name || "").slice(0, 3)).toUpperCase();
    return '<span class="cal-ev-logo cal-ev-logo--team cal-ev-abbr" role="img" aria-label="' + esc(name) +
      '" title="' + esc(name) + '">' + esc(short) + '</span>';
  }

  function sportsMatchHtml(ev, size) {
    if (ev.type !== "sports" || !(ev.leftLogo || ev.leftName) || !(ev.rightLogo || ev.rightName)) return null;
    const sizeClass = size && size !== "sm" ? " cal-ev-match--" + size : "";
    const hasScore = (ev.state === "in" || ev.state === "post") &&
      ev.leftScore != null && ev.rightScore != null;
    // The grid chips are only ~50px wide, too narrow for LOGO 27–33 LOGO in one
    // row (the score wrapped digit-by-digit). With a score, stack it as a
    // mini scoreboard instead: one logo+score line per team, winner emphasized.
    if (hasScore && (!size || size === "sm")) {
      const final = ev.state === "post";
      const l = parseFloat(ev.leftScore), r = parseFloat(ev.rightScore);
      const line = (logo, name, abbr, score, cls) =>
        '<span class="cal-ev-line' + cls + '">' + teamMarkHtml(logo, name, abbr) +
          '<span class="cal-ev-pts">' + esc(score) + '</span></span>';
      const win = (a, b) => final && a > b ? " cal-ev-line--win" : final && a < b ? " cal-ev-line--lose" : "";
      const tag = ev.gameLink ? "a" : "span";
      const linkAttrs = ev.gameLink
        ? ' href="' + esc(ev.gameLink) + '" target="_blank" rel="noopener"' : "";
      return '<' + tag + ' class="cal-ev-match cal-ev-match--board' + (final ? "" : " cal-ev-match--live") + '"' + linkAttrs + '>' +
        line(ev.leftLogo, ev.leftName, ev.leftAbbr, ev.leftScore, win(l, r)) +
        line(ev.rightLogo, ev.rightName, ev.rightAbbr, ev.rightScore, win(r, l)) +
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
        teamMarkHtml(ev.leftLogo, ev.leftName, ev.leftAbbr) +
        centerHtml +
        teamMarkHtml(ev.rightLogo, ev.rightName, ev.rightAbbr) +
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
      Promise.all([loadCalendar(), loadWebEvents(), loadTodos(), loadComics(), loadMovies(), syncTicks()]).then(() => { renderCalendar(); stampUpdated(); });
      return;
    }

    const todayStr = etTodayStr();
    const todoEvts = todoEvents(todayStr).filter(t => !duplicatesEvent(t));
    const tp = todayStr.split("-").map(Number);
    const dow = new Date(tp[0], tp[1] - 1, tp[2], 12).getDay();   // 0 = Sun
    // Rolling window: last week, this week and next week, starting on last
    // week's Sunday. Days flow continuously across month boundaries
    // (bleedthrough); there's no navigation further into the past.
    const start = new Date(tp[0], tp[1] - 1, tp[2] - dow - 7, 12);
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
    allCalEvents().concat(sportsEvents, todoEvts, movieEvents()).forEach(ev => {
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
    // Everything in start-time order; league-wide games (outlined, so my own
    // teams' solid cards still stand out) only yield to mine on a tie, e.g. the
    // UCL card beside a 12:45 Liverpool match.
    Object.keys(byDate).forEach(k =>
      byDate[k].sort((a, b) => {
        const as = a.start || "", bs = b.start || "";
        if (as !== bs) {
          if (!as) return 1;
          if (!bs) return -1;
          return as.localeCompare(bs);
        }
        return isLeagueWide(a) - isLeagueWide(b);
      }));
    // My own events (calendar.json and page-made) drop off today once their
    // start time has passed, like earlier days' do. Games keep their scores;
    // movies and todos have rules of their own. The 5-minute refresh redraws.
    if (byDate[todayStr]) {
      const nowMin = etNowMinutes();
      const nowHm = pad2(Math.floor(nowMin / 60)) + ":" + pad2(nowMin % 60);
      byDate[todayStr] = byDate[todayStr].filter(ev =>
        ev.type === "sports" || ev.type === "movie" || ev.type === "todo" || !ev.start || ev.start >= nowHm);
    }

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
        // Todos have their own strip below; league-wide games stay in the grid.
        if (!isWorkEvent(ev) && ev.type !== "todo" && !isLeagueWide(ev)) featuredEvents.push(Object.assign({}, ev, { _dateLabel: featuredLabel(ds) }));
      });
    });

    const sM = start.toLocaleDateString("en-US", { month: "long" });
    const lM = last.toLocaleDateString("en-US", { month: "long" });
    const sy = start.getFullYear(), ly = last.getFullYear();
    let range;
    if (sy === ly) range = (sM === lM) ? (sM + " " + sy) : (sM + " – " + lM + " " + sy);
    else range = sM + " " + sy + " – " + lM + " " + ly;

    $("range").textContent = range;
    let html = '';
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
      '<div class="daily-link-row"><button type="button" class="add-todo-btn" data-add-event>+ Add event</button>' +
      '<button type="button" class="add-todo-btn" data-add-todo>+ Add todo</button>' +
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
    if (!selectedDate || selectedDate < dateStr(start) || selectedDate > dateStr(last)) selectedDate = todayStr;
    html += '<div class="cal-grid" data-weeks="' + (totalDays / 7) + '">';
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(d =>
      html += '<div class="cal-dow">' + d + '</div>');

    days.forEach((d, i) => {
      const Mo = d.getMonth() + 1, day = d.getDate();
      const ds = d.getFullYear() + "-" + pad2(Mo) + "-" + pad2(day);
      const isToday = ds === todayStr;
      const isPast = ds < todayStr;
      // Days already gone keep only their games (with final scores); every
      // other kind of event clears off.
      const evs = (byDate[ds] || []).filter(ev => !isPast || ev.type === "sports");
      const showMon = day === 1 || i === 0;   // mark each new month for bleedthrough
      html += '<div class="cal-cell' +
        (isToday ? " cal-cell--today" : "") +
        (isPast ? " cal-cell--past" : "") +
        (ds === selectedDate ? " cal-cell--selected" : "") +
        (evs.length ? " cal-cell--has" : "") + '"' +
        (isPast && !evs.length ? '' : ' data-date="' + ds + '"') + '>';
      html += '<div class="cal-daynum">' +
        (showMon ? '<span class="cal-mon">' + esc(d.toLocaleDateString("en-US", { month: "short" })) + '</span> ' : '') +
        day + '</div>';
      // Phones show one dot per event instead of chips (CSS picks which).
      if (evs.length) {
        html += '<div class="cal-dots" aria-hidden="true">' +
          evs.slice(0, MAX_DOTS).map(ev => '<span class="cal-dot' + eventClass(ev) + '"></span>').join('') +
          (evs.length > MAX_DOTS ? '<span class="cal-dot-more">+' + (evs.length - MAX_DOTS) + '</span>' : '') +
          '</div>';
      }
      function evChipHtml(ev) {
        if (ev.type === "todo") {
          return '<div class="cal-ev cal-ev--todo">' + todoChipHtml(ev, ev.overdue ? "overdue" : "") + '</div>';
        }
        if (ev.slate) return '<div class="cal-ev' + eventClass(ev) + '">' + slateHtml(ev) + '</div>';
        const rng = fmtRange(ev);
        const clock = fmtTime(ev.start);   // real HH:MM only — never freetext
        const start = clock || rng;
        // A movie chip is one big link to its tickets: the whole purple box is
        // the tap target, not just the title text inside it.
        const wholeLink = ev.type === "movie" && ev.url;
        const tag = wholeLink ? "a" : "div";
        // .cal-ev-s (the bare start) is CSS-hidden except on movie chips, and
        // a sports chip carries its time in the match row, so a plain event
        // with only a start ("Weightlifting", 12:00) needs it shown here.
        const plain = ev.type !== "sports" && ev.type !== "movie";
        const chip = '<' + tag + ' class="cal-ev' + eventClass(ev) + (wholeLink ? ' cal-ev--linked' : '') + '"' +
          (wholeLink ? ' href="' + esc(ev.url) + '" target="_blank" rel="noopener"' : '') +
          ' title="' + esc((ev.title || "") + (rng ? " · " + rng : "")) + '">' +
          (start ? '<span class="cal-ev-s">' + esc(start) + '</span> ' : '') +
          (rng && (rng !== start || plain) ? '<span class="cal-ev-t">' + esc(rng) + '</span> ' : '') +
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
    function agendaItemHtml(ev, ds, withDate) {
      const dateHtml = withDate ? '<span class="cal-agenda-date">' + esc(featuredLabel(ds)) + '</span>' : '';
      if (ev.type === "todo") {
        return '<li class="cal-agenda-item">' + dateHtml +
          '<span class="cal-agenda-title">' + todoChipHtml(ev, ev.overdue ? "overdue" : "") + '</span></li>';
      }
      if (ev.slate) {
        return '<li class="cal-agenda-item">' + dateHtml +
          '<span class="cal-dot' + eventClass(ev) + '" aria-hidden="true"></span>' +
          '<span class="cal-agenda-title">' + slateHtml(ev, "lg") + '</span></li>';
      }
      const rng = fmtRange(ev);
      const matchHtml = sportsMatchHtml(ev, "lg"); // already carries the time/score, so skip the plain-text rng below
      return '<li class="cal-agenda-item">' + dateHtml +
        '<span class="cal-dot' + eventClass(ev) + '" aria-hidden="true"></span>' +
        '<span class="cal-agenda-title">' + (matchHtml || eventTitleHtml(ev)) + theatreLinksHtml(ev) + '</span>' +
        (!matchHtml && rng ? '<span class="cal-agenda-time">' + esc(rng) + '</span>' : '') +
        (ev.type === "movie" ? dismissButtonHtml(ev) : '') +
        '</li>';
    }

    // Phone only (CSS hides it on wider screens): the tapped day's events in
    // full, right under the dot grid.
    const selParts = selectedDate.split("-").map(Number);
    const selLabel = new Date(selParts[0], selParts[1] - 1, selParts[2], 12)
      .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const selEvs = (byDate[selectedDate] || []).filter(ev => selectedDate >= todayStr || ev.type === "sports");
    html += '<div class="cal-day-panel" aria-live="polite"><h3 class="sub">' +
      esc((selectedDate === todayStr ? "Today · " : selectedDate === tomorrowStr ? "Tomorrow · " : "") + selLabel) + '</h3>' +
      (selEvs.length
        ? '<ul class="cal-agenda">' + selEvs.map(ev => agendaItemHtml(ev, selectedDate, false)).join("") + '</ul>'
        : '<p class="cal-empty">Nothing scheduled.</p>') +
      '</div>';

    const agenda = [];
    days.forEach(d => {
      const ds = dateStr(d);
      if (ds < todayStr) return;
      (byDate[ds] || []).forEach(ev => agenda.push(agendaItemHtml(ev, ds, true)));
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
    grid.style.removeProperty("height");
    // Phone cells hold only a day number and dots; keep rows short so the day
    // panel under the grid stays on screen.
    if (window.matchMedia(PHONE_QUERY).matches) {
      grid.style.gridTemplateRows = "auto repeat(" + weeks + ", minmax(52px, auto))";
      return;
    }
    const gr = grid.getBoundingClientRect();
    const top = gr.top;
    const belowChrome = document.documentElement.scrollHeight - (gr.bottom + window.scrollY);
    const viewportFit = Math.round(window.innerHeight - top - belowChrome - 12);
    const rowFloor = Math.max(150, Math.floor((viewportFit - 28) / weeks));
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
      await Promise.all([loadCalendar(), loadWebEvents(), loadTodos(), loadComics(), loadMovies(), syncTicks()]);
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
    // toggle doesn't bubble, hence the capture-phase listener.
    if (calRoot) calRoot.addEventListener("toggle", e => {
      const key = e.target.dataset && e.target.dataset.slate;
      if (!key) return;
      if (e.target.open) openSlates.add(key); else openSlates.delete(key);
    }, true);
    if (calRoot) calRoot.addEventListener("click", e => {
      if (e.target.closest && e.target.closest("[data-add-todo]")) { openTodoSheet(); return; }
      if (e.target.closest && e.target.closest("[data-add-event]")) { openEventSheet(); return; }
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
      if (chip) { completeTodo(chip.dataset.todoKey); return; }
      const cell = e.target.closest && e.target.closest(".cal-cell[data-date]");
      if (cell && window.matchMedia(PHONE_QUERY).matches && cell.dataset.date !== selectedDate) {
        selectedDate = cell.dataset.date;
        renderCalendar();
      }
    });
    const undoBar = $("todoUndo");
    if (undoBar) undoBar.addEventListener("click", e => {
      if (e.target.closest && e.target.closest("[data-undo]")) undoLast();
    });
    initTodoSheet();
    initEventSheet();
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
