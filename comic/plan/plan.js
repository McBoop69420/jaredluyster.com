// The comic planner. One document (the plan) is loaded from ../api/private/plan, edited in
// place, and autosaved back a second after you stop typing. Saves carry the ETag they were
// loaded with, so if the planner is open on two devices the older one is told instead of
// quietly overwriting the newer one.
//
// Routes:  #strips   #strip/<id>   #cast   #ideas   #settings

(function () {
  // Absolute on purpose: Pages only runs a Function for the path as requested, so a
  // subdomain-relative "/api/..." would be rewritten by the middleware into a static miss.
  const API = "/comic/api/private";
  const TIME_ZONE = "America/New_York";
  const SAVE_DELAY = 1000;
  const MAX_EDGE = 3000; // longest side of an uploaded scan, in pixels
  const BACKUP_KEY = "comic-plan-unsaved";

  const STATUSES = [
    { id: "idea", label: "Idea" },
    { id: "script", label: "Scripted" },
    { id: "pencils", label: "Penciled" },
    { id: "inks", label: "Inked" },
    { id: "posted", label: "Posted" },
  ];

  const app = document.getElementById("app");
  const saveState = document.getElementById("saveState");
  const banner = document.getElementById("banner");
  const filePick = document.getElementById("filePick");
  const { doodle } = window.Doodles;

  let plan = null;
  let etag = null;
  let dirty = false;
  let saving = false;
  let saveTimer = null;
  let retryDelay = 2000;
  let conflicted = false;
  const orphanImages = new Set(); // replaced or removed; deleted from the bucket after the next good save

  // ---- Helpers --------------------------------------------------------------

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => new Date().toISOString();
  const today = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  function shortDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const imgUrl = (img) => `${API}/img/${encodeURIComponent(img.id)}`;
  const findStrip = (id) => plan.strips.find((s) => s.id === id);
  const findChar = (id) => plan.cast.find((c) => c.id === id);
  const findIdea = (id) => plan.ideas.find((i) => i.id === id);

  const blankPanel = () => ({ id: newId(), scene: "", lines: [{ who: "", text: "" }] });

  // Mirrors the server: posted + has art + has a date, oldest first. Numbers only count the
  // ones whose day has come, so a scheduled strip doesn't shift what readers see as #12.
  function liveNumbers() {
    const t = today();
    const nums = new Map();
    plan.strips
      .filter((s) => s.status === "posted" && s.image && s.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
      .filter((s) => s.date <= t)
      .forEach((s, i) => nums.set(s.id, i + 1));
    return nums;
  }

  function publishState(s, nums) {
    if (s.status !== "posted") return { kind: "draft" };
    if (!s.image) return { kind: "noart" };
    if (!s.date) return { kind: "nodate" };
    if (s.date > today()) return { kind: "scheduled" };
    return { kind: "live", n: (nums || liveNumbers()).get(s.id) };
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }

  function refreshCastNames() {
    const names = [...new Set(plan.cast.map((c) => c.name.trim()).filter(Boolean))];
    document.getElementById("castNames").innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join("");
  }

  function setPill(text, cls = "") {
    saveState.textContent = text;
    saveState.className = `save-pill ${cls}`;
  }

  function showBanner(html) {
    banner.innerHTML = html;
    banner.hidden = false;
  }

  function hideBanner() {
    banner.hidden = true;
    banner.innerHTML = "";
  }

  // ---- Saving ---------------------------------------------------------------

  function touch() {
    dirty = true;
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(plan));
    } catch {
      /* private mode or full: the server copy is the real one anyway */
    }
    if (conflicted) return;
    setPill("Unsaved", "busy");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    if (saving || !dirty || conflicted) return;
    saving = true;
    dirty = false;
    setPill("Saving…", "busy");
    try {
      const res = await fetch(`${API}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": etag },
        body: JSON.stringify(plan),
      });
      if (res.status === 412) {
        dirty = true;
        onConflict();
        return;
      }
      if (res.status === 401 || res.status === 403) {
        dirty = true;
        setPill("Signed out", "bad");
        showBanner(
          `<p>Your login expired, so the last changes aren't saved yet. They're kept in this browser. Sign in again in a new tab, then come back and press Retry.</p>
           <a class="button button-secondary" href="./" target="_blank" rel="noopener">Sign in</a>
           <button class="button button-primary" type="button" data-act="retry-save">Retry</button>`,
        );
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      etag = res.headers.get("ETag") || etag;
      retryDelay = 2000;
      if (!dirty) {
        setPill("Saved");
        try {
          localStorage.removeItem(BACKUP_KEY);
        } catch {}
      }
      hideBanner();
      sweepOrphans();
    } catch (err) {
      console.error("planner: save failed", err);
      dirty = true;
      setPill("Offline — retrying", "bad");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
      return;
    } finally {
      saving = false;
    }
    if (dirty) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_DELAY);
    }
  }

  function referencedImages() {
    const ids = new Set();
    for (const s of plan.strips) if (s.image) ids.add(s.image.id);
    for (const c of plan.cast) if (c.image) ids.add(c.image.id);
    return ids;
  }

  async function sweepOrphans() {
    const keep = referencedImages();
    for (const id of [...orphanImages]) {
      orphanImages.delete(id);
      if (keep.has(id)) continue;
      fetch(`${API}/img/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    }
  }

  function onConflict() {
    conflicted = true;
    clearTimeout(saveTimer);
    setPill("Not saved", "bad");
    showBanner(
      `<p><strong>The plan was changed somewhere else</strong> (another tab or device) since this page loaded. Your edits here haven't been saved.</p>
       <button class="button button-secondary" type="button" data-act="take-theirs">Load the other version</button>
       <button class="button button-primary" type="button" data-act="keep-mine">Keep mine (overwrite)</button>`,
    );
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirty || saving) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ---- Loading --------------------------------------------------------------

  async function load() {
    let res;
    try {
      res = await fetch(`${API}/plan`, { headers: { Accept: "application/json" } });
    } catch {
      return renderGate("offline");
    }
    if (res.status === 401) return renderGate("signin");
    if (res.status === 403) return renderGate("forbidden");
    if (res.status === 503) return renderGate("setup");
    if (!res.ok) return renderGate("broken", res.status);
    plan = await res.json();
    etag = res.headers.get("ETag") || '"new"';
    afterLoad();
  }

  function afterLoad() {
    let backup = null;
    try {
      backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null");
    } catch {}
    setPill("Saved");
    document.getElementById("comicName").textContent = plan.settings.title.trim() || "Untitled Comic";
    refreshCastNames();
    route();
    if (backup && JSON.stringify(backup) !== JSON.stringify(plan)) {
      showBanner(
        `<p>This browser has edits that never made it to the server (the page closed or went offline mid-save).</p>
         <button class="button button-secondary" type="button" data-act="drop-backup">Throw them out</button>
         <button class="button button-primary" type="button" data-act="restore-backup">Restore them</button>`,
      );
    }
  }

  function renderGate(kind, status) {
    setPill(kind === "offline" ? "Offline" : "Locked", "bad");
    const msgs = {
      signin: `<h1 class="marker-title">sign in first</h1>
        <p>This binder is private. Your login probably timed out.</p>
        <div class="flip" style="justify-content:flex-start"><a class="scribble" href="./">sign in again</a></div>`,
      forbidden: `<h1 class="marker-title">hey! no peeking</h1>
        <p>This planner belongs to the artist. The finished strips are on <a href="../">the comic</a>.</p>`,
      setup: `<h1 class="marker-title">not set up yet</h1>
        <p>The planner's storage isn't switched on. It needs the <code>COMIC</code> R2 binding and the
        <code>COMIC_OWNER_EMAILS</code> secret on the Pages project (see DEPLOY.md, "Comic").</p>`,
      offline: `<h1 class="marker-title">no internet?</h1>
        <p>Couldn't reach the planner. Check the connection and reload.</p>`,
      broken: `<h1 class="marker-title">something broke</h1>
        <p>The planner answered with an error (HTTP ${esc(status)}). Try reloading.</p>`,
    };
    app.innerHTML = `<article class="sheet gate">${msgs[kind]}${doodle("bolt", "red", "position:relative;display:block;width:56px;height:56px")}</article>`;
  }

  // ---- Router ---------------------------------------------------------------

  function setNav(view) {
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === view));
  }

  function route() {
    if (!plan) return;
    const hash = location.hash.replace(/^#/, "");
    const [view, arg] = hash.split("/");
    if (view === "strip" && arg && findStrip(arg)) renderEditor(findStrip(arg));
    else if (view === "cast") renderCast();
    else if (view === "ideas") renderIdeas();
    else if (view === "settings") renderSettings();
    else renderBoard();
    app.querySelectorAll("textarea").forEach(autosize);
  }

  function rerender() {
    const y = window.scrollY;
    route();
    window.scrollTo({ top: y });
  }

  window.addEventListener("hashchange", () => {
    route();
    window.scrollTo({ top: 0 });
  });

  // ---- Board ----------------------------------------------------------------

  function cardHtml(s, nums) {
    const panels = s.panels.length;
    const ps = publishState(s, nums);
    let tag = "";
    if (s.status === "posted") {
      if (ps.kind === "live") tag = `<span class="tag live">#${ps.n} live</span>`;
      else if (ps.kind === "scheduled") tag = `<span class="tag soon">${esc(shortDate(s.date))}</span>`;
      else if (ps.kind === "noart") tag = `<span class="tag warn">needs art</span>`;
      else tag = `<span class="tag warn">needs date</span>`;
    }
    return `<button class="card" type="button" draggable="true" data-card="${esc(s.id)}">
      <span class="card-title ${s.title.trim() ? "" : "untitled"}">${esc(s.title.trim() || "untitled")}</span>
      ${s.image ? `<img class="card-thumb" src="${imgUrl(s.image)}" alt="" loading="lazy" />` : ""}
      <span class="card-meta">${tag}${panels} panel${panels === 1 ? "" : "s"}${
        s.status !== "posted" && s.date ? ` · ${esc(shortDate(s.date))}` : ""
      }</span>
    </button>`;
  }

  function renderBoard() {
    setNav("strips");
    const nums = liveNumbers();
    const byStatus = (st) =>
      plan.strips
        .filter((s) => s.status === st)
        .sort((a, b) =>
          st === "posted"
            ? (b.date || "").localeCompare(a.date || "")
            : (b.updated || "").localeCompare(a.updated || ""),
        );
    const live = nums.size;
    app.innerHTML = `<div class="wrap">
      <div class="page-head">
        <div>
          <h1>Strips</h1>
          <p class="hint">${plan.strips.length} total · ${live} live. Drag a card to another column to move it along.</p>
        </div>
        <button class="button button-primary" type="button" data-act="new-strip">+ New strip</button>
      </div>
      <div class="board">${STATUSES.map((st) => {
        const list = byStatus(st.id);
        return `<section class="col" data-col="${st.id}" aria-label="${st.label}">
          <h2 class="col-head">${st.label}<span class="count">${list.length}</span></h2>
          ${list.length ? list.map((s) => cardHtml(s, nums)).join("") : `<p class="col-empty">${st.id === "idea" ? "Nothing yet. Start one with + New strip." : "—"}</p>`}
        </section>`;
      }).join("")}</div>
    </div>`;
  }

  function newStrip(fields = {}) {
    const s = {
      id: newId(),
      title: "",
      status: "idea",
      date: "",
      note: "",
      alt: "",
      notes: "",
      panels: [blankPanel(), blankPanel(), blankPanel()],
      image: null,
      created: now(),
      updated: now(),
      ...fields,
    };
    plan.strips.push(s);
    touch();
    location.hash = `#strip/${s.id}`;
  }

  function setStatus(s, status) {
    s.status = status;
    if (status === "posted" && !s.date) s.date = today();
    s.updated = now();
    touch();
  }

  // Drag a card between columns.
  let dragId = null;
  app.addEventListener("dragstart", (e) => {
    const card = e.target.closest && e.target.closest("[data-card]");
    if (!card) return;
    dragId = card.dataset.card;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  app.addEventListener("dragend", () => {
    dragId = null;
    app.querySelectorAll(".dragging, .drag-over").forEach((el) => el.classList.remove("dragging", "drag-over"));
  });
  app.addEventListener("dragover", (e) => {
    const col = e.target.closest && e.target.closest("[data-col]");
    if (col && dragId) {
      e.preventDefault();
      app.querySelectorAll(".drag-over").forEach((el) => el !== col && el.classList.remove("drag-over"));
      col.classList.add("drag-over");
    }
  });
  app.addEventListener("drop", (e) => {
    const col = e.target.closest && e.target.closest("[data-col]");
    if (!col || !dragId) return;
    e.preventDefault();
    const s = findStrip(dragId);
    if (s && s.status !== col.dataset.col) {
      setStatus(s, col.dataset.col);
      rerender();
    }
  });

  // ---- Strip editor ---------------------------------------------------------

  function pubStatusHtml(s) {
    const ps = publishState(s);
    switch (ps.kind) {
      case "live":
        return `<span class="hl">Live as #${ps.n}</span> since ${esc(shortDate(s.date))}. <a href="../#/${ps.n}" target="_blank" rel="noopener">see it ↗</a>`;
      case "scheduled":
        return `Scheduled: goes up <span class="hl">${esc(shortDate(s.date))}</span>.`;
      case "noart":
        return `<span class="red-pen">Marked posted, but it needs the scan before readers can see it.</span>`;
      case "nodate":
        return `<span class="red-pen">Marked posted, but it needs a date.</span>`;
      default:
        return `Not posted. Readers can't see it.`;
    }
  }

  function panelHtml(p, i, count) {
    return `<div class="panel-box" data-panel="${esc(p.id)}">
      <header>
        <span class="sec-label">Panel ${i + 1}</span>
        <button class="icon-btn" type="button" data-act="panel-up" ${i === 0 ? "disabled" : ""} aria-label="Move panel up">↑</button>
        <button class="icon-btn" type="button" data-act="panel-down" ${i === count - 1 ? "disabled" : ""} aria-label="Move panel down">↓</button>
        <button class="icon-btn danger" type="button" data-act="panel-del" aria-label="Delete panel ${i + 1}">✕</button>
      </header>
      <label class="f-label" for="scene-${esc(p.id)}">What we see</label>
      <textarea class="f-area" id="scene-${esc(p.id)}" data-f="scene" rows="2" placeholder="Setting, who's there, what they're doing…">${esc(p.scene)}</textarea>
      <div class="lines">${p.lines
        .map(
          (l, li) => `<div class="line-row" data-line="${li}">
            <input class="f-input who" data-f="who" list="castNames" value="${esc(l.who)}" placeholder="Who" aria-label="Who's talking" />
            <input class="f-input" data-f="text" value="${esc(l.text)}" placeholder="What they say (Enter for another line)" aria-label="Dialogue" />
            <button class="icon-btn danger" type="button" data-act="line-del" aria-label="Delete line">✕</button>
          </div>`,
        )
        .join("")}</div>
      <button class="text-btn" type="button" data-act="line-add">+ line</button>
    </div>`;
  }

  function renderEditor(s) {
    setNav("strips");
    const ps = publishState(s);
    const canPost = !!s.image;
    app.innerHTML = `
      <div class="editor-top">
        <a class="button button-secondary" href="#strips">← Board</a>
        <div class="seg" role="group" aria-label="Stage">${STATUSES.map(
          (st) => `<button type="button" data-act="status" data-status="${st.id}" aria-pressed="${s.status === st.id}">${st.label}</button>`,
        ).join("")}</div>
        <span class="spacer"></span>
        <button class="button button-secondary" type="button" data-act="strip-del">Delete strip</button>
      </div>
      <article class="sheet wide" data-strip="${esc(s.id)}">
        <div class="school-head">
          ${ps.kind === "live" ? `<span>No. <b>${ps.n}</b></span>` : ""}
          <span>Started: <b>${esc(s.created ? new Date(s.created).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) : "today")}</b></span>
        </div>
        <input class="title-input" data-f="title" value="${esc(s.title)}" placeholder="Name this strip…" aria-label="Strip title" />
        <div class="editor-grid">
          <section aria-label="Script">
            <span class="sec-label">Script</span>
            ${s.panels.map((p, i) => panelHtml(p, i, s.panels.length)).join("")}
            <button class="add-panel" type="button" data-act="panel-add">+ add a panel</button>
          </section>
          <aside>
            <div class="side-box">
              <span class="sec-label">The art</span>
              ${
                s.image
                  ? `<div class="art-preview"><span class="tape tl"></span><span class="tape tr"></span><img src="${imgUrl(s.image)}" alt="The strip's scan" /></div>
                     <div class="row"><button class="text-btn" type="button" data-act="art-pick">replace scan</button>
                     <button class="text-btn" type="button" data-act="art-remove">remove</button>
                     <span class="pencil">${s.image.w}×${s.image.h}</span></div>`
                  : `<div class="drop" tabindex="0" role="button" data-act="art-pick" data-drop="art">
                       ${doodle("arrow", "", "transform:rotate(90deg)")}
                       <span>Drop the scan here<br />or tap to pick / take a photo</span>
                     </div>`
              }
              <p class="f-hint">Photos are resized to ${MAX_EDGE}px at most and re-saved in the browser, which also strips location data from phone pictures.</p>
              <p class="uploading" data-uploading hidden>uploading…</p>
            </div>

            <div class="side-box">
              <span class="sec-label">Posting</span>
              <p class="pub-status" data-pub>${pubStatusHtml(s)}</p>
              <div class="field">
                <label class="f-label" for="date-${esc(s.id)}">Date it goes up <em>(a future date schedules it)</em></label>
                <input class="f-input" id="date-${esc(s.id)}" type="date" data-f="date" value="${esc(s.date)}" />
              </div>
              ${
                s.status === "posted"
                  ? `<button class="button button-secondary" type="button" data-act="unpost">Take it down</button>`
                  : `<button class="button button-primary" type="button" data-act="post" ${canPost ? "" : "disabled"}>Post it!</button>
                     ${canPost ? "" : `<p class="f-hint">Add the scan first.</p>`}`
              }
            </div>

            <div class="side-box">
              <span class="sec-label">For readers</span>
              <div class="field">
                <label class="f-label" for="note-${esc(s.id)}">Note from the artist <em>(under the strip)</em></label>
                <textarea class="f-area" id="note-${esc(s.id)}" data-f="note" rows="2" placeholder="optional">${esc(s.note)}</textarea>
              </div>
              <div class="field">
                <label class="f-label" for="alt-${esc(s.id)}">Describe it <em>(for screen readers)</em></label>
                <textarea class="f-area" id="alt-${esc(s.id)}" data-f="alt" rows="2" placeholder="What happens in the strip, briefly">${esc(s.alt)}</textarea>
                <button class="text-btn" type="button" data-act="alt-from-script">fill in from the script</button>
              </div>
            </div>

            <div class="side-box">
              <span class="sec-label">Private notes</span>
              <textarea class="f-area" data-f="notes" rows="4" placeholder="Only you see these." aria-label="Private notes">${esc(s.notes)}</textarea>
            </div>
          </aside>
        </div>
      </article>`;
    document.title = `${s.title.trim() || "Untitled strip"} — Planner`;
  }

  function scriptAsText(s) {
    return s.panels
      .map((p, i) => {
        const lines = p.lines.filter((l) => l.text.trim()).map((l) => (l.who.trim() ? `${l.who.trim()}: ${l.text.trim()}` : l.text.trim()));
        const scene = p.scene.trim();
        const parts = [scene, ...lines].filter(Boolean);
        return parts.length ? `Panel ${i + 1}. ${parts.join(" ")}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  // ---- Cast -----------------------------------------------------------------

  function renderCast() {
    setNav("cast");
    document.title = "Cast — Planner";
    app.innerHTML = `<div class="wrap">
      <div class="page-head">
        <div>
          <h1>Cast</h1>
          <p class="hint">Characters marked "show on the site" appear on the Cast page with their picture, role and bio. Notes stay private.</p>
        </div>
        <button class="button button-primary" type="button" data-act="char-add">+ New character</button>
      </div>
      ${
        plan.cast.length
          ? `<div class="cast-edit">${plan.cast
              .map(
                (c) => `<div class="char-card" data-char="${esc(c.id)}">
                  <span class="tape top"></span>
                  <div class="portrait ${c.image ? "has-img" : ""}" tabindex="0" role="button" data-act="char-pic" data-drop="char"
                       aria-label="${c.image ? "Replace picture" : "Add a picture"}">
                    ${c.image ? `<img src="${imgUrl(c.image)}" alt="" />` : `<span>${doodle("person", "pencil", "position:static;width:44px;height:44px;display:block;margin:0 auto 4px")}drop a drawing here</span>`}
                  </div>
                  <input class="name-input" data-f="name" value="${esc(c.name)}" placeholder="Name" aria-label="Name" />
                  <div class="field">
                    <label class="f-label">Role</label>
                    <input class="f-input" data-f="role" value="${esc(c.role)}" placeholder="the new kid, the know-it-all…" />
                  </div>
                  <div class="field">
                    <label class="f-label">Bio <em>(public)</em></label>
                    <textarea class="f-area" data-f="bio" rows="2">${esc(c.bio)}</textarea>
                  </div>
                  <div class="field">
                    <label class="f-label">Notes <em>(private: look, voice, running gags)</em></label>
                    <textarea class="f-area" data-f="notes" rows="2">${esc(c.notes)}</textarea>
                  </div>
                  <div class="char-foot">
                    <label class="check-row"><input type="checkbox" data-f="public" ${c.public ? "checked" : ""} /> show on the site</label>
                    <span class="row">
                      ${c.image ? `<button class="text-btn" type="button" data-act="char-pic-remove">remove pic</button>` : ""}
                      <button class="icon-btn danger" type="button" data-act="char-del" aria-label="Delete ${esc(c.name || "character")}">✕</button>
                    </span>
                  </div>
                </div>`,
              )
              .join("")}</div>`
          : `<article class="sheet"><h2 class="marker-title small">nobody yet</h2><p>Add your first character with <span class="hl">+ New character</span>.</p>
             ${doodle("person", "pencil", "position:relative;display:block;width:70px;height:70px")}</article>`
      }
    </div>`;
  }

  // ---- Ideas ----------------------------------------------------------------

  function ideaHtml(i) {
    return `<li class="idea ${i.done ? "done" : ""}" data-idea="${esc(i.id)}">
      <input type="checkbox" data-f="done" ${i.done ? "checked" : ""} aria-label="Used it" />
      <textarea class="f-area" data-f="text" rows="1" aria-label="Idea">${esc(i.text)}</textarea>
      <span class="idea-acts">
        <button class="text-btn" type="button" data-act="idea-strip" title="Start a strip from this idea">→ strip</button>
        <button class="icon-btn danger" type="button" data-act="idea-del" aria-label="Delete idea">✕</button>
      </span>
    </li>`;
  }

  function renderIdeas() {
    setNav("ideas");
    document.title = "Ideas — Planner";
    const open = plan.ideas.filter((i) => !i.done).sort((a, b) => b.created.localeCompare(a.created));
    const done = plan.ideas.filter((i) => i.done).sort((a, b) => b.created.localeCompare(a.created));
    app.innerHTML = `<article class="sheet">
      <div class="school-head"><span>Ideas: <b>${open.length}</b></span></div>
      <h1 class="marker-title">Ideas &amp; gags</h1>
      <form class="jot" data-form="jot" autocomplete="off">
        <input class="f-input" name="jot" placeholder="jot it down before you forget…" aria-label="New idea" />
        <button class="button button-primary" type="submit">Add</button>
      </form>
      ${open.length ? `<ul class="idea-list">${open.map(ideaHtml).join("")}</ul>` : `<p class="pencil">Empty page. Every gag starts as a scribble.</p>`}
      ${done.length ? `<p class="done-head">already used:</p><ul class="idea-list">${done.map(ideaHtml).join("")}</ul>` : ""}
      ${window.Doodles.marginDoodles(5, 2)}
    </article>`;
  }

  // ---- Settings -------------------------------------------------------------

  function renderSettings() {
    setNav("settings");
    document.title = "Settings — Planner";
    const st = plan.settings;
    app.innerHTML = `<article class="sheet">
      <h1 class="marker-title">Settings</h1>
      <div class="field">
        <label class="f-label" for="set-title">Comic's name</label>
        <input class="f-input" id="set-title" data-setting="title" value="${esc(st.title)}" placeholder="Untitled Comic" />
      </div>
      <div class="field">
        <label class="f-label" for="set-tag">Tagline <em>(top of the site)</em></label>
        <input class="f-input" id="set-tag" data-setting="tagline" value="${esc(st.tagline)}" placeholder="a comic strip by Jared Luyster" />
      </div>
      <div class="field">
        <label class="f-label" for="set-about">About page <em>(blank line = new paragraph)</em></label>
        <textarea class="f-area" id="set-about" data-setting="about" rows="5">${esc(st.about)}</textarea>
      </div>
      <h2 class="marker-title small">Backup</h2>
      <p>Everything (strips, scripts, cast, ideas, notes) lives in one file. Download a copy now and then; the scans themselves stay on the server.</p>
      <div class="row">
        <button class="button button-secondary" type="button" data-act="export">Download backup</button>
        <button class="button button-secondary" type="button" data-act="import">Restore from backup…</button>
      </div>
      ${window.Doodles.marginDoodles(9, 2)}
    </article>`;
  }

  // ---- Images ---------------------------------------------------------------

  // Re-encodes in the browser: caps the size, applies the photo's rotation, and drops EXIF
  // (phone photos carry GPS). Line art stays PNG; photos of paper become JPEG.
  async function prepareImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const lossless = file.type === "image/png" || file.type === "image/gif";
    if (!lossless) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close && bitmap.close();
    const toBlob = (type, q) => new Promise((ok) => canvas.toBlob(ok, type, q));
    let type = lossless ? "image/png" : "image/jpeg";
    let blob = await toBlob(type, 0.92);
    if (blob && blob.size > 12 * 1024 * 1024) {
      type = "image/jpeg";
      blob = await toBlob(type, 0.85);
    }
    if (!blob) throw new Error("Couldn't read that image.");
    return { blob, type, w, h };
  }

  async function uploadImage(file) {
    const { blob, type, w, h } = await prepareImage(file);
    const id = newId();
    const res = await fetch(`${API}/img/${id}`, { method: "PUT", headers: { "Content-Type": type }, body: blob });
    if (!res.ok) throw new Error(res.status === 413 ? "That image is too big." : `Upload failed (HTTP ${res.status}).`);
    return { id, w, h };
  }

  let pickTarget = null; // { kind: "art", id } | { kind: "char", id }

  async function handleFile(target, file) {
    if (!file) return;
    const flag = app.querySelector("[data-uploading]");
    if (flag) flag.hidden = false;
    setPill("Uploading…", "busy");
    try {
      const img = await uploadImage(file);
      const owner = target.kind === "art" ? findStrip(target.id) : findChar(target.id);
      if (!owner) return;
      if (owner.image) orphanImages.add(owner.image.id);
      owner.image = img;
      if (target.kind === "art") owner.updated = now();
      touch();
      rerender();
    } catch (err) {
      console.error("planner: upload failed", err);
      setPill(dirty ? "Unsaved" : "Saved", dirty ? "busy" : "");
      alert(err.message || "Upload failed.");
    } finally {
      if (flag && flag.isConnected) flag.hidden = true;
    }
  }

  filePick.addEventListener("change", () => {
    const file = filePick.files && filePick.files[0];
    filePick.value = "";
    if (pickTarget) handleFile(pickTarget, file);
  });

  function pick(target) {
    pickTarget = target;
    filePick.click();
  }

  // Drop a file onto the art box or a character's portrait.
  app.addEventListener("dragover", (e) => {
    const zone = e.target.closest && e.target.closest("[data-drop]");
    if (zone && !dragId && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      zone.classList.add("over");
    }
  });
  app.addEventListener("dragleave", (e) => {
    const zone = e.target.closest && e.target.closest("[data-drop]");
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("over");
  });
  app.addEventListener("drop", (e) => {
    const zone = e.target.closest && e.target.closest("[data-drop]");
    if (!zone || dragId) return;
    e.preventDefault();
    zone.classList.remove("over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (zone.dataset.drop === "art") handleFile({ kind: "art", id: zone.closest("[data-strip]").dataset.strip }, file);
    else handleFile({ kind: "char", id: zone.closest("[data-char]").dataset.char }, file);
  });

  // ---- Editing: inputs ------------------------------------------------------

  function onField(el) {
    const f = el.dataset.f;
    const setting = el.dataset.setting;
    const value = el.type === "checkbox" ? el.checked : el.value;

    if (setting) {
      plan.settings[setting] = value;
      if (setting === "title") document.getElementById("comicName").textContent = value.trim() || "Untitled Comic";
      return touch();
    }
    if (!f) return;

    const stripEl = el.closest("[data-strip]");
    if (stripEl) {
      const s = findStrip(stripEl.dataset.strip);
      if (!s) return;
      const panelEl = el.closest("[data-panel]");
      if (panelEl) {
        const p = s.panels.find((x) => x.id === panelEl.dataset.panel);
        if (!p) return;
        const lineEl = el.closest("[data-line]");
        if (lineEl) p.lines[Number(lineEl.dataset.line)][f] = value;
        else p[f] = value;
      } else {
        s[f] = value;
        if (f === "date") {
          const pub = app.querySelector("[data-pub]");
          if (pub) pub.innerHTML = pubStatusHtml(s);
        }
        if (f === "title") document.title = `${value.trim() || "Untitled strip"} — Planner`;
      }
      s.updated = now();
      return touch();
    }

    const charEl = el.closest("[data-char]");
    if (charEl) {
      const c = findChar(charEl.dataset.char);
      if (!c) return;
      c[f] = value;
      if (f === "name") refreshCastNames();
      return touch();
    }

    const ideaEl = el.closest("[data-idea]");
    if (ideaEl) {
      const i = findIdea(ideaEl.dataset.idea);
      if (!i) return;
      i[f] = value;
      touch();
      if (f === "done") rerender();
    }
  }

  app.addEventListener("input", (e) => {
    if (e.target.matches("textarea")) autosize(e.target);
    if (e.target.type !== "checkbox" && e.target.type !== "date") onField(e.target);
  });
  app.addEventListener("change", (e) => {
    if (e.target.type === "checkbox" || e.target.type === "date") onField(e.target);
  });

  // Enter in a dialogue box starts the next line of dialogue.
  app.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const el = e.target;
    if (el.dataset && el.dataset.f === "text" && el.closest("[data-line]")) {
      e.preventDefault();
      const s = findStrip(el.closest("[data-strip]").dataset.strip);
      const p = s.panels.find((x) => x.id === el.closest("[data-panel]").dataset.panel);
      const at = Number(el.closest("[data-line]").dataset.line);
      p.lines.splice(at + 1, 0, { who: "", text: "" });
      touch();
      rerender();
      const next = app.querySelector(`[data-panel="${CSS.escape(p.id)}"] [data-line="${at + 1}"] [data-f="who"]`);
      if (next) next.focus();
    }
    if (e.target.matches && e.target.matches("[data-act]") && e.target.getAttribute("role") === "button") {
      e.preventDefault();
      e.target.click();
    }
  });

  app.addEventListener("submit", (e) => {
    if (e.target.dataset.form !== "jot") return;
    e.preventDefault();
    const input = e.target.elements.jot;
    const text = input.value.trim();
    if (!text) return;
    plan.ideas.push({ id: newId(), text, done: false, created: now() });
    touch();
    rerender();
    const again = app.querySelector('[name="jot"]');
    if (again) again.focus();
  });

  // ---- Editing: actions -----------------------------------------------------

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn) {
      const act = btn.dataset.act;
      if (actions[act]) actions[act](btn, e);
      return;
    }
    const card = e.target.closest("[data-card]");
    if (card) location.hash = `#strip/${card.dataset.card}`;
  });

  const stripOf = (btn) => findStrip(btn.closest("[data-strip]")?.dataset.strip || location.hash.split("/")[1]);
  const panelOf = (btn, s) => s.panels.findIndex((p) => p.id === btn.closest("[data-panel]").dataset.panel);

  const actions = {
    "new-strip": () => newStrip(),

    status(btn) {
      const s = stripOf(btn);
      setStatus(s, btn.dataset.status);
      rerender();
    },
    post(btn) {
      const s = stripOf(btn);
      if (!s.image) return;
      if (!s.date || s.date < today()) s.date = today();
      setStatus(s, "posted");
      rerender();
    },
    unpost(btn) {
      const s = stripOf(btn);
      setStatus(s, "inks");
      rerender();
    },
    "strip-del"(btn) {
      const s = stripOf(btn);
      if (!confirm(`Delete "${s.title.trim() || "this untitled strip"}"? Its script, notes and scan go too.`)) return;
      if (s.image) orphanImages.add(s.image.id);
      plan.strips = plan.strips.filter((x) => x !== s);
      touch();
      location.hash = "#strips";
    },

    "panel-add"(btn) {
      const s = stripOf(btn);
      s.panels.push(blankPanel());
      s.updated = now();
      touch();
      rerender();
      const boxes = app.querySelectorAll(".panel-box textarea");
      if (boxes.length) boxes[boxes.length - 1].focus();
    },
    "panel-del"(btn) {
      const s = stripOf(btn);
      const i = panelOf(btn, s);
      const p = s.panels[i];
      const hasWords = p.scene.trim() || p.lines.some((l) => l.text.trim());
      if (hasWords && !confirm(`Delete panel ${i + 1}?`)) return;
      s.panels.splice(i, 1);
      s.updated = now();
      touch();
      rerender();
    },
    "panel-up"(btn) {
      const s = stripOf(btn);
      const i = panelOf(btn, s);
      if (i > 0) [s.panels[i - 1], s.panels[i]] = [s.panels[i], s.panels[i - 1]];
      touch();
      rerender();
    },
    "panel-down"(btn) {
      const s = stripOf(btn);
      const i = panelOf(btn, s);
      if (i < s.panels.length - 1) [s.panels[i + 1], s.panels[i]] = [s.panels[i], s.panels[i + 1]];
      touch();
      rerender();
    },
    "line-add"(btn) {
      const s = stripOf(btn);
      const p = s.panels[panelOf(btn, s)];
      p.lines.push({ who: "", text: "" });
      touch();
      rerender();
      const rows = app.querySelectorAll(`[data-panel="${CSS.escape(p.id)}"] [data-f="who"]`);
      if (rows.length) rows[rows.length - 1].focus();
    },
    "line-del"(btn) {
      const s = stripOf(btn);
      const p = s.panels[panelOf(btn, s)];
      p.lines.splice(Number(btn.closest("[data-line]").dataset.line), 1);
      touch();
      rerender();
    },
    "alt-from-script"(btn) {
      const s = stripOf(btn);
      const text = scriptAsText(s);
      if (!text) return alert("The script is empty, so there's nothing to fill in yet.");
      if (s.alt.trim() && !confirm("Replace the current description with one built from the script?")) return;
      s.alt = text;
      touch();
      rerender();
    },

    "art-pick"(btn) {
      pick({ kind: "art", id: stripOf(btn).id });
    },
    "art-remove"(btn) {
      const s = stripOf(btn);
      if (!confirm("Remove the scan from this strip?")) return;
      orphanImages.add(s.image.id);
      s.image = null;
      s.updated = now();
      touch();
      rerender();
    },

    "char-add"() {
      plan.cast.push({ id: newId(), name: "", role: "", bio: "", notes: "", public: false, image: null });
      touch();
      rerender();
      const names = app.querySelectorAll(".name-input");
      if (names.length) names[names.length - 1].focus();
    },
    "char-del"(btn) {
      const c = findChar(btn.closest("[data-char]").dataset.char);
      if (!confirm(`Delete ${c.name.trim() || "this character"}?`)) return;
      if (c.image) orphanImages.add(c.image.id);
      plan.cast = plan.cast.filter((x) => x !== c);
      refreshCastNames();
      touch();
      rerender();
    },
    "char-pic"(btn) {
      pick({ kind: "char", id: btn.closest("[data-char]").dataset.char });
    },
    "char-pic-remove"(btn) {
      const c = findChar(btn.closest("[data-char]").dataset.char);
      orphanImages.add(c.image.id);
      c.image = null;
      touch();
      rerender();
    },

    "idea-del"(btn) {
      const id = btn.closest("[data-idea]").dataset.idea;
      plan.ideas = plan.ideas.filter((i) => i.id !== id);
      touch();
      rerender();
    },
    "idea-strip"(btn) {
      const idea = findIdea(btn.closest("[data-idea]").dataset.idea);
      idea.done = true;
      const firstLine = idea.text.split("\n")[0].slice(0, 80);
      newStrip({ title: firstLine, notes: idea.text });
    },

    export() {
      const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `comic-plan-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    import() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        let data;
        try {
          data = JSON.parse(await file.text());
        } catch {
          return alert("That file isn't a planner backup.");
        }
        if (!data || !Array.isArray(data.strips) || !data.settings) return alert("That file isn't a planner backup.");
        if (!confirm(`Replace everything in the planner with this backup (${data.strips.length} strips)? This can't be undone.`)) return;
        plan = { version: 1, settings: data.settings, strips: data.strips, cast: data.cast || [], ideas: data.ideas || [] };
        refreshCastNames();
        touch();
        rerender();
      });
      input.click();
    },

    "retry-save"() {
      hideBanner();
      save();
    },
    async "take-theirs"() {
      conflicted = false;
      dirty = false;
      hideBanner();
      try {
        localStorage.removeItem(BACKUP_KEY);
      } catch {}
      setPill("Loading", "busy");
      await load();
    },
    async "keep-mine"() {
      const res = await fetch(`${API}/plan`, { method: "HEAD" }).catch(() => null);
      if (!res || !res.ok) return alert("Couldn't reach the server. Try again in a moment.");
      etag = res.headers.get("ETag") || etag;
      conflicted = false;
      hideBanner();
      dirty = true;
      save();
    },
    "restore-backup"() {
      try {
        const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null");
        if (backup) plan = backup;
      } catch {}
      hideBanner();
      refreshCastNames();
      touch();
      rerender();
    },
    "drop-backup"() {
      try {
        localStorage.removeItem(BACKUP_KEY);
      } catch {}
      hideBanner();
    },
  };

  load();
})();
