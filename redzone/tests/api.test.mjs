// Run: node --test redzone/tests/api.test.mjs
// Exercises functions/redzone/api/[[path]].ts and _lib/access.ts with real RSA signatures;
// only the network fetch of Access's published keys is faked. (Node 24 strips the TS types.)
// Never served: functions/_middleware.ts 404s anything under /tests/.
import test from "node:test";
import assert from "node:assert/strict";

import { onRequest } from "../../functions/redzone/api/[[path]].ts";
import { authenticate, parseAllowlist } from "../../functions/redzone/_lib/access.ts";

const HOST = "https://redzone.jaredluyster.com";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

const signer = async (kid = "k1") => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "RS256", use: "sig" };
  return { privateKey: pair.privateKey, jwk, kid };
};

async function makeToken({ privateKey, kid }, claims, header = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT", ...header }));
  const p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

// One team domain per test => an isolated key cache, since the module caches keys per domain.
let n = 0;
const freshTeam = () => `team${++n}.cloudflareaccess.com`;

function mockCerts(byTeam) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u.hostname);
    const keys = byTeam[u.hostname];
    if (!keys) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify({ keys }), { status: 200 });
  };
  return calls;
}

const fakeR2 = (value) => {
  const bucket = { reads: 0, get: async () => { bucket.reads++; return value == null ? null : { text: async () => value }; } };
  return bucket;
};

const call = (env, { headers = {}, method = "GET", path = ["bets"], host = HOST } = {}) =>
  onRequest({ request: new Request(`${host}/redzone/api/${path.join("/")}`, { method, headers }), env, params: { path } });

const OWNER = "owner@example.com";
const baseEnv = (team, r2, extra = {}) => ({ ACCESS_TEAM_DOMAIN: team, BETS_ALLOWED_EMAILS: OWNER, REDZONE_BETS: r2, ...extra });
const goodClaims = (team, extra = {}) => ({ iss: `https://${team}`, exp: now() + 300, email: OWNER, aud: ["app-aud"], ...extra });
const BETS = JSON.stringify({ bets: [{ id: "x", stake: 10, legs: [] }] });

test("owner with a valid token gets the bets, uncacheable", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const r2 = fakeR2(BETS);
  const res = await call(baseEnv(team, r2), { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team)) } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), BETS);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
  assert.match(res.headers.get("Cache-Control"), /private/);
});

test("token can arrive via the CF_Authorization cookie; email match is case-insensitive", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const t = await makeToken(k, goodClaims(team, { email: "OWNER@Example.com" }));
  const res = await call(baseEnv(team, fakeR2(BETS)), { headers: { Cookie: `a=b; CF_Authorization=${t}; c=d` } });
  assert.equal(res.status, 200);
});

test("no stored object -> empty list, not an error", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const res = await call(baseEnv(team, fakeR2(null)), { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team)) } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { bets: [] });
});

test("a GUEST with a perfectly valid token is refused and R2 is never read", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const r2 = fakeR2(BETS);
  const res = await call(baseEnv(team, r2), { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team, { email: "guest@example.com" })) } });
  assert.equal(res.status, 403);
  assert.equal(r2.reads, 0);
  assert.doesNotMatch(await res.text(), /"stake"/);
});

test("service tokens (no email claim) are refused", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const { email, ...noEmail } = goodClaims(team);
  const res = await call(baseEnv(team, fakeR2(BETS)), { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, { ...noEmail, common_name: "svc" }) } });
  assert.equal(res.status, 403);
});

test("no token, garbage token, and a spoofed email header are all 401", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const env = baseEnv(team, fakeR2(BETS));
  assert.equal((await call(env)).status, 401);
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": "not.a.jwt" } })).status, 401);
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": "x" } })).status, 401);
  // The unsigned identity header Access also sets must never be trusted on its own.
  assert.equal((await call(env, { headers: { "Cf-Access-Authenticated-User-Email": OWNER } })).status, 401);
});

test("forged tokens: wrong key, alg none, alg HS256, tampered payload", async () => {
  const team = freshTeam(); const real = await signer(); const attacker = await signer(); // same kid, different key
  mockCerts({ [team]: [real.jwk] });
  const env = baseEnv(team, fakeR2(BETS));
  const claims = goodClaims(team);
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": await makeToken(attacker, claims) } })).status, 401);
  const noneTok = `${b64u(JSON.stringify({ alg: "none", kid: "k1" }))}.${b64u(JSON.stringify(claims))}.`;
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": noneTok } })).status, 401);
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": await makeToken(real, claims, { alg: "HS256" }) } })).status, 401);
  const good = await makeToken(real, claims);
  const [h, , s] = good.split(".");
  const tampered = `${h}.${b64u(JSON.stringify({ ...claims, email: "attacker@example.com" }))}.${s}`;
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": tampered } })).status, 401);
});

