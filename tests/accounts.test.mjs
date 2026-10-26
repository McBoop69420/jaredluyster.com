// Accounts (sports/join/, /api/auth/*): email normalising, password hashing,
// the signed session cookie, and the sign-up / sign-in / sign-out flow against
// an in-memory stand-in for the SPORTS_BETS R2 bucket.
import test from "node:test";
import assert from "node:assert/strict";

const W = await import(new URL("../sports/_worker.js", import.meta.url).href);

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const ORIGIN = "https://sports.jaredluyster.com";

// Just enough of R2 for the account flow: get / put with the two conditions the worker uses.
function fakeBucket() {
  const objects = new Map();
  let n = 0;
  return {
    objects,
    async get(key) {
      const o = objects.get(key);
      return o ? { etag: o.etag, text: async () => o.body } : null;
    },
    async put(key, body, opts = {}) {
      const cur = objects.get(key);
      if (opts.onlyIf && opts.onlyIf.etagDoesNotMatch === "*" && cur) return null;
      if (opts.onlyIf && opts.onlyIf.etagMatches && (!cur || cur.etag !== opts.onlyIf.etagMatches)) return null;
      const o = { body, etag: "etag-" + ++n };
      objects.set(key, o);
      return { etag: o.etag };
    },
  };
}

function env(extra = {}) {
  return { SPORTS_BETS: fakeBucket(), SESSION_SECRET: SECRET, ...extra };
}

function post(path, body, headers = {}) {
  return new Request(ORIGIN + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

function cookieFrom(res) {
  const set = res.headers.get("Set-Cookie") || "";
  const m = /sports_session=([^;]+)/.exec(set);
  return m ? m[1] : null;
}

test("normalizeEmail trims, lowercases and rejects non-addresses", () => {
  assert.equal(W.normalizeEmail("  Jared@Example.COM "), "jared@example.com");
  assert.equal(W.normalizeEmail("no-at-sign"), null);
  assert.equal(W.normalizeEmail("two@@example.com"), null);
  assert.equal(W.normalizeEmail("spaces in@example.com"), null);
  assert.equal(W.normalizeEmail(""), null);
  assert.equal(W.normalizeEmail(undefined), null);
});

test("hashPassword round-trips through verifyPassword and never stores the password", async () => {
  const record = await W.hashPassword("correct horse");
  assert.equal(record.alg, "PBKDF2-SHA256");
  assert.ok(!JSON.stringify(record).includes("correct horse"));
  assert.equal(await W.verifyPassword("correct horse", record), true);
  assert.equal(await W.verifyPassword("wrong horse", record), false);
});

test("hashPassword salts every record", async () => {
  const a = await W.hashPassword("same password");
  const b = await W.hashPassword("same password");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test("verifyPassword refuses a malformed record", async () => {
  assert.equal(await W.verifyPassword("x", null), false);
  assert.equal(await W.verifyPassword("x", { alg: "md5", salt: "a", hash: "b", iterations: 1 }), false);
});

test("a session round-trips and is refused when tampered, expired or unconfigured", async () => {
  const e = env();
  const now = Date.now();
  const token = await W.signSession("jared@example.com", e, now);
  assert.equal(await W.readSession(token, e, now), "jared@example.com");

  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ email: "boss@example.com", exp: 9999999999 })).toString("base64url");
  assert.equal(await W.readSession(forged + "." + sig, e, now), null, "payload change must break the signature");

  const later = now + 31 * 24 * 60 * 60 * 1000;
  assert.equal(await W.readSession(token, e, later), null, "expired session");

  assert.equal(await W.readSession(token, env({ SESSION_SECRET: "too-short" }), now), null);
  assert.equal(await W.readSession(null, e, now), null);
  assert.ok(payload);
});

test("sign-up creates the account, sets a session, and refuses a second sign-up", async () => {
  const e = env();
  const first = await W.handleAuth(post("/api/auth/signup", { email: "New@Example.com", password: "long enough pw" }), e);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { email: "new@example.com" });
  const token = cookieFrom(first);
  assert.ok(token, "sets sports_session");
  assert.match(first.headers.get("Set-Cookie"), /HttpOnly/);
  assert.match(first.headers.get("Set-Cookie"), /Secure/);
  assert.match(first.headers.get("Set-Cookie"), /SameSite=Lax/);

  const stored = JSON.parse(e.SPORTS_BETS.objects.get(W.accountKeyFor("new@example.com")).body);
  assert.ok(!JSON.stringify(stored).includes("long enough pw"), "password is not stored in clear");

  const again = await W.handleAuth(post("/api/auth/signup", { email: "new@example.com", password: "another long pw" }), e);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, "email-taken");
});

