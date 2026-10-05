/* What each QR type actually encodes. Kept free of the DOM so qr/tests/payload.test.mjs
 * can run it in Node.
 *
 * Every code made here is STATIC: the payload below is the whole message, written straight
 * into the modules. There is no short link, redirect, or account behind it, so there is
 * nothing that can lapse — a printed code keeps working as long as whatever it points at
 * does (a URL's own site, a Wi-Fi network's password, and so on).
 *
 * Formats follow what phone cameras (iOS and Android/ZXing) actually parse:
 *   url     https://…                (a scheme is added when the user leaves it off)
 *   wifi    WIFI:T:WPA;S:ssid;P:pass;H:true;;
 *   contact vCard 3.0, CRLF line endings (RFC 2426)
 *   email   mailto:addr?subject=…&body=…
 *   phone   tel:+15551234567
 *   sms     SMSTO:+15551234567:message
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QRPayload = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const str = (v) => (v == null ? "" : String(v));

  // Anything that already starts with a scheme (https:, mailto:, spotify:, …) is left
  // alone; a bare "example.com/menu" gets https:// so a camera treats it as a link.
  function url(f) {
    const s = str(f.url).trim();
    if (!s) return "";
    return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  }

  function text(f) {
    return str(f.text);
  }

  // MECARD-style escaping, shared by every reader of the WIFI: format.
  const wifiEscape = (s) => str(s).replace(/([\\;,:"])/g, "\\$1");

  function wifi(f) {
    const ssid = str(f.ssid);
    if (!ssid) return "";
    const security = ["WPA", "WEP", "nopass"].includes(f.security) ? f.security : "WPA";
    let out = `WIFI:T:${security};S:${wifiEscape(ssid)};`;
    if (security !== "nopass") out += `P:${wifiEscape(f.password)};`;
    if (f.hidden) out += "H:true;";
    return `${out};`;
  }

  // RFC 2426 text-value escaping. Newlines inside a value become a literal "\n".
  const vEscape = (s) =>
    str(s).trim().replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  function contact(f) {
    const first = str(f.first).trim();
    const last = str(f.last).trim();
    const org = str(f.org).trim();
    const full = [first, last].filter(Boolean).join(" ") || org;
    if (!full) return "";
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${vEscape(last)};${vEscape(first)};;;`,
      `FN:${vEscape(full)}`,
    ];
    if (org) lines.push(`ORG:${vEscape(org)}`);
    if (str(f.title).trim()) lines.push(`TITLE:${vEscape(f.title)}`);
    if (str(f.phone).trim()) lines.push(`TEL;TYPE=CELL:${vEscape(f.phone)}`);
    if (str(f.email).trim()) lines.push(`EMAIL:${vEscape(f.email)}`);
    if (str(f.website).trim()) lines.push(`URL:${vEscape(url({ url: f.website }))}`);
    if (str(f.address).trim()) lines.push(`ADR:;;${vEscape(f.address)};;;;`);
    if (str(f.note).trim()) lines.push(`NOTE:${vEscape(f.note)}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  }

  function email(f) {
    const to = str(f.to).trim();
    if (!to) return "";
    const params = [];
    if (str(f.subject)) params.push(`subject=${encodeURIComponent(f.subject)}`);
    if (str(f.body)) params.push(`body=${encodeURIComponent(f.body)}`);
    const addr = encodeURIComponent(to).replace(/%40/g, "@");
    return `mailto:${addr}${params.length ? `?${params.join("&")}` : ""}`;
  }

  // Dialable characters only — spaces, dashes and brackets are for people, not dialers.
  const dialable = (s) => str(s).replace(/[^\d+*#]/g, "");

  function phone(f) {
    const n = dialable(f.number);
    return n ? `tel:${n}` : "";
  }

  function sms(f) {
    const n = dialable(f.number);
    if (!n) return "";
    const msg = str(f.message);
    return msg ? `SMSTO:${n}:${msg}` : `SMSTO:${n}`;
  }

  const BUILDERS = { url, text, wifi, contact, email, phone, sms };

  function build(type, fields) {
    const fn = BUILDERS[type];
    return fn ? fn(fields || {}) : "";
  }

  // Bytes as the encoder will count them (it writes UTF-8 in byte mode).
  function byteLength(s) {
    return new TextEncoder().encode(str(s)).length;
  }

  return { build, byteLength, types: Object.keys(BUILDERS) };
});
