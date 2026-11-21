/* Sports — Daily Brief core
 * The data half of the brief: which leagues to ask ESPN about, how a finished
 * or upcoming game is scored for "worth reading", and the My Teams + top 10
 * selection. DOM-free, so the page (brief.js) and the 7:30 AM snapshot job
 * (scripts/sports-brief.mjs) run the same code and cannot disagree.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BriefCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  const TOP_N = 10;

  // `mine` marks the teams I follow (same list as the Games page).
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

  const etDate = d => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
  const addDays = (iso, n) => {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  function isMine(league, name) {
    return league.mine.some(t => name.toLowerCase().indexOf(t.toLowerCase()) >= 0);
  }

  // How worth-reading a finished game is, for picking the top 10.
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

  // Record "W-L", "W-L-OTL" or soccer "W-D-L" -> { games, wins, losses, pct } or null.
  function readRec(rec, soccer) {
    const n = String(rec || "").split("-").map(Number);
    if (n.length < 2 || n.some(x => !Number.isFinite(x))) return null;
    const games = n.reduce((s, x) => s + x, 0);
    if (!games) return null;
    const losses = soccer ? (n[2] || 0) : n.slice(1).reduce((s, x) => s + x, 0);
    // Soccer: share of available points, so a draw counts for something.
    const pct = soccer ? (3 * n[0] + n[1]) / (3 * games) : n[0] / games;
    return { games, wins: n[0], losses, pct };
  }

  // One or two plain sentences on why a finished game mattered, built only
  // from what the scoreboard says: rankings, records, the score by period.
  function whyItMattered(league, away, home, detail) {
    const sport = league.key.split("/")[0];
    const soccer = sport === "soccer";
    const pair = [away, home];
    const W = pair.find(t => t.raw.winner), L = pair.find(t => t !== W);
    const out = [];
    // US pro teams read as "the Bengals"; schools, clubs and countries don't.
    const pro = /^(football\/nfl|basketball\/nba|basketball\/wnba|baseball\/mlb|hockey\/nhl)$/.test(league.key);
    pair.forEach(t => { t.short = (pro ? "the " : "") + t.short; });
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const nm = t => (t.rank != null ? "No. " + t.rank + " " : "") + t.short;
    const mine = t => isMine(league, t.name);

    if (W && L) {
      const sw = parseFloat(W.raw.score), sl = parseFloat(L.raw.score);
      const margin = sw - sl;
      const rw = readRec(W.raw.rec, soccer), rl = readRec(L.raw.rec, soccer);

      // Upsets: by poll ranking first, then by record.
      if (L.rank != null && W.rank == null) out.push("Upset: unranked " + W.short + " beat " + nm(L) + ".");
      else if (L.rank != null && W.rank != null && W.rank - L.rank >= 8) out.push("Upset: " + nm(W) + " beat " + nm(L) + ".");
      else if (W.rank == null && L.rank == null && rw && rl && rw.games >= 6 && rl.games >= 6 && rl.pct - rw.pct >= 0.25)
        out.push("Upset: " + W.short + " (" + W.raw.rec + ") beat " + L.short + " (" + L.raw.rec + ").");
      else if (W.rank != null && L.rank != null) out.push("Top-25 matchup: " + nm(W) + " beat " + nm(L) + ".");

      // Streaks the result started or ended.
      if (rl && rl.losses === 1 && rl.games >= 5) out.push("First loss of the season for " + L.short + " (" + L.raw.rec + ").");
      if (rw && rw.wins === 1 && rw.games >= 4) out.push("First win of the season for " + W.short + ".");

      // Comebacks, from the running score at the end of each period.
      const big = { basketball: 12, football: 14, baseball: 4, hockey: 2, soccer: 2 }[sport] || 99;
      const lw = W.raw.ls, ll = L.raw.ls;
      if (lw.length && lw.length === ll.length) {
        let cw = 0, cl = 0, worst = 0;
        for (let i = 0; i < lw.length - 1; i++) { cw += lw[i]; cl += ll[i]; worst = Math.max(worst, cl - cw); }
        if (worst >= big) out.push(cap(W.short) + " came back from " + worst + " down.");
      }

      if (/AET|extra time/i.test(detail)) out.push("Went to extra time.");
      else if (/OT|extra/i.test(detail)) out.push("Went to overtime.");
      else if (/SO|shootout/i.test(detail)) out.push("Decided in a shootout.");
      else if (/Pens|penalt/i.test(detail)) out.push("Decided on penalties.");
      else {
        const close = { basketball: 3, football: 3, baseball: 1 }[sport];
        if (close && margin <= close) out.push("Decided by " + margin + ".");
      }

      if (rw && rw.losses === 0 && rw.wins >= 5) out.push("Still unbeaten: " + W.short + " " + W.raw.rec + ".");
    }

    const why = out.slice(0, 2);
    // For my teams, always say where the season stands.
    pair.filter(mine).forEach(t => {
      if (!t.raw.rec || why.some(s => s.indexOf(t.raw.rec) >= 0)) return;
      why.push(cap(t.short) + " now " + t.raw.rec + ".");
    });
    return why.join(" ");
  }

  // mode "post": finished games (the recap). mode "pre": not started or live (the preview).
  function parse(ev, league, mode) {
    const comp = (ev.competitions && ev.competitions[0]) || {};
    const cs = comp.competitors || [];
    if (cs.length < 2) return null;
    const status = ev.status || comp.status || {};
    const type = status.type || {};
    if (type.name === "STATUS_POSTPONED" || type.name === "STATUS_CANCELED") return null;
    const preview = mode === "pre";
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
    const link = (ev.links || []).find(l => (l.rel || []).indexOf("summary") >= 0 || (l.rel || []).indexOf("desktop") >= 0);
    const mine = isMine(league, a.name) || isMine(league, h.name);
    const stakes = !!((ev.season && ev.season.type === 3) || (/champion|final|playoff|bowl|cup/i.test(note) && !/group play/i.test(note)));
    const ranked = a.rank != null || h.rank != null;
    // Kept small: this object goes into the snapshot file.
    const lg = { key: league.key, label: league.label, intl: !!league.intl, college: !!league.college };

    if (preview) {
      const odds = comp.odds && comp.odds[0];
      const nets = (comp.broadcasts || []).find(b => b.market === "national") || (comp.broadcasts || [])[0];
      const line = [odds && odds.details, odds && odds.overUnder ? "O/U " + odds.overUnder : ""].filter(Boolean).join(" · ");
      const closeLine = !!(odds && typeof odds.spread === "number" && Math.abs(odds.spread) <= 3);
      const live = type.state === "in";
      const when = live ? (type.shortDetail || type.detail || "Live") :
        new Date(ev.date).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
      const both = a.rank != null && h.rank != null;
      return {
        id: league.key + ":" + ev.id, league: lg, away: a, home: h, note, preview: true, live,
        when, startMs: new Date(ev.date).getTime(), line, tv: nets && nets.names ? nets.names.join("/") : "",
        url: link && link.href, mine,
        weight: (mine ? 100 : 0) + (stakes ? 30 : 0) + (both ? 25 : ranked ? 12 : 0) + (closeLine ? 8 : 0) + (live ? 5 : 0),
      };
    }

    const hl = (comp.headlines || []).find(x => x.type === "Recap") || (comp.headlines || [])[0] || null;
    const detail = type.detail && !/^final$/i.test(type.detail) ? type.detail : ""; // "Final/OT", "FT-Pens"
    // Only what whyItMattered needs; not stored in the snapshot.
    const forWhy = (c, t) => ({
      name: t.name, rank: t.rank,
      short: (league.college && c.team.location) || c.team.shortDisplayName || t.name, // "Central Connecticut", "Bengals"
      raw: { winner: t.winner, score: t.score, rec: t.rec, ls: (c.linescores || []).map(x => Number(x.value) || 0) },
    });
    return {
      id: league.key + ":" + ev.id, league: lg, away: a, home: h, note, detail,
      why: whyItMattered(league, forWhy(away, a), forWhy(home, h), detail),
      recap: hl && (hl.shortLinkText || hl.description) ? { title: hl.shortLinkText || "", body: hl.description || "" } : null,
      url: link && link.href, mine,
      weight: (mine ? 100 : 0) + interest(a, h, stakes, ranked, detail, !!hl),
    };
  }

  async function loadLeague(league, iso, mode) {
    const url = ESPN + league.key + "/scoreboard?" + (league.q || "limit=300") + "&dates=" + iso.replace(/-/g, "");
    try {
      const res = await fetch(url, typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(20000) } : undefined);
      if (!res.ok) return { games: [], failed: true };
      const json = await res.json();
      return { games: (json.events || []).map(ev => parse(ev, league, mode)).filter(Boolean), failed: false };
    } catch (e) {
      return { games: [], failed: true };
    }
  }

  // Every league for one ET day -> { games, failed }.
  async function loadDay(iso, mode) {
    const results = await Promise.all(LEAGUES.map(l => loadLeague(l, iso, mode)));
    return {
      games: results.reduce((acc, r) => acc.concat(r.games), []),
      failed: results.filter(r => r.failed).length,
    };
  }

  // My Teams in full, then the top 10 of everything else. Pro leagues get a
  // small edge so a 150-game college night can't crowd them out. A preview is
  // shown in time order; a recap in order of interest.
  function select(games, preview) {
    const byTime = (a, b) => a.startMs - b.startMs;
    const byWeight = (a, b) => b.weight - a.weight;
    let mine = games.filter(g => g.mine).sort(byWeight);
    let others = games.filter(g => !g.mine)
      .map(g => Object.assign({}, g, { weight: g.weight + (g.league.college ? 0 : 15) }))
      .sort(byWeight).slice(0, TOP_N);
    if (preview) { mine = mine.sort(byTime); others = others.sort(byTime); }
    return { total: games.length, mine, others, otherTotal: games.length - mine.length };
  }

  // The whole brief: yesterday's recap and, optionally, today's preview.
  async function buildBrief(opts) {
    opts = opts || {};
    const today = etDate(new Date());
    const recapDate = opts.recapDate || addDays(today, -1);
    const withPreview = opts.withPreview !== false && recapDate === addDays(today, -1);
    const [recap, preview] = await Promise.all([
      loadDay(recapDate, "post"),
      withPreview ? loadDay(today, "pre") : null,
    ]);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      recapDate,
      previewDate: withPreview ? today : null,
      failed: recap.failed + (preview ? preview.failed : 0),
      recap: select(recap.games, false),
      preview: preview ? select(preview.games, true) : null,
    };
  }

  return { LEAGUES, TOP_N, etDate, addDays, parse, select, loadDay, buildBrief };
});
