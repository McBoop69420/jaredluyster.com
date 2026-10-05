/* QR Code Maker UI: form -> payload (payload.js) -> matrix + SVG (code.js) -> preview,
 * PNG/SVG download, print sheet, and a per-browser "Recent" list. Everything happens in
 * the page; nothing is sent anywhere. */
(function () {
  const $ = (id) => document.getElementById(id);
  const TYPE_LABELS = { url: "Link", text: "Text", wifi: "Wi-Fi", contact: "Contact", email: "Email", phone: "Phone", sms: "SMS" };
  const RECENT_KEY = "qr.recent.v1";
  const DRAFT_KEY = "qr.draft.v1";
  const RECENT_MAX = 12;
  // A module this wide or wider scans comfortably from a phone at arm's length.
  const MIN_MODULE_IN = 0.5 / 25.4;
  // Printable area at 0.5in margins.
  const PAPER = { letter: { w: 7.5, h: 10 }, A4: { w: 7.27, h: 10.69 } };
  const GAP_IN = 0.25;

  const form = $("fields");
  const tabs = [...document.querySelectorAll(".type-tabs [data-type]")];
  const preview = $("preview");

  let type = "url";
  let current = null; // { payload, matrix, opts } for the code on screen, or null

  // ---- storage (a convenience only — the page works the same without it) -------------

  const store = {
    get(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        return v == null ? fallback : v;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
  };

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

  function styleOpts() {
    return {
      ecc: $("ecc").value,
      margin: Number($("margin").value),
      dark: $("dark").value,
      light: $("light").value,
      caption: $("caption").value.trim(),
    };
  }

  function setStyle(o) {
    if (o.ecc) $("ecc").value = o.ecc;
    if (o.margin != null) $("margin").value = String(o.margin);
    if (o.dark) $("dark").value = o.dark;
    if (o.light) $("light").value = o.light;
    $("caption").value = o.caption || "";
  }

  function setType(t) {
    if (!TYPE_LABELS[t]) return;
    type = t;
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.type === t)));
    form.querySelectorAll("fieldset").forEach((fs) => { fs.hidden = fs.dataset.type !== t; });
  }

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
    const opts = styleOpts();
    const warn = colorWarning(opts.dark, opts.light);
    $("colorWarn").textContent = warn;
    $("colorWarn").hidden = !warn;
    $("encoded").textContent = payload;
    $("error").hidden = true;

    let matrix = null;
    if (payload) {
      try {
        matrix = QRCode.encode(payload, opts.ecc);
      } catch (err) {
        $("error").textContent = err.message === "too-long"
          ? `Too much to fit in one QR code (${QRPayload.byteLength(payload).toLocaleString()} bytes). Shorten it, or lower the error correction.`
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
        `prints reliably at ${fmtIn(Math.max(0.75, minPrintIn(matrix, opts.margin)))} or larger`;
    } else {
      // Keep a faint placeholder code so the card doesn't collapse while empty.
      preview.innerHTML = QRCode.toSvg(QRCode.encode("https://jaredluyster.com", "M"), {});
      preview.classList.add("is-empty");
      $("stats").textContent = "";
    }
    updatePrintNote();
    store.set(DRAFT_KEY, { type, fields: { [type]: fieldsOf(type) }, style: opts, print: printOpts() });
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
  function pngBlob() {
    return new Promise((resolve, reject) => {
      const { matrix, opts } = current;
      const side = matrix.size + opts.margin * 2;
      const scale = Math.max(8, Math.ceil(2000 / side));
      const svg = QRCode.toSvg(matrix, { ...opts, width: side * scale });
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png");
      };
      img.onerror = () => reject(new Error("PNG export failed"));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
    } catch (err) {
      flash($("downloadPng"), "Failed");
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

  function buildPrintSheet() {
    const sheet = $("printSheet");
    if (!current) { sheet.innerHTML = ""; return; }
    const { w, count } = layout();
    const { paper } = printOpts();
    const svg = svgMarkup();
    const tile = `<div class="print-tile" style="width:${w}in">${svg}</div>`;
    sheet.innerHTML = tile.repeat(count);
    sheet.classList.toggle("tiled", count > 1);
    let page = document.getElementById("pageRule");
    if (!page) {
      page = document.createElement("style");
      page.id = "pageRule";
      document.head.appendChild(page);
    }
    page.textContent = `@page { size: ${paper === "A4" ? "A4" : "letter"} portrait; margin: 0.5in; }`;
  }

  $("print").addEventListener("click", () => {
    if (!current) return;
    buildPrintSheet();
    remember();
    window.print();
  });
  // Ctrl+P / the browser menu should print the same sheet, not the editor.
  window.addEventListener("beforeprint", buildPrintSheet);

  // ---- recent -------------------------------------------------------------------------

  function remember() {
    if (!current) return;
    const entry = { type, fields: fieldsOf(type), style: current.opts, payload: current.payload, at: Date.now() };
    const list = store.get(RECENT_KEY, []).filter((e) => !(e.payload === entry.payload && e.type === entry.type));
    list.unshift(entry);
    store.set(RECENT_KEY, list.slice(0, RECENT_MAX));
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
        thumb = QRCode.toSvg(QRCode.encode(e.payload, e.style.ecc), { margin: e.style.margin, dark: e.style.dark, light: e.style.light });
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
      label.append(kind, document.createTextNode(e.style.caption || summary(e.type, e.fields) || "—"));
      open.append(box, label);
      open.addEventListener("click", () => {
        setType(e.type);
        fillFields(e.type, e.fields);
        setStyle(e.style);
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
  ["caption", "ecc", "margin", "dark", "light"].forEach((id) => $(id).addEventListener("input", update));
  ["printSize", "copies", "paper"].forEach((id) => $(id).addEventListener("change", () => {
    updatePrintNote();
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
  }
  update();
  renderRecent();
})();
