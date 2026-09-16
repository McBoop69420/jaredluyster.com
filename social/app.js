// Wires up the DOM: canvas pointer interactions, the left/right panels, and the library.
// Depends on globals from projects.js, canvas.js and library.js (all classic scripts,
// loaded in that order — see index.html).

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

const state = {
  project: "jaredluyster",
  platform: "instagram-post",
  canvasW: 1080,
  canvasH: 1080,
  background: { type: "color", color: "#131113", from: "#131113", to: "#f2971d", angle: 45, img: null, imgSrc: null },
  layers: [],
  selectedId: null,
};

let pendingImageTarget = null; // layer id to replace, or null to create a new layer
let dragMode = null; // "move" | "resize" | null
let dragLayerId = null;
let dragStart = { x: 0, y: 0 };
let layerStart = { x: 0, y: 0, w: 0, h: 0 };
let saveDraftTimer = null;

// ---------- persistence helpers ----------

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function logoKey(project) {
  return `social:logo:${project}`;
}

function loadCustomProjects() {
  try {
    const raw = localStorage.getItem("social:customProjects");
    if (!raw) return;
    JSON.parse(raw).forEach((p) => {
      if (!PROJECTS.some((existing) => existing.slug === p.slug)) PROJECTS.push(p);
    });
  } catch (e) {
    /* corrupt data — ignore, built-in presets still work */
  }
}

function addCustomProject(label) {
  const slug = slugify(label);
  if (!PROJECTS.some((p) => p.slug === slug)) {
    PROJECTS.push({ slug, label });
    try {
      const raw = localStorage.getItem("social:customProjects");
      const list = raw ? JSON.parse(raw) : [];
      list.push({ slug, label });
      localStorage.setItem("social:customProjects", JSON.stringify(list));
    } catch (e) {
      /* localStorage full or unavailable — the project still works this session */
    }
  }
  return slug;
}

function ensureProjectOption(slug) {
  if (!PROJECTS.some((p) => p.slug === slug)) {
    PROJECTS.push({ slug, label: slug });
  }
}

function scheduleSaveDraft() {
  clearTimeout(saveDraftTimer);
  saveDraftTimer = setTimeout(() => {
    try {
      localStorage.setItem("social:draft", JSON.stringify(serializeState()));
    } catch (e) {
      /* quota exceeded — the draft is a convenience, not required */
    }
  }, 400);
}

function serializeState() {
  return {
    version: 1,
    project: state.project,
    platform: state.platform,
    canvasW: state.canvasW,
    canvasH: state.canvasH,
    background: {
      type: state.background.type,
      color: state.background.color,
      from: state.background.from,
      to: state.background.to,
      angle: state.background.angle,
      imgSrc: state.background.imgSrc || null,
    },
    layers: state.layers.map(({ img, ...rest }) => rest),
  };
}

async function deserializeState(design) {
  const background = { ...design.background, img: null };
  if (design.background && design.background.imgSrc) {
    background.img = await loadImage(design.background.imgSrc);
  }

  const layers = [];
  for (const layer of design.layers) {
    if (layer.type === "image") {
      layers.push({ ...layer, img: await loadImage(layer.src) });
    } else {
      layers.push({ ...layer });
    }
  }

  Object.assign(state, {
    project: design.project,
    platform: design.platform,
    canvasW: design.canvasW,
    canvasH: design.canvasH,
    background,
    layers,
    selectedId: null,
  });
}

function setDefaultState(keepProjectAndPlatform) {
  const project = keepProjectAndPlatform ? state.project : PROJECTS[0].slug;
  const platform = keepProjectAndPlatform ? state.platform : "instagram-post";
  const preset = PLATFORMS.find((p) => p.slug === platform) || PLATFORMS[0];
  Object.assign(state, {
    project,
    platform,
    canvasW: preset.w,
    canvasH: preset.h,
    background: { type: "color", color: "#131113", from: "#131113", to: "#f2971d", angle: 45, img: null, imgSrc: null },
    layers: [createTextLayer(Math.round(preset.w * 0.08), Math.round(preset.h * 0.08))],
    selectedId: null,
  });
}

// ---------- rendering ----------

function redrawCanvas() {
  render(ctx, state);
}

function fullRefresh() {
  redrawCanvas();
  renderLayerList();
  renderPropsPanel();
  scheduleSaveDraft();
}

