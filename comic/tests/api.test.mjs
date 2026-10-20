// Run: node --test comic/tests/api.test.mjs
// Exercises functions/comic/api/[[path]].ts and _lib/plan.ts against an in-memory R2 fake.
// Access JWT verification itself is covered by redzone/tests/api.test.mjs (same module);
// here the private routes are reached through the localhost dev bypass, and the production
// host is checked to refuse without a token. Never served: the middleware 404s /tests/.
import test from "node:test";
import assert from "node:assert/strict";

import { onRequest } from "../../functions/comic/api/[[path]].ts";
import { derivePublished, normalizePlan, publicImageIds, visible } from "../../functions/comic/_lib/plan.ts";

function fakeR2() {
  const store = new Map();
  let n = 0;
  const meta = (key, v) => ({ key, etag: v.etag, httpEtag: `"${v.etag}"`, httpMetadata: v.httpMetadata });
  return {
    store,
    async get(key) {
      const v = store.get(key);
      if (!v) return null;
      return { ...meta(key, v), body: v.bytes, text: async () => new TextDecoder().decode(v.bytes) };
    },
    async head(key) {
      const v = store.get(key);
      return v ? meta(key, v) : null;
    },
    async put(key, value, opts = {}) {
      const cur = store.get(key);
      if (opts.onlyIf?.etagMatches && (!cur || cur.etag !== opts.onlyIf.etagMatches)) return null;
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
      const v = { bytes, etag: `e${++n}`, httpMetadata: opts.httpMetadata };
      store.set(key, v);
      return meta(key, v);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const DEV = "http://comic.localhost:8793";
const PROD = "https://comic.jaredluyster.com";

function call(env, path, { method = "GET", headers = {}, body, host = DEV } = {}) {
  const segs = path.split("/");
  const request = new Request(`${host}/comic/api/${path}`, { method, headers, body });
  return onRequest({ request, env, params: { path: segs } });
}

const devEnv = (bucket = fakeR2()) => ({ COMIC: bucket, COMIC_DEV_EMAIL: "dev@localhost" });

const strip = (id, extra = {}) => ({
  id,
  title: `Strip ${id}`,
  status: "posted",
  date: "2026-01-01",
  note: "public note",
  alt: "",
  notes: "SECRET private notes",
  panels: [{ id: `${id}-p1`, scene: "SECRET script", lines: [{ who: "Max", text: "SECRET line" }] }],
  image: { id: `img-${id}`, w: 1200, h: 400 },
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const planWith = (strips, cast = []) => ({ version: 1, settings: { title: "T", tagline: "", about: "" }, strips, cast, ideas: [] });

async function save(env, plan, etag) {
  return call(env, "private/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify(plan),
  });
}

// ---- Pure rules -------------------------------------------------------------

test("derivePublished keeps only posted strips with art and a date, and drops private fields", () => {
  const plan = normalizePlan(
    planWith([
      strip("a"),
      strip("b", { status: "inks" }),
      strip("c", { image: null }),
      strip("d", { date: "" }),
      strip("e", { date: "2025-06-01" }),
    ]),
  );
  const pub = derivePublished(plan);
  assert.deepEqual(pub.strips.map((s) => s.id), ["e", "a"]); // oldest first
  const text = JSON.stringify(pub);
  assert.ok(!text.includes("SECRET"), "private notes, scripts and dialogue must not be published");
});

test("scheduled strips stay hidden and unnumbered until their day", () => {
  const pub = derivePublished(normalizePlan(planWith([strip("a"), strip("b", { date: "2026-03-01" }), strip("c", { date: "2026-02-01" })])));
  assert.deepEqual(visible(pub, "2026-02-15").strips.map((s) => [s.n, s.id]), [[1, "a"], [2, "c"]]);
  assert.ok(!publicImageIds(pub, "2026-02-15").has("img-b"));
  assert.ok(publicImageIds(pub, "2026-03-01").has("img-b"));
});

test("only characters marked public (and named) are published, without their notes", () => {
  const cast = [
    { id: "max", name: "Max", role: "kid", bio: "bio", notes: "SECRET", public: true, image: { id: "img-max", w: 1, h: 1 } },
    { id: "hid", name: "Hidden", role: "", bio: "", notes: "", public: false, image: { id: "img-hid", w: 1, h: 1 } },
    { id: "blank", name: "  ", role: "", bio: "", notes: "", public: true, image: null },
  ];
  const pub = derivePublished(normalizePlan(planWith([], cast)));
  assert.deepEqual(pub.cast.map((c) => c.id), ["max"]);
  assert.ok(!JSON.stringify(pub).includes("SECRET"));
  const ids = publicImageIds(pub, "2026-01-01");
  assert.ok(ids.has("img-max") && !ids.has("img-hid"));
});

test("normalizePlan drops bad ids, bad dates, duplicate ids and unknown statuses", () => {
  const plan = normalizePlan({
    strips: [
      strip("ok"),
      strip("ok"),
      strip("Bad Id"),
      strip("baddate", { date: "2026-02-30" }),
      strip("weird", { status: "published", image: { id: "../etc", w: 1, h: 1 } }),
    ],
    extra: "dropped",
  });
  assert.deepEqual(plan.strips.map((s) => s.id), ["ok", "baddate", "weird"]);
  assert.equal(plan.strips[1].date, "");
  assert.equal(plan.strips[2].status, "idea");
  assert.equal(plan.strips[2].image, null);
  assert.equal(plan.extra, undefined);
  assert.equal(normalizePlan(null), null);
  assert.equal(normalizePlan([1, 2]), null);
});

// ---- Endpoint ---------------------------------------------------------------

test("public site is empty before anything is saved", async () => {
  const res = await call(devEnv(), "public/site");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.strips, []);
  assert.match(res.headers.get("Cache-Control"), /public/);
});

test("saving the plan publishes the public slice", async () => {
  const env = devEnv();
  const first = await call(env, "private/plan");
  assert.equal(first.headers.get("ETag"), '"new"');
  const res = await save(env, planWith([strip("a"), strip("b", { status: "pencils" })]), '"new"');
  assert.equal(res.status, 200);
  const site = await (await call(env, "public/site")).json();
  assert.deepEqual(site.strips.map((s) => [s.n, s.id]), [[1, "a"]]);
  assert.ok(!JSON.stringify(site).includes("SECRET"));
});

test("a save with a stale ETag is refused (412) instead of overwriting newer work", async () => {
  const env = devEnv();
  const r1 = await save(env, planWith([strip("a")]), '"new"');
  const etag1 = r1.headers.get("ETag");
  const r2 = await save(env, planWith([strip("a"), strip("b")]), etag1); // laptop
  assert.equal(r2.status, 200);
  const r3 = await save(env, planWith([]), etag1); // phone, still holding the old copy
  assert.equal(r3.status, 412);
  const kept = await (await call(env, "private/plan")).json();
  assert.equal(kept.strips.length, 2);
  // A second "first save" can't clobber an existing plan either.
  assert.equal((await save(env, planWith([]), '"new"')).status, 412);
  // And a missing If-Match is refused outright.
  const noMatch = await call(env, "private/plan", { method: "PUT", body: JSON.stringify(planWith([])) });
  assert.equal(noMatch.status, 428);
});

test("bad bodies are refused", async () => {
  const env = devEnv();
  const bad = await call(env, "private/plan", { method: "PUT", headers: { "If-Match": '"new"' }, body: "{nope" });
  assert.equal(bad.status, 400);
  const notObj = await call(env, "private/plan", { method: "PUT", headers: { "If-Match": '"new"' }, body: "[]" });
  assert.equal(notObj.status, 400);
  const huge = await call(env, "private/plan", { method: "PUT", headers: { "If-Match": '"new"' }, body: "x".repeat(2 * 1024 * 1024 + 1) });
  assert.equal(huge.status, 413);
});

test("images: only posted art is public; unposted and scheduled art stays private", async () => {
  const bucket = fakeR2();
  const env = devEnv(bucket);
  const png = new Uint8Array([137, 80, 78, 71]);
  for (const id of ["img-a", "img-b", "img-c"]) {
    const up = await call(env, `private/img/${id}`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png });
    assert.equal(up.status, 200);
  }
  await save(env, planWith([strip("a"), strip("b", { status: "inks" }), strip("c", { date: "2999-01-01" })]), '"new"');

  const a = await call(env, "public/img/img-a");
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("Content-Type"), "image/png");
  assert.match(a.headers.get("Cache-Control"), /immutable/);
  assert.equal((await call(env, "public/img/img-b")).status, 404, "unposted art");
  assert.equal((await call(env, "public/img/img-c")).status, 404, "scheduled art");
  assert.equal((await call(env, "private/img/img-b")).status, 200, "the owner can still see it");

  const del = await call(env, "private/img/img-b", { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.ok(!bucket.store.has("img/img-b"));
});

test("image uploads must be an allowed image type and size", async () => {
  const env = devEnv();
  const svg = await call(env, "private/img/x1", { method: "PUT", headers: { "Content-Type": "image/svg+xml" }, body: "<svg/>" });
  assert.equal(svg.status, 415, "SVG could carry script, so it isn't accepted");
  const html = await call(env, "private/img/x2", { method: "PUT", headers: { "Content-Type": "text/html" }, body: "<b>" });
  assert.equal(html.status, 415);
  const empty = await call(env, "private/img/x3", { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array() });
  assert.equal(empty.status, 400);
  const badId = await call(env, "private/img/..%2Fplan.json", { method: "GET" });
  assert.equal(badId.status, 404);
});

test("the dev bypass only works on localhost; production requires Access", async () => {
  const bucket = fakeR2();
  // Production host with the dev email set: still needs a real login (the bypass is ignored).
  const prod = await call({ COMIC: bucket, COMIC_DEV_EMAIL: "dev@localhost", COMIC_OWNER_EMAILS: "o@example.com" }, "private/plan", { host: PROD });
  assert.equal(prod.status, 401);
  // No allowlist configured: fail closed.
  const unset = await call({ COMIC: bucket }, "private/plan", { host: PROD });
  assert.equal(unset.status, 503);
  // Localhost without the dev email: no private routes at all.
  assert.equal((await call({ COMIC: bucket }, "private/plan")).status, 404);
  // Public routes work on the real host without a login.
  assert.equal((await call({ COMIC: bucket }, "public/site", { host: PROD })).status, 200);
});

test("other hosts (the ungated *.pages.dev copy) get nothing", async () => {
  const env = devEnv();
  const res = await call(env, "public/site", { host: "https://jaredluyster-com.pages.dev" });
  assert.equal(res.status, 404);
  const priv = await call(env, "private/plan", { host: "https://jaredluyster-com.pages.dev" });
  assert.equal(priv.status, 404);
});

test("no bucket bound: 503, not a crash", async () => {
  assert.equal((await call({}, "public/site")).status, 503);
});
