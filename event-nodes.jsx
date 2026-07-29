// event-nodes.jsx — Wizard Battle · event-node icon system
// Line-art glyphs (sigil family) inside a containing frame, color-coded per
// node type, with four map states. Built crisp/SVG so they read at 40px and
// scale to any size. Exports to window for the main doc's babel scope.

// ─────────────────────────────────────────────────────────────
// Node types — color-coded by function (not by element).
// Hues are spaced around the wheel so a glance at the map separates them;
// Mystery stays rune-gold (the system's neutral) to read as "unknown".
// ─────────────────────────────────────────────────────────────
const NODE_TYPES = [
  { id: "duel",     name: "Duel",     fn: "Standard wizard fight",        color: "#ff5a4d", glyph: "duel" },
  { id: "elite",    name: "Elite",    fn: "Marked, tougher opponent",     color: "#ff4d8d", glyph: "elite" },
  { id: "boss",     name: "Boss",     fn: "End-of-act archmage",          color: "#a96bff", glyph: "boss" },
  { id: "rest",     name: "Rest",     fn: "Heal or meditate at sanctum",  color: "#4db8ff", glyph: "rest" },
  { id: "shop",     name: "Shop",     fn: "Spend gold at the bazaar",     color: "#d8a544", glyph: "shop" },
  { id: "treasure", name: "Treasure", fn: "Loot a cache or relic",        color: "#45c97a", glyph: "treasure" },
  { id: "mystery",  name: "Mystery",  fn: "Unknown random encounter",     color: "#c9b06b", glyph: "mystery" },
];

const NODE_BY_ID = Object.fromEntries(NODE_TYPES.map(t => [t.id, t]));