function resizeCanvasElement() {
  canvas.width = state.canvasW;
  canvas.height = state.canvasH;
}

function selectLayer(id) {
  state.selectedId = id;
  fullRefresh();
}

function deselect() {
  state.selectedId = null;
  fullRefresh();
}

function layerLabel(layer) {
  if (layer.type === "text") return layer.text.slice(0, 24) || "Text";
  if (layer.type === "image") return "Image";
  return layer.shape === "circle" ? "Circle" : "Rectangle";
}

function renderLayerList() {
  const list = document.getElementById("layerList");
  list.innerHTML = "";
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = state.layers[i];
    const li = document.createElement("li");
    li.className = "layer-row" + (layer.id === state.selectedId ? " selected" : "");

    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = layerLabel(layer);
    li.appendChild(name);

    const upBtn = document.createElement("button");
    upBtn.textContent = "▲";
    upBtn.title = "Move up";
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLayer(layer.id, 1);
    });
    li.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.textContent = "▼";
    downBtn.title = "Move down";
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLayer(layer.id, -1);
    });
    li.appendChild(downBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Delete layer";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteLayer(layer.id);
    });
    li.appendChild(delBtn);

    li.addEventListener("click", () => selectLayer(layer.id));
    list.appendChild(li);
  }
}

function moveLayer(id, dir) {
  const idx = state.layers.findIndex((l) => l.id === id);
  const swapIdx = idx + dir;
  if (idx === -1 || swapIdx < 0 || swapIdx >= state.layers.length) return;
  [state.layers[idx], state.layers[swapIdx]] = [state.layers[swapIdx], state.layers[idx]];
  fullRefresh();
}

