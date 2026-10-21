// The public reader. Everything comes from one call, api/public/site, which the planner
// keeps up to date: settings, every posted strip (numbered, oldest first) and the public cast.
//
// Routes live in the hash so the whole comic is one static page:
//   #/      newest strip      #/12   strip 12      #archive   #cast   #about

(function () {
  const sheet = document.getElementById("sheet");
  const { doodle, marginDoodles } = window.Doodles;
  let site = null;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const comicTitle = () => (site && site.settings.title.trim()) || "Untitled Comic";

  function parseDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const longDate = (iso) => parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const schoolDate = (iso) => {
    const d = parseDate(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  };

  function schoolHead(dateIso, number) {
    return `<div class="school-head">
      <span>Name: <b>Jared L.</b></span>
      ${dateIso ? `<span>Date: <b>${esc(schoolDate(dateIso))}</b></span>` : ""}
      ${number ? `<span>No. <b>${number}</b></span>` : ""}
    </div>`;
  }

  function imageUrl(img) {
    return `/comic/api/public/img/${encodeURIComponent(img.id)}`;
  }

  function setNav(view) {
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === view));
  }

  function setTitle(part) {
    document.title = part ? `${part} — ${comicTitle()}` : comicTitle();
  }

  // ---- Views ----------------------------------------------------------------

  function renderStrip(n) {
    const strips = site.strips;
    setNav("strip");
    if (!strips.length) return renderComingSoon();

    const latest = strips.length;
    const index = n == null ? latest - 1 : Math.min(Math.max(n, 1), latest) - 1;
    const s = strips[index];
    const at = s.n;
    const link = (to, label, on) =>
      on ? `<a class="scribble" href="#/${to}">${label}</a>` : `<span class="scribble is-off" aria-disabled="true">${label}</span>`;

    sheet.innerHTML = `
      ${schoolHead(s.date, at)}
      <h1 class="marker-title">${esc(s.title || `Strip #${at}`)}</h1>
      <figure class="strip snap-rule">
        <span class="tape tl"></span><span class="tape tr"></span>
        <img src="${imageUrl(s.image)}" width="${s.image.w}" height="${s.image.h}"
             alt="${esc(s.alt || s.title || `Strip ${at}`)}" decoding="async" />
      </figure>
      <nav class="flip snap-rule" aria-label="Flip through strips">
        ${link(1, "« first", at > 1)}
        ${link(at - 1, "‹ back", at > 1)}
        <button class="scribble" type="button" id="randomBtn" ${latest < 2 ? "disabled" : ""}>random?</button>
        ${link(at + 1, "next ›", at < latest)}
        ${link(latest, "newest »", at < latest)}
      </nav>
      ${
        s.note.trim()
          ? `<div class="artist-note"><span class="who">note from the artist:</span>${esc(s.note)}</div>`
          : ""
      }
      <p class="pencil">posted ${esc(longDate(s.date))}${at === latest ? ' · <span class="hl">the newest one!</span>' : ""}</p>
      ${marginDoodles(at * 31 + 7)}
    `;

    const randomBtn = document.getElementById("randomBtn");
    randomBtn.addEventListener("click", () => {
      let pick = at;
      while (latest > 1 && pick === at) pick = 1 + Math.floor(Math.random() * latest);
      location.hash = `#/${pick}`;
    });
    setTitle(n == null ? "" : s.title || `#${at}`);
  }

  function renderComingSoon() {
    sheet.innerHTML = `
      ${schoolHead(null, null)}
      <h1 class="marker-title">Coming soon!!!</h1>
      <p>The first strip is still in pencil.</p>
      <p>Check back soon <span class="hl">(seriously, it's going to be good)</span>.</p>
      <p class="red-pen">— J</p>
      ${doodle("arrow", "red", "position:relative;display:block;width:70px;height:70px;transform:rotate(18deg);margin:0 0 0 30%")}
      ${doodle("coolS", "", "position:relative;display:inline-block;width:80px;height:80px;margin-right:16px")}
      ${doodle("cube", "pencil", "position:relative;display:inline-block;width:70px;height:70px;margin-right:16px")}
      ${doodle("star", "red", "position:relative;display:inline-block;width:60px;height:60px")}
      ${marginDoodles(3, 2)}
    `;
    setTitle("");
  }

  function renderArchive() {
    setNav("archive");
    const strips = site.strips;
    sheet.innerHTML = `
      ${schoolHead(null, null)}
      <h1 class="marker-title">Table of Contents</h1>
      ${
        strips.length
          ? `<p class="pencil">${strips.length} strip${strips.length === 1 ? "" : "s"} so far</p>
             <ol class="toc">${strips
               .map(
                 (s) => `<li><a href="#/${s.n}">
                   <span class="num">#${s.n}</span>
                   <span class="t">${esc(s.title || "untitled")}</span>
                   <span class="dots" aria-hidden="true"></span>
                   <span class="d">${esc(longDate(s.date))}</span></a></li>`,
               )
               .join("")}</ol>`
          : `<p>Nothing here yet. The first strip goes on line 1.</p>`
      }
      ${marginDoodles(11)}
    `;
    setTitle("Archive");
  }

  function renderCast() {
    setNav("cast");
    const cast = site.cast;
    sheet.innerHTML = `
      ${schoolHead(null, null)}
      <h1 class="marker-title">The Cast</h1>
      ${
        cast.length
          ? `<div class="cast-grid snap-rule">${cast
              .map(
                (c, i) => `<div class="snap">
                  <span class="tape top"></span>
                  <div class="snap-pic">${
                    c.image
                      ? `<img src="${imageUrl(c.image)}" alt="${esc(c.name)}" loading="lazy" decoding="async" />`
                      : doodle(["person", "smiley", "star"][i % 3], "pencil")
                  }</div>
                  <h3>${esc(c.name)}</h3>
                  ${c.role.trim() ? `<span class="role hl">${esc(c.role)}</span>` : ""}
                  ${c.bio.trim() ? `<p class="bio">${esc(c.bio)}</p>` : ""}
                </div>`,
              )
              .join("")}</div>`
          : `<p>Still deciding who's in this thing.</p>${doodle("person", "pencil", "position:relative;display:block;width:80px;height:80px")}`
      }
      ${marginDoodles(23, 2)}
    `;
    setTitle("Cast");
  }

  function renderAbout() {
    setNav("about");
    const { tagline, about } = site.settings;
    const paras = about
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((p) => `<p>${esc(p.trim())}</p>`)
      .join("");
    sheet.innerHTML = `
      ${schoolHead(null, null)}
      <h1 class="marker-title">About ${esc(comicTitle())}</h1>
      ${tagline.trim() ? `<p><span class="hl">${esc(tagline)}</span></p>` : ""}
      ${paras ? `<div class="artist-note">${paras}</div><p class="red-pen">— Jared</p>` : ""}
      ${marginDoodles(41)}
    `;
    setTitle("About");
  }

  function renderError() {
    sheet.innerHTML = `
      <h1 class="marker-title">uh oh.</h1>
      <p>The comic didn't load. Maybe the internet ate it.</p>
      <div class="flip" style="justify-content:flex-start"><button class="scribble" type="button" id="retryBtn">try again</button></div>
      ${doodle("bolt", "red", "position:relative;display:block;width:60px;height:60px")}
    `;
    document.getElementById("retryBtn").addEventListener("click", load);
  }

  // Images, buttons and snapshots aren't a whole number of ruled lines tall, so everything
  // after them would float between the lines. Pad each one's bottom margin out to the next
  // line so the handwriting below it lands back on the rules.
  function snapToRules() {
    const rule = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rule")) || 28;
    const top = sheet.getBoundingClientRect().top;
    sheet.querySelectorAll(":scope > .snap-rule").forEach((el) => {
      el.style.marginBottom = "";
      const base = parseFloat(getComputedStyle(el).marginBottom) || 0;
      const bottom = el.getBoundingClientRect().bottom - top + base;
      el.style.marginBottom = `${base + ((rule - (bottom % rule)) % rule)}px`;
    });
  }

  function afterRender() {
    snapToRules();
    sheet.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", snapToRules, { once: true });
    });
  }

  // Pages are 8½×11 sheets at this width (the binder holes in comic.css follow the same size).
  // When the writing stops partway down a sheet, the rest was torn off: ragged bottom edge.
  const LETTER = 11 / 8.5;
  const markTorn = () => {
    const full = sheet.offsetWidth * LETTER;
    const left = sheet.offsetHeight % full;
    sheet.classList.toggle("torn", left > 1 && full - left > 1);
  };
  if (window.ResizeObserver) new ResizeObserver(markTorn).observe(sheet);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(snapToRules, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => site && snapToRules());

  // ---- Router ---------------------------------------------------------------

  function route() {
    if (!site) return;
    const hash = location.hash.replace(/^#/, "");
    const m = /^\/(\d+)$/.exec(hash);
    if (m) renderStrip(Number(m[1]));
    else if (hash === "archive") renderArchive();
    else if (hash === "cast") renderCast();
    else if (hash === "about") renderAbout();
    else renderStrip(null);
    afterRender();
    window.scrollTo({ top: 0 });
  }

  document.addEventListener("keydown", (e) => {
    if (!site || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const hash = location.hash.replace(/^#/, "");
    const m = /^\/(\d+)$/.exec(hash);
    const isStrip = m || hash === "" || hash === "/";
    if (!isStrip || !site.strips.length) return;
    const at = m ? Math.min(Number(m[1]), site.strips.length) : site.strips.length;
    if (e.key === "ArrowLeft" && at > 1) location.hash = `#/${at - 1}`;
    if (e.key === "ArrowRight" && at < site.strips.length) location.hash = `#/${at + 1}`;
  });

  async function load() {
    try {
      const res = await fetch("/comic/api/public/site", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      site = await res.json();
    } catch (err) {
      console.error("comic: couldn't load the site data", err);
      renderError();
      return;
    }
    document.getElementById("brandTitle").textContent = comicTitle();
    route();
  }

  window.addEventListener("hashchange", route);
  load();
})();
