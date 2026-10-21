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

function corsOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

// Serves a hostname-routed subsite (calendar) whose site lives in its own
// top-level directory within this same Pages deploy, mirroring the news
// shell's own deploy. Non-index paths are passed straight through (with the
// directory prefix applied); the index document gets a no-cache header so
// shell edits show up immediately.
//
// sports.jaredluyster.com is NOT one of these despite looking like it should
// be — it's served by a separate, Git-integrated Pages project (mcboop-sports,
// root directory sports/) that redeploys on every push to main, entirely
// independent of this worker and of deploy-pages.sh. It now carries its own
// _worker.js with the /api/odds BetExplorer proxy that used to live in this
// file. See INFRASTRUCTURE.md sections 4 and 4b.
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

// Private data that deploy-pages.sh layers into this deploy (calendar.json, the
// frozen archive/ gallery) must only be served on hostnames that sit behind a
// Cloudflare Access app. mcboop-daily.pages.dev, and the unique
// <id>.mcboop-daily.pages.dev URL every deploy gets, serve these same files with
// NO login, so they answer 404 for those paths. Everything else (the app shell,
// /api/feeds, the calendar shell) stays reachable there because deploy-pages.sh's
// post-deploy verification probes it unauthenticated. localhost is allowed so
// `wrangler pages dev` keeps working.
const GATED_HOSTS = new Set([
  "news.jaredluyster.com",
  "calendar.jaredluyster.com",
  "localhost",
  "127.0.0.1",
]);

function isPrivatePath(pathname) {
  // The asset server percent-decodes and is case-insensitive enough that
  // /%63alendar.json or /Calendar.json could otherwise slip past a raw compare.
  let p;
  try { p = decodeURIComponent(pathname).toLowerCase(); } catch (e) { return true; }
  return p.startsWith("/calendar.json") || p === "/archive" || p.startsWith("/archive/");
}

// ---------------------------------------------------------------------------
// Calendar ticks, shared across devices: /api/ticks on calendar.jaredluyster.com.
// Which todos are ticked off and which movies are dismissed used to live only in
// each browser's localStorage, so a tick on the phone never reached the wall
// display. They now live in one file, ticks.json, in the CALENDAR_TICKS R2 bucket
// (jaredluyster-calendar):
//   { "done": { "<todo key>": tickedAtMs }, "dismissed": { "<movie key>": atMs } }
// The page sends its changes as a list of ops; each is applied to whatever is stored
// (not a whole-file replace), so two devices ticking different things never undo
// each other. Every answer is the whole merged state.
//   GET  /api/ticks                         -> the state
//   POST /api/ticks  { "ops": [ { "op", "key", "at" } ] }
//        op: "tick" | "untick" (todos), "dismiss" | "undismiss" (movies)
//
// Gated twice, like the RedZone bet store: Access covers all of
// calendar.jaredluyster.com, and this checks the signed Access JWT itself against
// the CALENDAR_OWNER_EMAILS secret. Any other host (the ungated *.pages.dev copies)
// gets a 404; until the secret and the bucket binding exist it answers 503.
// localhost only works with a CALENDAR_DEV_EMAIL binding (`wrangler pages dev`).
const TICKS_HOST = "calendar.jaredluyster.com";
const TICKS_DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
const TICKS_FILE = "ticks.json";
const TICKS_OPS = new Set(["tick", "untick", "dismiss", "undismiss"]);
const TICKS_MAX_BODY = 256 * 1024;
const TICKS_MAX_OPS = 500;
const TICKS_MAX_KEY = 400;
const TICKS_MAX_ENTRIES = 5000;   // per map; the oldest go first, far beyond normal use

