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
