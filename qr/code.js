/* Payload -> module matrix -> SVG. DOM-free so the tests can run it in Node.
 *
 * The encoder is Kazuhiko Arase's qrcode-generator (MIT), vendored at vendor/qrcode.js
 * rather than loaded from a CDN: a QR tool whose whole point is "never expires" shouldn't
 * stop working because a third-party script URL moved.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vendor/qrcode.js"));
  else root.QRCode = factory(root.qrcode);
})(typeof self !== "undefined" ? self : this, function (qrcode) {
  // The stock encoder only maps Latin-1; anything else (emoji, accents in a contact name)
  // would be silently mangled.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

  const ECC_LEVELS = ["L", "M", "Q", "H"];

  // Center logo limits, as a fraction of the code's width (quiet zone excluded). The cap
  // keeps the covered area well inside what High error correction can rebuild at every
  // version — checked by decoding codes with random noise in the center (tests/qr.test.js
  // and the page's own scan check). A logo also bumps tiny codes up to version 3 so it has
  // room to be more than a few modules wide.
  const CENTER_MIN = 0.12;
  const CENTER_MAX = 0.3;
  const CENTER_MIN_VERSION = 3;

  function make(payload, typeNumber, level) {
    const qr = qrcode(typeNumber, level);
    qr.addData(String(payload), "Byte");
    try {
      qr.make();
    } catch (err) {
      throw new Error(String(err).includes("overflow") ? "too-long" : String(err));
    }
    return qr;
  }

  // Smallest version that fits (but at least minVersion), best mask chosen by the encoder.
  // Throws a plain Error when the payload is too big for a version-40 code at this level.
  function encode(payload, ecc, minVersion) {
    const level = ECC_LEVELS.includes(ecc) ? ecc : "M";
    let qr = make(payload, 0, level);
    if (minVersion && (qr.getModuleCount() - 17) / 4 < minVersion) qr = make(payload, Math.min(40, minVersion), level);
    const size = qr.getModuleCount();
    const dark = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
      dark.push(row);
    }
    return { size, version: (size - 17) / 4, ecc: level, dark };
  }

  // The block of modules a center logo clears: an odd number of modules wide so it sits
  // exactly on the grid, centred, and never reaching the finder, timing or format-info
  // modules (which live within 9 modules of the edges). Circles clear only the modules
  // they actually touch. Returns null when there's no logo or no room for one.
  function centerBlock(m, center) {
    if (!center) return null;
    const frac = Math.min(CENTER_MAX, Math.max(CENTER_MIN, Number(center.size) || 0.22));
    let k = Math.floor(frac * m.size);
    if (k % 2 === 0) k -= 1;
    k = Math.min(k, m.size - 18);
    if (k < 3) return null;
    const start = (m.size - k) / 2;
    const circle = center.shape === "circle";
    const mid = m.size / 2;
    const r2 = (k / 2) ** 2;
    const covers = (r, c) => {
      if (r < start || r >= start + k || c < start || c >= start + k) return false;
      if (!circle) return true;
      const dx = Math.max(c - mid, 0, mid - c - 1);
      const dy = Math.max(r - mid, 0, mid - r - 1);
      return dx * dx + dy * dy < r2;
    };
    return { k, start, circle, covers };
  }

  const xml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // One <path> with a run per horizontal stretch of dark modules — a fraction of the size
  // of one <rect> per module, and no hairline seams between neighbours when scaled.
  function modulePath(m, margin, skip) {
    let d = "";
    for (let r = 0; r < m.size; r++) {
      let c = 0;
      while (c < m.size) {
        if (!m.dark[r][c] || (skip && skip(r, c))) { c++; continue; }
        const start = c;
        while (c < m.size && m.dark[r][c] && !(skip && skip(r, c))) c++;
        d += `M${start + margin} ${r + margin}h${c - start}v1h${start - c}z`;
      }
    }
    return d;
  }

  // Geometry in module units: the square (code + quiet zone) plus a caption band below it,
  // shrunk for long captions to fit the code's width (~0.58em per glyph for Inter 600).
  function dimensions(m, opts) {
    const o = opts || {};
    const margin = Number.isFinite(o.margin) ? o.margin : 4;
    const caption = String(o.caption || "").trim();
    const side = m.size + margin * 2;
    const fontSize = Math.max(1.5, Math.min(side * 0.075, (side * 0.9) / (caption.length * 0.58 || 1)));
    const band = caption ? fontSize * 1.9 : 0;
    return { margin, caption, side, fontSize, band, height: side + band };
  }

  // Up to two lines, broken at the space nearest the middle ("SCAN ME" -> "SCAN" / "ME").
  function badgeLines(text) {
    const t = String(text || "").trim().replace(/\s+/g, " ");
    if (!t.includes(" ") || [...t].length <= 5) return t ? [t] : [];
    let best = -1;
    for (let i = t.indexOf(" "); i !== -1; i = t.indexOf(" ", i + 1)) {
      if (best === -1 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2)) best = i;
    }
    return [t.slice(0, best), t.slice(best + 1)];
  }

  let clipSeq = 0;

  // The plate is inset half a module from the cleared block so a coloured plate never
  // touches the code's modules; the image or text is inset again inside the plate.
  function centerMarkup(blk, margin, center, dark, light) {
    const plate = center.plate || light;
    const x0 = margin + blk.start + 0.5;
    const pw = blk.k - 1;
    const mid = x0 + pw / 2;
    let out = blk.circle
      ? `<circle cx="${mid}" cy="${mid}" r="${pw / 2}" fill="${xml(plate)}"/>`
      : `<rect x="${x0}" y="${x0}" width="${pw}" height="${pw}" rx="${(pw * 0.12).toFixed(3)}" fill="${xml(plate)}"/>`;
    // Content box: the plate minus padding (for a circle, its inscribed square).
    const box = blk.circle ? (pw / Math.SQRT2) * 0.98 : pw * 0.9;
    const bx = mid - box / 2;

    if (center.kind === "image" && center.src) {
      let clip = "";
      if (blk.circle) {
        const id = `qrc${++clipSeq}`;
        out += `<clipPath id="${id}"><circle cx="${mid}" cy="${mid}" r="${pw / 2 - pw * 0.04}"/></clipPath>`;
        clip = ` clip-path="url(#${id})"`;
      }
      out += `<image x="${bx}" y="${bx}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"${clip} xlink:href="${xml(center.src)}"/>`;
    } else if (center.kind === "text") {
      const lines = badgeLines(center.text);
      if (lines.length) {
        const glyphs = Math.max(...lines.map((l) => [...l].length));
        // ~0.7em per glyph for a heavy sans (Arial Black is the widest fallback).
        const fs = glyphs === 1 && lines.length === 1
          ? box * 0.78
          : Math.min(lines.length === 1 ? box * 0.42 : box * 0.36, box / (glyphs * 0.7));
        const lh = fs * 1.05;
        const y0 = mid - (lh * (lines.length - 1)) / 2;
        const tspans = lines
          .map((l, i) => `<tspan x="${mid}" y="${(y0 + i * lh).toFixed(3)}">${xml(l)}</tspan>`)
          .join("");
        out += `<text text-anchor="middle" dominant-baseline="central" font-family="Inter, 'Arial Black', Arial, Helvetica, sans-serif" ` +
          `font-weight="800" font-size="${fs.toFixed(3)}" fill="${xml(center.textColor || dark)}">${tspans}</text>`;
      }
    }
    return out;
  }

  // The SVG's unit is one module, so it scales to any print size losslessly.
  function toSvg(m, opts) {
    const o = opts || {};
    const { margin, caption, side, fontSize, band, height: h } = dimensions(m, o);
    const dark = o.dark || "#000000";
    const light = o.light || "#ffffff";
    const blk = centerBlock(m, o.center);
    const title = o.title ? `<title>${xml(o.title)}</title>` : "";
    const sizeAttrs = o.width ? ` width="${o.width}" height="${(o.width * h) / side}"` : "";
    const text = caption
      ? `<text x="${side / 2}" y="${side + band * 0.42}" text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600" font-size="${fontSize.toFixed(2)}" fill="${xml(dark)}">${xml(caption)}</text>`
      : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${side} ${h}"${sizeAttrs} shape-rendering="crispEdges" role="img">` +
      title +
      `<rect width="${side}" height="${h}" fill="${xml(light)}"/>` +
      `<path d="${modulePath(m, margin, blk && blk.covers)}" fill="${xml(dark)}"/>` +
      (blk ? `<g shape-rendering="geometricPrecision">${centerMarkup(blk, margin, o.center, dark, light)}</g>` : "") +
      text +
      `</svg>`
    );
  }

  return {
    encode, toSvg, dimensions, centerBlock, badgeLines,
    ECC_LEVELS, CENTER_MIN, CENTER_MAX, CENTER_MIN_VERSION,
  };
});
