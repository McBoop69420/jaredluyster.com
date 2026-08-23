// localStorage persistence for solo drafts and multiplayer seat tokens.
//
// The card catalog is written once per draft and the mutable slice on every pick. Before
// refs this module's predecessor reserialized every card object on each click — roughly
// 100 KB per pick for a full table.

const DRAFT_KEY = "roto.draft.v2";
const CATALOG_KEY = "roto.catalog.v2";
const LEGACY_KEYS = ["roto.draft.v1"];
const SEAT_PREFIX = "roto.seat.";

export function saveDraft(draft) {
  try {
    const { catalog, ...slice } = draft;
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(slice));
  } catch (error) {
    console.warn("Could not save draft progress", error);
  }
}

export function loadDraft() {
  discardLegacy();

  const slice = readJson(DRAFT_KEY);
  const catalog = readJson(CATALOG_KEY);

  if (!slice?.config || !Array.isArray(slice.pools) || !Array.isArray(catalog)) {
    return null;
  }

  return { ...slice, catalog };
}

export function clearDraft() {
  window.localStorage.removeItem(DRAFT_KEY);
  window.localStorage.removeItem(CATALOG_KEY);
}

// Pre-refs saves stored whole card objects and cannot be resumed. Drop them rather than
// carrying a migration path for an unreleased format.
function discardLegacy() {
  for (const key of LEGACY_KEYS) {
    window.localStorage.removeItem(key);
  }
}

/* ---------- multiplayer seat tokens ---------- */

export function saveSeat(code, seat) {
  try {
    window.localStorage.setItem(SEAT_PREFIX + code, JSON.stringify(seat));
  } catch (error) {
    console.warn("Could not save seat token", error);
  }
}

export function loadSeat(code) {
  const seat = readJson(SEAT_PREFIX + code);
  return seat?.token ? seat : null;
}

export function clearSeat(code) {
  window.localStorage.removeItem(SEAT_PREFIX + code);
}

function readJson(key) {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
