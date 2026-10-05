// Run: node --test qr/tests/qr.test.js
// (functions/_middleware.ts 404s anything under /tests/, so this never ships.)
const test = require("node:test");
const assert = require("node:assert/strict");
const { build, byteLength } = require("../payload.js");
const { encode, toSvg, dimensions } = require("../code.js");

test("url: adds https:// only when there's no scheme", () => {
  assert.equal(build("url", { url: "jaredluyster.com/menu" }), "https://jaredluyster.com/menu");
  assert.equal(build("url", { url: "  http://a.b  " }), "http://a.b");
  assert.equal(build("url", { url: "spotify:track:123" }), "spotify:track:123");
  assert.equal(build("url", { url: "   " }), "");
});

test("text: passed through untouched", () => {
  assert.equal(build("text", { text: "  two\nlines  " }), "  two\nlines  ");
});

test("wifi: standard WIFI: string with MECARD escaping", () => {
  assert.equal(build("wifi", { ssid: "Home", password: "pa;ss", security: "WPA" }), "WIFI:T:WPA;S:Home;P:pa\\;ss;;");
  assert.equal(build("wifi", { ssid: 'a\\b,c:"d"', password: "x", security: "WEP", hidden: true }),
    'WIFI:T:WEP;S:a\\\\b\\,c\\:\\"d\\";P:x;H:true;;');
  assert.equal(build("wifi", { ssid: "Cafe", password: "ignored", security: "nopass" }), "WIFI:T:nopass;S:Cafe;;");
  assert.equal(build("wifi", { ssid: "X", password: "y", security: "bogus" }), "WIFI:T:WPA;S:X;P:y;;");
  assert.equal(build("wifi", { ssid: "", password: "y" }), "");
});

test("contact: vCard 3.0 with CRLF and escaped values", () => {
  const v = build("contact", {
    first: "Jane", last: "Doe", org: "Acme, Inc.", phone: "+1 859 555 0123",
    email: "jane@example.com", website: "example.com", note: "line1\nline2; ok",
  });
  assert.equal(v, [
    "BEGIN:VCARD", "VERSION:3.0", "N:Doe;Jane;;;", "FN:Jane Doe", "ORG:Acme\\, Inc.",
    "TEL;TYPE=CELL:+1 859 555 0123", "EMAIL:jane@example.com", "URL:https://example.com",
    "NOTE:line1\\nline2\\; ok", "END:VCARD",
  ].join("\r\n"));
  assert.match(build("contact", { org: "Only Co" }), /\r\nFN:Only Co\r\n/);
  assert.equal(build("contact", { title: "nobody" }), "");
});

test("email: mailto with encoded subject and body", () => {
  assert.equal(build("email", { to: "a@b.co", subject: "Hi there", body: "x&y=z" }), "mailto:a@b.co?subject=Hi%20there&body=x%26y%3Dz");
  assert.equal(build("email", { to: "a@b.co" }), "mailto:a@b.co");
  assert.equal(build("email", { to: "" , subject: "x"}), "");
});

test("phone and sms: dialable characters only", () => {
  assert.equal(build("phone", { number: "+1 (859) 555-0123" }), "tel:+18595550123");
  assert.equal(build("sms", { number: "859.555.0123", message: "On my way: 5 min" }), "SMSTO:8595550123:On my way: 5 min");
  assert.equal(build("sms", { number: "5550123" }), "SMSTO:5550123");
  assert.equal(build("phone", { number: "call me" }), "");
});

test("unknown type builds nothing", () => {
  assert.equal(build("nope", { url: "x" }), "");
});

test("byteLength counts UTF-8", () => {
  assert.equal(byteLength("abc"), 3);
  assert.equal(byteLength("é"), 2);
  assert.equal(byteLength("🍕"), 4);
});