function deleteLayer(id) {
  state.layers = state.layers.filter((l) => l.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  fullRefresh();
}

function labeledDiv(text, el) {
  const box = document.createElement("div");
  box.className = "props-row";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = text;
  box.appendChild(span);
  box.appendChild(el);
  return box;
}

function renderPropsPanel() {
  const panel = document.getElementById("propsPanel");
  panel.innerHTML = "";
  const layer = state.layers.find((l) => l.id === state.selectedId);
  if (!layer) {
    const p = document.createElement("p");
    p.className = "props-empty";
    p.textContent = "Select a layer to edit its properties.";
    panel.appendChild(p);
    return;
  }

  const heading = document.createElement("div");
  heading.className = "field-label";
  heading.textContent = layer.type === "text" ? "Text layer" : layer.type === "image" ? "Image layer" : "Shape layer";
  panel.appendChild(heading);

  if (layer.type === "text") panel.appendChild(buildTextProps(layer));
  else if (layer.type === "image") panel.appendChild(buildImageProps(layer));
  else panel.appendChild(buildShapeProps(layer));
}

function buildTextProps(layer) {
  const wrap = document.createElement("div");
  wrap.className = "props-row";

  const textarea = document.createElement("textarea");
  textarea.id = "propText";
  textarea.value = layer.text;
  textarea.addEventListener("input", () => {
    layer.text = textarea.value;
    redrawCanvas();
    renderLayerList();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Content", textarea));

  const fontSelect = document.createElement("select");
  [
    ["display", "Space Grotesk"],
    ["body", "Inter"],
    ["serif", "Serif"],
    ["mono", "Monospace"],
  ].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === layer.fontFamily) opt.selected = true;
    fontSelect.appendChild(opt);
  });
  fontSelect.addEventListener("change", () => {
    layer.fontFamily = fontSelect.value;
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Font", fontSelect));

  const sizeRow = document.createElement("div");
  sizeRow.className = "props-row-inline";
  const sizeRange = document.createElement("input");
  sizeRange.type = "range";
  sizeRange.min = "12";
  sizeRange.max = "220";
  sizeRange.value = String(layer.fontSize);
  const sizeReadout = document.createElement("span");
  sizeReadout.textContent = `${layer.fontSize}px`;
  sizeRange.addEventListener("input", () => {
    layer.fontSize = Number(sizeRange.value);
    sizeReadout.textContent = `${layer.fontSize}px`;
    redrawCanvas();
    scheduleSaveDraft();
  });
  sizeRow.append(sizeRange, sizeReadout);
  wrap.appendChild(labeledDiv("Size", sizeRow));

  const weightSelect = document.createElement("select");
  ["400", "500", "600", "700", "800", "900"].forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = w;
    if (w === layer.weight) opt.selected = true;
    weightSelect.appendChild(opt);
  });
  weightSelect.addEventListener("change", () => {
    layer.weight = weightSelect.value;
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Weight", weightSelect));

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = layer.color;
  colorInput.addEventListener("input", () => {
    layer.color = colorInput.value;
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Color", colorInput));

  const alignWrap = document.createElement("div");
  alignWrap.className = "align-group";
  ["left", "center", "right"].forEach((a) => {
    const btn = document.createElement("button");
    btn.className = `button button-sm ${layer.align === a ? "button-primary" : "button-secondary"}`;
    btn.textContent = a[0].toUpperCase();
    btn.addEventListener("click", () => {
      layer.align = a;
      redrawCanvas();
      renderPropsPanel();
      scheduleSaveDraft();
    });
    alignWrap.appendChild(btn);
  });
  wrap.appendChild(labeledDiv("Align", alignWrap));

  const widthRange = document.createElement("input");
  widthRange.type = "range";
  widthRange.min = "80";
  widthRange.max = String(state.canvasW);
  widthRange.value = String(layer.w);
  widthRange.addEventListener("input", () => {
    layer.w = Number(widthRange.value);
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Wrap width", widthRange));

  return wrap;
}

function buildImageProps(layer) {
  const wrap = document.createElement("div");
  wrap.className = "props-row";

  const opacity = document.createElement("input");
  opacity.type = "range";
  opacity.min = "0";
  opacity.max = "1";
  opacity.step = "0.05";
  opacity.value = String(layer.opacity ?? 1);
  opacity.addEventListener("input", () => {
    layer.opacity = Number(opacity.value);
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Opacity", opacity));

  const dims = document.createElement("div");
  dims.className = "props-row-inline";
  const wNum = document.createElement("input");
  wNum.type = "number";
  wNum.value = String(Math.round(layer.w));
  const hNum = document.createElement("input");
  hNum.type = "number";
  hNum.value = String(Math.round(layer.h));
  wNum.addEventListener("input", () => {
    layer.w = Number(wNum.value);
    redrawCanvas();
    scheduleSaveDraft();
  });
  hNum.addEventListener("input", () => {
    layer.h = Number(hNum.value);
    redrawCanvas();
    scheduleSaveDraft();
  });
  dims.append(wNum, hNum);
  wrap.appendChild(labeledDiv("Width × height (px)", dims));

  const replaceBtn = document.createElement("button");
  replaceBtn.className = "button button-secondary button-sm";
  replaceBtn.textContent = "Replace image…";
  replaceBtn.addEventListener("click", () => {
    pendingImageTarget = layer.id;
    document.getElementById("imageFileInput").click();
  });
  wrap.appendChild(replaceBtn);

  return wrap;
}

function buildShapeProps(layer) {
  const wrap = document.createElement("div");
  wrap.className = "props-row";

  const shapeSelect = document.createElement("select");
  [
    ["rect", "Rectangle"],
    ["circle", "Circle"],
  ].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value === layer.shape) opt.selected = true;
    shapeSelect.appendChild(opt);
  });
  shapeSelect.addEventListener("change", () => {
    layer.shape = shapeSelect.value;
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Shape", shapeSelect));

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = layer.color;
  colorInput.addEventListener("input", () => {
    layer.color = colorInput.value;
    redrawCanvas();
    scheduleSaveDraft();
  });
  wrap.appendChild(labeledDiv("Color", colorInput));

  const dims = document.createElement("div");
  dims.className = "props-row-inline";
  const wNum = document.createElement("input");
  wNum.type = "number";
  wNum.value = String(Math.round(layer.w));
  const hNum = document.createElement("input");
  hNum.type = "number";
  hNum.value = String(Math.round(layer.h));
  wNum.addEventListener("input", () => {
    layer.w = Number(wNum.value);
    redrawCanvas();
    scheduleSaveDraft();
  });
  hNum.addEventListener("input", () => {
    layer.h = Number(hNum.value);
    redrawCanvas();
    scheduleSaveDraft();
  });
  dims.append(wNum, hNum);
  wrap.appendChild(labeledDiv("Width × height (px)", dims));

  return wrap;
}

// ---------- select population ----------

function populateProjectOptions() {
  const select = document.getElementById("projectSelect");
  const current = select.value;
  select.innerHTML = "";
  for (const p of PROJECTS) {
    const opt = document.createElement("option");
    opt.value = p.slug;
    opt.textContent = p.label;
    select.appendChild(opt);
  }
  if (PROJECTS.some((p) => p.slug === current)) select.value = current;
}

function populatePlatformOptions() {
  const select = document.getElementById("platformSelect");
  select.innerHTML = "";
  for (const p of PLATFORMS) {
    const opt = document.createElement("option");
    opt.value = p.slug;
    opt.textContent = `${p.label} (${p.w}×${p.h})`;
    select.appendChild(opt);
  }
}

function populateLibraryFilterOptions(extraSlugs) {
  const select = document.getElementById("libProjectFilter");
  const current = select.value || "all";
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All projects";
  select.appendChild(allOpt);

  const slugs = new Set(PROJECTS.map((p) => p.slug).concat(extraSlugs || []));
  for (const slug of slugs) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = projectLabel(slug);
    select.appendChild(opt);
  }
  select.value = [...select.options].some((o) => o.value === current) ? current : "all";
}

function applyPlatformSize() {
  const preset = PLATFORMS.find((p) => p.slug === state.platform) || PLATFORMS[0];
  const customRow = document.getElementById("customSizeRow");
  if (state.platform === "custom") {
    customRow.classList.remove("hidden");
    state.canvasW = Number(document.getElementById("customW").value) || preset.w;
    state.canvasH = Number(document.getElementById("customH").value) || preset.h;
  } else {
    customRow.classList.add("hidden");
    state.canvasW = preset.w;
    state.canvasH = preset.h;
  }
  resizeCanvasElement();
  document.getElementById("canvasSizeReadout").textContent = `${state.canvasW} × ${state.canvasH}px`;
}

function syncControlsFromState() {
  ensureProjectOption(state.project);
  populateProjectOptions();
  document.getElementById("projectSelect").value = state.project;
  document.getElementById("platformSelect").value = state.platform;

  const isCustom = state.platform === "custom";
  document.getElementById("customSizeRow").classList.toggle("hidden", !isCustom);
  document.getElementById("customW").value = String(state.canvasW);
  document.getElementById("customH").value = String(state.canvasH);
  document.getElementById("canvasSizeReadout").textContent = `${state.canvasW} × ${state.canvasH}px`;

  document.querySelectorAll("#bgTypeControl .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.bg === state.background.type);
  });
  document.getElementById("bgColorRow").classList.toggle("hidden", state.background.type !== "color");
  document.getElementById("bgGradientRow").classList.toggle("hidden", state.background.type !== "gradient");
  document.getElementById("bgImageRow").classList.toggle("hidden", state.background.type !== "image");
  document.getElementById("bgColor").value = state.background.color || "#131113";
  document.getElementById("bgFrom").value = state.background.from || "#131113";
  document.getElementById("bgTo").value = state.background.to || "#f2971d";
  document.getElementById("bgAngle").value = String(state.background.angle || 0);
}

// ---------- canvas pointer interactions ----------

function toStageCoords(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
}

canvas.addEventListener("pointerdown", (e) => {
  const { x, y } = toStageCoords(e);
  const selected = state.layers.find((l) => l.id === state.selectedId);

  if (selected && isOnResizeHandle(ctx, selected, x, y)) {
    dragMode = "resize";
    dragLayerId = selected.id;
    dragStart = { x, y };
    layerStart = { x: selected.x, y: selected.y, w: selected.w, h: selected.h || 0 };
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  const hit = hitTest(ctx, state, x, y);
  if (hit) {
    selectLayer(hit.id);
    dragMode = "move";
    dragLayerId = hit.id;
    dragStart = { x, y };
    layerStart = { x: hit.x, y: hit.y, w: hit.w, h: hit.h || 0 };
    canvas.setPointerCapture(e.pointerId);
  } else {
    deselect();
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragMode) return;
  const layer = state.layers.find((l) => l.id === dragLayerId);
  if (!layer) return;
  const { x, y } = toStageCoords(e);
  const dx = x - dragStart.x;
  const dy = y - dragStart.y;

  if (dragMode === "move") {
    layer.x = layerStart.x + dx;
    layer.y = layerStart.y + dy;
  } else if (dragMode === "resize") {
    if (layer.type === "text") {
      layer.w = Math.max(80, layerStart.w + dx);
    } else {
      layer.w = Math.max(20, layerStart.w + dx);
      layer.h = Math.max(20, layerStart.h + dy);
    }
  }
  redrawCanvas();
});

window.addEventListener("pointerup", () => {
  if (!dragMode) return;
  dragMode = null;
  dragLayerId = null;
  fullRefresh();
});

document.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
    const active = document.activeElement;
    const typing = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (!typing) {
      deleteLayer(state.selectedId);
      e.preventDefault();
    }
  }
});

// ---------- toolbar wiring ----------

document.getElementById("projectSelect").addEventListener("change", (e) => {
  state.project = e.target.value;
  scheduleSaveDraft();
});

document.getElementById("addProjectBtn").addEventListener("click", () => {
  const input = document.getElementById("newProjectInput");
  const label = input.value.trim();
  if (!label) return;
  const slug = addCustomProject(label);
  populateProjectOptions();
  populateLibraryFilterOptions();
  document.getElementById("projectSelect").value = slug;
  state.project = slug;
  input.value = "";
  scheduleSaveDraft();
});

document.getElementById("platformSelect").addEventListener("change", (e) => {
  state.platform = e.target.value;
  applyPlatformSize();
  fullRefresh();
});

document.getElementById("customW").addEventListener("input", () => {
  if (state.platform !== "custom") return;
  applyPlatformSize();
  fullRefresh();
});
document.getElementById("customH").addEventListener("input", () => {
  if (state.platform !== "custom") return;
  applyPlatformSize();
  fullRefresh();
});

document.querySelectorAll("#bgTypeControl .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#bgTypeControl .seg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.background.type = btn.dataset.bg;
    document.getElementById("bgColorRow").classList.toggle("hidden", state.background.type !== "color");
    document.getElementById("bgGradientRow").classList.toggle("hidden", state.background.type !== "gradient");
    document.getElementById("bgImageRow").classList.toggle("hidden", state.background.type !== "image");
    fullRefresh();
  });
});

