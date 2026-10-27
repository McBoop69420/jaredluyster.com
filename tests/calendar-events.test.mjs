// Tests for /api/events in news/_worker.js: events added on the calendar page,
// kept in their own R2 file (events.json) beside the published calendar.json.
// Run: node --test tests/*.test.mjs
//
// Same harness as calendar-ticks.test.mjs: real RSA signatures, faked key fetch and bucket.

import test from "node:test";
import assert from "node:assert/strict";

const worker = (await import(new URL("../news/_worker.js", import.meta.url).href)).default;

const HOST = "https://calendar.jaredluyster.com";
const OWNER = "owner@example.com";
const TEAM = "team-events.cloudflareaccess.com";
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

async function call(e, { method = "GET", body, host = HOST, auth = true } = {}) {
  const h = {};
  if (auth === true) h["Cf-Access-Jwt-Assertion"] = await token();
  const init = { method, headers: h };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await worker.fetch(new Request(`${host}/api/events`, init), e);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (err) { /* not JSON */ }
  return { status: res.status, json, headers: res.headers };
}

const LIFT = { id: "abc123", title: "Weightlifting", date: "2026-10-27", start: "12:00", end: "13:00",
  location: "Gym", recurrence: { freq: "weekly", byDay: "TU,TH" } };
const strip = (evs) => evs.map(({ added, ...rest }) => rest);

test("an empty list before anything is added, uncacheable", async () => {
  const r = await call(env(fakeBucket()));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { events: [] });
  assert.match(r.headers.get("Cache-Control"), /private, no-store/);
});

test("an added event is stored and comes back on the next read", async () => {
  const b = fakeBucket();
  const r = await call(env(b), { method: "POST", body: { op: "add", event: LIFT } });
  assert.equal(r.status, 200);
  assert.deepEqual(strip(r.json.events), [LIFT]);
  assert.equal(typeof r.json.events[0].added, "number");
  assert.deepEqual(strip((await call(env(b))).json.events), [LIFT]);
});

test("adding the same id twice keeps one; delete removes it", async () => {
  const b = fakeBucket();
  await call(env(b), { method: "POST", body: { op: "add", event: LIFT } });
  const again = await call(env(b), { method: "POST", body: { op: "add", event: { ...LIFT, title: "Dupe" } } });
  assert.deepEqual(strip(again.json.events), [LIFT]);
  const del = await call(env(b), { method: "POST", body: { op: "delete", id: LIFT.id } });
  assert.deepEqual(del.json.events, []);
});

test("only the known fields are kept, trimmed", async () => {
  const b = fakeBucket();
  const r = await call(env(b), { method: "POST", body: { op: "add", event:
    { id: "xyz789", title: "  Dinner  ", date: "2026-11-02", start: "18:30", location: "", url: "https://x", type: "sports" } } });
  assert.deepEqual(strip(r.json.events), [{ id: "xyz789", title: "Dinner", date: "2026-11-02", start: "18:30" }]);
});

test("bad events and bad ops are refused without writing", async () => {
  const b = fakeBucket();
  const bad = [
    { ...LIFT, id: "x" }, { ...LIFT, title: "" }, { ...LIFT, title: "x".repeat(121) },
    { ...LIFT, date: "2026-13-01" }, { ...LIFT, start: "25:00" }, { ...LIFT, start: undefined },
    { ...LIFT, recurrence: { freq: "daily" } }, { ...LIFT, recurrence: { freq: "weekly", byDay: "XX" } },
  ];
  for (const event of bad) {
    assert.equal((await call(env(b), { method: "POST", body: { op: "add", event } })).status, 400, JSON.stringify(event));
  }
  assert.equal((await call(env(b), { method: "POST", body: { op: "nope" } })).status, 400);
  assert.equal((await call(env(b), { method: "POST", body: "{" })).status, 400);
  assert.equal((await call(env(b), { method: "PUT" })).status, 405);
  assert.equal(b.puts, 0);
});

test("a write that races another one is retried on top of it", async () => {
  const b = fakeBucket({ events: [] });
  b.interfere = () => { b.text = JSON.stringify({ events: [{ ...LIFT, id: "other1", added: 1 }] }); b.etag = "x"; };
  const r = await call(env(b), { method: "POST", body: { op: "add", event: LIFT } });
  assert.deepEqual(r.json.events.map(e => e.id), ["other1", "abc123"]);
});

test("a damaged file reads as empty; damaged entries are dropped", async () => {
  const b = fakeBucket();
  b.text = "not json"; b.etag = "e0";
  assert.deepEqual((await call(env(b))).json, { events: [] });
  b.text = JSON.stringify({ events: [LIFT, { title: "no id" }] });
  assert.deepEqual(strip((await call(env(b))).json.events), [LIFT]);
});

test("same gate as ticks: no token 401, pages.dev 404, no bucket 503", async () => {
  assert.equal((await call(env(fakeBucket()), { auth: false })).status, 401);
  assert.equal((await call(env(fakeBucket()), { host: "https://mcboop-daily.pages.dev" })).status, 404);
  assert.equal((await call(env(null))).status, 503);
});