async function handleTicks(request, env, url) {
  const host = url.hostname.toLowerCase();
  const isDev = TICKS_DEV_HOSTS.has(host);
  if (host !== TICKS_HOST && !isDev) return ticksJson({ error: "not-found" }, 404);
  if (isDev) {
    if (!env.CALENDAR_DEV_EMAIL) return ticksJson({ error: "not-found" }, 404);
  } else {
    const auth = await accessAuthenticate(request, env, env.CALENDAR_OWNER_EMAILS);
    if (!auth.ok) return ticksJson({ error: auth.error }, auth.status);
  }
  const bucket = env.CALENDAR_TICKS;
  if (!bucket) return ticksJson({ error: "not-configured" }, 503);

  if (request.method === "GET") return ticksJson((await readTicks(bucket)).state);
  if (request.method !== "POST") return ticksJson({ error: "method-not-allowed" }, 405, { Allow: "GET, POST" });

  const text = await request.text();
  if (text.length > TICKS_MAX_BODY) return ticksJson({ error: "too-large" }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return ticksJson({ error: "bad-json" }, 400); }
  if (!body || !Array.isArray(body.ops) || body.ops.length > TICKS_MAX_OPS) return ticksJson({ error: "bad-ops" }, 400);
  const ops = body.ops.filter(validTickOp);
  if (!ops.length) return ticksJson((await readTicks(bucket)).state);

  // Read, apply, write only if nobody else wrote in between; otherwise go again
  // on top of what they wrote.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, etag } = await readTicks(bucket);
    applyTickOps(state, ops, Date.now());
    const opts = { httpMetadata: { contentType: "application/json" } };
    if (etag) opts.onlyIf = { etagMatches: etag };
    const written = await bucket.put(TICKS_FILE, JSON.stringify(state), opts);
    if (written) return ticksJson(state);
  }
  return ticksJson({ error: "conflict" }, 409);
}

async function readTicks(bucket) {
  const obj = await bucket.get(TICKS_FILE);
  if (!obj) return { state: { done: {}, dismissed: {} }, etag: null };
  let raw = null;
  try { raw = JSON.parse(await obj.text()); } catch (e) { /* a damaged file starts over */ }
  return {
    state: { done: cleanTickMap(raw && raw.done), dismissed: cleanTickMap(raw && raw.dismissed) },
    etag: obj.etag,
  };
}

function cleanTickMap(m) {
  const out = {};
  if (!m || typeof m !== "object" || Array.isArray(m)) return out;
  for (const [k, v] of Object.entries(m)) {
    if (k && k.length <= TICKS_MAX_KEY && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function validTickOp(o) {
  return !!o && TICKS_OPS.has(o.op) && typeof o.key === "string" && o.key.length > 0 &&
    o.key.length <= TICKS_MAX_KEY && (o.at === undefined || (typeof o.at === "number" && Number.isFinite(o.at)));
}

// Ops apply in order. Ticking something already ticked keeps the first time.
function applyTickOps(state, ops, now) {
  for (const o of ops) {
    const map = o.op === "tick" || o.op === "untick" ? state.done : state.dismissed;
    if (o.op === "untick" || o.op === "undismiss") delete map[o.key];
    else if (!(o.key in map)) map[o.key] = Math.min(o.at || now, now);
  }
  for (const map of [state.done, state.dismissed]) {
    const keys = Object.keys(map);
    if (keys.length <= TICKS_MAX_ENTRIES) continue;
    keys.sort((a, b) => map[a] - map[b]).slice(0, keys.length - TICKS_MAX_ENTRIES).forEach(k => delete map[k]);
  }
}

function ticksJson(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...extra },
  });
}

// ---- Cloudflare Access JWT check ------------------------------------------
// A plain-JS copy of functions/redzone/_lib/access.ts in this repo (that file
// belongs to the jaredluyster-com project, and deploy-pages.sh ships only news/
// and calendar/ here). Keep the two in step. Verifies the signed token Access
// attaches to every request it let through (header Cf-Access-Jwt-Assertion, or
// the CF_Authorization cookie), then that its email is on the allowlist.
// 401 = no valid identity; 403 = valid but not allowed; 503 = can't tell (keys
// unreachable, or no allowlist configured). Always fails closed.
const ACCESS_TEAM_DOMAIN = "quiet-frost-ed57.cloudflareaccess.com";
const ACCESS_KEYS_TTL_MS = 10 * 60 * 1000;
const ACCESS_REFETCH_FLOOR_MS = 60 * 1000;   // an unknown kid can't turn into a stream of fetches
const ACCESS_CLOCK_SKEW_S = 30;
let accessKeyCache = null;   // { team, at, keys: Map<kid, CryptoKey> }

