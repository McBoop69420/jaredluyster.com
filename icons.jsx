// Wizard class icon library — three style variants per class.
// All icons are pure SVG built from primitive paths/circles/lines.
// Each icon component accepts { size, color }.

// ============================================================
// STYLE A — SIGIL (thin runic line art, glyph-like, no fill)
// ============================================================

const SigilFrame = ({ size, color, children, strokeWidth = 1.25 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none"
    stroke={color} strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="32" cy="32" r="28" opacity="0.35" />
    <circle cx="32" cy="32" r="24" opacity="0.9" />
    {children}
  </svg>
);

const SigilPyromancer = ({ size = 64, color = "#ff6b3d" }) => (
  <SigilFrame size={size} color={color}>
    <path d="M32 18 L40 32 L36 32 L40 44 L32 50 L24 44 L28 32 L24 32 Z" />
    <path d="M32 26 L32 40" opacity="0.5" />
  </SigilFrame>
);

const SigilTidecaller = ({ size = 64, color = "#4aa8ff" }) => (
  <SigilFrame size={size} color={color}>
    <path d="M16 34 Q22 28, 28 34 T40 34 T52 34" />
  </SigilFrame>
);

const SigilStonewarden = ({ size = 64, color = "#d6a44a" }) => (
  <SigilFrame size={size} color={color}>
    <path d="M14 48 L22 36 L27 41 L36 18 L44 32 L48 28 L50 48 Z" />
    <path d="M33 23 L36 18 L40 26 L36 28 Z" opacity="0.55" />
    <path d="M36 18 L34 48 M22 36 L24 48 M48 28 L46 48" opacity="0.35" />
  </SigilFrame>
);

const SigilStormseeker = ({ size = 64, color = "#c69bff" }) => (
  <SigilFrame size={size} color={color}>
    <path d="M34 14 L22 34 L31 34 L28 50 L42 28 L33 28 L36 14 Z" />
    <path d="M14 32 L18 32 M46 32 L50 32" opacity="0.5" />
  </SigilFrame>
);

const SigilFrostweaver = ({ size = 64, color = "#7ad8e8" }) => (
  <SigilFrame size={size} color={color}>
    <path d="M32 14 L32 50 M16.5 23 L47.5 41 M16.5 41 L47.5 23" />
    <path d="M28 18 L32 14 L36 18 M28 46 L32 50 L36 46" />
    <path d="M21 22 L16.5 23 L19 28 M43 22 L47.5 23 L46 28" opacity="0.6" />
    <path d="M46 36 L47.5 41 L43 42 M19 36 L16.5 41 L21 42" opacity="0.6" />
  </SigilFrame>
);

const SigilShadowblade = ({ size = 64, color = "#0d0d0d" }) => {
  const stroke = "#f2f2f2";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none"
      stroke={stroke} strokeWidth={1.25}
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="28" opacity="0.35" />
      <circle cx="32" cy="32" r="24" opacity="0.9" />
      <circle cx="32" cy="32" r="11" fill={color} />
      <path d="M32 21 A11 11 0 0 0 32 43 A8 11 0 0 1 32 21 Z" fill={stroke} stroke="none" opacity="0.9" />
      <path d="M32 11 L32 17 M32 47 L32 53 M11 32 L17 32 M47 32 L53 32" opacity="0.5" />
    </svg>
  );
};

const SigilDawnmage = ({ size = 64, color = "#f0c64a" }) => (
  <SigilFrame size={size} color={color}>
    <circle cx="32" cy="32" r="8" />
    <path d="M32 14 L32 18 M32 46 L32 50 M14 32 L18 32 M46 32 L50 32" />
    <path d="M19 19 L22 22 M42 42 L45 45 M42 22 L45 19 M19 45 L22 42" opacity="0.7" />
    <circle cx="32" cy="32" r="3" fill={color} stroke="none" />
  </SigilFrame>
);

const SigilVerdantmaker = ({ size = 64, color = "#5bd07a" }) => (
  <SigilFrame size={size} color={color}>
    <path d="M22 50 Q 30 38, 44 18" />
    <path d="M22 50 C 16 42, 18 30, 28 24 C 38 22, 46 30, 44 18 C 32 18, 24 28, 22 50 Z" />
    <path d="M28 44 Q 32 38, 38 32" opacity="0.55" />
  </SigilFrame>
);

// ============================================================
// STYLE B — EMBLEM (filled glyph on dark disc, with halo glow)
// ============================================================

