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

  // Smallest version that fits, best mask chosen by the encoder. Throws a plain Error
  // when the payload is too big for even a version-40 code at this correction level.
  function encode(payload, ecc) {
    const level = ECC_LEVELS.includes(ecc) ? ecc : "M";
    const qr = qrcode(0, level);
    qr.addData(String(payload), "Byte");
    try {
      qr.make();
    } catch (err) {
      throw new Error(String(err).includes("overflow") ? "too-long" : String(err));
    }
    const size = qr.getModuleCount();
    const dark = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
      dark.push(row);
    }
    return { size, version: (size - 17) / 4, ecc: level, dark };
  }

  const xml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // One <path> with a run per horizontal stretch of dark modules — a fraction of the size
  // of one <rect> per module, and no hairline seams between neighbours when scaled.
  function modulePath(m, margin) {
    let d = "";
    for (let r = 0; r < m.size; r++) {
      let c = 0;
      while (c < m.size) {
        if (!m.dark[r][c]) { c++; continue; }
        const start = c;
        while (c < m.size && m.dark[r][c]) c++;
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

  // The SVG's unit is one module, so it scales to any print size losslessly.
  function toSvg(m, opts) {
    const o = opts || {};
    const { margin, caption, side, fontSize, band, height: h } = dimensions(m, o);
    const dark = o.dark || "#000000";
    const light = o.light || "#ffffff";
    const title = o.title ? `<title>${xml(o.title)}</title>` : "";
    const sizeAttrs = o.width ? ` width="${o.width}" height="${(o.width * h) / side}"` : "";
    const text = caption
      ? `<text x="${side / 2}" y="${side + band * 0.42}" text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600" font-size="${fontSize.toFixed(2)}" fill="${xml(dark)}">${xml(caption)}</text>`
      : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${h}"${sizeAttrs} shape-rendering="crispEdges" role="img">` +
      title +
      `<rect width="${side}" height="${h}" fill="${xml(light)}"/>` +
      `<path d="${modulePath(m, margin)}" fill="${xml(dark)}"/>` +
      text +
      `</svg>`
    );
  }

  return { encode, toSvg, dimensions, ECC_LEVELS };
});
