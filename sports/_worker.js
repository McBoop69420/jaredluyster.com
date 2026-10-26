// ---------------------------------------------------------------------------
// Sports — Pages Worker (advanced mode)
//
// sports.jaredluyster.com is otherwise a plain static Pages project; this file
// exists for two routes the browser can't do itself: /api/odds (the value
// screen's BetExplorer moneylines; betexplorer.com has no CORS header) and
// /api/picks (Expert Picks: CBS's picks are HTML-only, and Action Network's
// JSON is megabytes per league before trimming), plus /api/bets, the private
// store behind the My Bets panel (static files can't hold anything private).
// Everything else falls straight through to the static assets, so a change
// here can only affect those routes.
//
// Be careful editing this: in advanced mode a worker that throws takes down the
// WHOLE site, not just one route — hence the blanket try/catch around each
// handler and the unconditional ASSETS fallthrough at the bottom.
// `npx wrangler pages dev sports` is the cheap way to smoke-test it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Live MLB moneylines — /api/odds
// Server-side scrape of BetExplorer's /fixtures/ listing (browsers can't fetch
// betexplorer.com — no CORS), date-pinned per row via the page's CEST kickoff
// cells, edge-cached ~4 min. JS twin of scripts/betexplorer_mlb.py in the
// live-sports-feeds skill (same regexes, same canonical map, same CEST->ET
// conversion). Call: /api/odds?date=YYYY-MM-DD (ET; default today ET).
// Returns { date, fetchedAt, games: [{away, home, away_ml, home_ml,
// away_implied_pct, home_implied_pct, et_start}] } — only games whose odds
// are aired; missing rows must be shown as "no market line", never invented.
//
// Moved here from news/_worker.js when the value screen left The McBoop Daily
// — this is now its only home.
// ---------------------------------------------------------------------------
const ODDS_URL = "https://www.betexplorer.com/baseball/usa/mlb/fixtures/";
const ODDS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ODDS_CACHE_SECONDS = 240;

// canonical name -> spellings betexplorer uses (canonical listed first)
const BE_CANON = {
  "Arizona Diamondbacks": ["Arizona Diamondbacks"],
  "Atlanta Braves": ["Atlanta Braves"],
  "Baltimore Orioles": ["Baltimore Orioles"],
  "Boston Red Sox": ["Boston Red Sox"],
  "Chicago Cubs": ["Chicago Cubs"],
  "Chicago White Sox": ["Chicago White Sox"],
  "Cincinnati Reds": ["Cincinnati Reds"],
  "Cleveland Guardians": ["Cleveland Guardians"],
  "Colorado Rockies": ["Colorado Rockies"],
  "Detroit Tigers": ["Detroit Tigers"],
  "Houston Astros": ["Houston Astros"],
  "Kansas City Royals": ["Kansas City Royals"],
  "Los Angeles Angels": ["Los Angeles Angels"],
  "Los Angeles Dodgers": ["Los Angeles Dodgers"],
  "Miami Marlins": ["Miami Marlins"],
  "Milwaukee Brewers": ["Milwaukee Brewers"],
  "Minnesota Twins": ["Minnesota Twins"],
  "New York Mets": ["New York Mets"],
  "New York Yankees": ["New York Yankees"],
  "Athletics": ["Athletics", "Oakland Athletics", "Las Vegas Athletics"],
  "Philadelphia Phillies": ["Philadelphia Phillies"],
  "Pittsburgh Pirates": ["Pittsburgh Pirates"],
  "San Diego Padres": ["San Diego Padres"],
  "San Francisco Giants": ["San Francisco Giants"],
  "Seattle Mariners": ["Seattle Mariners"],
  "St. Louis Cardinals": ["St.Louis Cardinals"],
  "Tampa Bay Rays": ["Tampa Bay Rays"],
  "Texas Rangers": ["Texas Rangers"],
  "Toronto Blue Jays": ["Toronto Blue Jays"],
  "Washington Nationals": ["Washington Nationals"],
};
const BE_CANON_FLAT = (() => {
  const m = {};
  for (const [canon, names] of Object.entries(BE_CANON)) {
    for (const n of names) m[n] = canon;
  }
  return m;
})();

function dec2amer(d) {
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

const RE_TR = /<tr>([\s\S]*?)<\/tr>/g;
const RE_ANCHOR = /<span>(?:<strong>)?([^<]+)(?:<\/strong>)?<\/span>\s*-\s*<span>(?:<strong>)?([^<]+)(?:<\/strong>)?<\/span>/;
const RE_DATECELL = /<td[^>]*class="[^"]*date[^"]*"[^>]*>\s*([^<]*?)\s*<\/td>/;
const RE_TAG = /data-odd="([\d.]+)"/g;

function p2(n) { return (n < 10 ? "0" : "") + n; }

// Label like "Today 23:40" / "Tomorrow 00:05" / "13.08. 01:07" (CEST
// Europe/Warsaw +02:00; "Today"/"Tomorrow" relative to the CEST reference
// day). Returns ET "YYYY-MM-DD HH:MM" (ET = CEST minus 6h in summer).
function etStartFromLabel(label, refCest) {
  if (!label) return null;
  const tm = label.match(/^(Today|Tomorrow)?\s*(\d{2}):(\d{2})/);
  if (!tm) return null;
  let day;
  if (tm[1] === "Tomorrow") {
    day = new Date(refCest.getTime() + 86400000);
  } else if (tm[1] === "Today") {
    day = refCest;
  } else {
    const dm = label.match(/(\d{2})\.(\d{2})\./);
    if (dm) day = new Date(Date.UTC(refCest.getUTCFullYear(), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10)));
  }
  if (!day) return null;
  const hh = parseInt(tm[2], 10), mm = parseInt(tm[3], 10);
  const et = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm) - 6 * 3600000);
  return et.getUTCFullYear() + "-" + p2(et.getUTCMonth() + 1) + "-" + p2(et.getUTCDate()) +
    " " + p2(et.getUTCHours()) + ":" + p2(et.getUTCMinutes());
}