const EmblemFrame = ({ size, color, children }) => {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="45%">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="55%" stopColor={color} stopOpacity="0.08" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`d${id}`} cx="50%" cy="35%">
          <stop offset="0%" stopColor="#1a1322" />
          <stop offset="100%" stopColor="#0a0710" />
        </radialGradient>
      </defs>
      <circle cx="36" cy="36" r="34" fill={`url(#g${id})`} />
      <circle cx="36" cy="36" r="26" fill={`url(#d${id})`} stroke={color} strokeOpacity="0.55" strokeWidth="1" />
      <circle cx="36" cy="36" r="22" fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="0.75" />
      <g>{children}</g>
    </svg>
  );
};

const EmblemPyromancer = ({ size = 72, color = "#ff6b3d" }) => (
  <EmblemFrame size={size} color={color}>
    <path d="M36 20 C 42 28, 46 30, 46 38 C 46 46, 41 51, 36 51 C 31 51, 26 46, 26 38 C 26 32, 30 32, 32 26 C 33 30, 34 31, 36 30 Z"
      fill={color} />
    <path d="M36 38 C 38 41, 40 42, 40 45 C 40 48, 38 50, 36 50 C 34 50, 32 48, 32 45 C 32 43, 33 43, 34 41 Z"
      fill="#fff8e8" opacity="0.85" />
  </EmblemFrame>
);

const EmblemTidecaller = ({ size = 72, color = "#4aa8ff" }) => (
  <EmblemFrame size={size} color={color}>
    <path d="M36 20 C 30 30, 24 36, 24 43 C 24 49, 29 53, 36 53 C 43 53, 48 49, 48 43 C 48 36, 42 30, 36 20 Z"
      fill={color} />
  </EmblemFrame>
);

const EmblemStonewarden = ({ size = 72, color = "#d6a44a" }) => (
  <EmblemFrame size={size} color={color}>
    <path d="M18 52 L26 38 L31 43 L40 22 L48 34 L52 30 L54 52 Z" fill={color} />
    <path d="M37 27 L40 22 L44 30 L40 32 Z" fill="#fff" opacity="0.55" />
    <path d="M40 22 L31 43 L26 38 Z" fill="#fff" opacity="0.18" />
    <path d="M40 22 L38 52 M48 34 L46 52 M26 38 L28 52" stroke="#2a1c0a" strokeWidth="1" opacity="0.4" />
  </EmblemFrame>
);

const EmblemStormseeker = ({ size = 72, color = "#c69bff" }) => (
  <EmblemFrame size={size} color={color}>
    <path d="M40 18 L26 38 L34 38 L30 54 L46 32 L38 32 L42 18 Z" fill={color} />
    <path d="M40 18 L26 38 L34 38 L30 54" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.75" fill="none" />
  </EmblemFrame>
);

const EmblemFrostweaver = ({ size = 72, color = "#7ad8e8" }) => (
  <EmblemFrame size={size} color={color}>
    <g stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none">
      <path d="M36 18 L36 54" />
      <path d="M20 27 L52 45" />
      <path d="M20 45 L52 27" />
    </g>
    <g stroke={color} strokeWidth="2" strokeLinecap="round" fill="none">
      <path d="M32 21 L36 18 L40 21" />
      <path d="M32 51 L36 54 L40 51" />
      <path d="M25 26 L20 27 L22 32" />
      <path d="M47 46 L52 45 L50 40" />
      <path d="M50 32 L52 27 L47 26" />
      <path d="M22 40 L20 45 L25 46" />
    </g>
    <circle cx="36" cy="36" r="3" fill={color} />
  </EmblemFrame>
);

const EmblemShadowblade = ({ size = 72, color = "#0d0d0d" }) => {
  const id = React.useId();
  const rim = "#f2f2f2";
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="45%">
          <stop offset="0%" stopColor={rim} stopOpacity="0.3" />
          <stop offset="55%" stopColor={rim} stopOpacity="0.05" />
          <stop offset="100%" stopColor={rim} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`d${id}`} cx="50%" cy="35%">
          <stop offset="0%" stopColor="#1a1322" />
          <stop offset="100%" stopColor="#0a0710" />
        </radialGradient>
      </defs>
      <circle cx="36" cy="36" r="34" fill={`url(#g${id})`} />
      <circle cx="36" cy="36" r="26" fill={`url(#d${id})`} stroke={rim} strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="36" cy="36" r="22" fill="none" stroke={rim} strokeOpacity="0.18" strokeWidth="0.75" />
      <circle cx="36" cy="36" r="13" fill={color} stroke={rim} strokeWidth="1" strokeOpacity="0.7" />
      <path d="M36 23 A13 13 0 0 1 36 49 A9 13 0 0 0 36 23 Z" fill={rim} opacity="0.9" />
      <circle cx="32" cy="32" r="1.5" fill="#000" opacity="0.6" />
    </svg>
  );
};