test("encode: picks the smallest version and has finder patterns", () => {
  const m = encode("https://jaredluyster.com", "M");
  assert.equal(m.version, 2);
  assert.equal(m.size, 25);
  // Top-left finder: dark 7x7 ring, light ring inside, dark 3x3 core.
  assert.equal(m.dark[0][0], true);
  assert.equal(m.dark[0][6], true);
  assert.equal(m.dark[1][1], false);
  assert.equal(m.dark[3][3], true);
  assert.equal(m.dark[0][m.size - 1], true);
  assert.equal(m.dark[m.size - 1][0], true);
  assert.equal(encode("x".repeat(200), "H").version > encode("x".repeat(200), "L").version, true);
});

test("encode: overflow is reported as too-long", () => {
  assert.throws(() => encode("x".repeat(3000), "L"), /too-long/);
  assert.throws(() => encode("x".repeat(1300), "H"), /too-long/);
  assert.doesNotThrow(() => encode("x".repeat(2900), "L"));
});

test("toSvg: module-unit viewBox, quiet zone, escaped caption", () => {
  const m = encode("hi", "M");
  const svg = toSvg(m, { margin: 4, caption: "<Menu & more>" });
  const d = dimensions(m, { margin: 4, caption: "<Menu & more>" });
  assert.equal(d.side, m.size + 8);
  assert.ok(d.height > d.side);
  assert.match(svg, new RegExp(`viewBox="0 0 ${d.side} ${d.height}"`));
  assert.match(svg, /&lt;Menu &amp; more&gt;/);
  assert.match(svg, /^<svg[^>]*><rect width="29"/);
  const plain = toSvg(m, { margin: 2 });
  assert.match(plain, /viewBox="0 0 25 25"/);
  assert.doesNotMatch(plain, /<text/);
  // First dark run starts inside the quiet zone, never at 0,0.
  assert.match(plain, /<path d="M2 2h7/);
});

// ---- center logo ----------------------------------------------------------------------

const jsQR = require("../vendor/jsQR.js");
const { centerBlock, badgeLines, CENTER_MAX, CENTER_MIN_VERSION } = require("../code.js");

// Rasterise a matrix the way a phone would see it, with the logo area painted by `fill`:
// "light" (empty plate), "dark" (solid plate) or "noise" (a busy photo).
function decodeWithLogo(m, blk, fill, seed = 7) {
  const margin = 4, scale = 3, W = (m.size + margin * 2) * scale;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) {
    const inLogo = blk && blk.covers(r, c);
    const dark = inLogo ? fill === "dark" || (fill === "noise" && rnd() < 0.5) : m.dark[r][c];
    if (!dark) continue;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + margin) * scale + y) * W + (c + margin) * scale + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  const res = jsQR(px, W, W, { inversionAttempts: "dontInvert" });
  return res && res.data;
}

// Payloads that land on a spread of versions (3, 4, 7 … 36, 40) at High error correction.
const LOGO_PAYLOADS = ["tel:911", ...[5, 40, 90, 180, 330, 600, 1000, 1250].map((n) => "https://example.com/" + "a".repeat(n))];

test("centerBlock: none without a logo, odd and centred, clamped to the cap", () => {
  const m = encode(LOGO_PAYLOADS[5], "H", CENTER_MIN_VERSION);
  assert.equal(centerBlock(m, null), null);
  const b = centerBlock(m, { size: 0.22 });
  assert.equal(b.k % 2, 1);
  assert.equal(b.start * 2 + b.k, m.size);
  assert.equal(centerBlock(m, { size: 0.9 }).k, centerBlock(m, { size: CENTER_MAX }).k);
  // A circle clears fewer modules than the square around it, and never its corners.
  const sq = centerBlock(m, { size: CENTER_MAX, shape: "square" });
  const ci = centerBlock(m, { size: CENTER_MAX, shape: "circle" });
  assert.equal(ci.covers(ci.start, ci.start), false);
  assert.equal(ci.covers(m.size >> 1, m.size >> 1), true);
  assert.equal(sq.covers(sq.start, sq.start), true);
});

