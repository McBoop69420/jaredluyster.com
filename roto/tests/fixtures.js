// Shared helpers for the roto test suites. No dependencies — bare `node --test`.

const COLORS = ["W", "U", "B", "R", "G"];
const RARITIES = ["common", "uncommon", "rare", "mythic"];

// Deterministic synthetic cube. Spreads colors, rarities, lands and creatures so the
// bot heuristic has something to actually discriminate on.
export function makeCube(size) {
  return Array.from({ length: size }, (_, i) => ({
    id: `c${i}`,
    name: `Card ${i}`,
    image: `https://example.invalid/${i}.jpg`,
    link: "",
    cmc: i % 7,
    colors: i % 9 === 0 ? [] : [COLORS[i % 5]],
    rarity: RARITIES[i % 4],
    isLand: i % 13 === 0,
    isCreature: i % 3 === 0,
  }));
}

export function config(overrides = {}) {
  return {
    cubeId: "test-cube",
    players: 8,
    packs: 3,
    packSize: 15,
    doublePickAfter: 0,
    seed: "fixture-seed",
    ...overrides,
  };
}

// Small deterministic PRNG so pick scripts are reproducible across engines.
export function rng(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// A pick script is a pure function (packLength) -> index. Both engines get the same
// one, so if they ever present differently-sized packs the parity test diverges loudly
// instead of silently comparing two different drafts.
export function scriptedPicker(seed) {
  const next = rng(seed);
  return (packLength) => Math.floor(next() * packLength);
}

// Reads a seat's pool as card names from either engine generation: the legacy engine
// stores card objects, the current one stores integer refs into draft.catalog.
export function poolNames(draft, seat) {
  return draft.pools[seat].map((entry) =>
    typeof entry === "number" ? draft.catalog[entry].name : entry.name
  );
}

export function packLength(draft, seat) {
  return draft.currentPacks[seat].length;
}

export function countByName(names) {
  const counts = new Map();
  for (const name of names) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

export function sameMultiset(a, b) {
  const left = countByName(a);
  const right = countByName(b);
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}