document.getElementById("bgColor").addEventListener("input", (e) => {
  state.background.color = e.target.value;
  redrawCanvas();
  scheduleSaveDraft();
});
document.getElementById("bgFrom").addEventListener("input", (e) => {
  state.background.from = e.target.value;
  redrawCanvas();
  scheduleSaveDraft();
});
document.getElementById("bgTo").addEventListener("input", (e) => {
  state.background.to = e.target.value;
  redrawCanvas();
  scheduleSaveDraft();
});
document.getElementById("bgAngle").addEventListener("input", (e) => {
  state.background.angle = Number(e.target.value);
  redrawCanvas();
  scheduleSaveDraft();
});

document.getElementById("bgImageFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await readFileAsDataURL(file);
  state.background.img = await loadImage(dataUrl);
  state.background.imgSrc = dataUrl;
  redrawCanvas();
  scheduleSaveDraft();
  e.target.value = "";
});

document.getElementById("addTextBtn").addEventListener("click", () => {
  const layer = createTextLayer(Math.round(state.canvasW * 0.1), Math.round(state.canvasH * 0.1));
  layer.w = Math.min(layer.w, Math.round(state.canvasW * 0.8));
  state.layers.push(layer);
  selectLayer(layer.id);
});

document.getElementById("addRectBtn").addEventListener("click", () => {
  const layer = createShapeLayer("rect", Math.round(state.canvasW * 0.1), Math.round(state.canvasH * 0.1));
  state.layers.push(layer);
  selectLayer(layer.id);
});

