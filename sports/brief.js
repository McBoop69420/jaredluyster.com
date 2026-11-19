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
    const stakes = (ev.season && ev.season.type === 3) || (note && !/group play/i.test(note));
    const ranked = a.rank != null || h.rank != null;
    const detail = type.detail && !/^final$/i.test(type.detail) ? type.detail : ""; // "Final/OT", "FT-Pens"
    return {
      id: league.key + ":" + ev.id, league, away: a, home: h, note, detail,
      recap: hl && (hl.shortLinkText || hl.description) ? { title: hl.shortLinkText || "", body: hl.description || "" } : null,
      url: link && link.href,
      mine, stakes: !!stakes, ranked,
      // Ordering score: my teams, then playoff/ranked, then anything with a recap.
      weight: (mine ? 100 : 0) + (stakes ? 30 : 0) + (ranked ? 20 : 0) + (hl ? 10 : 0),
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

  function compactRow(g) {
    const w = g.away.winner ? 0 : g.home.winner ? 1 : -1;
    const nm = (t, win) => '<span class="' + (win ? "w" : "") + '">' + esc(t.name) + " " + esc(t.score) + "</span>";
    return "<div>" + nm(g.away, w === 0) + nm(g.home, w === 1) + "</div>";
  }

  function section(league, games) {
    games.sort((x, y) => y.weight - x.weight);
    // College leagues run 50 to 150 games a day: feature the ones that mattered,
    // fold the rest into a one-line-per-game list.
    const cap = league.college ? 8 : 12;
    const featured = (league.college ? games.filter(g => g.weight >= 20) : games).slice(0, cap);
    const rest = games.filter(g => featured.indexOf(g) < 0);
    let html = '<h3 class="sec"><span>' + esc(league.intl ? "International" : league.label) +
      '</span><small>' + games.length + (games.length === 1 ? " game" : " games") + "</small></h3>";
    html += featured.map(gameCard).join("");
    if (rest.length) {
      html += '<details class="brief-more"><summary>' + (featured.length ? "More " : "All ") + esc(league.label) +
        " finals (" + rest.length + ")</summary><div class=\"brief-compact\">" + rest.map(compactRow).join("") + "</div></details>";
    }
    return html;
  }

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

    // Merge the international competitions into one section.
    const groups = new Map();
    results.forEach(r => {
      if (!r.games.length) return;
      const k = r.league.intl ? "intl" : r.league.key;
      if (!groups.has(k)) groups.set(k, { league: r.league.intl ? { key: "intl", label: "International", mine: r.league.mine, intl: true } : r.league, games: [] });
      groups.get(k).games.push(...r.games);
    });

    // Top of the brief: my teams' results, all leagues together.
    const mine = all.filter(g => g.mine).sort((a, b) => b.weight - a.weight);
    let html = "";
    if (mine.length) {
      html += '<h3 class="sec"><span>My Teams</span><small>' + mine.length + (mine.length === 1 ? " game" : " games") + "</small></h3>" +
        mine.map(g => gameCard(Object.assign({}, g, { note: [g.league.label, g.note].filter(Boolean).join(" · ") }))).join("");
    }

    // Pro leagues first, then college, each in the order they're listed above.
    const idx = g => LEAGUES.findIndex(l => l.key === g.league.key || (g.league.intl && l.intl));
    const ordered = [...groups.values()].sort((a, b) =>
      (a.league.college ? 1 : 0) - (b.league.college ? 1 : 0) || idx(a) - idx(b));
    // My games already ran above; keep them out of the league sections.
    html += ordered.map(g => {
      const rest = g.games.filter(x => !x.mine);
      return rest.length ? section(g.league, rest) : "";
    }).join("");
    out.innerHTML = html;

    const leaguesN = groups.size;
    $("#summary").textContent = all.length + " finals across " + leaguesN + (leaguesN === 1 ? " league" : " leagues") +
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
    const results = await Promise.all(LEAGUES.map(l => fetchLeague(l, iso)));
    render(iso, results);
  }

  init();
})();
