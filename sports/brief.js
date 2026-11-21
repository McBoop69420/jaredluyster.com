/* Sports — Daily Brief (page)
 * Shows yesterday's recap plus today's preview. The data comes from
 * brief-core.js. At 7:30 AM ET a scheduled job on Jared-Server writes both
 * halves to /brief/snapshot.json (scripts/sports-brief.mjs), so the page opens
 * instantly; the preview is then refreshed live from ESPN so start times,
 * lines and live scores stay current. With no usable snapshot (before 7:30, or
 * a missed run) it builds the whole brief live. ?date=YYYY-MM-DD shows an
 * older day's recap.
 */
(function () {
  "use strict";

  const Core = window.BriefCore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const today = Core.etDate(new Date());
  const yesterday = Core.addDays(today, -1);

  function pickDate() {
    const m = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    // Never show today or the future: the recap is for games that are over.
    return m && m[1] <= yesterday ? m[1] : yesterday;
  }

  function teamLine(t, pre) {
    return '<div class="brief-line' + (t.winner ? " win" : "") + '">' +
      '<span class="t">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy">' : "") +
      (t.rank ? '<span class="rk">' + t.rank + "</span>" : "") + esc(t.name) +
      (pre && t.rec ? ' <span class="rk">' + esc(t.rec) + "</span>" : "") + "</span>" +
      '<span class="s">' + (pre ? "" : esc(t.score)) + "</span></div>";
  }

  function gameCard(g) {
    const pre = g.preview && !g.live;
    let html = '<div class="brief-game' + (g.mine ? " mine" : "") + '">' + teamLine(g.away, pre) + teamLine(g.home, pre);
    if (g.preview) {
      const pm = [g.when, g.tv, g.line, g.league.intl ? g.league.label : "", g.note].filter(Boolean).join(" · ");
      return html + '<div class="brief-meta">' + (g.live ? "<b>Live</b> · " : "") + esc(pm) + "</div></div>";
    }
    const meta = [g.league.intl ? g.league.label : "", g.note, g.detail].filter(Boolean).join(" · ");
    if (meta) html += '<div class="brief-meta">' + esc(meta) + "</div>";
    const link = g.url ? ' <a href="' + esc(g.url) + '" target="_blank" rel="noopener">Full recap</a>' : "";
    if (g.why) {
      // Why it mattered first, then ESPN's one-line headline for what happened.
      html += '<p class="brief-recap"><b>' + esc(g.why) + "</b>" +
        (g.recap && g.recap.title ? " " + esc(g.recap.title) + "." : "") + link + "</p>";
    } else if (g.recap) {
      html += '<p class="brief-recap">' + (g.recap.title ? "<b>" + esc(g.recap.title) + ".</b> " : "") +
        (g.recap.body ? esc(g.recap.body.replace(/^[—–-]\s*/, "")) : "") + link + "</p>";
    }
    return html + "</div>";
  }

  const label = g => Object.assign({}, g, { note: [g.league.label, g.note].filter(Boolean).join(" · ") });
  const count = n => n + (n === 1 ? " game" : " games");

  // One half of the page: My Teams, then the top 10 of everything else.
  function half(sel, o) {
    let html = "";
    if (sel.mine.length) {
      html += '<h3 class="sec"><span>My Teams</span><small>' + count(sel.mine.length) + "</small></h3>" + sel.mine.map(g => gameCard(label(g))).join("");
    } else {
      html += '<h3 class="sec"><span>My Teams</span></h3><div class="brief-status">' + o.none + "</div>";
    }
    if (sel.others.length) {
      html += '<h3 class="sec"><span>Top ' + sel.others.length + " Around Sports</span><small>of " + sel.otherTotal +
        " other " + o.noun + "</small></h3>" + sel.others.map(g => gameCard(label(g))).join("");
    }
    return html;
  }

  function render(brief) {
    const recap = brief.recap, pre = brief.preview;
    let html = "";
    if (pre) html += '<h2 class="brief-part">Yesterday\'s Recap</h2>';
    html += recap.total
      ? half(recap, { none: "None of my teams played.", noun: "finals" })
      : '<div class="brief-status">No finished games found for this day' + (brief.failed ? " (some leagues failed to load)" : "") + ".</div>";
    if (pre) {
      html += '<h2 class="brief-part">Today\'s Preview</h2>';
      html += pre.total
        ? half(pre, { none: "None of my teams play today.", noun: "games today" })
        : '<div class="brief-status">No upcoming games found for today.</div>';
    }
    $("#out").innerHTML = html;
    $("#summary").textContent = recap.total + " finals yesterday" + (pre ? " · " + pre.total + " games on today" : "") +
      (brief.failed ? " · " + brief.failed + " feeds unavailable" : "");
  }

  function setNav(iso) {
    const d = new Date(iso + "T12:00:00Z");
    $("#dateTitle").textContent = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
    document.title = "Daily Brief, " + iso + " — Sports";
    const prev = $("#prevDay"), next = $("#nextDay");
    prev.href = "?date=" + Core.addDays(iso, -1);
    const n = Core.addDays(iso, 1);
    if (n > yesterday) { next.setAttribute("aria-disabled", "true"); next.removeAttribute("href"); }
    else next.href = n === yesterday ? "/brief/" : "?date=" + n;
  }

  // The 7:30 AM snapshot, if it is for the day we want to show.
  async function loadSnapshot(iso) {
    try {
      const res = await fetch("/brief/snapshot.json", { cache: "no-cache" });
      if (!res.ok) return null;
      const snap = await res.json();
      return snap && snap.version === 1 && snap.recapDate === iso && snap.recap && snap.preview ? snap : null;
    } catch (e) {
      return null;
    }
  }

  async function init() {
    const iso = pickDate();
    setNav(iso);
    // Today's preview only goes with the default view; for an older day, "today" is long over.
    if (iso !== yesterday) { render(await Core.buildBrief({ recapDate: iso })); return; }

    const snap = await loadSnapshot(iso);
    if (!snap) { render(await Core.buildBrief()); return; }
    render(snap);
    // Start times, lines and live scores move after 7:30: refresh just the preview.
    const fresh = await Core.loadDay(today, "pre");
    if (fresh.games.length) render(Object.assign({}, snap, { preview: Core.select(fresh.games, true) }));
  }

  init();
})();