async function accessAuthenticate(request, env, allowlist) {
  const allowed = new Set(String(allowlist || "").split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean));
  if (!allowed.size) return { ok: false, status: 503, error: "not-configured" };
  const token = accessTokenFrom(request);
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };
  const v = await accessVerify(token, env);
  if (v.status === "unavailable") return { ok: false, status: 503, error: "auth-unavailable" };
  if (v.status !== "ok") return { ok: false, status: 401, error: "unauthenticated" };
  // Service tokens carry no email; they were never granted this data.
  if (!v.email || !allowed.has(v.email)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, email: v.email };
}

function accessTokenFrom(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get("Cookie") || "");
  return m ? m[1] : null;
}

function accessB64(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function accessJsonPart(part) {
  try {
    const v = JSON.parse(new TextDecoder().decode(accessB64(part)));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

async function accessKeys(team, forceRefresh) {
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
    keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  accessKeyCache = { team, at: now, keys };
  return keys;
}

async function accessVerify(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return { status: "invalid" };
  const [h, p, s] = parts;
  const header = accessJsonPart(h);
  const claims = accessJsonPart(p);
  // Pin the algorithm: never let the token choose "none" or an HMAC keyed by a public value.
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return { status: "invalid" };
  const team = String(env.ACCESS_TEAM_DOMAIN || ACCESS_TEAM_DOMAIN).toLowerCase();
  let signature;
  try { signature = accessB64(s); } catch (e) { return { status: "invalid" }; }
  try {
    let keys = await accessKeys(team, false);
    let key = keys.get(header.kid);
    if (!key) {
      keys = await accessKeys(team, true);   // key rotation: look again, at most once a minute
      key = keys.get(header.kid);
    }
    if (!key) return { status: "invalid" };
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(h + "." + p));
    if (!valid) return { status: "invalid" };
  } catch (e) {
    return { status: "unavailable" };
  }
  const nowS = Math.floor(Date.now() / 1000);
  if (claims.iss !== "https://" + team) return { status: "invalid" };
  if (typeof claims.exp !== "number" || claims.exp + ACCESS_CLOCK_SKEW_S < nowS) return { status: "invalid" };
  if (typeof claims.nbf === "number" && claims.nbf - ACCESS_CLOCK_SKEW_S > nowS) return { status: "invalid" };
  if (env.CALENDAR_ACCESS_AUD) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(env.CALENDAR_ACCESS_AUD)) return { status: "invalid" };
  }
  return { status: "ok", email: typeof claims.email === "string" ? claims.email.toLowerCase() : null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isPrivatePath(url.pathname) && !GATED_HOSTS.has(url.hostname)) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/api/ticks") return handleTicks(request, env, url);

    // Calendar data is no-cache so newly added commitments show immediately,
    // regardless of which (gated) hostname/subsite is asking for it — the file
    // itself lives at the deploy root, not under calendar/.
    if (url.pathname === "/calendar.json") {
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

    if (url.hostname === "calendar.jaredluyster.com") {
      return serveSubsite(request, env, url, "calendar");
    }

    // Live in-browser RSS feed for the news sections (National/World/Business/
    // Technology/Science & Health) — see the top of this file.
    if (url.pathname === "/api/feeds") {
      if (request.method === "OPTIONS") return corsOptions();
      return handleFeeds(request);
    }

    // news.jaredluyster.com — the living newspaper shell.
    // The shell (index.html/app.js/app.css) is deployed once and refreshed only
    // when it changes; there is no edition anymore — every tab is live from its
    // own source (NWS + LFUCG in-browser, RSS via /api/feeds above).
    return env.ASSETS.fetch(request);
  }
};