test("sign-up enforces the password length and the email shape", async () => {
  const e = env();
  const short = await W.handleAuth(post("/api/auth/signup", { email: "a@example.com", password: "short" }), e);
  assert.equal(short.status, 400);
  assert.equal((await short.json()).error, "bad-password");
  const bad = await W.handleAuth(post("/api/auth/signup", { email: "nope", password: "long enough pw" }), e);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "bad-email");
});

test("sign-in works with the right password and refuses the wrong one", async () => {
  const e = env();
  await W.handleAuth(post("/api/auth/signup", { email: "fan@example.com", password: "long enough pw" }), e);

  const ok = await W.handleAuth(post("/api/auth/login", { email: "FAN@example.com", password: "long enough pw" }), e);
  assert.equal(ok.status, 200);
  assert.ok(cookieFrom(ok));

  const wrong = await W.handleAuth(post("/api/auth/login", { email: "fan@example.com", password: "not it at all" }), e);
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, "bad-credentials");

  const nobody = await W.handleAuth(post("/api/auth/login", { email: "ghost@example.com", password: "long enough pw" }), e);
  assert.equal(nobody.status, 401);
  assert.equal((await nobody.json()).error, "bad-credentials", "unknown email looks the same as a wrong password");
});

test("/api/auth/me reads the cookie; logout clears it", async () => {
  const e = env();
  const signup = await W.handleAuth(post("/api/auth/signup", { email: "me@example.com", password: "long enough pw" }), e);
  const token = cookieFrom(signup);

  const me = await W.handleAuth(new Request(ORIGIN + "/api/auth/me", { headers: { Cookie: "sports_session=" + token } }), e);
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { email: "me@example.com" });

  const anon = await W.handleAuth(new Request(ORIGIN + "/api/auth/me"), e);
  assert.equal(anon.status, 401);

  const out = await W.handleAuth(post("/api/auth/logout", null), e);
  assert.equal(out.status, 200);
  assert.match(out.headers.get("Set-Cookie"), /sports_session=;.*Max-Age=0/);
});

test("auth answers 503 until both the bucket and SESSION_SECRET exist", async () => {
  const noSecret = await W.handleAuth(post("/api/auth/signup", { email: "a@example.com", password: "long enough pw" }), env({ SESSION_SECRET: "" }));
  assert.equal(noSecret.status, 503);
  const noBucket = await W.handleAuth(post("/api/auth/signup", { email: "a@example.com", password: "long enough pw" }), env({ SPORTS_BETS: null }));
  assert.equal(noBucket.status, 503);
});

test("POSTs from another origin or without JSON are refused", async () => {
  const e = env();
  const cross = await W.handleAuth(post("/api/auth/login", { email: "a@example.com", password: "x" }, { Origin: "https://evil.example" }), e);
  assert.equal(cross.status, 403);
  const form = new Request(ORIGIN + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
    body: "email=a%40example.com&password=x",
  });
  assert.equal((await W.handleAuth(form, e)).status, 415);
});

test("a join-page session also identifies the My Bets owner", async () => {
  const e = env();
  const token = await W.signSession("owner@example.com", e);
  const req = new Request(ORIGIN + "/api/bets", { headers: { Cookie: "sports_session=" + token } });
  const auth = await W.authenticateUser(req, e);
  assert.deepEqual(auth, { ok: true, email: "owner@example.com" });
  assert.equal(W.betsKeyFor("owner@example.com"), "bets/owner%40example.com.json", "same key as before accounts");
});