document.getElementById("addCircleBtn").addEventListener("click", () => {
  const layer = createShapeLayer("circle", Math.round(state.canvasW * 0.1), Math.round(state.canvasH * 0.1));
  state.layers.push(layer);
  selectLayer(layer.id);
});

document.getElementById("addImageBtn").addEventListener("click", () => {
  pendingImageTarget = null;
  document.getElementById("imageFileInput").click();
});

document.getElementById("imageFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  if (pendingImageTarget) {
    const layer = state.layers.find((l) => l.id === pendingImageTarget);
    if (layer) {
      layer.src = dataUrl;
      layer.img = img;
    }
    pendingImageTarget = null;
    fullRefresh();
  } else {
    const layer = createImageLayer(dataUrl, img, Math.round(state.canvasW * 0.1), Math.round(state.canvasH * 0.1));
    state.layers.push(layer);
    selectLayer(layer.id);
  }
  e.target.value = "";
});

document.getElementById("addLogoBtn").addEventListener("click", (e) => {
  const saved = !e.shiftKey && localStorage.getItem(logoKey(state.project));
  if (saved) {
    loadImage(saved).then((img) => {
      const layer = createImageLayer(saved, img, 40, 40);
      state.layers.push(layer);
      selectLayer(layer.id);
    });
  } else {
    document.getElementById("logoFileInput").click();
  }
});

