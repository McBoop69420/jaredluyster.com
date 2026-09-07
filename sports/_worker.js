// ---------------------------------------------------------------------------
// McBoop Sports — Pages Worker (advanced mode)
//
// sports.jaredluyster.com is otherwise a plain static Pages project; this file
// exists for exactly one reason: the value screen needs BetExplorer moneylines,
// and the browser cannot fetch betexplorer.com (no CORS header). Everything
// that isn't /api/odds falls straight through to the static assets, so a change
// here can only affect that one route.
//
// Be careful editing this: in advanced mode a worker that throws takes down the
// WHOLE site, not just /api/odds — hence the blanket try/catch inside
// handleOdds and the unconditional ASSETS fallthrough at the bottom.
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

    // Everything else is the static site, served exactly as Pages would.
    return env.ASSETS.fetch(request);
  },
};