const EmblemDawnmage = ({ size = 72, color = "#f0c64a" }) => (
  <EmblemFrame size={size} color={color}>
    <g fill={color}>
      <circle cx="36" cy="36" r="9" />
      <path d="M36 18 L34 24 L38 24 Z" />
      <path d="M36 54 L34 48 L38 48 Z" />
      <path d="M18 36 L24 34 L24 38 Z" />
      <path d="M54 36 L48 34 L48 38 Z" />
      <path d="M23 23 L28 26 L26 28 Z" />
      <path d="M49 49 L44 46 L46 44 Z" />
      <path d="M49 23 L44 26 L46 28 Z" />
      <path d="M23 49 L28 46 L26 44 Z" />
    </g>
    <circle cx="36" cy="36" r="4" fill="#fffbe8" />
  </EmblemFrame>
);

const EmblemVerdantmaker = ({ size = 72, color = "#5bd07a" }) => (
  <EmblemFrame size={size} color={color}>
    <path d="M28 56 C 22 46, 20 32, 28 22 C 38 16, 50 22, 52 34 C 52 46, 42 54, 28 56 Z" fill={color} />
    <path d="M28 56 Q 36 42, 50 26" stroke="#1a3a1f" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
  </EmblemFrame>
);

// ============================================================
// STYLE C — RELIC (faceted gem / crest, bold geometric)
// ============================================================

const RelicFrame = ({ size, color, children }) => {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#231828" />
          <stop offset="100%" stopColor="#0c0710" />
        </linearGradient>
      </defs>
      {/* hex crest */}
      <path d="M36 4 L62 18 L62 54 L36 68 L10 54 L10 18 Z"
        fill={`url(#r${id})`} stroke={color} strokeOpacity="0.5" strokeWidth="1" />
      <path d="M36 8 L58 20 L58 52 L36 64 L14 52 L14 20 Z"
        fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="0.75" />
      <g>{children}</g>
    </svg>
  );
};

