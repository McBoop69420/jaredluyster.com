// ---------------------------------------------------------------------------
// Live news feed (National/World/Business/Technology/Science & Health).
// Fetched and parsed server-side (Workers have no CORS restriction on
// outbound fetch, unlike the browser), edge-cached briefly, and polled by
// app.js every few minutes. See references/live-news-feed.md in the
// mcboop-morning-newspaper skill for the full contract.
// ---------------------------------------------------------------------------

// `bias` is a rough, editorially-labeled political lean shown next to each
// source in the UI (Ground-News-style) — not a scientific rating. One of:
// "left", "lean-left", "center", "lean-right", "right". Non-political
// sections (Technology, Science & Health) are all tagged "center" since the
// label doesn't really apply, but every item still carries one for a
// consistent UI.
const FEED_SOURCES = {
  local: [
    { name: "LEX 18", url: "https://www.lex18.com/news.rss", bias: "center" },
    { name: "ABC 36 (WTVQ)", url: "https://www.wtvq.com/category/local-news/feed", bias: "center" },
    { name: "WKYT", url: "https://www.wkyt.com/arc/outboundfeeds/rss/", bias: "center" },
    // kentucky.com (Lexington Herald-Leader) has no public RSS feed — the site
    // blocks automated fetches outright. This Google News search feed, scoped
    // to kentucky.com via allinurl, is the closest working substitute.
    { name: "Herald-Leader (via Google News)", url: "https://news.google.com/rss/search?q=when:24h+allinurl:kentucky.com&hl=en-US&gl=US&ceid=US:en", bias: "center" },
  ],
  national: [
    { name: "NPR", url: "https://feeds.npr.org/1001/rss.xml", bias: "lean-left" },
    { name: "CBS News", url: "https://www.cbsnews.com/latest/rss/main", bias: "center" },
    { name: "The Hill", url: "https://thehill.com/homenews/feed/", bias: "center" },
    { name: "Mother Jones", url: "https://www.motherjones.com/feed/", bias: "left" },
    { name: "Fox News", url: "https://feeds.foxnews.com/foxnews/national", bias: "right" },
  ],
  world: [
    { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", bias: "center" },
    { name: "CBS News", url: "https://www.cbsnews.com/latest/rss/world", bias: "center" },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", bias: "center" },
    { name: "The Guardian", url: "https://www.theguardian.com/world/rss", bias: "left" },
    { name: "Fox News", url: "https://feeds.foxnews.com/foxnews/world", bias: "right" },
  ],
  business: [
    { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", bias: "center" },
    { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", bias: "center" },
    { name: "The Guardian", url: "https://www.theguardian.com/us/business/rss", bias: "left" },
    { name: "WSJ Markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", bias: "lean-right" },
    { name: "Forbes", url: "https://www.forbes.com/business/feed/", bias: "lean-right" },
  ],
  tech: [
    { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", bias: "center" },
    { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", bias: "center" },
    { name: "TechCrunch", url: "https://techcrunch.com/feed/", bias: "center" },
    { name: "Wired", url: "https://www.wired.com/feed/rss", bias: "center" },
  ],
  science: [
    { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/top.xml", bias: "center" },
    { name: "STAT News", url: "https://www.statnews.com/feed/", bias: "center" },
    { name: "Live Science", url: "https://www.livescience.com/feeds/all", bias: "center" },
  ],
};

const FEED_CACHE_SECONDS = 240; // 4 min edge cache — "live" without hammering upstream
const FEED_ITEMS_PER_SECTION = 20;
const FEED_PER_SOURCE_MIN = 3; // guaranteed slots per source before recency fills the rest
const FEED_FETCH_TIMEOUT_MS = 8000;
const FEED_UA = "McBoopNews/1.0 (jaredluyster.com)";

async function handleFeeds(request) {
  const cache = caches.default;
  const cacheKey = new Request("https://cache.internal/api/feeds", { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const sections = {};
  await Promise.all(
    Object.entries(FEED_SOURCES).map(async ([slug, sources]) => {
      const results = await Promise.all(sources.map((s) => fetchAndParseFeed(s.url, s.name, s.bias)));

      // A flat recency sort lets high-cadence sources (post every few
      // minutes) crowd out slower ones (a few times a day) entirely — the
      // whole point of the bias spread is to actually see every configured
      // outlet, so guarantee each source its own top N items first, then
      // fill any remaining slots by recency from the leftover pool.
      const guaranteed = [];
      const leftoverPool = [];
      for (const list of results) {
        const bySource = list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
        guaranteed.push(...bySource.slice(0, FEED_PER_SOURCE_MIN));
        leftoverPool.push(...bySource.slice(FEED_PER_SOURCE_MIN));
      }
      const remainingSlots = Math.max(0, FEED_ITEMS_PER_SECTION - guaranteed.length);
      const fill = leftoverPool
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, remainingSlots);

      const merged = guaranteed.concat(fill)
        .filter((it) => it.title && it.link)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .map(({ ts, ...rest }) => rest); // drop internal sort key from the response
      sections[slug] = merged;
    })
  );

  const body = JSON.stringify({ sections, fetchedAt: new Date().toISOString() });
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=" + FEED_CACHE_SECONDS,
      "Access-Control-Allow-Origin": "*",
    },
  });

  await cache.put(cacheKey, response.clone());
  return response;
}

async function fetchAndParseFeed(url, sourceName, bias) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FEED_UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: ctrl.signal,
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeedItems(xml, sourceName, bias);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Minimal RSS 2.0 / Atom item parser — no DOMParser in the Workers runtime,
// and these feeds are consistent enough that a regex extraction is reliable.
function parseFeedItems(xml, fallbackSource, bias) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const items = [];
  for (const raw of blocks) {
    let title = cleanText(extractTag(raw, "title"));
    let link = decodeEntities(extractTag(raw, "link").trim());
    if (!link) {
      const m = raw.match(/<link\b[^>]*\bhref="([^"]+)"/i);
      link = m ? decodeEntities(m[1]) : "";
    }
    const pubDateRaw =
      extractTag(raw, "pubDate") || extractTag(raw, "published") ||
      extractTag(raw, "updated") || extractTag(raw, "dc:date");
    const source = cleanText(extractTag(raw, "source")) || fallbackSource;
    // Google News appends " - Publisher" to every title; drop it since the
    // publisher already shows on its own line in the item's meta.
    if (source) {
      const suffix = new RegExp("\\s+-\\s+" + source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
      title = title.replace(suffix, "");
    }
    if (!title || !link) continue;
    const ts = pubDateRaw ? Date.parse(pubDateRaw) : NaN;
    items.push({
      title,
      link: link.trim(),
      source,
      bias: bias || "center",
      pubDate: !isNaN(ts) ? new Date(ts).toISOString() : "",
      ts: isNaN(ts) ? 0 : ts,
    });
  }
  return items;
}

function extractTag(xml, name) {
  const re = new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

// Numeric character references first (feeds are full of curly quotes/dashes
// as &#8217;/&#x2019; etc.) — decode these before the named-entity pass, and
// decode &amp; last since earlier replacements can introduce literal "&".
function decodeEntities(s) {
  if (!s) return "";
  let t = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  t = t.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  return t
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanText(s) {
  if (!s) return "";
  let t = s.trim();
  const cdata = t.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) t = cdata[1];
  t = t.replace(/<[^>]+>/g, "");
  t = decodeEntities(t);
  return t.trim();
}

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

// Serves a hostname-routed subdomain (sports/calendar) whose site lives in its
// own top-level directory, mirroring the news shell's own deploy. Non-index
// paths are passed straight through (with the directory prefix applied);
// the index document gets a no-cache header so shell edits show up immediately.
async function serveSubsite(request, env, url, dir) {
  const p = url.pathname;
  const isIndex = p === "/" || p === "/" + dir || p === "/" + dir + "/";
  const asset = isIndex
    ? "/" + dir + "/"
    : (p.startsWith("/" + dir + "/") ? p : "/" + dir + p);
  const response = await env.ASSETS.fetch(
    new Request(url.origin + asset + url.search, request),
  );
  if (!isIndex) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Calendar data is no-cache so newly added commitments show immediately,
    // regardless of which hostname/subsite is asking for it — the file itself
    // lives at the deploy root, not under calendar/. edition.json is kept for
    // backward compatibility with old open tabs but is no longer produced.
    if (url.pathname === "/edition.json" || url.pathname === "/calendar.json") {
      const res = await env.ASSETS.fetch(
        new Request(url.origin + url.pathname + url.search, request),
      );
      const headers = new Headers(res.headers);
      // Always revalidate so the latest calendar is served immediately.
      headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, {
        status: res.status, statusText: res.statusText, headers,
      });
    }

    if (url.hostname === "sports.jaredluyster.com") {
      return serveSubsite(request, env, url, "sports");
    }

    if (url.hostname === "calendar.jaredluyster.com") {
      return serveSubsite(request, env, url, "calendar");
    }

    // Live in-browser RSS feed for the news sections (National/World/Business/
    // Technology/Science & Health) — see the top of this file.
    if (url.pathname === "/api/feeds") {
      if (request.method === "OPTIONS") return corsOptions();
      return handleFeeds(request);
    }

    // Live MLB moneylines (BetExplorer proxy) for the Sports tab.
    if (url.pathname === "/api/odds") {
      if (request.method === "OPTIONS") return corsOptions();
      return handleOdds(request, url);
    }

    // news.jaredluyster.com — the living newspaper shell.
    // The shell (index.html/app.js/app.css) is deployed once and refreshed only
    // when it changes; there is no per-day edition anymore — every section is
    // live from its own source.
    return env.ASSETS.fetch(request);
  }
};