// Verifies the signed JWT that Cloudflare Access attaches to every request it has
// authenticated (header `Cf-Access-Jwt-Assertion`, also the `CF_Authorization` cookie).
//
// Access already blocks logged-out traffic to redzone.jaredluyster.com at the edge. This
// exists because Access lets *guests* through to that hostname (the `Redzone guest access`
// policy) and the bet data is the owner's alone — so the API has to check WHO got through,
// and it must do that from a signed token, not from a header a client could set on some
// other hostname. This file exports helpers only (no onRequest*), so Pages doesn't turn it
// into a route.

const DEFAULT_TEAM_DOMAIN = "quiet-frost-ed57.cloudflareaccess.com"; // the Zero Trust org, see DEPLOY.md
const KEYS_TTL_MS = 10 * 60 * 1000;
// A token naming an unknown key makes us refetch the key set; without a floor, anyone able
// to send requests could turn that into a stream of fetches to Cloudflare.
const REFETCH_FLOOR_MS = 60 * 1000;
const CLOCK_SKEW_S = 30;

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string; // override of DEFAULT_TEAM_DOMAIN (tests)
  ACCESS_AUD?: string; // the Access application's AUD tag; when set, tokens for other apps are refused
  BETS_ALLOWED_EMAILS?: string; // comma/space separated; a SECRET, never committed (the repo is public)
}

export type AuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

type KeyCache = { team: string; at: number; keys: Map<string, CryptoKey> };
let keyCache: KeyCache | null = null;

export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJsonPart(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function loadKeys(team: string, forceRefresh: boolean): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (keyCache && keyCache.team === team) {
    const age = now - keyCache.at;
    if (age < KEYS_TTL_MS && !forceRefresh) return keyCache.keys;
    if (forceRefresh && age < REFETCH_FLOOR_MS) return keyCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access key fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
    );
  }
  keyCache = { team, at: now, keys };
  return keys;
}

function tokenFrom(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const cookie = request.headers.get("Cookie") ?? "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m ? m[1] : null;
}

type Verified = { status: "ok"; email: string | null } | { status: "invalid" } | { status: "unavailable" };

export async function verifyAccessJwt(token: string, env: AccessEnv, nowMs = Date.now()): Promise<Verified> {
  const parts = token.split(".");
  if (parts.length !== 3) return { status: "invalid" };
  const [h, p, s] = parts;
  const header = parseJsonPart(h);
  const claims = parseJsonPart(p);
  // Pin the algorithm: never let the token choose "none" or an HMAC keyed by a public value.
  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string") return { status: "invalid" };

  const team = (env.ACCESS_TEAM_DOMAIN || DEFAULT_TEAM_DOMAIN).toLowerCase();
  let signature: Uint8Array;
  try {
    signature = b64urlToBytes(s);
  } catch {
    return { status: "invalid" };
  }

  try {
    let keys = await loadKeys(team, false);
    let key = keys.get(header.kid);
    if (!key) {
      keys = await loadKeys(team, true); // key rotation: look again, at most once a minute
      key = keys.get(header.kid);
    }
    if (!key) return { status: "invalid" };
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${h}.${p}`));
    if (!valid) return { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }

  const nowS = Math.floor(nowMs / 1000);
  if (claims.iss !== `https://${team}`) return { status: "invalid" };
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < nowS) return { status: "invalid" };
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) return { status: "invalid" };
  if (env.ACCESS_AUD) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(env.ACCESS_AUD)) return { status: "invalid" };
  }
  return { status: "ok", email: typeof claims.email === "string" ? claims.email.toLowerCase() : null };
}

// 401 = no valid Access identity; 403 = a valid identity that isn't on the allowlist (a guest);
// 503 = we can't tell (Access keys unreachable, or no allowlist configured) — always fail closed.
export async function authenticate(request: Request, env: AccessEnv): Promise<AuthResult> {
  const allowed = parseAllowlist(env.BETS_ALLOWED_EMAILS);
  if (!allowed.size) return { ok: false, status: 503, error: "not-configured" };
  const token = tokenFrom(request);
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };
  const v = await verifyAccessJwt(token, env);
  if (v.status === "unavailable") return { ok: false, status: 503, error: "auth-unavailable" };
  if (v.status !== "ok") return { ok: false, status: 401, error: "unauthenticated" };
  // Service tokens carry no email; they were never granted this data.
  if (!v.email || !allowed.has(v.email)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, email: v.email };
}
