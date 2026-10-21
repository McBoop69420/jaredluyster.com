// Tests for /api/ticks in news/_worker.js: the calendar's ticked todos and dismissed
// movies, shared across devices through one R2 file.
// Run: node --test tests/*.test.mjs
//
// Real RSA signatures; only the fetch of Access's published keys and the R2 bucket are faked.
// The point: only the owner, on calendar.jaredluyster.com, gets in; ops from two devices
// merge instead of overwriting each other; a write that races another one is retried.

import test from "node:test";
import assert from "node:assert/strict";

const worker = (await import(new URL("../news/_worker.js", import.meta.url).href)).default;

const HOST = "https://calendar.jaredluyster.com";
const OWNER = "owner@example.com";
const TEAM = "team-ticks.cloudflareaccess.com";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
globalThis.fetch = async (url) => {
  if (new URL(String(url)).hostname === TEAM) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  return new Response("nope", { status: 500 });
};

async function token(claims = {}, header = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT", ...header }));
  const p = b64u(JSON.stringify({ iss: `https://${TEAM}`, exp: now() + 300, email: OWNER, ...claims }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

// A bucket holding one object, with ETags and etagMatches the way R2 does them.
// `interfere` runs once before the next put, standing in for another device's write.
function fakeBucket(initial) {
  const b = {
    text: initial == null ? null : JSON.stringify(initial),
    etag: initial == null ? null : "e0",
    n: 0,
    puts: 0,
    interfere: null,
    async get() {
      if (b.text == null) return null;
      const text = b.text;
      return { etag: b.etag, text: async () => text };
    },
    async put(_key, body, opts = {}) {
      b.puts++;
      if (b.interfere) { const f = b.interfere; b.interfere = null; f(); }
      const want = opts.onlyIf && opts.onlyIf.etagMatches;
      if (want && want !== b.etag) return null;
      b.text = body;
      b.etag = "e" + ++b.n;
      return { etag: b.etag };
    },
    state: () => JSON.parse(b.text),
  };
  return b;
}

const env = (bucket, extra = {}) => ({ ACCESS_TEAM_DOMAIN: TEAM, CALENDAR_OWNER_EMAILS: OWNER, CALENDAR_TICKS: bucket, ...extra });

async function call(e, { method = "GET", body, host = HOST, auth = true, headers = {} } = {}) {
  const h = { ...headers };
  if (auth === true) h["Cf-Access-Jwt-Assertion"] = await token();
  else if (typeof auth === "string") h["Cf-Access-Jwt-Assertion"] = auth;
  const init = { method, headers: h };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await worker.fetch(new Request(`${host}/api/ticks`, init), e);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (err) { /* not JSON */ }
  return { status: res.status, json, headers: res.headers };
}

test("owner gets an empty state before anything is ticked, uncacheable", async () => {
  const r = await call(env(fakeBucket()));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { done: {}, dismissed: {} });
  assert.match(r.headers.get("Cache-Control"), /no-store/);
  assert.match(r.headers.get("Cache-Control"), /private/);
});

test("ticks and dismissals are stored and come back on the next read", async () => {
  const b = fakeBucket();
  const r = await call(env(b), { method: "POST", body: { ops: [
    { op: "tick", key: "C:2026-10-21|Comics: Absolute Flash #20", at: 1000 },
    { op: "dismiss", key: "rocky|1975", at: 2000 },
  ] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { done: { "C:2026-10-21|Comics: Absolute Flash #20": 1000 }, dismissed: { "rocky|1975": 2000 } });
  assert.deepEqual((await call(env(b))).json, r.json);
});

test("two devices' ops merge instead of one overwriting the other", async () => {
  const b = fakeBucket({ done: { a: 1 }, dismissed: {} });
  await call(env(b), { method: "POST", body: { ops: [{ op: "tick", key: "b", at: 2 }] } });
  const r = await call(env(b), { method: "POST", body: { ops: [{ op: "untick", key: "a" }, { op: "tick", key: "c", at: 3 }] } });
  assert.deepEqual(r.json.done, { b: 2, c: 3 });
});

test("ticking something already ticked keeps the first time; a future time is clamped to now", async () => {
  const b = fakeBucket({ done: { a: 5 }, dismissed: {} });
  const r = await call(env(b), { method: "POST", body: { ops: [{ op: "tick", key: "a", at: 9 }, { op: "tick", key: "z", at: 9e15 }] } });
  assert.equal(r.json.done.a, 5);
  assert.ok(r.json.done.z <= Date.now());
});

test("ops apply in order, so tick then Undo leaves it unticked", async () => {
  const b = fakeBucket();
  const r = await call(env(b), { method: "POST", body: { ops: [{ op: "tick", key: "a", at: 1 }, { op: "untick", key: "a" }, { op: "dismiss", key: "m", at: 1 }, { op: "undismiss", key: "m" }] } });
  assert.deepEqual(r.json, { done: {}, dismissed: {} });
});

test("a write that races another device's is retried on top of it", async () => {
  const b = fakeBucket({ done: { a: 1 }, dismissed: {} });
  b.interfere = () => { b.text = JSON.stringify({ done: { a: 1, other: 7 }, dismissed: {} }); b.etag = "elsewhere"; };
  const r = await call(env(b), { method: "POST", body: { ops: [{ op: "tick", key: "mine", at: 2 }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.done, { a: 1, other: 7, mine: 2 });
  assert.deepEqual(b.state().done, { a: 1, other: 7, mine: 2 });
  assert.equal(b.puts, 2);
});

test("bad ops are skipped, bad bodies refused, and an op-less POST writes nothing", async () => {
  const b = fakeBucket({ done: { a: 1 }, dismissed: {} });
  const skipped = await call(env(b), { method: "POST", body: { ops: [{ op: "explode", key: "a" }, { op: "tick", key: "" }, { op: "tick", key: "x".repeat(401) }, { op: "tick", key: "ok", at: "soon" }, null] } });
  assert.equal(skipped.status, 200);
  assert.deepEqual(skipped.json.done, { a: 1 });
  assert.equal(b.puts, 0);
  assert.equal((await call(env(b), { method: "POST", body: "{nope" })).status, 400);
  assert.equal((await call(env(b), { method: "POST", body: { ops: "tick" } })).status, 400);
  assert.equal((await call(env(b), { method: "POST", body: { ops: Array(501).fill({ op: "tick", key: "k" }) } })).status, 400);
  assert.equal((await call(env(b), { method: "DELETE" })).status, 405);
});

test("a damaged file reads as empty instead of breaking the calendar", async () => {
  const b = fakeBucket();
  b.text = "not json"; b.etag = "e0";
  assert.deepEqual((await call(env(b))).json, { done: {}, dismissed: {} });
});

test("no token is 401, someone else's token 403, a forged one 401", async () => {
  const b = fakeBucket({ done: { secret: 1 }, dismissed: {} });
  assert.equal((await call(env(b), { auth: false })).status, 401);
  assert.equal((await call(env(b), { auth: await token({ email: "guest@example.com" }) })).status, 403);
  const good = await token();
  const forged = good.slice(0, good.lastIndexOf(".") + 1) + b64u(new Uint8Array(256));
  assert.equal((await call(env(b), { auth: forged })).status, 401);
  assert.equal((await call(env(b), { auth: await token({ exp: now() - 3600 }) })).status, 401);
  assert.equal((await call(env(b), { auth: await token({ iss: "https://evil.cloudflareaccess.com" }) })).status, 401);
  assert.equal((await call(env(b), { auth: await token({}, { alg: "none" }) })).status, 401);
});

test("the token is also read from the CF_Authorization cookie", async () => {
  const r = await call(env(fakeBucket()), { auth: false, headers: { Cookie: "x=1; CF_Authorization=" + await token() } });
  assert.equal(r.status, 200);
});

test("with an AUD set, a token for another Access app is refused", async () => {
  const e = env(fakeBucket(), { CALENDAR_ACCESS_AUD: "calendar-aud" });
  assert.equal((await call(e, { auth: await token({ aud: ["redzone-aud"] }) })).status, 401);
  assert.equal((await call(e, { auth: await token({ aud: ["calendar-aud"] }) })).status, 200);
});

test("fails closed: no allowlist or no bucket is 503", async () => {
  assert.equal((await call(env(fakeBucket(), { CALENDAR_OWNER_EMAILS: "" }))).status, 503);
  assert.equal((await call(env(undefined))).status, 503);
});

test("only calendar.jaredluyster.com serves it: pages.dev copies 404 even with a valid token", async () => {
  for (const host of ["https://mcboop-daily.pages.dev", "https://a1b2c3d4.mcboop-daily.pages.dev", "https://news.jaredluyster.com"]) {
    assert.equal((await call(env(fakeBucket()), { host })).status, 404, host);
  }
});

test("localhost works only with a dev email binding, and then skips the token", async () => {
  assert.equal((await call(env(fakeBucket()), { host: "http://localhost:8788", auth: false })).status, 404);
  const r = await call(env(fakeBucket(), { CALENDAR_DEV_EMAIL: "dev@localhost" }), { host: "http://localhost:8788", auth: false });
  assert.equal(r.status, 200);
});