function parseOddsHtml(html) {
  // "now" in CEST (Europe/Warsaw, UTC+2 in summer) as a UTC-based Date, then
  // its midnight = the reference day for Today/Tomorrow labels.
  const refNow = new Date(Date.now() + 2 * 3600000);
  const refCest = new Date(Date.UTC(refNow.getUTCFullYear(), refNow.getUTCMonth(), refNow.getUTCDate()));
  const games = [];
  let inherit = null; // last day-group label, carried forward across &nbsp; cells
  for (const mRow of html.matchAll(RE_TR)) {
    const row = mRow[1];
    const m = row.match(RE_ANCHOR);
    if (!m) continue;
    const h = m[1].trim(), a = m[2].trim();
    if (!(h in BE_CANON_FLAT) || !(a in BE_CANON_FLAT)) continue;
    const nums = [];
    RE_TAG.lastIndex = 0;
    let om;
    while ((om = RE_TAG.exec(row))) nums.push(parseFloat(om[1]));
    if (nums.length < 2) continue; // odds not aired -> skip row
    const home = BE_CANON_FLAT[h], away = BE_CANON_FLAT[a];
    const g = {
      away, home,
      away_dec: nums[1], home_dec: nums[0],
      away_ml: dec2amer(nums[1]), home_ml: dec2amer(nums[0]),
      away_implied_pct: Math.round(100 / nums[1] * 10) / 10,
      home_implied_pct: Math.round(100 / nums[0] * 10) / 10,
      et_start: null,
    };
    const dc = row.match(RE_DATECELL);
    if (dc) {
      const label = dc[1].trim();
      if (label && label !== "&nbsp;") inherit = label;
    }
    if (inherit) g.et_start = etStartFromLabel(inherit, refCest);
    games.push(g);
  }
  return games;
}