document.getElementById("logoFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await readFileAsDataURL(file);
  try {
    localStorage.setItem(logoKey(state.project), dataUrl);
  } catch (err) {
    /* logo just won't be remembered next time — still usable this session */
  }
  const img = await loadImage(dataUrl);
  const layer = createImageLayer(dataUrl, img, 40, 40);
  state.layers.push(layer);
  selectLayer(layer.id);
  e.target.value = "";
});

document.getElementById("clearDesignBtn").addEventListener("click", () => {
  if (!confirm("Start a new design? The current canvas will be cleared (anything already saved to the library is unaffected).")) return;
  setDefaultState(true);
  syncControlsFromState();
  resizeCanvasElement();
  fullRefresh();
});

// ---------- export / save ----------

function currentTitle() {
  return document.getElementById("assetTitle").value.trim() || `${state.project}-${state.platform}`;
}

function exportCanvasBlob() {
  const previousSelection = state.selectedId;
  state.selectedId = null;
  redrawCanvas();
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      state.selectedId = previousSelection;
      redrawCanvas();
      resolve(blob);
    }, "image/png");
  });
}

document.getElementById("exportBtn").addEventListener("click", async () => {
  const blob = await exportCanvasBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(currentTitle())}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("saveBtn").addEventListener("click", async () => {
  const saveBtn = document.getElementById("saveBtn");
  const original = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const title = currentTitle();
    const filename = `${slugify(title)}-${Date.now()}.png`;
    const blob = await exportCanvasBlob();
    await uploadAsset(state.project, filename, blob, { title, platform: state.platform });
    await uploadDesign(state.project, filename, serializeState());
    saveBtn.textContent = "Saved!";
    await refreshLibrary();
  } catch (err) {
    console.error(err);
    saveBtn.textContent = "Save failed";
  } finally {
    setTimeout(() => {
      saveBtn.textContent = original;
      saveBtn.disabled = false;
    }, 1500);
  }
});

// ---------- library ----------

document.getElementById("libProjectFilter").addEventListener("change", () => refreshLibrary());
document.getElementById("refreshLibraryBtn").addEventListener("click", () => refreshLibrary());

async function refreshLibrary() {
  const filter = document.getElementById("libProjectFilter").value;
  const grid = document.getElementById("libraryGrid");
  try {
    const items = await fetchLibrary(filter);
    populateLibraryFilterOptions(items.map((i) => i.project));
    renderLibraryGrid(grid, items, {
      onEdit: (item) => loadFromLibrary(item),
      onDelete: (item) => onDeleteAsset(item),
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="library-empty">Could not reach the library API — has the R2 binding been set up? See DEPLOY.md.</p>';
  }
}

async function loadFromLibrary(item) {
  const design = await fetchDesign(item.project, item.filename);
  await deserializeState(design);
  syncControlsFromState();
  resizeCanvasElement();
  fullRefresh();
  document.getElementById("assetTitle").value = item.title;
  document.querySelector(".canvas-wrap").scrollIntoView({ behavior: "smooth" });
}

async function onDeleteAsset(item) {
  if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
  await deleteLibraryAsset(item.project, item.filename);
  refreshLibrary();
}

// ---------- boot ----------

async function restoreDraftOrDefault() {
  const raw = localStorage.getItem("social:draft");
  if (raw) {
    try {
      await deserializeState(JSON.parse(raw));
      return;
    } catch (e) {
      console.warn("draft restore failed, starting fresh", e);
    }
  }
  setDefaultState(false);
}

(async function init() {
  loadCustomProjects();
  populateProjectOptions();
  populatePlatformOptions();
  populateLibraryFilterOptions();

  await restoreDraftOrDefault();
  syncControlsFromState();
  resizeCanvasElement();
  fullRefresh();
  await refreshLibrary();
})();