// ─────────────────────────────────────────────────────────────
// Glyphs — 24×24 line-art, stroke = currentColor, round caps/joins.
// Kept geometric and open so the silhouette survives at 40px.
// ─────────────────────────────────────────────────────────────
function Glyph({ name }) {
  const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const F = { fill: "currentColor", stroke: "none" };
  switch (name) {
    case "duel": // crossed wands
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <line x1="6"  y1="18.5" x2="17.5" y2="7" />
          <line x1="18" y1="18.5" x2="6.5"  y2="7" />
          <circle cx="6"  cy="18.5" r="1.3" {...F} />
          <circle cx="18" cy="18.5" r="1.3" {...F} />
          <path d="M17.5 4.2 V9.8 M14.7 7 H20.3" strokeWidth="1.3" />
        </svg>
      );
    case "elite": // marked star
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <polygon points="12,2.5 13.7,10.3 21.5,12 13.7,13.7 12,21.5 10.3,13.7 2.5,12 10.3,10.3" />
          <path d="M18.5 4.4 V7.6 M16.9 6 H20.1" strokeWidth="1.2" />
          <path d="M5.5 16.4 V19.6 M3.9 18 H7.1" strokeWidth="1.2" />
        </svg>
      );
    case "boss": // crown
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <path d="M4 17.5 L5.6 8 L9.2 12.6 L12 6 L14.8 12.6 L18.4 8 L20 17.5 Z" />
          <line x1="4.8" y1="14.3" x2="19.2" y2="14.3" strokeWidth="1.2" />
          <circle cx="5.6" cy="8"  r="1.15" {...F} />
          <circle cx="12"  cy="6"  r="1.25" {...F} />
          <circle cx="18.4" cy="8" r="1.15" {...F} />
        </svg>
      );
    case "rest": // crescent moon + spark
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <path d="M17.5 5 A8.5 8.5 0 1 0 17.5 19 A6.5 6.5 0 1 1 17.5 5 Z" />
          <path d="M8.5 6 V9 M7 7.5 H10" strokeWidth="1.2" />
        </svg>
      );
    case "shop": // coin pouch
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <path d="M9 5.5 H15 M10 5.5 L9.4 8.4 M14 5.5 L14.6 8.4" />
          <path d="M9 8.4 Q5.5 20 12 20 Q18.5 20 15 8.4 Z" />
          <circle cx="12" cy="14" r="2.1" strokeWidth="1.3" />
        </svg>
      );
    case "treasure": // chest
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <path d="M5 13.5 V11.5 Q5 10 6.5 10 H17.5 Q19 10 19 11.5 V13.5" />
          <path d="M4.5 13.5 H19.5 V18.5 Q19.5 20 18 20 H6 Q4.5 20 4.5 18.5 Z" />
          <path d="M11 13.3 H13 V16.2 H11 Z" strokeWidth="1.3" />
        </svg>
      );
    case "mystery": // question rune
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <path d="M8.6 9 A3.6 3.6 0 1 1 13.4 11.4 C12 12.3 12 13 12 14.6" />
          <circle cx="12" cy="18.4" r="1.25" {...F} />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" {...S}>
          <path d="M8.5 11 V9 A3.5 3.5 0 0 1 15.5 9 V11" strokeWidth="1.6" />
          <rect x="6.5" y="11" width="11" height="8" rx="1.6" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" {...S} strokeWidth="2.6">
          <path d="M5 12.5 L10 17.5 L19 7" />
        </svg>
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Frame — the containing vessel. Double outline + cardinal seal dots,
// echoing the class-icon grammar. Three shapes to compare.
// ─────────────────────────────────────────────────────────────
function Frame({ shape }) {
  const ring = { fill: "none", stroke: "currentColor" };
  const seal = { fill: "currentColor", stroke: "none" };
  if (shape === "diamond") {
    return (
      <svg className="em-frame" viewBox="0 0 48 48">
        <polygon {...ring} strokeWidth="1.3" points="24,2 46,24 24,46 2,24" />
        <polygon {...ring} strokeWidth="2.2" points="24,7.5 40.5,24 24,40.5 7.5,24" />
        <circle {...seal} cx="24" cy="2.6" r="1.8" />
        <circle {...seal} cx="45.4" cy="24" r="1.8" />
        <circle {...seal} cx="24" cy="45.4" r="1.8" />
        <circle {...seal} cx="2.6" cy="24" r="1.8" />
      </svg>
    );
  }
  if (shape === "hex") {
    return (
      <svg className="em-frame" viewBox="0 0 48 48">
        <polygon {...ring} strokeWidth="1.3" points="24,2 43.1,13 43.1,35 24,46 4.9,35 4.9,13" />
        <polygon {...ring} strokeWidth="2.2" points="24,7.6 38.7,16 38.7,32 24,40.4 9.3,32 9.3,16" />
        <circle {...seal} cx="24" cy="2.4" r="1.8" />
        <circle {...seal} cx="24" cy="45.6" r="1.8" />
      </svg>
    );
  }
  // circle (default)
  return (
    <svg className="em-frame" viewBox="0 0 48 48">
      <circle {...ring} strokeWidth="1.3" cx="24" cy="24" r="22" />
      <circle {...ring} strokeWidth="2.2" cx="24" cy="24" r="17.6" />
      <circle {...seal} cx="24" cy="2.4" r="1.7" />
      <circle {...seal} cx="45.6" cy="24" r="1.7" />
      <circle {...seal} cx="24" cy="45.6" r="1.7" />
      <circle {...seal} cx="2.4" cy="24" r="1.7" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// NodeMarker — frame + glyph + state treatment.
// state: locked | available | active | cleared
// ─────────────────────────────────────────────────────────────
const STATE_CFG = {
  locked:    { glow: 0,  artOp: 1,    col: "#3c3947" },
  available: { glow: 4,  artOp: 1,    col: null },
  active:    { glow: 10, artOp: 1,    col: null },
  cleared:   { glow: 0,  artOp: 0.4,  col: null },
};

function NodeMarker({ type, frame = "diamond", state = "available", size = 64 }) {
  const t = NODE_BY_ID[type];
  const cfg = STATE_CFG[state] || STATE_CFG.available;
  const col = cfg.col || t.color;
  const isLocked = state === "locked";
  const isCleared = state === "cleared";

  const nodeStyle = {
    "--c": col,
    width: size, height: size,
    color: col,
    filter: cfg.glow ? `drop-shadow(0 0 ${cfg.glow}px ${col})` : "none",
  };

  return (
    <div className={"em-node em-" + state} style={nodeStyle}>
      {state === "active" && <span className="em-pulse" />}
      {state === "active" && <span className="em-here" aria-hidden="true" />}
      <div className="em-art" style={{ opacity: cfg.artOp }}>
        <Frame shape={frame} />
        {!isLocked && (
          <span className="em-glyph"><Glyph name={t.glyph} /></span>
        )}
        {isLocked && (
          <span className="em-glyph em-glyph-lock"><Glyph name="lock" /></span>
        )}
      </div>
      {isCleared && (
        <span className="em-badge em-badge-check"><Glyph name="check" /></span>
      )}
    </div>
  );
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

Object.assign(window, { NODE_TYPES, NODE_BY_ID, Glyph, Frame, NodeMarker, hexToRgba });