async function handleOdds(request, url) {
  const date = (url.searchParams.get("date") || "").trim();
  const cacheKey = new Request("https://cache.internal/api/odds?" + date, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let games = [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(ODDS_URL, {
      headers: { "User-Agent": ODDS_UA, Accept: "text/html" },
      signal: ctrl.signal,
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (res.ok) {
      const html = await res.text();
      games = parseOddsHtml(html);
      if (date) games = games.filter((g) => g.et_start && g.et_start.slice(0, 10) === date);
      // first occurrence per matchup (page order = soonest first); callers
      // must filter by et_start date before this dedup (series repeat pairs)
      const seen = new Set();
      games = games.filter((g) => {
        const k = g.away + "|" + g.home;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
  } catch (e) {
    games = [];
  } finally {
    clearTimeout(t);
  }

  const body = JSON.stringify({ date: date || null, fetchedAt: new Date().toISOString(), games });
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=" + ODDS_CACHE_SECONDS,
      "Access-Control-Allow-Origin": "*",
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

// ---------------------------------------------------------------------------
// Expert picks — /api/picks
// What published handicappers are picking on one day's games, from two
// sources merged per game:
//   - Action Network: api.actionnetwork.com/web/v2/scoreboard/picks/<league>,
//     the JSON behind actionnetwork.com/<league>/picks. Every game with each
//     expert's posted picks (~40-50 experts, mostly bettors/writers, each with
//     a last-30-days record). Daily leagues take ?date=YYYYMMDD; weekly ones
//     (NFL, NCAAF) return the current week unless given ?week=&seasonType=,
//     which we look up in the response's own calendar_info.
//   - CBS Sports: cbssports.com/<nfl|college-football>/picks/experts/, an HTML
//     table where the same 7-9 staff writers pick every game of the week
//     against the spread, plus a straight-up page for the same week.
// Only full-game spread, moneyline/straight-up and total picks are kept; props,
// team totals and quarter/half picks are just counted (`props`). Call:
// /api/picks?league=nfl|ncaaf|mlb|ncaab|nba|nhl&date=YYYY-MM-DD (ET; default today ET)
// [&through=YYYY-MM-DD: every day from date to through, at most a week; the
// Betting page asks for the rest of the college football week this way].
// Returns { league, date, through, fetchedAt, sources, games: [{ id, date,
// start, status, time, away, home, props, picks: [{ src, expert, market, side, line, odds,
// result, rec, recLabel }] }] }. A source that fails is reported in `sources`
// and the other still shows; nothing here may throw past handlePicks.
// ---------------------------------------------------------------------------
const PICKS_CACHE_SECONDS = 600;
const PICKS_FAIL_CACHE_SECONDS = 60;
const PICKS_LEAGUES = {
  nfl: { an: "nfl", cbs: "nfl", weekly: true },
  ncaaf: { an: "ncaaf", cbs: "college-football", weekly: true },
  mlb: { an: "mlb" },
  ncaab: { an: "ncaab" },
  nba: { an: "nba" },
  nhl: { an: "nhl" },
};
const AN_PICKS_URL = "https://api.actionnetwork.com/web/v2/scoreboard/picks/";
const CBS_PICKS_URL = "https://www.cbssports.com/";

const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});
function etDateOf(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ET_DATE.format(d);
}

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const AN_TYPES = {
  spread_away: ["spread", "away"], spread_home: ["spread", "home"],
  ml_away: ["ml", "away"], ml_home: ["ml", "home"],
  over: ["total", "over"], under: ["total", "under"],
};

function anPick(p) {
  const kind = p && p.period === "game" && AN_TYPES[p.type];
  if (!kind) return null;
  const [market, side] = kind;
  return {
    src: "Action Network", market, side,
    line: market === "ml" ? null : num(p.value),
    odds: num(p.odds),
    result: p.result === "win" || p.result === "loss" || p.result === "push" ? p.result : null,
  };
}

function anRecord(r) {
  if (!r || !Number.isFinite(r.win) || !Number.isFinite(r.loss)) return null;
  return r.win + "-" + r.loss + (r.push ? "-" + r.push : "");
}

function anTeam(t) {
  return { abbr: t.abbr, name: t.full_name || t.display_name || t.abbr, slug: t.url_slug || null };
}

// Action Network scoreboard JSON -> games on `date` (ET) with their side picks.
export function normalizeActionNetwork(data, date, through = date) {
  const games = [];
  for (const g of (data && data.games) || []) {
    const day = g && g.start_time ? etDateOf(g.start_time) : null;
    if (!day || day < date || day > through) continue;
    const teams = {};
    for (const t of g.teams || []) teams[t.id] = t;
    const away = teams[g.away_team_id], home = teams[g.home_team_id];
    if (!away || !home) continue;
    const game = {
      id: "an" + g.id, date: day, start: g.start_time, status: g.status || null, time: null,
      away: anTeam(away), home: anTeam(home), props: 0, picks: [],
    };
    const seen = new Set();
    for (const e of g.experts || []) {
      for (const p of e.picks || []) {
        const pick = anPick(p);
        if (!pick) { game.props++; continue; }
        // One pick per expert per market and side (a re-post at a new line
        // would otherwise count twice in the consensus).
        const k = e.id + "|" + pick.market + "|" + pick.side;
        if (seen.has(k)) continue;
        seen.add(k);
        pick.expert = e.name;
        pick.rec = anRecord(e.record);
        pick.recLabel = pick.rec ? "last 30 days" : null;
        game.picks.push(pick);
      }
    }
    games.push(game);
  }
  return games;
}

// The calendar entry (week + season type) whose window holds `date`, so a
// weekly league can be asked for a week other than the current one.
export function anWeekFor(league, date) {
  const cal = league && league.calendar_info;
  if (!cal) return null;
  const t = Date.parse(date + "T16:00:00Z"); // midday ET
  for (const seasonType of ["reg", "post", "pre"]) {
    for (const w of cal[seasonType] || []) {
      const a = Date.parse(w.startDate), b = Date.parse(w.endDate);
      if (t >= a && t <= b) return { week: w.week, seasonType };
    }
  }
  return null;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
}

// One CBS expert-picks table (ATS or straight-up page) -> experts in column
// order plus a row per game: { date, awayCode, homeCode, awayAbbr, homeAbbr,
// time, picks: [{ expert, code, slug, text, line, result }] }. Codes are the
// CBS ids in the gametracker link (JAC, NWEST); abbrs are the displayed ones.
export function parseCbsPicks(html) {
  const out = { experts: [], rows: [] };
  const start = html.indexOf("TableExpertPicks");
  if (start < 0) return out;
  const end = html.indexOf("</table>", start);
  const table = html.slice(start, end < 0 ? undefined : end);
  const bodyAt = table.indexOf("<tbody");
  const head = table.slice(0, bodyAt < 0 ? undefined : bodyAt);
  const names = [...head.matchAll(/AuthorHeadshotAndName-firstName">([^<]*)<\/span>\s*<span class="AuthorHeadshotAndName-lastName">([^<]*)</g)];
  const records = [...head.matchAll(/TableExpertPicks-overallRecords">\s*Overall:\s*([\d-]+)/g)];
  out.experts = names.map((m, i) => ({
    name: decodeEntities((m[1].trim() + " " + m[2].trim()).trim()),
    record: records[i] ? records[i][1] : null,
  }));
  if (bodyAt < 0) return out;
  for (const row of table.slice(bodyAt).split('<tr class="TableBase-bodyTr').slice(1)) {
    const g = row.match(/\/gametracker\/[a-z]+\/[A-Z]+_(\d{4})(\d{2})(\d{2})_([^@/"]+)@([^/"]+)\//);
    if (!g) continue;
    const abbrs = [...row.matchAll(/GameMatchup-teamAbbr">\s*([^<]*?)\s*</g)].map(m => m[1]);
    const status = row.match(/GameMatchup-gameStatus--status">\s*([^<]*?)\s*</);
    const r = {
      date: g[1] + "-" + g[2] + "-" + g[3], awayCode: g[4], homeCode: g[5],
      awayAbbr: abbrs[0] || g[4], homeAbbr: abbrs[1] || g[5],
      time: status && status[1] ? status[1] : null, picks: [],
    };
    const cells = row.split("<td ").slice(2); // [0] is the row's own tail, [1] the matchup
    cells.forEach((cell, i) => {
      const team = cell.match(/\/teams\/([^/"]+)\/([^/"]+)\//);
      if (!team || !out.experts[i]) return;
      const text = cell.match(/(?:BetButton-text|TableExpertPicks-pick)">\s*([^<]*?)\s*</);
      const line = cell.match(/"line":"([^"]*)"/);
      const badge = cell.match(/TableExpertPicks-badge--(win|loss|push)/);
      r.picks.push({
        expert: i, code: team[1], slug: team[2],
        text: text ? decodeEntities(text[1]) : "",
        line: line ? num(line[1]) : null,
        result: badge ? badge[1] : null,
      });
    });
    out.rows.push(r);
  }
  return out;
}

function slugTokens(s) {
  return new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

// How well a CBS row's team (abbr + any slug seen in a pick) fits an Action
// Network team. CBS and Action Network share most abbreviations (not JAX/JAC,
// WISC/WIS) and most team slugs, so either one agreeing is a match.
function teamFit(abbr, slug, t) {
  let s = 0;
  if (abbr && t.abbr && abbr.toUpperCase() === t.abbr.toUpperCase()) s += 2;
  if (slug && t.slug) {
    if (slug === t.slug) s += 2;
    else {
      const a = slugTokens(slug), b = slugTokens(t.slug);
      let shared = 0;
      for (const x of a) if (b.has(x)) shared++;
      if (shared >= 2) s += 1;
    }
  }
  return s;
}

// Folds CBS's ATS and straight-up tables into `games` (Action Network's list
// for the same date): matched rows add their picks to that game, unmatched
// rows on `date` become games of their own. Returns the number of picks added.
export function mergeCbs(games, date, tables, through = date) {
  let added = 0;
  const byKey = new Map();
  for (const { market, parsed } of tables) {
    for (const row of parsed.rows) {
      if (row.date < date || row.date > through) continue;
      const key = row.awayCode + "@" + row.homeCode;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { row, slugs: {}, picks: [] };
        byKey.set(key, entry);
      }
      for (const p of row.picks) {
        const side = p.code === row.awayCode ? "away" : p.code === row.homeCode ? "home" : null;
        if (!side) continue;
        entry.slugs[side] = p.slug;
        const expert = parsed.experts[p.expert];
        let line = market === "spread" ? p.line : null;
        if (market === "spread" && line == null) {
          const m = p.text.match(/([+-]\d+(?:\.\d+)?)\s*$/);
          line = m ? num(m[1]) : /\bPK\b|\bEVEN\b/i.test(p.text) ? 0 : null;
        }
        entry.picks.push({
          src: "CBS Sports", market, side, line, odds: null, result: p.result,
          expert: expert.name, rec: expert.record,
          recLabel: expert.record ? (market === "spread" ? "season ATS" : "season straight up") : null,
        });
      }
    }
  }
  for (const { row, slugs, picks } of byKey.values()) {
    let best = null, bestScore = 0;
    for (const g of games) {
      let a = teamFit(row.awayAbbr, slugs.away, g.away);
      let h = teamFit(row.homeAbbr, slugs.home, g.home);
      // A team's slug is only seen through picks on it, so when every CBS
      // expert took the same side the other team has nothing but its
      // abbreviation to go on. A team plays once a day: a full match on the
      // known side (abbreviation and slug) on the same date is the game.
      if (!h && !slugs.home && a >= 4 && g.date === row.date) h = 1;
      if (!a && !slugs.away && h >= 4 && g.date === row.date) a = 1;
      if (!a || !h) continue;
      if (a + h > bestScore) { best = g; bestScore = a + h; }
    }
    if (!best || bestScore < 3) {
      best = {
        id: "cbs" + row.date + row.awayCode + row.homeCode, date: row.date, start: null, status: null, time: row.time,
        away: { abbr: row.awayAbbr, name: row.awayAbbr, slug: slugs.away || null },
        home: { abbr: row.homeAbbr, name: row.homeAbbr, slug: slugs.home || null },
        props: 0, picks: [],
      };
      games.push(best);
    }
    best.picks.push(...picks);
    added += picks.length;
  }
  return added;
}

async function fetchWithTimeout(url, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ODDS_UA, Accept: accept },
      signal: ctrl.signal,
    });
    return res.ok ? res : null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchActionNetwork(cfg, date, through) {
  const base = AN_PICKS_URL + cfg.an + "?bookIds=15";
  let res = await fetchWithTimeout(base + "&date=" + date.replace(/-/g, ""), "application/json");
  if (!res) return null;
  let data = await res.json();
  let games = normalizeActionNetwork(data, date, through);
  if (cfg.weekly && !games.length) {
    const wk = anWeekFor(data.league, date);
    const current = data.league && data.league.current_week;
    if (wk && wk.week !== current) {
      res = await fetchWithTimeout(base + "&week=" + wk.week + "&seasonType=" + wk.seasonType, "application/json");
      if (res) games = normalizeActionNetwork(await res.json(), date, through);
    }
  }
  return games;
}

async function fetchCbs(cfg) {
  const atsUrl = CBS_PICKS_URL + cfg.cbs + "/picks/experts/";
  const atsRes = await fetchWithTimeout(atsUrl, "text/html");
  if (!atsRes) return null;
  const atsHtml = await atsRes.text();
  const tables = [{ market: "spread", parsed: parseCbsPicks(atsHtml) }];
  // The straight-up page only exists per week; the ATS page links this week's.
  const su = atsHtml.match(new RegExp("/" + cfg.cbs + "/picks/experts/straight-up/(\\d+)/"));
  if (su) {
    const suRes = await fetchWithTimeout(atsUrl + "straight-up/" + su[1] + "/", "text/html");
    if (suRes) tables.push({ market: "ml", parsed: parseCbsPicks(await suRes.text()) });
  }
  return tables;
}

function todayEt() {
  return ET_DATE.format(new Date());
}

export async function buildPicks(leagueKey, date, through = date) {
  const cfg = PICKS_LEAGUES[leagueKey];
  const sources = {};
  const [anGames, cbsTables] = await Promise.all([
    fetchActionNetwork(cfg, date, through).catch(() => null),
    cfg.cbs ? fetchCbs(cfg).catch(() => null) : Promise.resolve(undefined),
  ]);
  const games = anGames || [];
  sources.actionNetwork = { ok: anGames != null, picks: games.reduce((n, g) => n + g.picks.length, 0) };
  if (cbsTables !== undefined) {
    sources.cbs = { ok: cbsTables != null, picks: cbsTables ? mergeCbs(games, date, cbsTables, through) : 0 };
  }
  games.sort((a, b) => (a.start ? Date.parse(a.start) : Infinity) - (b.start ? Date.parse(b.start) : Infinity));
  for (const g of games) {
    delete g.away.slug;
    delete g.home.slug;
  }
  return { league: leagueKey, date, through, fetchedAt: new Date().toISOString(), sources, games };
}

async function handlePicks(request, url) {
  const league = (url.searchParams.get("league") || "").trim().toLowerCase();
  let date = (url.searchParams.get("date") || "").trim();
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  };
  if (!PICKS_LEAGUES[league]) {
    return new Response(JSON.stringify({ error: "unknown league", leagues: Object.keys(PICKS_LEAGUES) }),
      { status: 400, headers });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayEt();
  let through = (url.searchParams.get("through") || "").trim();
  const span = (Date.parse(through) - Date.parse(date)) / 86400000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through) || !(span >= 0 && span <= 7)) through = date;

  const cacheKey = new Request("https://cache.internal/api/picks?" + league + "&" + date + "&" + through, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let body;
  try {
    body = await buildPicks(league, date, through);
  } catch (e) {
    body = { league, date, fetchedAt: new Date().toISOString(), sources: {}, games: [] };
  }
  const anyOk = Object.values(body.sources).some(s => s.ok);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "public, max-age=" + (anyOk ? PICKS_CACHE_SECONDS : PICKS_FAIL_CACHE_SECONDS),
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

// ---------------------------------------------------------------------------
// Accounts — /api/auth/*
// Anyone can join: sign up with an email and a password, sign in again later
// with the same pair (sports/join/). Each account is one private R2 object
// (SPORTS_BETS, key users/<email>.json) holding a salted PBKDF2-SHA256 hash,
// never the password. Sign-up and sign-in set the `sports_session` cookie:
// `<base64url payload>.<HMAC-SHA256 signature>`, payload { email, exp }, signed
// with the SESSION_SECRET Pages secret (at least 32 characters). Without the
// secret or the bucket, every /api/auth call answers 503 "not-configured".
//
//   POST /api/auth/signup { email, password } -> 201 { email }  (409 email-taken)
//   POST /api/auth/login  { email, password } -> 200 { email }  (401 bad-credentials)
//   POST /api/auth/logout                     -> 200 { ok: true }
//   GET  /api/auth/me                         -> 200 { email }  (401 unauthenticated)
//
// POSTs need a JSON body from this very origin, same as /api/bets. Setup: DEPLOY.md,
// "Sports accounts — sign up / sign in".
// ---------------------------------------------------------------------------
const ACCOUNT_KEY_PREFIX = "users/";
const SESSION_COOKIE = "sports_session";
const SESSION_TTL_S = 30 * 24 * 60 * 60;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const EMAIL_MAX = 254;
const PBKDF2_ITERATIONS = 100000; // Workers' ceiling for PBKDF2
const SESSION_SECRET_MIN = 32;
const DUMMY_PASSWORD_RECORD = { alg: "PBKDF2-SHA256", iterations: PBKDF2_ITERATIONS, salt: "AAAAAAAAAAAAAAAAAAAAAA", hash: "AAAA" };

const textEncoder = new TextEncoder();

function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// -> lowercased address, or null if it isn't one we'd store
export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return { alg: "PBKDF2-SHA256", iterations, salt: b64urlFromBytes(salt), hash: b64urlFromBytes(new Uint8Array(bits)) };
}

export async function verifyPassword(password, record) {
  if (!record || record.alg !== "PBKDF2-SHA256" || typeof record.salt !== "string" || typeof record.hash !== "string") return false;
  if (!Number.isInteger(record.iterations) || record.iterations < 1) return false;
  let salt;
  try {
    salt = b64urlToBytes(record.salt);
  } catch (e) {
    return false;
  }
  const actual = (await hashPassword(password, salt, record.iterations)).hash;
  return constantTimeEqual(actual, record.hash);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sessionKey(env) {
  const secret = String(env.SESSION_SECRET || "");
  if (secret.length < SESSION_SECRET_MIN) return null;
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(email, env, nowMs = Date.now()) {
  const key = await sessionKey(env);
  if (!key) return null;
  const payload = b64urlFromBytes(textEncoder.encode(JSON.stringify({ email, exp: Math.floor(nowMs / 1000) + SESSION_TTL_S })));
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return payload + "." + b64urlFromBytes(new Uint8Array(sig));
}

// -> the signed-in email, or null (no cookie, bad signature, expired, no secret)
export async function readSession(token, env, nowMs = Date.now()) {
  const key = await sessionKey(env);
  if (!key || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  let sig, claims;
  try {
    sig = b64urlToBytes(parts[1]);
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  } catch (e) {
    return null;
  }
  if (!(await crypto.subtle.verify("HMAC", key, sig, textEncoder.encode(parts[0])))) return null;
  if (!claims || typeof claims.email !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp < Math.floor(nowMs / 1000)) return null;
  return claims.email;
}

function sessionTokenFrom(request) {
  const m = /(?:^|;\s*)sports_session=([^;]+)/.exec(request.headers.get("Cookie") || "");
  return m ? m[1] : null;
}

function sessionCookie(value, maxAge) {
  return SESSION_COOKIE + "=" + value + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax";
}

function authJson(data, status = 200, cookie = null) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}

export function accountKeyFor(email) {
  return ACCOUNT_KEY_PREFIX + encodeURIComponent(String(email).toLowerCase()) + ".json";
}

export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const action = url.pathname.slice("/api/auth/".length);
  const bucket = env.SPORTS_BETS;
  if (!bucket || !(await sessionKey(env))) return authJson({ error: "not-configured" }, 503);

  if (action === "me") {
    if (request.method !== "GET") return authJson({ error: "method-not-allowed" }, 405);
    const email = await readSession(sessionTokenFrom(request), env);
    return email ? authJson({ email }) : authJson({ error: "unauthenticated" }, 401);
  }

  if (request.method !== "POST") return authJson({ error: "method-not-allowed" }, 405);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return authJson({ error: "bad-origin" }, 403);

  if (action === "logout") {
    return authJson({ ok: true }, 200, sessionCookie("", 0));
  }
  if (action !== "signup" && action !== "login") return authJson({ error: "not-found" }, 404);
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) {
    return authJson({ error: "json-only" }, 415);
  }
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch (e) {
    return authJson({ error: "bad-json" }, 400);
  }
  const email = normalizeEmail(body && body.email);
  if (!email) return authJson({ error: "bad-email" }, 400);
  const password = body && typeof body.password === "string" ? body.password : "";
  if (password.length > PASSWORD_MAX) return authJson({ error: "bad-password" }, 400);
  const key = accountKeyFor(email);

  if (action === "signup") {
    if (password.length < PASSWORD_MIN) return authJson({ error: "bad-password" }, 400);
    const doc = { email, createdAt: new Date().toISOString(), password: await hashPassword(password) };
    const written = await bucket.put(key, JSON.stringify(doc), {
      onlyIf: { etagDoesNotMatch: "*" }, // create only: never overwrite an existing account
      httpMetadata: { contentType: "application/json" },
    });
    if (!written) return authJson({ error: "email-taken" }, 409);
    const token = await signSession(email, env);
    return authJson({ email }, 201, sessionCookie(token, SESSION_TTL_S));
  }

  // login: always run one PBKDF2 pass, so an unknown email takes as long as a wrong password
  const object = await bucket.get(key);
  let record = DUMMY_PASSWORD_RECORD;
  if (object) {
    try {
      const doc = JSON.parse(await object.text());
      if (doc && doc.password) record = doc.password;
    } catch (e) { /* unreadable account: treat as wrong credentials */ }
  }
  const ok = await verifyPassword(password, record);
  if (!object || !ok) return authJson({ error: "bad-credentials" }, 401);
  const token = await signSession(email, env);
  return authJson({ email }, 200, sessionCookie(token, SESSION_TTL_S));
}

// ---------------------------------------------------------------------------
// My Bets (paper bets) — /api/bets
// The Betting page's "My Bets" panel (sports/my-bets.js) keeps each account's
// bets in its own private R2 object (SPORTS_BETS, key bets/<email>.json), never
// in this repo: the repo is public. GET returns { version, bets }; PUT
// { version, bets } replaces the list, but only if `version` (the object's
// etag, or null for "no object yet") still matches, so two devices can't
// silently overwrite each other: a stale write gets 409 and the page reloads
// and re-applies its change.
//
// One ledger per account, failing closed at every step, same layering as
// RedZone's bet store (functions/redzone/api/[[path]].ts, _lib/access.ts —
// ported here because this project is a _worker.js, not Functions):
//   1. only answers on sports.jaredluyster.com (mcboop-sports.pages.dev is not
//      gated: 404 there);
//   2. requires a valid join-page session (/api/auth) or, until the sports
//      Access app is removed, a signed Access JWT with an email (service tokens
//      have none: 403);
//   3. reads and writes only that email's object, so the owner and each guest
//      the `Sports guest access` policy admits see only their own bets.
// Until the bucket is bound this answers 503 "not-configured". Setup: DEPLOY.md,
// "Sports My Bets — private store setup".
//
// Before 2026-10-26 there was one shared object, paper-bets.json, gated to the
// owner by the BETS_ALLOWED_EMAILS secret. It is kept, untouched, as a backup,
// and copied to its owner's key the first time they load with no ledger of
// their own: the owner is BETS_LEGACY_OWNER if set, else the one address in
// BETS_ALLOWED_EMAILS (with several, nothing is copied until BETS_LEGACY_OWNER
// names one).
//
// Local dev only: `wrangler pages dev sports` on localhost/127.0.0.1 with
// BETS_DEV_EMAIL set (sports/.dev.vars, gitignored) skips the JWT check. The
// production hostname is never localhost, so this can't open the real store.
// ---------------------------------------------------------------------------
const BETS_HOST = "sports.jaredluyster.com";
const BETS_LEGACY_KEY = "paper-bets.json";
const BETS_MAX_BYTES = 1024 * 1024;
const BETS_MAX_COUNT = 5000;
const BETS_MAX_LEGS = 12;
const ACCESS_TEAM_DOMAIN = "quiet-frost-ed57.cloudflareaccess.com"; // the Zero Trust org, see DEPLOY.md
const ACCESS_KEYS_TTL_MS = 10 * 60 * 1000;
// A token naming an unknown key makes us refetch the key set; without a floor,
// anyone able to send requests could turn that into a stream of fetches.
const ACCESS_REFETCH_FLOOR_MS = 60 * 1000;
const ACCESS_CLOCK_SKEW_S = 30;
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

let accessKeyCache = null; // { team, at, keys: Map<kid, CryptoKey> }

export function parseAllowlist(raw) {
  return new Set(String(raw || "").split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean));
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJwtPart(part) {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

async function loadAccessKeys(team, forceRefresh) {
  const now = Date.now();
  if (accessKeyCache && accessKeyCache.team === team) {
    const age = now - accessKeyCache.at;
    if (age < ACCESS_KEYS_TTL_MS && !forceRefresh) return accessKeyCache.keys;
    if (forceRefresh && age < ACCESS_REFETCH_FLOOR_MS) return accessKeyCache.keys;
  }
  const res = await fetch("https://" + team + "/cdn-cgi/access/certs");
  if (!res.ok) throw new Error("Access key fetch failed: HTTP " + res.status);
  const body = await res.json();
  const keys = new Map();
  for (const jwk of (body && body.keys) || []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  accessKeyCache = { team, at: now, keys };
  return keys;
}

function accessTokenFrom(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("Cookie") || "");
  return m ? m[1] : null;
}

// -> { status: "ok", email } | { status: "invalid" } | { status: "unavailable" }
export async function verifyAccessJwt(token, env, nowMs = Date.now()) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return { status: "invalid" };
  const [h, p, s] = parts;
  const header = parseJwtPart(h);
  const claims = parseJwtPart(p);
  // Pin the algorithm: never let the token choose "none" or an HMAC keyed by a public value.
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return { status: "invalid" };

  const team = String(env.ACCESS_TEAM_DOMAIN || ACCESS_TEAM_DOMAIN).toLowerCase();
  let signature;
  try {
    signature = b64urlToBytes(s);
  } catch (e) {
    return { status: "invalid" };
  }
  try {
    let keys = await loadAccessKeys(team, false);
    let key = keys.get(header.kid);
    if (!key) {
      keys = await loadAccessKeys(team, true); // key rotation: look again, at most once a minute
      key = keys.get(header.kid);
    }
    if (!key) return { status: "invalid" };
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(h + "." + p));
    if (!valid) return { status: "invalid" };
  } catch (e) {
    return { status: "unavailable" };
  }

  const nowS = Math.floor(nowMs / 1000);
  if (claims.iss !== "https://" + team) return { status: "invalid" };
  if (typeof claims.exp !== "number" || claims.exp + ACCESS_CLOCK_SKEW_S < nowS) return { status: "invalid" };
  if (typeof claims.nbf === "number" && claims.nbf - ACCESS_CLOCK_SKEW_S > nowS) return { status: "invalid" };
  if (env.ACCESS_AUD) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(env.ACCESS_AUD)) return { status: "invalid" };
  }
  return { status: "ok", email: typeof claims.email === "string" ? claims.email.toLowerCase() : null };
}

// 401 = no valid identity; 403 = a valid Access identity with no email (a
// service token); 503 = can't tell (Access keys unreachable). A join-page
// session (/api/auth) is checked first; Cloudflare Access is the fallback for as
// long as the sports Access app still gates the hostname.
export async function authenticateUser(request, env) {
  const session = await readSession(sessionTokenFrom(request), env);
  if (session) return { ok: true, email: session };
  const token = accessTokenFrom(request);
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };
  const v = await verifyAccessJwt(token, env);
  if (v.status === "unavailable") return { ok: false, status: 503, error: "auth-unavailable" };
  if (v.status !== "ok") return { ok: false, status: 401, error: "unauthenticated" };
  // Service tokens carry no email, so there is no ledger to give them.
  if (!v.email) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, email: v.email };
}

export function betsKeyFor(email) {
  return "bets/" + encodeURIComponent(String(email).toLowerCase()) + ".json";
}

// Who the pre-2026-10-26 shared ledger belongs to, or null if that's ambiguous.
export function legacyOwner(env) {
  const named = parseAllowlist(env.BETS_LEGACY_OWNER);
  if (named.size) return named.size === 1 ? [...named][0] : null;
  const allowed = parseAllowlist(env.BETS_ALLOWED_EMAILS);
  return allowed.size === 1 ? [...allowed][0] : null;
}

function betsJson(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...extra },
  });
}

// Shape check only: the page owns the schema (sports/my-bets.js). This keeps a
// bad client from storing something the page can't read back.
export function validBets(bets) {
  if (!Array.isArray(bets) || bets.length > BETS_MAX_COUNT) return false;
  const ids = new Set();
  for (const b of bets) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return false;
    if (typeof b.id !== "string" || !b.id || b.id.length > 64 || ids.has(b.id)) return false;
    ids.add(b.id);
    if (typeof b.stake !== "number" || !(b.stake > 0) || b.stake > 1e6) return false;
    if (!Array.isArray(b.legs) || !b.legs.length || b.legs.length > BETS_MAX_LEGS) return false;
    if (b.legs.some(l => !l || typeof l !== "object" || typeof l.gameId !== "string" || typeof l.kind !== "string")) return false;
  }
  return true;
}

export async function handleBets(request, env) {
  const url = new URL(request.url);
  const dev = DEV_HOSTS.has(url.hostname) && !!env.BETS_DEV_EMAIL;
  if (url.hostname !== BETS_HOST && !dev) return betsJson({ error: "not-found" }, 404);

  const bucket = env.SPORTS_BETS;
  if (!bucket) return betsJson({ error: "not-configured" }, 503);
  let email = String(env.BETS_DEV_EMAIL || "").toLowerCase();
  if (!dev) {
    const auth = await authenticateUser(request, env);
    if (!auth.ok) return betsJson({ error: auth.error }, auth.status);
    email = auth.email;
  }
  const key = betsKeyFor(email);

  if (request.method === "GET" || request.method === "HEAD") {
    let object = await bucket.get(key);
    if (!object && email === legacyOwner(env)) {
      // First load since ledgers went per account: bring the shared one along.
      const legacy = await bucket.get(BETS_LEGACY_KEY);
      if (legacy) {
        await bucket.put(key, await legacy.text(), { httpMetadata: { contentType: "application/json" } });
        object = await bucket.get(key);
      }
    }
    let bets = [];
    if (object) {
      try {
        const doc = JSON.parse(await object.text());
        if (doc && Array.isArray(doc.bets)) bets = doc.bets;
      } catch (e) { /* unreadable object: show it as empty, the next save replaces it */ }
    }
    return betsJson({ version: object ? object.etag : null, bets });
  }

  if (request.method !== "PUT") {
    return betsJson({ error: "method-not-allowed" }, 405, { Allow: "GET, HEAD, PUT" });
  }
  // Writes must come from the page itself: a JSON body (cross-site forms can't
  // send one without a CORS preflight, which this never answers) and, when the
  // browser says where it came from, this very origin.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return betsJson({ error: "bad-origin" }, 403);
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) {
    return betsJson({ error: "json-only" }, 415);
  }
  const text = await request.text();
  if (text.length > BETS_MAX_BYTES) return betsJson({ error: "too-large" }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return betsJson({ error: "bad-json" }, 400);
  }
  if (!body || !validBets(body.bets)) return betsJson({ error: "bad-bets" }, 400);
  const version = typeof body.version === "string" ? body.version : null;

  const doc = JSON.stringify({ updatedAt: new Date().toISOString(), bets: body.bets });
  const options = { httpMetadata: { contentType: "application/json" } };
  if (version) {
    options.onlyIf = { etagMatches: version };
  } else if (await bucket.head(key)) {
    return betsJson({ error: "conflict" }, 409); // someone created it since this page loaded
  }
  const written = await bucket.put(key, doc, options);
  if (!written) return betsJson({ error: "conflict" }, 409); // etag moved on: a newer save exists
  return betsJson({ version: written.etag });
}

function corsOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/odds") {
      if (request.method === "OPTIONS") return corsOptions();
      return handleOdds(request, url);
    }

    if (url.pathname === "/api/picks") {
      if (request.method === "OPTIONS") return corsOptions();
      try {
        return await handlePicks(request, url);
      } catch (e) {
        return new Response(JSON.stringify({ games: [], sources: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    }

    if (url.pathname.startsWith("/api/auth/")) {
      try {
        return await handleAuth(request, env);
      } catch (e) {
        return authJson({ error: "server-error" }, 500);
      }
    }

    if (url.pathname === "/api/bets") {
      try {
        return await handleBets(request, env);
      } catch (e) {
        return betsJson({ error: "server-error" }, 500);
      }
    }

    // Everything else is the static site, served exactly as Pages would.
    return env.ASSETS.fetch(request);
  },
};
