/* Sports — Daily Brief
 * Recaps one finished ET day (default: yesterday) from ESPN's public
 * scoreboard JSON, fetched straight from the browser like the Games page.
 * Finished games carry a short recap blurb in competitions[0].headlines,
 * so no backend or generated text is involved.
 * ?date=YYYY-MM-DD picks another day.
 */
(function () {
  "use strict";

  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";

  // Order is the order sections appear when a league has the same amount of
  // news as another. `mine` marks the teams I follow (same list as Games).
  const LEAGUES = [
    { key: "baseball/mlb", label: "MLB", mine: ["Cincinnati Reds"] },
    { key: "football/nfl", label: "NFL", mine: ["Cincinnati Bengals"] },
    { key: "football/college-football", label: "NCAAF", mine: ["Kentucky Wildcats", "Louisville Cardinals"], q: "groups=80&limit=500", college: true },
    { key: "basketball/nba", label: "NBA", mine: ["San Antonio Spurs"] },
    { key: "basketball/mens-college-basketball", label: "NCAAM", mine: ["Kentucky Wildcats", "Louisville Cardinals"], q: "groups=50&limit=500", college: true },
    { key: "basketball/womens-college-basketball", label: "NCAAW", mine: ["Kentucky Wildcats", "Louisville Cardinals"], q: "groups=50&limit=500", college: true },
    { key: "hockey/nhl", label: "NHL", mine: [] },
    { key: "basketball/wnba", label: "WNBA", mine: [] },
    { key: "soccer/eng.1", label: "Premier League", mine: ["Liverpool", "Arsenal"] },
    { key: "soccer/usa.1", label: "MLS", mine: ["FC Cincinnati"] },
    { key: "soccer/usa.nwsl", label: "NWSL", mine: ["Racing Louisville FC"] },
    { key: "soccer/usa.usl.1", label: "USL Championship", mine: ["Lexington SC"] },
    { key: "soccer/usa.w.usl.1", label: "USL Super League", mine: ["Lexington SC"] },
    { key: "soccer/esp.1", label: "La Liga", mine: ["Athletic Club"] },
    { key: "soccer/mex.1", label: "Liga MX", mine: [] },
    { key: "soccer/ger.1", label: "Bundesliga", mine: [] },
    { key: "soccer/ita.1", label: "Serie A", mine: [] },
    { key: "soccer/fra.1", label: "Ligue 1", mine: [] },
    { key: "soccer/uefa.champions", label: "UCL", mine: [] },
    { key: "soccer/uefa.europa", label: "UEL", mine: [] },
    { key: "soccer/ned.1", label: "Eredivisie", mine: [] },
    // National teams play across many ESPN competitions; fetch each, label by competition.
    ...[
      ["soccer/fifa.world", "World Cup"], ["soccer/fifa.wwc", "Women's World Cup"],
      ["soccer/fifa.worldq.concacaf", "WC Qualifying · Concacaf"], ["soccer/fifa.worldq.uefa", "WC Qualifying · UEFA"],
      ["soccer/fifa.worldq.conmebol", "WC Qualifying · CONMEBOL"], ["soccer/concacaf.nations.league", "Concacaf Nations League"],
      ["soccer/uefa.nations", "UEFA Nations League"], ["soccer/uefa.euroq", "Euro Qualifying"],
      ["soccer/fifa.friendly", "Int'l Friendly"], ["soccer/fifa.friendly.w", "Women's Int'l Friendly"],
    ].map(([key, label]) => ({ key, label, mine: ["United States"], intl: true })),
  ];

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const etDate = d => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
  const addDays = (iso, n) => {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const today = etDate(new Date());
  const yesterday = addDays(today, -1);

  function pickDate() {
    const m = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    // Never show today or the future: the brief is for games that are over.
    return m && m[1] <= yesterday ? m[1] : yesterday;
  }

  function isMine(league, name) {
    return league.mine.some(t => name.toLowerCase().indexOf(t.toLowerCase()) >= 0);
  }

  // How worth-reading a game is, for picking the top 10. Pro leagues get a
  // small edge over the 100+ college games that finish on a busy night.
  function interest(a, h, stakes, ranked, detail, hasRecap) {
    const sa = parseFloat(a.score), sh = parseFloat(h.score);
    const margin = Number.isFinite(sa) && Number.isFinite(sh) ? Math.abs(sa - sh) : 99;
    const both = a.rank != null && h.rank != null;
    const upset = (a.rank != null && !a.winner && h.winner && h.rank == null) ||
                  (h.rank != null && !h.winner && a.winner && a.rank == null);
    return (stakes ? 30 : 0) + (both ? 25 : ranked ? 12 : 0) + (upset ? 25 : 0) +
      (/OT|SO|Pens|extra/i.test(detail) ? 15 : 0) + (margin <= 3 ? 10 : margin <= 6 ? 5 : 0) +
      (hasRecap ? 8 : 0);
  }

  function parse(ev, league, mode) {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const cs = comp.competitors || [];
    if (cs.length < 2) return null;
    const status = ev.status || comp.status || {};
    const type = status.type || {};
    if (type.name === "STATUS_POSTPONED" || type.name === "STATUS_CANCELED") return null;
    const preview = mode === "pre";
    // Recap: finished games only. Preview: games not yet started, or live right now.
    if (preview ? type.state === "post" : type.state !== "post") return null;
    const away = cs.find(c => c.homeAway === "away") || cs[0];
    const home = cs.find(c => c.homeAway === "home") || cs[1];
    const side = c => {
      const r = c.curatedRank && c.curatedRank.current;
      return {
        name: c.team.displayName,
        logo: c.team.logo || (c.team.logos && c.team.logos[0] && c.team.logos[0].href) || "",
        score: c.score,
        rec: (c.records && c.records[0] && c.records[0].summary) || "",
        winner: !!c.winner,
        rank: typeof r === "number" && r <= 25 ? r : null,
      };
    };
    const a = side(away), h = side(home);
    const note = (comp.notes && comp.notes[0] && comp.notes[0].headline) || "";
    const hl = (comp.headlines || []).find(x => x.type === "Recap") || (comp.headlines || [])[0] || null;
    const link = (ev.links || []).find(l => (l.rel || []).indexOf("summary") >= 0 || (l.rel || []).indexOf("desktop") >= 0);
    const mine = isMine(league, a.name) || isMine(league, h.name);
    const stakes = (ev.season && ev.season.type === 3) || /champion|final|playoff|bowl|cup/i.test(note) && !/group play/i.test(note);
    const ranked = a.rank != null || h.rank != null;
    const detail = type.detail && !/^final$/i.test(type.detail) ? type.detail : ""; // "Final/OT", "FT-Pens"
    if (preview) {
      const odds = comp.odds && comp.odds[0];
      const nets = (comp.broadcasts || []).find(b => b.market === "national") || (comp.broadcasts || [])[0];
      const line = [odds && odds.details, odds && odds.overUnder ? "O/U " + odds.overUnder : ""].filter(Boolean).join(" · ");
      const closeLine = odds && typeof odds.spread === "number" && Math.abs(odds.spread) <= 3;
      const live = type.state === "in";
      const when = live ? (type.shortDetail || type.detail || "Live") :
        new Date(ev.date).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
      const both = a.rank != null && h.rank != null;
      return {
        id: league.key + ":" + ev.id, league, away: a, home: h, note, detail: "", preview: true, live,
        when, startMs: new Date(ev.date).getTime(), line, tv: nets && nets.names ? nets.names.join("/") : "",
        url: link && link.href, mine, stakes: !!stakes, ranked,
        weight: (mine ? 100 : 0) + (stakes ? 30 : 0) + (both ? 25 : ranked ? 12 : 0) + (closeLine ? 8 : 0) + (live ? 5 : 0),
      };
    }
    return {
      id: league.key + ":" + ev.id, league, away: a, home: h, note, detail,
      recap: hl && (hl.shortLinkText || hl.description) ? { title: hl.shortLinkText || "", body: hl.description || "" } : null,
      url: link && link.href,
      mine, stakes: !!stakes, ranked,
      weight: (mine ? 100 : 0) + interest(a, h, stakes, ranked, detail, !!hl),
    };
  }

  async function fetchLeague(league, iso, mode) {
    const url = ESPN + league.key + "/scoreboard?" + (league.q || "limit=300") + "&dates=" + iso.replace(/-/g, "");
    try {
      const res = await fetch(url);
      if (!res.ok) return { league, games: [], failed: true };
      const json = await res.json();
      const games = (json.events || []).map(ev => parse(ev, league, mode)).filter(Boolean);
      return { league, games };
    } catch (e) {
      return { league, games: [], failed: true };
    }
  }

  function teamLine(t, pre) {
    return '<div class="brief-line' + (t.winner ? " win" : "") + '">' +
      '<span class="t">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : "") +
      (t.rank ? '<span class="rk">' + t.rank + "</span>" : "") + esc(t.name) +
      (pre && t.rec ? ' <span class="rk">' + esc(t.rec) + "</span>" : "") + "</span>" +
      '<span class="s">' + (pre ? "" : esc(t.score)) + "</span></div>";
  }

  function gameCard(g) {
    const meta = [g.league.intl ? g.league.label : "", g.note, g.detail].filter(Boolean).join(" · ");
    let html = '<div class="brief-game' + (g.mine ? " mine" : "") + '">' + teamLine(g.away, g.preview && !g.live) + teamLine(g.home, g.preview && !g.live);
    if (g.preview) {
      const pm = [g.when, g.tv, g.line, g.league.intl ? g.league.label : "", g.note].filter(Boolean).join(" · ");
      return html + '<div class="brief-meta">' + (g.live ? "<b>Live</b> · " : "") + esc(pm) + "</div></div>";
    }
    if (meta) html += '<div class="brief-meta">' + esc(meta) + "</div>";
    if (g.recap) {
      html += '<p class="brief-recap">' + (g.recap.title ? "<b>" + esc(g.recap.title) + ".</b> " : "") +
        (g.recap.body ? esc(g.recap.body.replace(/^[—–-]\s*/, "")) : "") +
        (g.url ? ' <a href="' + esc(g.url) + '" target="_blank" rel="noopener">Full recap</a>' : "") + "</p>";
    }
    return html + "</div>";
  }

  const TOP_N = 10;

  const label = g => Object.assign({}, g, { note: [g.league.label, g.note].filter(Boolean).join(" · ") });
  // Pro leagues get a small edge so a 150-game college night can't crowd them out.
  const boost = g => Object.assign(g, { weight: g.weight + (g.league.college ? 0 : 15) });
  const count = n => n + (n === 1 ? " game" : " games");
  const flat = results => results.reduce((acc, r) => acc.concat(r.games), []);

  // One half of the page: My Teams, then the top 10 of everything else.
  function half(all, o) {
    const byTime = (a, b) => a.startMs - b.startMs;
    let mine = all.filter(g => g.mine).sort((a, b) => b.weight - a.weight);
    let others = all.filter(g => !g.mine).map(boost).sort((a, b) => b.weight - a.weight).slice(0, TOP_N);
    if (o.preview) { mine = mine.sort(byTime); others = others.sort(byTime); }
    let html = "";
    if (mine.length) {
      html += '<h3 class="sec"><span>My Teams</span><small>' + count(mine.length) + "</small></h3>" + mine.map(g => gameCard(label(g))).join("");
    } else {
      html += '<h3 class="sec"><span>My Teams</span></h3><div class="brief-status">' + o.none + "</div>";
    }
    if (others.length) {
      html += '<h3 class="sec"><span>Top ' + others.length + " Around Sports</span><small>of " + (all.length - mine.length) +
        " other " + o.noun + "</small></h3>" + others.map(g => gameCard(label(g))).join("");
    }
    return html;
  }

  function render(results, previewResults) {
    const out = $("#out");
    const all = flat(results);
    const failed = results.filter(r => r.failed).length;
    const pre = previewResults ? flat(previewResults) : null;

    let html = "";
    if (pre) html += '<h2 class="brief-part">Yesterday\'s Recap</h2>';
    html += all.length
      ? half(all, { none: "None of my teams played.", noun: "finals" })
      : '<div class="brief-status">No finished games found for this day' + (failed ? " (some leagues failed to load)" : "") + ".</div>";
    if (pre) {
      html += '<h2 class="brief-part">Today\'s Preview</h2>';
      html += pre.length
        ? half(pre, { preview: true, none: "None of my teams play today.", noun: "games today" })
        : '<div class="brief-status">No upcoming games found for today.</div>';
    }
    out.innerHTML = html;

    $("#summary").textContent = all.length + " finals yesterday" + (pre ? " · " + pre.length + " games on today" : "") +
      (failed ? " · " + failed + " feeds unavailable" : "");
  }

  function setNav(iso) {
    const d = new Date(iso + "T12:00:00Z");
    $("#dateTitle").textContent = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
    document.title = "Daily Brief, " + iso + " — Sports";
    const prev = $("#prevDay"), next = $("#nextDay");
    prev.href = "?date=" + addDays(iso, -1);
    const n = addDays(iso, 1);
    if (n > yesterday) { next.setAttribute("aria-disabled", "true"); next.removeAttribute("href"); }
    else next.href = n === yesterday ? "/brief/" : "?date=" + n;
  }

  async function init() {
    const iso = pickDate();
    setNav(iso);
    // Today's preview only goes with the default view; for an older day, "today" is long over.
    const wantPreview = iso === yesterday;
    const [results, previewResults] = await Promise.all([
      Promise.all(LEAGUES.map(l => fetchLeague(l, iso, "post"))),
      wantPreview ? Promise.all(LEAGUES.map(l => fetchLeague(l, today, "pre"))) : null,
    ]);
    render(results, previewResults);
  }

  init();
})();
