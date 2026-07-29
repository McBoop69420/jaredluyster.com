// marks.jsx — Wizard Battle · element & status glyphs
// Drawn in the class-icon sigil grammar: thin runic line-art inside the
// double-ring frame. Element glyphs are 64px (match class sigils); status
// glyphs are compact 24px marks used in the reference grid. All pure SVG,
// stroke = currentColor so the caller sets the canonical school/status color.
// Exposes ELEMENT_GLYPHS, STATUS_GLYPHS, and a <GlyphTile> renderer on window.

const MarkFrame = ({ size, color, children, sw = 1.25 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="32" cy="32" r="28" opacity="0.35" />
    <circle cx="32" cy="32" r="24" opacity="0.9" />
    {children}
  </svg>
);

// ── Element glyphs (64px sigil frame) ──
const ElFire = ({ size = 64, color = "#ff4422" }) => (
  <MarkFrame size={size} color={color}>
    <path d="M32 16 C 39 24, 43 28, 43 36 C 43 45, 38 51, 32 51 C 26 51, 21 45, 21 36 C 21 29, 26 29, 28 22 C 29 27, 30 28, 32 27 Z" />
    <path d="M32 37 C 34 40, 36 41, 36 44 C 36 47, 34 49, 32 49 C 30 49, 28 47, 28 44 C 28 41, 30 41, 31 39 Z" opacity="0.55" />
  </MarkFrame>
);
const ElWater = ({ size = 64, color = "#2277ff" }) => (
  <MarkFrame size={size} color={color}>
    <path d="M16 33 Q 22 27, 28 33 T 40 33 T 50 33" />
    <path d="M16 41 Q 22 35, 28 41 T 40 41 T 50 41" opacity="0.5" />
  </MarkFrame>
);
const ElRock = ({ size = 64, color = "#a87832" }) => (
  <MarkFrame size={size} color={color}>
    <path d="M14 48 L22 35 L27 41 L36 18 L45 33 L49 28 L51 48 Z" />
    <path d="M33 23 L36 18 L41 27 L36 29 Z" opacity="0.55" />
    <path d="M36 18 L34 48 M22 35 L24 48 M49 28 L47 48" opacity="0.32" />
  </MarkFrame>
);
const ElArc = ({ size = 64, color = "#f97316" }) => (
  <MarkFrame size={size} color={color}>
    <path d="M34 12 L20 35 L31 35 L27 52 L44 27 L33 27 L37 12 Z" />
    <path d="M14 32 L19 32 M45 32 L50 32" opacity="0.5" />
  </MarkFrame>
);
const ElIce = ({ size = 64, color = "#88ddff" }) => (
  <MarkFrame size={size} color={color}>
    <path d="M32 13 L32 51 M16.5 22 L47.5 42 M16.5 42 L47.5 22" />
    <path d="M28 17 L32 13 L36 17 M28 47 L32 51 L36 47" opacity="0.6" />
    <path d="M21 21 L16.5 22 L19 27 M43 21 L47.5 22 L46 27 M46 37 L47.5 42 L43 43 M19 37 L16.5 42 L21 43" opacity="0.6" />
  </MarkFrame>
);
const ElShadow = ({ size = 64, color = "#8c2a5e" }) => (
  <MarkFrame size={size} color={color}>
    <circle cx="32" cy="32" r="11" />
    <path d="M32 21 A11 11 0 0 0 32 43 A8 11 0 0 1 32 21 Z" fill={color} stroke="none" opacity="0.85" />
    <path d="M32 10 L32 16 M32 48 L32 54 M10 32 L16 32 M48 32 L54 32" opacity="0.5" />
  </MarkFrame>
);
const ElLight = ({ size = 64, color = "#ffe234" }) => (
  <MarkFrame size={size} color={color}>
    <circle cx="32" cy="32" r="8" />
    <path d="M32 13 L32 18 M32 46 L32 51 M13 32 L18 32 M46 32 L51 32" />
    <path d="M19 19 L22 22 M42 42 L45 45 M42 22 L45 19 M19 45 L22 42" opacity="0.7" />
    <circle cx="32" cy="32" r="3" fill={color} stroke="none" />
  </MarkFrame>
);
const ElGrass = ({ size = 64, color = "#22c55e" }) => (
  <MarkFrame size={size} color={color}>
    <path d="M22 50 Q 30 38, 45 17" />
    <path d="M22 50 C 16 42, 18 29, 29 23 C 39 21, 47 29, 45 17 C 32 17, 24 28, 22 50 Z" />
    <path d="M28 44 Q 32 38, 39 31" opacity="0.55" />
  </MarkFrame>
);

const ELEMENT_GLYPHS = {
  fire: ElFire, water: ElWater, rock: ElRock, arc: ElArc,
  ice: ElIce, shadow: ElShadow, light: ElLight, grass: ElGrass,
};

// ── Status glyphs (compact 24px marks) ──
function Svg24({ color, children }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const F24 = { fill: "currentColor", stroke: "none" };

const STATUS_GLYPHS = {
  Char: ({ color }) => (
    <Svg24 color={color}><path d="M12 3 C15 7,17 9,17 13 C17 17.5,14.5 20,12 20 C9.5 20,7 17.5,7 13 C7 9,9 9,10 5 C10.5 8,11 8.5,12 8 Z" /></Svg24>
  ),
  Drown: ({ color }) => (
    <Svg24 color={color}><path d="M4 10 Q7 7,10 10 T16 10 T20 10" /><path d="M4 14 Q7 11,10 14 T16 14 T20 14" opacity="0.6" /><path d="M4 18 Q7 15,10 18 T16 18 T20 18" opacity="0.35" /></Svg24>
  ),
  Shock: ({ color }) => (
    <Svg24 color={color}><path d="M13 2 L6 13 L11 13 L9 22 L18 10 L13 10 L15 2 Z" /></Svg24>
  ),
  Root: ({ color }) => (
    <Svg24 color={color}><path d="M12 21 C12 15,7 14,5 10 C9 10,12 12,12 7 C12 12,15 10,19 10 C17 14,12 15,12 21 Z" /></Svg24>
  ),
  Freeze: ({ color }) => (
    <Svg24 color={color}><path d="M12 3 L12 21 M4 7.5 L20 16.5 M4 16.5 L20 7.5" /><path d="M10 5 L12 3 L14 5 M10 19 L12 21 L14 19" opacity="0.7" /></Svg24>
  ),
  Daze: ({ color }) => (
    <Svg24 color={color}><path d="M3 13 Q7 7,12 10 Q17 13,21 9" /><circle cx="6" cy="15.5" r="1" {...F24} /><circle cx="12" cy="16" r="1" {...F24} /><circle cx="18" cy="15" r="1" {...F24} /></Svg24>
  ),
  Blind: ({ color }) => (
    <Svg24 color={color}><path d="M3 12 C6 7,9 5,12 5 C15 5,18 7,21 12 C18 17,15 19,12 19 C9 19,6 17,3 12 Z" /><circle cx="12" cy="12" r="2.6" /><path d="M9.5 9.5 L14.5 14.5" strokeWidth="1.4" /></Svg24>
  ),
  Weak: ({ color }) => (
    <Svg24 color={color}><path d="M5 16 L9 12 L12 14 L19 7" /><path d="M15 7 L19 7 L19 11" /></Svg24>
  ),
  Strength: ({ color }) => (
    <Svg24 color={color}><path d="M12 3 L14 9 L20 9 L15 13 L17 20 L12 16 L7 20 L9 13 L4 9 L10 9 Z" /></Svg24>
  ),
  Lifesteal: ({ color }) => (
    <Svg24 color={color}><path d="M12 20 C12 14,6 12,4 8 C8 8,12 10,12 5 C12 10,16 8,20 8 C18 12,12 14,12 20 Z" /></Svg24>
  ),
};

// Convenience renderer for the reference grid
function GlyphTile({ kind, id, size = 64 }) {
  const map = kind === "element" ? ELEMENT_GLYPHS : STATUS_GLYPHS;
  const C = map[id];
  if (!C) return null;
  return <C size={size} />;
}

Object.assign(window, { ELEMENT_GLYPHS, STATUS_GLYPHS, GlyphTile, MarkFrame });
