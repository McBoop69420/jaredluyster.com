// Pure(-ish) rendering + hit-testing for the studio canvas. No DOM/event wiring here —
// that lives in app.js, which owns mouse/keyboard handling and calls into this module.

const HANDLE_SIZE = 14; // on-canvas px, in the *stage* coordinate space (not screen px)

let nextLayerId = 1;
function makeLayerId() {
  return `layer-${nextLayerId++}`;
}

function createTextLayer(x, y) {
  return {
    id: makeLayerId(),
    type: "text",
    text: "Your text here",
    x,
    y,
    w: 480,
    fontSize: 64,
    fontFamily: "display",
    color: "#f3ede0",
    weight: "700",
    align: "left",
  };
}

function createImageLayer(src, img, x, y) {
  const maxW = 400;
  const scale = img.width > maxW ? maxW / img.width : 1;
  return {
    id: makeLayerId(),
    type: "image",
    src,
    img,
    x,
    y,
    w: Math.round(img.width * scale),
    h: Math.round(img.height * scale),
    opacity: 1,
  };
}

function createShapeLayer(shape, x, y) {
  return {
    id: makeLayerId(),
    type: "shape",
    shape, // "rect" | "circle"
    x,
    y,
    w: 300,
    h: 300,
    color: "#f2971d",
  };
}

function fontFamilyFor(key) {
  if (key === "display") return "'Space Grotesk', 'Arial Black', sans-serif";
  if (key === "body") return "'Inter', -apple-system, sans-serif";
  if (key === "serif") return "Georgia, 'Times New Roman', serif";
  if (key === "mono") return "'Courier New', monospace";
  return "'Inter', sans-serif";
}

function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const paragraphs = text.split("\n");
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

function textLayerLines(ctx, layer) {
  const font = `${layer.weight} ${layer.fontSize}px ${fontFamilyFor(layer.fontFamily)}`;
  return wrapText(ctx, layer.text, layer.w, font);
}

function textLayerHeight(ctx, layer) {
  const lines = textLayerLines(ctx, layer);
  return lines.length * layer.fontSize * 1.25;
}

function getLayerBounds(ctx, layer) {
  if (layer.type === "text") {
    return { x: layer.x, y: layer.y, w: layer.w, h: textLayerHeight(ctx, layer) };
  }
  return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
}

function drawBackground(ctx, bg, w, h) {
  if (bg.type === "gradient") {
    const angle = ((bg.angle || 0) * Math.PI) / 180;
    const x1 = w / 2 - (Math.cos(angle) * w) / 2;
    const y1 = h / 2 - (Math.sin(angle) * h) / 2;
    const x2 = w / 2 + (Math.cos(angle) * w) / 2;
    const y2 = h / 2 + (Math.sin(angle) * h) / 2;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === "image" && bg.img) {
    const scale = Math.max(w / bg.img.width, h / bg.img.height);
    const dw = bg.img.width * scale;
    const dh = bg.img.height * scale;
    ctx.drawImage(bg.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = bg.color || "#131113";
    ctx.fillRect(0, 0, w, h);
  }
}

function drawLayer(ctx, layer) {
  if (layer.type === "text") {
    ctx.save();
    ctx.fillStyle = layer.color;
    ctx.textBaseline = "top";
    ctx.textAlign = layer.align || "left";
    const font = `${layer.weight} ${layer.fontSize}px ${fontFamilyFor(layer.fontFamily)}`;
    const lines = wrapText(ctx, layer.text, layer.w, font);
    ctx.font = font;
    const lineHeight = layer.fontSize * 1.25;
    const anchorX = layer.align === "center" ? layer.x + layer.w / 2 : layer.align === "right" ? layer.x + layer.w : layer.x;
    lines.forEach((line, i) => {
      ctx.fillText(line, anchorX, layer.y + i * lineHeight);
    });
    ctx.restore();
  } else if (layer.type === "image" && layer.img) {
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.drawImage(layer.img, layer.x, layer.y, layer.w, layer.h);
    ctx.restore();
  } else if (layer.type === "shape") {
    ctx.save();
    ctx.fillStyle = layer.color;
    if (layer.shape === "circle") {
      ctx.beginPath();
      ctx.ellipse(layer.x + layer.w / 2, layer.y + layer.h / 2, layer.w / 2, layer.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
    }
    ctx.restore();
  }
}

function drawSelection(ctx, bounds) {
  ctx.save();
  ctx.strokeStyle = "#f2971d";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.setLineDash([]);
  ctx.fillStyle = "#f2971d";
  ctx.fillRect(
    bounds.x + bounds.w - HANDLE_SIZE / 2,
    bounds.y + bounds.h - HANDLE_SIZE / 2,
    HANDLE_SIZE,
    HANDLE_SIZE,
  );
  ctx.restore();
}

function render(ctx, state) {
  ctx.clearRect(0, 0, state.canvasW, state.canvasH);
  drawBackground(ctx, state.background, state.canvasW, state.canvasH);
  for (const layer of state.layers) drawLayer(ctx, layer);
  if (state.selectedId) {
    const layer = state.layers.find((l) => l.id === state.selectedId);
    if (layer) drawSelection(ctx, getLayerBounds(ctx, layer));
  }
}

// Topmost layer under (x, y), in stage coordinates.
function hitTest(ctx, state, x, y) {
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = state.layers[i];
    const b = getLayerBounds(ctx, layer);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return layer;
  }
  return null;
}

function isOnResizeHandle(ctx, layer, x, y) {
  const b = getLayerBounds(ctx, layer);
  const hx = b.x + b.w;
  const hy = b.y + b.h;
  return Math.abs(x - hx) <= HANDLE_SIZE && Math.abs(y - hy) <= HANDLE_SIZE;
}
