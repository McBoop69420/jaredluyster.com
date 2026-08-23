// Pure draft engine — no DOM. Shared by app.js and the node tests.

const RARITY_WEIGHT = { common: 1, uncommon: 1.35, rare: 1.8, mythic: 2.1 };

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

export function createDraft(config, cards) {
  const needed = config.players * config.packs * config.packSize;
  const random = mulberry32(hashSeed(config.seed));
  const supply = drawSupply(cards, needed, random);
  const rounds = [];

  let cursor = 0;
  for (let round = 0; round < config.packs; round += 1) {
    const seats = [];
    for (let seat = 0; seat < config.players; seat += 1) {
      seats.push(supply.slice(cursor, cursor + config.packSize));
      cursor += config.packSize;
    }
    rounds.push(seats);
  }

  return {
    config,
    rounds,
    round: 0,
    pickNumber: 1,
    picksTakenThisStep: 0,
    currentPacks: rounds[0].map((pack) => pack.slice()),
    pools: Array.from({ length: config.players }, () => []),
    botColors: Array.from({ length: config.players }, () => ({})),
    finished: false,
  };
}

export function picksThisStep(draft) {
  const { doublePickAfter } = draft.config;
  return doublePickAfter > 0 && draft.pickNumber > doublePickAfter ? 2 : 1;
}

// Cards the human still owes on this pick, capped by what's left in the pack.
export function picksRemaining(draft) {
  const available = draft.picksTakenThisStep + draft.currentPacks[0].length;
  return Math.min(picksThisStep(draft), available) - draft.picksTakenThisStep;
}

// Takes one card for the human. Returns "same-pack" if they still owe a pick,
// "next-pick" once the table has passed, or "finished" when the draft is over.
export function pickCard(draft, index) {
  const pack = draft.currentPacks[0];
  const [card] = pack.splice(index, 1);
  draft.pools[0].push(card);
  draft.picksTakenThisStep += 1;

  if (picksRemaining(draft) > 0) {
    return "same-pack";
  }

  const wanted = picksThisStep(draft);
  for (let seat = 1; seat < draft.config.players; seat += 1) {
    takeBotPicks(draft, seat, wanted);
  }

  draft.picksTakenThisStep = 0;
  draft.pickNumber += 1;
  passPacks(draft);

  if (draft.currentPacks[0].length > 0) {
    return "next-pick";
  }

  return startNextRound(draft);
}

function startNextRound(draft) {
  draft.round += 1;
  draft.pickNumber = 1;
  draft.picksTakenThisStep = 0;

  if (draft.round >= draft.config.packs) {
    draft.finished = true;
    return "finished";
  }

  draft.currentPacks = draft.rounds[draft.round].map((pack) => pack.slice());
  return "next-pick";
}

function takeBotPicks(draft, seat, count) {
  const pack = draft.currentPacks[seat];

  for (let pick = 0; pick < count && pack.length > 0; pick += 1) {
    const [card] = pack.splice(chooseBotCard(pack, draft.botColors[seat]), 1);
    draft.pools[seat].push(card);

    for (const color of card.colors) {
      draft.botColors[seat][color] = (draft.botColors[seat][color] || 0) + 1;
    }
  }
}

function chooseBotCard(pack, colorCounts) {
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let index = 0; index < pack.length; index += 1) {
    const score = scoreCardForBot(pack[index], colorCounts);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function scoreCardForBot(card, colorCounts) {
  let score = RARITY_WEIGHT[card.rarity] || 1;

  if (card.colors.length === 0) {
    score += card.isLand ? -0.4 : 0.25;
  } else {
    const affinity = card.colors.reduce((total, color) => total + (colorCounts[color] || 0), 0);
    score += affinity * 0.09;
    score -= (card.colors.length - 1) * 0.35;
  }

  if (card.isCreature) {
    score += 0.15;
  }

  return score;
}

function passPacks(draft) {
  const { players } = draft.config;
  const passLeft = draft.round % 2 === 0;
  const next = new Array(players);

  for (let seat = 0; seat < players; seat += 1) {
    const target = passLeft ? (seat + 1) % players : (seat - 1 + players) % players;
    next[target] = draft.currentPacks[seat];
  }

  draft.currentPacks = next;
}

function drawSupply(cards, needed, random) {
  const supply = [];

  while (supply.length < needed) {
    const shuffled = shuffle(cards, random);
    supply.push(...shuffled.slice(0, Math.min(needed - supply.length, shuffled.length)));
  }

  return supply;
}

function shuffle(items, random) {
  const copy = items.slice();

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }

  return copy;
}

export function groupKey(card) {
  if (card.colors.length > 1) {
    return "M";
  }
  if (card.colors.length === 1) {
    return card.colors[0];
  }
  return card.isLand ? "L" : "C";
}

export function makeSeed() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(36)).join("-");
}

function hashSeed(seed) {
  let hash = 2166136261;

  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  return function nextRandom() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
