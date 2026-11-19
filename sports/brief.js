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

  function parse(ev, league) {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const cs = comp.competitors || [];
    if (cs.length < 2) return null;
    const status = ev.status || comp.status || {};
    const type = status.type || {};
    if (type.state !== "post" || type.name === "STATUS_POSTPONED" || type.name === "STATUS_CANCELED") return null;
    const away = cs.find(c => c.homeAway === "away") || cs[0];
    const home = cs.find(c => c.homeAway === "home") || cs[1];
    const side = c => {
      const r = c.curatedRank && c.curatedRank.current;
      return {
        name: c.team.displayName,
        logo: c.team.logo || (c.team.logos && c.team.logos[0] && c.team.logos[0].href) || "",
        score: c.score,
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
    return {
      id: league.key + ":" + ev.id, league, away: a, home: h, note, detail,
      recap: hl && (hl.shortLinkText || hl.description) ? { title: hl.shortLinkText || "", body: hl.description || "" } : null,
      url: link && link.href,
      mine, stakes: !!stakes, ranked,
      weight: (mine ? 100 : 0) + interest(a, h, stakes, ranked, detail, !!hl),
    };
  }

  async function fetchLeague(league, iso) {
    const url = ESPN + league.key + "/scoreboard?" + (league.q || "limit=300") + "&dates=" + iso.replace(/-/g, "");
    try {
      const res = await fetch(url);
      if (!res.ok) return { league, games: [], failed: true };
      const json = await res.json();
      const games = (json.events || []).map(ev => parse(ev, league)).filter(Boolean);
      return { league, games };
    } catch (e) {
      return { league, games: [], failed: true };
    }
  }

  function teamLine(t, label) {
    return '<div class="brief-line' + (t.winner ? " win" : "") + '">' +
      '<span class="t">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : "") +
      (t.rank ? '<span class="rk">' + t.rank + "</span>" : "") + esc(t.name) + "</span>" +
      '<span class="s">' + esc(t.score) + "</span></div>";
  }

  function gameCard(g) {
    const meta = [g.league.intl ? g.league.label : "", g.note, g.detail].filter(Boolean).join(" · ");
    let html = '<div class="brief-game' + (g.mine ? " mine" : "") + '">' + teamLine(g.away) + teamLine(g.home);
    if (meta) html += '<div class="brief-meta">' + esc(meta) + "</div>";
    if (g.recap) {
      html += '<p class="brief-recap">' + (g.recap.title ? "<b>" + esc(g.recap.title) + ".</b> " : "") +
        (g.recap.body ? esc(g.recap.body.replace(/^[—–-]\s*/, "")) : "") +
        (g.url ? ' <a href="' + esc(g.url) + '" target="_blank" rel="noopener">Full recap</a>' : "") + "</p>";
    }
    return html + "</div>";
  }

  const TOP_N = 10;

  function render(iso, results) {
    const out = $("#out");
    const all = [];
    results.forEach(r => r.games.forEach(g => all.push(g)));
    const failed = results.filter(r => r.failed).length;

    if (!all.length) {
      out.innerHTML = '<div class="brief-status">No finished games found for this day' +
        (failed ? " (some leagues failed to load)" : "") + ".</div>";
      $("#summary").textContent = "";
      return;
    }

    const label = g => Object.assign({}, g, { note: [g.league.label, g.note].filter(Boolean).join(" · ") });
    const mine = all.filter(g => g.mine).sort((a, b) => b.weight - a.weight);
    // Pro leagues get a small edge so a 150-game college night can't crowd them out.
    const others = all.filter(g => !g.mine)
      .map(g => Object.assign(g, { weight: g.weight + (g.league.college ? 0 : 15) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, TOP_N);

    let html = "";
    if (mine.length) {
      html += '<h3 class="sec"><span>My Teams</span><small>' + mine.length + (mine.length === 1 ? " game" : " games") + "</small></h3>" +
        mine.map(g => gameCard(label(g))).join("");
    } else {
      html += '<h3 class="sec"><span>My Teams</span></h3><div class="brief-status">None of my teams played.</div>';
    }
    html += '<h3 class="sec"><span>Top ' + others.length + ' Around Sports</span><small>of ' + (all.length - mine.length) + " other finals</small></h3>" +
      others.map(g => gameCard(label(g))).join("");
    out.innerHTML = html;

    $("#summary").textContent = all.length + " finals yesterday" + (failed ? " · " + failed + " feeds unavailable" : "");
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
    const results = await Promise.all(LEAGUES.map(l => fetchLeague(l, iso)));
    render(iso, results);
  }

  init();
})();
