/* What the code encodes. Kept free of the DOM so qr/tests/qr.test.js can run it in Node.
 *
 * Every code made here is STATIC: the payload below is the whole message, written straight
 * into the modules. There is no short link or redirect behind it, so nothing can lapse — a
 * printed code keeps working as long as the page it points at does.
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

  function build(fields) {
    return url(fields || {});
  }

  // Bytes as the encoder will count them (it writes UTF-8 in byte mode).
  function byteLength(s) {
    return new TextEncoder().encode(str(s)).length;
  }

  return { build, byteLength };
});