test("centerBlock: never touches finder, timing or format modules at any version", () => {
  for (let v = CENTER_MIN_VERSION; v <= 40; v++) {
    const size = 17 + 4 * v;
    const b = centerBlock({ size }, { size: CENTER_MAX });
    assert.ok(b, `v${v} has room for a logo`);
    assert.ok(b.start >= 9 && b.start + b.k <= size - 9, `v${v}: block ${b.start}+${b.k} of ${size}`);
  }
});

test("encode: a logo bumps tiny codes up to the minimum version", () => {
  assert.equal(encode("hi", "H").version, 1);
  assert.equal(encode("hi", "H", CENTER_MIN_VERSION).version, CENTER_MIN_VERSION);
  assert.equal(encode(LOGO_PAYLOADS[6], "H", CENTER_MIN_VERSION).version, encode(LOGO_PAYLOADS[6], "H").version);
});

test("logo at the size cap still decodes — every version, both shapes, any fill", () => {
  for (const payload of LOGO_PAYLOADS) {
    const m = encode(payload, "H", CENTER_MIN_VERSION);
    for (const shape of ["square", "circle"]) for (const fill of ["light", "dark", "noise"]) {
      const blk = centerBlock(m, { size: CENTER_MAX, shape });
      assert.equal(decodeWithLogo(m, blk, fill), payload, `v${m.version} ${shape} ${fill}`);
    }
  }
});

test("…and the check can fail: a block far past the cap breaks decoding", () => {
  const m = encode(LOGO_PAYLOADS[5], "H", CENTER_MIN_VERSION);
  const k = m.size - 18, start = (m.size - k) / 2;
  const huge = { covers: (r, c) => r >= start && r < start + k && c >= start && c < start + k };
  assert.notEqual(decodeWithLogo(m, huge, "noise"), LOGO_PAYLOADS[5]);
});

test("toSvg: logo modules are cleared and the image/badge is drawn", () => {
  const m = encode("https://jaredluyster.com", "H", CENTER_MIN_VERSION);
  const plain = toSvg(m, {});
  const withImg = toSvg(m, { center: { kind: "image", src: "data:image/png;base64,AAAA", size: 0.3 } });
  assert.match(withImg, /<image [^>]*xlink:href="data:image\/png;base64,AAAA"/);
  assert.match(withImg, /xmlns:xlink=/);
  assert.ok(withImg.match(/<path d="([^"]*)"/)[1].length < plain.match(/<path d="([^"]*)"/)[1].length);
  const circ = toSvg(m, { center: { kind: "image", src: "x", shape: "circle" } });
  assert.match(circ, /<clipPath id="(qrc\d+)">[\s\S]*clip-path="url\(#\1\)"/);
  const badge = toSvg(m, { center: { kind: "text", text: "Scan <me>", plate: "#f2971d", textColor: "#ffffff" } });
  assert.match(badge, /fill="#f2971d"/);
  assert.match(badge, /<tspan[^>]*>Scan<\/tspan><tspan[^>]*>&lt;me&gt;<\/tspan>/);
  assert.match(badge, /fill="#ffffff"><tspan/);
  // An image kind with no image yet draws only the plate.
  assert.doesNotMatch(toSvg(m, { center: { kind: "image", src: "" } }), /<image/);
});

test("badgeLines: one or two balanced lines", () => {
  assert.deepEqual(badgeLines("MENU"), ["MENU"]);
  assert.deepEqual(badgeLines("SCAN ME"), ["SCAN", "ME"]);
  assert.deepEqual(badgeLines("  50%   OFF "), ["50%", "OFF"]);
  assert.deepEqual(badgeLines("FREE WI-FI HERE"), ["FREE WI-FI", "HERE"]);
  assert.deepEqual(badgeLines("A B"), ["A B"]);
  assert.deepEqual(badgeLines("🍕"), ["🍕"]);
  assert.deepEqual(badgeLines("   "), []);
});
