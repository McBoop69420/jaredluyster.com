/* QR Code Maker UI: form -> payload (payload.js) -> matrix + SVG (code.js) -> preview,
 * PNG/SVG download, print sheet, and a per-browser "Recent" list. Everything happens in
 * the page; nothing is sent anywhere — center logos included. */
(function () {
  const $ = (id) => document.getElementById(id);
  const TYPE_LABELS = { url: "Link", text: "Text", wifi: "Wi-Fi", contact: "Contact", email: "Email", phone: "Phone", sms: "SMS" };
  const RECENT_KEY = "qr.recent.v1";
  const DRAFT_KEY = "qr.draft.v1";
  // Logo images, keyed by content hash, so the same logo on many Recent codes is stored once.
  const LOGOS_KEY = "qr.logos.v1";
  const RECENT_MAX = 12;
  const LOGO_MAX_PX = 512;
  // A module this wide or wider scans comfortably from a phone at arm's length.
  const MIN_MODULE_IN = 0.5 / 25.4;
  // Printable area at 0.5in margins.
  const PAPER = { letter: { w: 7.5, h: 10 }, A4: { w: 7.27, h: 10.69 } };
  const GAP_IN = 0.25;

  const form = $("fields");
  const tabs = [...document.querySelectorAll(".type-tabs [data-type]")];
  const segs = [...document.querySelectorAll(".seg [data-center]")];
  const preview = $("preview");

  let type = "url";
  let current = null; // { payload, matrix, opts } for the code on screen, or null
  // What goes in the middle. logoId points into `logos`; the image itself never leaves the browser.
  const center = { kind: "none", logoId: null, text: "", size: 0.22, shape: "square", plate: "#ffffff", textColor: "#000000" };
  let userEcc = "M"; // the ECC picked by hand, restored when the logo comes off

  // ---- storage (a convenience only — the page works the same without it) -------------

  const store = {
    get(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        return v == null ? fallback : v;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };

  const logos = store.get(LOGOS_KEY, {});

  // Keep only the logos something still points at. If that's still over the browser's
  // storage quota, the oldest Recent entries go first; failing that, the logo simply lasts
  // for this visit.
  function saveLogos() {
    let recent = store.get(RECENT_KEY, []);
    for (;;) {
      const keep = {};
      [center, ...recent.map((e) => e.center || {})].forEach((c) => {
        if (c.logoId && logos[c.logoId]) keep[c.logoId] = logos[c.logoId];
      });
      if (store.set(LOGOS_KEY, keep) || recent.length === 0) break;
      recent = recent.slice(0, -1);
      store.set(RECENT_KEY, recent);
    }
  }

  function hashId(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return `l${(h >>> 0).toString(36)}${s.length.toString(36)}`;
  }

  // ---- reading / writing the form -----------------------------------------------------

  function fieldsOf(t) {
    const out = {};
    form.querySelectorAll(`fieldset[data-type="${t}"] [name]`).forEach((el) => {
      out[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }

  function fillFields(t, values) {
    form.querySelectorAll(`fieldset[data-type="${t}"] [name]`).forEach((el) => {
      if (!(el.name in values)) return;
      if (el.type === "checkbox") el.checked = !!values[el.name];
      else el.value = values[el.name];
    });
  }

  // The style as the user set it (their own ECC, even while a logo forces High).
  function styleState() {
    return {
      ecc: center.kind === "none" ? $("ecc").value : userEcc,
      margin: Number($("margin").value),
      dark: $("dark").value,
      light: $("light").value,
      caption: $("caption").value.trim(),
    };
  }

  function setStyle(o) {
    if (o.ecc) { $("ecc").value = o.ecc; userEcc = o.ecc; }
    if (o.margin != null) $("margin").value = String(o.margin);
    if (o.dark) $("dark").value = o.dark;
    if (o.light) $("light").value = o.light;
    $("caption").value = o.caption || "";
  }

  function setCenter(c) {
    Object.assign(center, { kind: "none", logoId: null, text: "" }, c || {});
    if (center.logoId && !logos[center.logoId]) center.logoId = null;
    syncCenterUI();
  }

  // A center config + stored logos -> what code.js draws, or null when there's nothing to draw yet.
  function resolveCenter(c) {
    if (!c || c.kind === "none") return null;
    const base = { size: c.size, shape: c.shape, plate: c.plate, textColor: c.textColor };
    if (c.kind === "image") return c.logoId && logos[c.logoId] ? { ...base, kind: "image", src: logos[c.logoId] } : null;
    if (c.kind === "text") return String(c.text || "").trim() ? { ...base, kind: "text", text: c.text } : null;
    return null;
  }

  // Any logo means High error correction: the covered modules have to be rebuilt.
  function buildOpts(style, c) {
    const on = !!c && c.kind !== "none";
    return { ...style, ecc: on ? "H" : style.ecc, center: resolveCenter(c) };
  }

  function encodeFor(payload, opts) {
    return QRCode.encode(payload, opts.ecc, opts.center ? QRCode.CENTER_MIN_VERSION : 0);
  }

  function setType(t) {
    if (!TYPE_LABELS[t]) return;
    type = t;
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.type === t)));
    form.querySelectorAll("fieldset").forEach((fs) => { fs.hidden = fs.dataset.type !== t; });
    if (t !== "url") showTypes(true);
  }

  // Links are the everyday case, so the other types stay tucked away until asked for (or
  // until a draft or Recent code of another type is loaded).
  function showTypes(open) {
    $("typeTabs").hidden = !open;
    const btn = $("moreTypes");
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Just a link" : "Other kinds of code — Wi-Fi, contact card, text, email…";
  }

  $("moreTypes").addEventListener("click", () => {
    if ($("typeTabs").hidden) { showTypes(true); return; }
    showTypes(false);
    if (type !== "url") { setType("url"); update(); }
  });

  // ---- center logo controls -----------------------------------------------------------

  function syncCenterUI() {
    const k = center.kind;
    segs.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.center === k)));
    $("centerImageRow").hidden = k !== "image";
    $("centerTextRow").hidden = k !== "text";
    $("centerOptions").hidden = k === "none";
    $("centerTextColorField").hidden = k !== "text";
    const hasLogo = !!(center.logoId && logos[center.logoId]);
    $("centerRemove").hidden = !hasLogo;
    $("centerFileLabel").textContent = hasLogo ? "Change image" : "Choose image";
    $("centerText").value = center.text;
    $("centerSize").value = String(Math.round(center.size * 100));
    $("centerSizeOut").textContent = `${Math.round(center.size * 100)}% of the code`;
    $("centerShape").value = center.shape;
    $("centerPlate").value = center.plate;
    $("centerTextColor").value = center.textColor;

    const ecc = $("ecc");
    if (k !== "none" && !ecc.disabled) {
      userEcc = ecc.value;
      ecc.value = "H";
      ecc.disabled = true;
    } else if (k === "none" && ecc.disabled) {
      ecc.disabled = false;
      ecc.value = userEcc;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("unreadable image"));
      img.src = src;
    });
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  // Bounding box of the visibly non-transparent pixels, or null if there's nothing to trim.
  function opaqueBounds(ctx, w, h) {
    const a = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (a[(y * w + x) * 4 + 3] < 8) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Small SVGs stay vector (crisp at any print size); everything else has its transparent
  // margin trimmed (so the logo fills the space it's given) and is scaled to at most 512px —
  // plenty for a logo printed a couple of inches wide — so storage stays small.
  async function logoDataUrl(file) {
    if (file.type === "image/svg+xml" && file.size <= 300 * 1024) {
      const src = await readDataUrl(file);
      await loadImage(src); // reject anything the browser can't render
      return src;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const w0 = img.naturalWidth || LOGO_MAX_PX;
      const h0 = img.naturalHeight || LOGO_MAX_PX;
      const pre = Math.min(1, 1024 / Math.max(w0, h0));
      const full = document.createElement("canvas");
      full.width = Math.max(1, Math.round(w0 * pre));
      full.height = Math.max(1, Math.round(h0 * pre));
      const fctx = full.getContext("2d");
      fctx.drawImage(img, 0, 0, full.width, full.height);
      const crop = (file.type !== "image/jpeg" && opaqueBounds(fctx, full.width, full.height)) ||
        { x: 0, y: 0, w: full.width, h: full.height };
      const scale = Math.min(1, LOGO_MAX_PX / Math.max(crop.w, crop.h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(crop.w * scale));
      canvas.height = Math.max(1, Math.round(crop.h * scale));
      canvas.getContext("2d").drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      // Photos stay JPEG (no transparency to keep, much smaller); the rest keep their alpha.
      return file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  $("centerFile").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    const label = $("centerFileLabel");
    if (file.size > 20 * 1024 * 1024) { label.textContent = "Too big (20 MB max)"; return; }
    label.textContent = "Loading…";
    try {
      const src = await logoDataUrl(file);
      const id = hashId(src);
      logos[id] = src;
      center.logoId = id;
      saveLogos();
    } catch {
      label.textContent = "Couldn't read that image";
      return;
    }
    syncCenterUI();
    update();
  });

  $("centerRemove").addEventListener("click", () => {
    center.logoId = null;
    saveLogos();
    syncCenterUI();
    update();
  });

  segs.forEach((b) => b.addEventListener("click", () => {
    center.kind = b.dataset.center;
    syncCenterUI();
    update();
  }));

  $("centerText").addEventListener("input", (e) => { center.text = e.target.value; update(); });
  $("centerSize").addEventListener("input", (e) => {
    center.size = Number(e.target.value) / 100;
    $("centerSizeOut").textContent = `${e.target.value}% of the code`;
    update();
  });
  $("centerShape").addEventListener("change", (e) => { center.shape = e.target.value; update(); });
  $("centerPlate").addEventListener("input", (e) => { center.plate = e.target.value; update(); });
  $("centerTextColor").addEventListener("input", (e) => { center.textColor = e.target.value; update(); });

  // ---- color checks -------------------------------------------------------------------

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  function colorWarning(dark, light) {
    const ld = luminance(dark), ll = luminance(light);
    if (ld >= ll) return "The code is lighter than its background. Many phone cameras can't read inverted codes — keep the code dark and the background light.";
    const ratio = (ll + 0.05) / (ld + 0.05);
    if (ratio < 4) return `Low contrast (${ratio.toFixed(1)}:1). Scanners want a strong difference — aim for 4:1 or more, ideally near black on white.`;
    return "";
  }

  // ---- render -------------------------------------------------------------------------

  const fmtIn = (n) => `${Math.round(n * 100) / 100} in`;

  function minPrintIn(m, margin) {
    return (m.size + margin * 2) * MIN_MODULE_IN;
  }

  function update() {
    const payload = QRPayload.build(type, fieldsOf(type));
    const style = styleState();
    const opts = buildOpts(style, center);
    const warn = colorWarning(opts.dark, opts.light);
    $("colorWarn").textContent = warn;
    $("colorWarn").hidden = !warn;
    $("encoded").textContent = payload;
    $("error").hidden = true;

    let matrix = null;
    if (payload) {
      try {
        matrix = encodeFor(payload, opts);
      } catch (err) {
        $("error").textContent = err.message === "too-long"
          ? `Too much to fit in one QR code (${QRPayload.byteLength(payload).toLocaleString()} bytes). Shorten it${opts.center ? ", or take the logo off (it needs High error correction)" : ", or lower the error correction"}.`
          : `Couldn't make this code: ${err.message}`;
        $("error").hidden = false;
      }
    }

    current = matrix ? { payload, matrix, opts } : null;
    ["downloadPng", "downloadSvg", "copyPng", "print"].forEach((id) => { $(id).disabled = !current; });
    $("empty").hidden = !!payload;

    if (current) {
      preview.innerHTML = QRCode.toSvg(matrix, { ...opts, title: summary(type, fieldsOf(type)) });
      preview.classList.remove("is-empty");
      const bytes = QRPayload.byteLength(payload);
      $("stats").textContent =
        `Version ${matrix.version} · ${matrix.size}×${matrix.size} modules · ${bytes.toLocaleString()} byte${bytes === 1 ? "" : "s"} · ` +
        `${opts.ecc === "H" && center.kind !== "none" ? "High error correction for the logo · " : ""}` +
        `prints reliably at ${fmtIn(Math.max(0.75, minPrintIn(matrix, opts.margin)))} or larger`;
    } else {
      // Keep a faint placeholder code so the card doesn't collapse while empty.
      preview.innerHTML = QRCode.toSvg(QRCode.encode("https://jaredluyster.com", "M"), {});
      preview.classList.add("is-empty");
      $("stats").textContent = "";
    }
    updatePrintNote();
    scheduleCheck();
    schedulePrintSheet();
    store.set(DRAFT_KEY, { type, fields: { [type]: fieldsOf(type) }, style, center: { ...center }, print: printOpts() });
  }

  // ---- scan check ---------------------------------------------------------------------
  // Decodes the finished code (logo, colors and all) with an independent reader, so a logo
  // that's too big or a bad color pair shows up here rather than on a printed sheet.

  let jsqrLoading = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (!jsqrLoading) {
      jsqrLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "vendor/jsQR.js";
        s.onload = resolve;
        s.onerror = () => { jsqrLoading = null; reject(new Error("decoder failed to load")); };
        document.head.appendChild(s);
      });
    }
    return jsqrLoading;
  }

  async function rasterize(matrix, opts, pxPerModule) {
    const { side } = QRCode.dimensions(matrix, opts);
    const svg = QRCode.toSvg(matrix, { ...opts, width: side * pxPerModule });
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  let checkSeq = 0;
  let checkTimer = null;
  function scheduleCheck() {
    clearTimeout(checkTimer);
    const el = $("scanCheck");
    if (!current) { el.hidden = true; return; }
    const seq = ++checkSeq;
    const snap = current;
    if (el.hidden) { el.textContent = "Checking that it scans…"; el.hidden = false; }
    el.className = "scan-check pending";
    checkTimer = setTimeout(async () => {
      try {
        await loadJsQR();
        const canvas = await rasterize(snap.matrix, snap.opts, 4);
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        // dontInvert: plenty of phone cameras can't read light-on-dark either.
        const res = window.jsQR(data.data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (seq !== checkSeq) return;
        const ok = !!res && res.data === snap.payload;
        el.className = `scan-check ${ok ? "ok" : "bad"}`;
        el.textContent = ok
          ? `✓ Scan check passed — it reads back as exactly this content${snap.opts.center ? ", logo and all" : ""}.`
          : snap.opts.center
            ? "✗ Doesn't scan with this logo. Make it smaller, or check the code and background colors."
            : "✗ Doesn't scan. Check the code and background colors.";
      } catch {
        if (seq === checkSeq) el.hidden = true; // couldn't run the check — say nothing rather than guess
      }
    }, 180);
  }

  // ---- naming -------------------------------------------------------------------------

  function summary(t, f) {
    const pick = {
      url: () => f.url,
      text: () => f.text,
      wifi: () => f.ssid,
      contact: () => [f.first, f.last].filter(Boolean).join(" ") || f.org,
      email: () => f.to,
      phone: () => f.number,
      sms: () => f.number,
    }[t];
    const s = String((pick && pick()) || "").replace(/\s+/g, " ").trim();
    return s.length > 60 ? `${s.slice(0, 59)}…` : s;
  }

  function fileName(ext) {
    const base = summary(type, fieldsOf(type))
      .replace(/^https?:\/\//i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .toLowerCase();
    return `qr-${base || type}.${ext}`;
  }

  // ---- export -------------------------------------------------------------------------

  function svgMarkup() {
    return QRCode.toSvg(current.matrix, { ...current.opts, title: summary(type, fieldsOf(type)) });
  }

  // PNG at a whole number of pixels per module (no blurry edges), at least ~2000px wide.
  async function pngBlob() {
    const { matrix, opts } = current;
    const { side } = QRCode.dimensions(matrix, opts);
    const canvas = await rasterize(matrix, opts, Math.max(8, Math.ceil(2000 / side)));
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
    });
  }

  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function flash(btn, text) {
    const original = btn.dataset.label || (btn.dataset.label = btn.textContent);
    btn.textContent = text;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = original; }, 1400);
  }

  $("downloadSvg").addEventListener("click", () => {
    if (!current) return;
    save(new Blob([svgMarkup()], { type: "image/svg+xml" }), fileName("svg"));
    remember();
  });

  $("downloadPng").addEventListener("click", async () => {
    if (!current) return;
    try {
      save(await pngBlob(), fileName("png"));
      remember();
    } catch {
      flash($("downloadPng"), "Failed — try SVG");
    }
  });

  if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
    $("copyPng").hidden = false;
    $("copyPng").addEventListener("click", async () => {
      if (!current) return;
      try {
        // Safari wants the promise handed to ClipboardItem directly, inside the gesture.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob() })]);
        flash($("copyPng"), "Copied");
        remember();
      } catch {
        flash($("copyPng"), "Blocked");
      }
    });
  }

  // ---- print --------------------------------------------------------------------------

  function printOpts() {
    return { size: Number($("printSize").value), copies: $("copies").value, paper: $("paper").value };
  }

  function layout() {
    const { size, copies, paper } = printOpts();
    const area = PAPER[paper] || PAPER.letter;
    const { matrix, opts } = current;
    // The caption band makes each tile taller than it is wide.
    const { side, height } = QRCode.dimensions(matrix, opts);
    const w = Math.min(size, area.w);
    const h = (w * height) / side;
    if (copies !== "fill") return { w, count: 1, area };
    const cols = Math.max(1, Math.floor((area.w + GAP_IN) / (w + GAP_IN)));
    const rows = Math.max(1, Math.floor((area.h + GAP_IN) / (h + GAP_IN)));
    return { w, count: cols * rows, area };
  }

  function updatePrintNote() {
    const note = $("printNote");
    if (!current) { note.textContent = ""; return; }
    const { w, count } = layout();
    const min = minPrintIn(current.matrix, current.opts.margin);
    let text = count > 1 ? `${count} copies on one page, with dashed cut lines.` : "One code, centered at the top of the page.";
    if (w < min) text += ` This code is dense — it may not scan below ${fmtIn(min)}. Pick a bigger size or shorten the content.`;
    else text += " Set your printer to 100% / actual size, not fit-to-page.";
    note.textContent = text;
  }

  // Every tile is an <img> of one shared SVG blob, so a logo is embedded once rather than
  // once per copy. The sheet is kept built (and its images loaded) ahead of time, so Ctrl+P
  // prints the same thing the Print button does.
  let printUrl = null;
  let printKey = "";
  let printTimer = null;

  function buildPrintSheet() {
    const sheet = $("printSheet");
    if (!current) { sheet.innerHTML = ""; printKey = ""; return; }
    const { w, count } = layout();
    const { paper } = printOpts();
    const svg = svgMarkup();
    const key = `${w}|${count}|${paper}|${svg}`;
    if (key === printKey) return;
    printKey = key;
    if (printUrl) URL.revokeObjectURL(printUrl);
    printUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    sheet.innerHTML = `<div class="print-tile" style="width:${w}in"><img src="${printUrl}" alt=""></div>`.repeat(count);
    sheet.classList.toggle("tiled", count > 1);
    let page = document.getElementById("pageRule");
    if (!page) {
      page = document.createElement("style");
      page.id = "pageRule";
      document.head.appendChild(page);
    }
    page.textContent = `@page { size: ${paper === "A4" ? "A4" : "letter"} portrait; margin: 0.5in; }`;
  }

  function schedulePrintSheet() {
    clearTimeout(printTimer);
    printTimer = setTimeout(buildPrintSheet, 300);
  }

  $("print").addEventListener("click", async () => {
    if (!current) return;
    clearTimeout(printTimer);
    buildPrintSheet();
    await Promise.all([...$("printSheet").querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
    remember();
    window.print();
  });
  window.addEventListener("beforeprint", () => { clearTimeout(printTimer); buildPrintSheet(); });

  // ---- recent -------------------------------------------------------------------------

  function remember() {
    if (!current) return;
    const entry = {
      type, fields: fieldsOf(type), style: styleState(), center: { ...center },
      payload: current.payload, at: Date.now(),
    };
    const same = (e) => e.type === entry.type && e.payload === entry.payload &&
      JSON.stringify([e.style, e.center]) === JSON.stringify([entry.style, entry.center]);
    const list = store.get(RECENT_KEY, []).filter((e) => !same(e));
    list.unshift(entry);
    store.set(RECENT_KEY, list.slice(0, RECENT_MAX));
    saveLogos();
    renderRecent();
  }

  function renderRecent() {
    const list = store.get(RECENT_KEY, []);
    const ul = $("recentList");
    ul.innerHTML = "";
    $("recentSection").hidden = list.length === 0;
    list.forEach((e, i) => {
      let thumb = "";
      try {
        const opts = buildOpts({ ...e.style, caption: "" }, e.center);
        thumb = QRCode.toSvg(encodeFor(e.payload, opts), opts);
      } catch { return; }
      const li = document.createElement("li");
      li.className = "recent-item";

      const open = document.createElement("button");
      open.type = "button";
      open.className = "recent-open";
      open.title = "Load this code";
      const box = document.createElement("div");
      box.className = "recent-thumb";
      box.innerHTML = thumb;
      const label = document.createElement("span");
      label.className = "recent-label";
      const kind = document.createElement("span");
      kind.className = "recent-type";
      kind.textContent = TYPE_LABELS[e.type] || e.type;
      const badge = e.center && e.center.kind === "text" ? e.center.text : "";
      label.append(kind, document.createTextNode(e.style.caption || badge || summary(e.type, e.fields) || "—"));
      open.append(box, label);
      open.addEventListener("click", () => {
        setType(e.type);
        fillFields(e.type, e.fields);
        setCenter({ kind: "none" }); // unlock ECC first so setStyle's value sticks as the user's own
        setStyle(e.style);
        setCenter(e.center);
        update();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "recent-remove";
      remove.setAttribute("aria-label", "Remove from recent");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        const next = store.get(RECENT_KEY, []);
        next.splice(i, 1);
        store.set(RECENT_KEY, next);
        saveLogos();
        renderRecent();
      });

      li.append(open, remove);
      ul.appendChild(li);
    });
  }

  // ---- wiring -------------------------------------------------------------------------

  tabs.forEach((b) => b.addEventListener("click", () => { setType(b.dataset.type); update(); }));
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  ["caption", "margin", "dark", "light"].forEach((id) => $(id).addEventListener("input", update));
  $("ecc").addEventListener("input", (e) => { userEcc = e.target.value; update(); });
  ["printSize", "copies", "paper"].forEach((id) => $(id).addEventListener("change", () => {
    updatePrintNote();
    schedulePrintSheet();
    store.set(DRAFT_KEY, { ...store.get(DRAFT_KEY, {}), print: printOpts() });
  }));
  $("resetColors").addEventListener("click", () => {
    $("dark").value = "#000000";
    $("light").value = "#ffffff";
    update();
  });

  // Restore the last draft so a reload doesn't lose what was typed.
  const draft = store.get(DRAFT_KEY, null);
  if (draft && TYPE_LABELS[draft.type]) {
    setType(draft.type);
    if (draft.fields && draft.fields[draft.type]) fillFields(draft.type, draft.fields[draft.type]);
    if (draft.style) setStyle(draft.style);
    if (draft.print) {
      if (draft.print.size) $("printSize").value = String(draft.print.size);
      if (draft.print.copies) $("copies").value = draft.print.copies;
      if (draft.print.paper) $("paper").value = draft.print.paper;
    }
    setCenter(draft.center);
  } else {
    syncCenterUI();
  }
  update();
  renderRecent();
})();
