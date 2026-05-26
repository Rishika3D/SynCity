// ── Colour palette ──────────────────────────────────────────────────────────
export const COLORS = {
  royalBlue  : '#1E3A8A',
  deepSpace  : '#060B18',
  neonCyan   : '#00EEFF',
  neonAmber  : '#FF7722',
  neonViolet : '#AA44FF',
  neonGreen  : '#00FF88',
  chaos      : '#FF2244',
  calm       : '#00CCFF',
  peach      : '#D4A87A',
} as const;

// ── Scene scroll boundaries ──────────────────────────────────────────────────
export const SCENES = {
  mystery   : { start: 0.00, end: 0.20 },
  formation : { start: 0.20, end: 0.40 },
  present   : { start: 0.40, end: 0.70 },
  future    : { start: 0.70, end: 0.85 },
  neural    : { start: 0.85, end: 1.00 },
} as const;

// ── Camera waypoints [x, y, z] ───────────────────────────────────────────────
export const CAMERA_WAYPOINTS = [
  [0,   12, 28],  // Scene 0 — high aerial, mystery fog
  [0,    8, 18],  // Scene 1 — pulling closer during formation
  [0,    5, 12],  // Scene 2 — city level, data visible
  [4,    3,  8],  // Scene 3 — angled view, simulation
  [0,   10, 18],  // Scene 4 — zoomed out, neural overlay
] as const;

// ── Camera look-at targets ────────────────────────────────────────────────────
export const CAMERA_TARGETS = [
  [0, 0,  0],
  [0, 2,  0],
  [0, 0,  0],
  [2, 0, -2],
  [0, 3,  0],
] as const;

// ── Particle config ───────────────────────────────────────────────────────────
export const PARTICLE_COUNT = 8_000;
export const CITY_GRID      = { cols: 14, rows: 14 };