const RelicPyromancer = ({ size = 72, color = "#ff6b3d" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M36 22 L46 42 L36 50 L26 42 Z" fill={color} />
    <path d="M36 22 L36 50" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.75" />
    <path d="M26 42 L46 42" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.75" />
    <path d="M36 32 L40 42 L36 46 L32 42 Z" fill="#fff" opacity="0.6" />
  </RelicFrame>
);

const RelicTidecaller = ({ size = 72, color = "#4aa8ff" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M36 22 C 30 32, 26 38, 26 44 C 26 49, 30 52, 36 52 C 42 52, 46 49, 46 44 C 46 38, 42 32, 36 22 Z"
      fill={color} />
  </RelicFrame>
);

const RelicStonewarden = ({ size = 72, color = "#d6a44a" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M18 50 L26 38 L31 43 L38 22 L46 34 L50 30 L52 50 Z" fill={color} />
    <path d="M35 26 L38 22 L42 30 L38 32 Z" fill="#fff" opacity="0.6" />
    <path d="M38 22 L31 43 L26 38 Z" fill="#fff" opacity="0.2" />
    <path d="M38 22 L36 50 M46 34 L44 50 M26 38 L28 50" stroke="#3a2810" strokeWidth="0.75" opacity="0.5" />
  </RelicFrame>
);

const RelicStormseeker = ({ size = 72, color = "#c69bff" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M40 20 L24 40 L34 40 L30 54 L48 32 L38 32 L42 20 Z" fill={color} />
    <path d="M40 20 L34 40 L30 54" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.75" fill="none" />
  </RelicFrame>
);

const RelicFrostweaver = ({ size = 72, color = "#7ad8e8" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M36 20 L46 30 L46 42 L36 52 L26 42 L26 30 Z" fill={color} />
    <path d="M36 20 L36 52 M26 30 L46 42 M46 30 L26 42" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.6" />
    <path d="M36 20 L46 30 L26 30 Z" fill="#fff" opacity="0.25" />
  </RelicFrame>
);

const RelicShadowblade = ({ size = 72, color = "#0d0d0d" }) => {
  const id = React.useId();
  const rim = "#f2f2f2";
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#231828" />
          <stop offset="100%" stopColor="#0c0710" />
        </linearGradient>
      </defs>
      <path d="M36 4 L62 18 L62 54 L36 68 L10 54 L10 18 Z"
        fill={`url(#r${id})`} stroke={rim} strokeOpacity="0.6" strokeWidth="1" />
      <path d="M36 8 L58 20 L58 52 L36 64 L14 52 L14 20 Z"
        fill="none" stroke={rim} strokeOpacity="0.18" strokeWidth="0.75" />
      <circle cx="36" cy="36" r="14" fill={color} stroke={rim} strokeWidth="1" strokeOpacity="0.7" />
      <path d="M36 22 A14 14 0 0 1 36 50 A10 14 0 0 0 36 22 Z" fill={rim} opacity="0.95" />
      <circle cx="32" cy="30" r="1.5" fill="#000" opacity="0.7" />
    </svg>
  );
};

const RelicDawnmage = ({ size = 72, color = "#f0c64a" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M36 20 L40 32 L52 36 L40 40 L36 52 L32 40 L20 36 L32 32 Z" fill={color} />
    <circle cx="36" cy="36" r="3.5" fill="#0c0710" />
    <circle cx="36" cy="36" r="2" fill="#fffbe8" />
  </RelicFrame>
);

const RelicVerdantmaker = ({ size = 72, color = "#5bd07a" }) => (
  <RelicFrame size={size} color={color}>
    <path d="M30 20 C 22 28, 18 42, 26 50 C 36 52, 46 44, 46 32 C 44 24, 38 20, 30 20 Z"
      fill={color} />
    <path d="M30 20 Q 34 34, 28 50" stroke="#1a3a1f" strokeWidth="1" fill="none" opacity="0.5" />
    <path d="M30 32 Q 36 32, 40 28 M28 40 Q 34 40, 40 36" stroke="#1a3a1f" strokeWidth="0.75" opacity="0.4" fill="none" />
  </RelicFrame>
);

// ============================================================
// Registry
// ============================================================

const CLASSES = [
  { id: "pyromancer",   name: "Pyromancer",   element: "Fire",   role: "Aggressive DoT",   tagline: "Burn DoT, high damage.",            color: "#ff6633" },
  { id: "tidecaller",   name: "Tidecaller",   element: "Water",  role: "Sustain Healer",   tagline: "Healing, mana gen, control.",       color: "#4488ff" },
  { id: "stonewarden",  name: "Stonewarden",  element: "Rock",   role: "Tank",             tagline: "Max defense, outlasts foes.",       color: "#cc9944" },
  { id: "stormseeker",  name: "Stormseeker",  element: "Arc",    role: "Combo Mage",       tagline: "Fast chains, shock combos.",        color: "#ff9933" },
  { id: "frostweaver",  name: "Frostweaver",  element: "Ice",    role: "Control",          tagline: "Freeze, control.",                  color: "#66ddff" },
  { id: "shadowblade",  name: "Shadowblade",  element: "Shadow", role: "Debuff",           tagline: "Lifesteal, curses, Weak.",          color: "#0d0d0d" },
  { id: "dawnmage",     name: "Dawnmage",     element: "Light",  role: "Support",          tagline: "Shields, heals, cleanses.",         color: "#ffdd00" },
  { id: "verdantmaker", name: "Verdantmaker", element: "Grass",  role: "Scaling DoT",      tagline: "Low base damage, exponential DoT.", color: "#44cc66" },
];

const ICONS = {
  sigil: {
    pyromancer: SigilPyromancer, tidecaller: SigilTidecaller, stonewarden: SigilStonewarden,
    stormseeker: SigilStormseeker, frostweaver: SigilFrostweaver, shadowblade: SigilShadowblade,
    dawnmage: SigilDawnmage, verdantmaker: SigilVerdantmaker,
  },
  emblem: {
    pyromancer: EmblemPyromancer, tidecaller: EmblemTidecaller, stonewarden: EmblemStonewarden,
    stormseeker: EmblemStormseeker, frostweaver: EmblemFrostweaver, shadowblade: EmblemShadowblade,
    dawnmage: EmblemDawnmage, verdantmaker: EmblemVerdantmaker,
  },
  relic: {
    pyromancer: RelicPyromancer, tidecaller: RelicTidecaller, stonewarden: RelicStonewarden,
    stormseeker: RelicStormseeker, frostweaver: RelicFrostweaver, shadowblade: RelicShadowblade,
    dawnmage: RelicDawnmage, verdantmaker: RelicVerdantmaker,
  },
};

Object.assign(window, { CLASSES, ICONS });