test("claims: wrong issuer, expired, not-yet-valid, wrong audience", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const hdr = async (c) => ({ "Cf-Access-Jwt-Assertion": await makeToken(k, c) });
  const env = baseEnv(team, fakeR2(BETS));
  assert.equal((await call(env, { headers: await hdr(goodClaims(team, { iss: "https://evil.cloudflareaccess.com" })) })).status, 401);
  assert.equal((await call(env, { headers: await hdr(goodClaims(team, { exp: now() - 3600 })) })).status, 401);
  assert.equal((await call(env, { headers: await hdr(goodClaims(team, { nbf: now() + 3600 })) })).status, 401);
  assert.equal((await call(env, { headers: await hdr({ ...goodClaims(team), exp: undefined }) })).status, 401); // exp is mandatory
  const pinned = baseEnv(team, fakeR2(BETS), { ACCESS_AUD: "app-aud" });
  assert.equal((await call(pinned, { headers: await hdr(goodClaims(team)) })).status, 200);
  assert.equal((await call(pinned, { headers: await hdr(goodClaims(team, { aud: ["some-other-app"] })) })).status, 401);
});

test("fails closed: no allowlist, no bucket, Access keys unreachable", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const headers = { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team)) };
  assert.equal((await call(baseEnv(team, fakeR2(BETS), { BETS_ALLOWED_EMAILS: "" }), { headers })).status, 503);
  assert.equal((await call(baseEnv(team, fakeR2(BETS), { BETS_ALLOWED_EMAILS: undefined }), { headers })).status, 503);
  assert.equal((await call(baseEnv(team, undefined), { headers })).status, 503);
  const down = freshTeam(); mockCerts({}); // certs endpoint 500s
  const res = await call(baseEnv(down, fakeR2(BETS)), { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(down)) } });
  assert.equal(res.status, 503);
  assert.notEqual(res.status, 200);
});

test("only answers on the Access-gated hostname; other hosts get a bare 404", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const headers = { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team)) };
  for (const host of ["https://jaredluyster-com.pages.dev", "https://jaredluyster.com", "http://localhost:8788"]) {
    const r2 = fakeR2(BETS);
    const res = await call(baseEnv(team, r2), { headers, host });
    assert.equal(res.status, 404, host);
    assert.equal(r2.reads, 0);
  }
});

test("routing and methods: unknown paths 404, writes are 405, HEAD has no body", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const headers = { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team)) };
  const env = baseEnv(team, fakeR2(BETS));
  assert.equal((await call(env, { headers, path: ["nope"] })).status, 404);
  assert.equal((await call(env, { headers, path: ["bets", "extra"] })).status, 404);
  for (const method of ["PUT", "POST", "DELETE", "PATCH"]) {
    const res = await onRequest({ request: new Request(`${HOST}/redzone/api/bets`, { method, headers, body: "{}" }), env, params: { path: ["bets"] } });
    assert.equal(res.status, 405, method);
  }
  const head = await call(env, { headers, method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  // Unauthenticated writes are rejected before they get as far as a method check.
  assert.equal((await onRequest({ request: new Request(`${HOST}/redzone/api/bets`, { method: "PUT", body: "{}" }), env, params: { path: ["bets"] } })).status, 401);
});

test("Access keys are cached, and unknown-kid refetches are rate limited", async () => {
  const team = freshTeam(); const k = await signer("k1"); const calls = mockCerts({ [team]: [k.jwk] });
  const env = baseEnv(team, fakeR2(BETS));
  const headers = { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team)) };
  await call(env, { headers }); await call(env, { headers }); await call(env, { headers });
  assert.equal(calls.length, 1, "valid tokens reuse the cached key set");
  const stranger = await signer("unknown-kid");
  const bad = { "Cf-Access-Jwt-Assertion": await makeToken(stranger, goodClaims(team)) };
  for (let i = 0; i < 20; i++) assert.equal((await call(env, { headers: bad })).status, 401);
  assert.ok(calls.length <= 2, `20 forged tokens caused ${calls.length} key fetches`);
});

test("key rotation inside the refetch floor fails closed, never open", async () => {
  const team = freshTeam(); const oldKey = await signer("old"); const newKey = await signer("new");
  const published = [oldKey.jwk];
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ keys: published }), { status: 200 }); };
  const env = baseEnv(team, fakeR2(BETS));
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": await makeToken(oldKey, goodClaims(team)) } })).status, 200);
  published.push(newKey.jwk);
  // Within the refetch floor the cached set is used, so the new key isn't seen yet -> refused (fail closed, not open).
  assert.equal((await call(env, { headers: { "Cf-Access-Jwt-Assertion": await makeToken(newKey, goodClaims(team)) } })).status, 401);
});

test("authenticate() itself refuses an empty allowlist (the route also checks; neither layer may be dropped)", async () => {
  const team = freshTeam(); const k = await signer(); mockCerts({ [team]: [k.jwk] });
  const request = new Request(`${HOST}/redzone/api/bets`, { headers: { "Cf-Access-Jwt-Assertion": await makeToken(k, goodClaims(team, { email: "anyone@example.com" })) } });
  for (const empty of ["", "  ", " , ; ", undefined]) {
    const r = await authenticate(request, { ACCESS_TEAM_DOMAIN: team, BETS_ALLOWED_EMAILS: empty });
    assert.deepEqual([r.ok, r.status], [false, 503], JSON.stringify(empty));
  }
  assert.deepEqual([...parseAllowlist("A@x.com, b@y.com;  C@z.com")], ["a@x.com", "b@y.com", "c@z.com"]);
});
