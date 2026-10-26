// Tests for the scored bias labels on /api/feeds in news/_worker.js.
// Run: node --test tests/*.test.mjs
//
// Every feed is stubbed to return one item, so the response carries one row per
// configured source with the bias it was scored from BIAS_RATINGS.

import test from "node:test";
import assert from "node:assert/strict";

const worker = (await import(new URL("../news/_worker.js", import.meta.url).href)).default;

globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
globalThis.fetch = async (url) => new Response(
  `<rss><channel><item><title>Story from ${url}</title><link>${url}#1</link>` +
  `<pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
  { headers: { "Content-Type": "application/rss+xml" } }
);

const res = await worker.fetch(new Request("https://news.jaredluyster.com/api/feeds"), {});
const { sections } = await res.json();
const bySource = {};
for (const items of Object.values(sections)) for (const it of items) bySource[it.source] = it;

test("every source gets a scored label; only uncovered outlets are unrated", () => {
  const sources = Object.keys(bySource);
  assert.ok(sources.length >= 20, "expected every configured source in the response");
  for (const [name, it] of Object.entries(bySource)) {
    if (name === "LEX 18") continue;
    assert.notEqual(it.bias, "unrated", `${name} has no BIAS_RATINGS entry`);
    assert.equal(typeof it.biasScore, "number", name);
  }
  assert.equal(bySource["LEX 18"].bias, "unrated");
  assert.equal(bySource["LEX 18"].biasScore, null);
});

test("averaged scores land in the expected buckets", () => {
  const expected = {
    "The Hill": "center",
    "NPR": "lean-left",
    "Mother Jones": "left",
    "Fox News": "right",
    "The Guardian": "lean-left",
    "WSJ Markets": "lean-right",
    "ABC 36 (WTVQ)": "center",
  };
  for (const [name, bias] of Object.entries(expected)) assert.equal(bySource[name].bias, bias, name);
});

test("hover note shows the score and each rater behind it", () => {
  assert.equal(bySource["The Hill"].biasNote, "Score −0.01 · AllSides Center · Ad Fontes −1.65 · MBFC +0.4");
  assert.equal(bySource["STAT News"].biasNote.includes("AllSides"), false);
});
