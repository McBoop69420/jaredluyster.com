// Tests for the private-path gate in news/_worker.js (mcboop-daily Pages project).
// Run: node --test tests/*.test.mjs
//
// The point: calendar.json and archive/ are private data layered into the deploy, and
// mcboop-daily.pages.dev (plus each deploy's <id>.mcboop-daily.pages.dev) serves them with
// no login. The Worker must 404 those paths on every hostname that isn't behind Access,
// while leaving the paths deploy-pages.sh's unauthenticated post-deploy check needs alone.
//
// WORKER_UNDER_TEST=<path> points the suite at another copy of the Worker (used to
// mutation-test that these assertions really fail when the gate is removed).

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const workerUrl = process.env.WORKER_UNDER_TEST
  ? pathToFileURL(process.env.WORKER_UNDER_TEST).href
  : new URL("../news/_worker.js", import.meta.url).href;
const worker = (await import(workerUrl)).default;

// /api/feeds reads the Workers cache; a warm cache lets us reach it without network.
globalThis.caches = { default: { match: async () => new Response("FEEDS"), put: async () => {} } };

const env = {
  ASSETS: {
    fetch: async (req) => new Response("ASSET " + new URL(req.url).pathname, {
      headers: { "Content-Type": "text/plain" },
    }),
  },
};

async function get(url) {
  const res = await worker.fetch(new Request(url), env);
  return { status: res.status, body: await res.text(), headers: res.headers };
}

const UNGATED = [
  "https://mcboop-daily.pages.dev",
  "https://a1b2c3d4.mcboop-daily.pages.dev",
  "https://example.com",
];
const GATED = [
  "https://calendar.jaredluyster.com",
  "https://news.jaredluyster.com",
  "http://localhost:8788",
];

for (const host of UNGATED) {
  test(`${host}: private data is not served`, async () => {
    for (const path of [
      "/calendar.json",
      "/calendar.json?v=123",
      "/Calendar.JSON",
      "/%63alendar.json",
      "/archive",
      "/archive/",
      "/archive/2026-09-01/index.html",
      "/ARCHIVE/x.json",
      "/%61rchive/x.json",
      "/%zz-not-valid-percent-encoding",
    ]) {
      const r = await get(host + path);
      assert.equal(r.status, 404, `${host}${path} should be 404, got ${r.status}`);
      assert.doesNotMatch(r.body, /^ASSET/, `${host}${path} leaked an asset`);
    }
  });

  test(`${host}: what deploy verification and the shells need still works`, async () => {
    assert.equal((await get(host + "/app.js")).body, "ASSET /app.js");
    assert.equal((await get(host + "/api/feeds")).body, "FEEDS");
    assert.equal((await get(host + "/calendar/calendar.js")).body, "ASSET /calendar/calendar.js");
    assert.equal((await get(host + "/calendar/todos.json")).body, "ASSET /calendar/todos.json");
  });
}

for (const host of GATED) {
  test(`${host}: gated hostnames still get calendar.json (no-cache) and archive`, async () => {
    const cal = await get(host + "/calendar.json");
    assert.equal(cal.status, 200);
    assert.equal(cal.body, "ASSET /calendar.json");
    assert.match(cal.headers.get("Cache-Control"), /no-cache/);
    // Not blocked. (The calendar host's subsite router still prefixes /calendar, as before.)
    const arch = await get(host + "/archive/x.json");
    assert.equal(arch.status, 200);
    assert.match(arch.body, /^ASSET .*\/archive\/x\.json$/);
  });
}

test("calendar.jaredluyster.com still serves the calendar shell at the root", async () => {
  assert.equal((await get("https://calendar.jaredluyster.com/")).body, "ASSET /calendar/");
});
