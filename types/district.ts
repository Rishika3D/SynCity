/**
 * types/district.ts
 *
 * District type system for the urban hierarchy.
 * Districts are top-level spatial regions (CBD, Residential, Tech Hub, etc.)
 * that control building density, height limits, architectural style, and
 * visual accent colours throughout the city.
 *
 * Generated server-side by utils/districtGenerator.ts from road-density
 * analysis + Voronoi tessellation, then serialised into CityData.
 */

// ─── Enumerations ─────────────────────────────────────────────────────────────

export enum DistrictType {
  CBD         = 'cbd',           // Central Business District — tall towers, dense
  TechHub     = 'tech_hub',      // IT corridors — campus-style, mid-rise
  Residential = 'residential',   // Housing areas — low/mid-rise, wider spacing
  GreenLung   = 'green_lung',    // Park-adjacent zones — sparse, low-rise
  Industrial  = 'industrial',    // Warehouses, factories — blocky, wide
  Mixed       = 'mixed',         // Mixed-use / default fallback
}

// ─── District Profile ──────────────────────────────────────────────────────────

/**
 * Controls how buildings are generated within a district.
 * The BuildingGenerator reads this profile to determine height ranges,
 * spacing, crown probability, greeble density, etc.
 */
export interface DistrictProfile {
  type:               DistrictType;

  // ── Height constraints (visual metres, post-exaggeration) ──
  maxHeight:          number;    // tallest allowed building in the district
  minHeight:          number;    // shortest building floor

  // ── Density ──
  density:            number;    // 0–1, affects lot subdivision spacing

  // ── Style ──
  buildingStyle:      'tower' | 'midrise' | 'lowrise' | 'campus';
  crownProbability:   number;    // 0–1, chance a building gets a decorative crown
  greebleProbability: number;    // 0–1, chance of rooftop greebles (AC, tanks, antennas)

  // ── Material / shader ──
  windowLitRatio:     number;    // 0–1, fraction of windows that are lit at night
  neonAccentColor:    string;    // hex colour for neon wireframe / rim accents

  // ── Base hue for instance colours ──
  baseHue:            number;    // 0–1 hue value for HSL building tint
  hueSaturation:      number;    // 0–1 saturation for instance colours
}

// ─── District ──────────────────────────────────────────────────────────────────

/**
 * A spatial region of the city with a consistent urban character.
 * The polygon is in world-space XZ coordinates (post-projection).
 */
export interface District {
  id:        string;
  name:      string;
  profile:   DistrictProfile;
  /** Closed polygon boundary in world-space [x, z] pairs */
  polygon:   [number, number][];
  /** Centroid of the polygon in world-space [x, z] */
  centroid:  [number, number];
}

// ─── Default district profiles ─────────────────────────────────────────────────

export const DISTRICT_PROFILES: Record<DistrictType, DistrictProfile> = {
  [DistrictType.CBD]: {
    type:               DistrictType.CBD,
    maxHeight:          500,
    minHeight:          80,
    density:            0.9,
    buildingStyle:      'tower',
    crownProbability:   0.7,
    greebleProbability: 0.3,
    windowLitRatio:     0.85,
    neonAccentColor:    '#00f3ff',
    baseHue:            0.58,
    hueSaturation:      0.35,
  },
  [DistrictType.TechHub]: {
    type:               DistrictType.TechHub,
    maxHeight:          250,
    minHeight:          40,
    density:            0.65,
    buildingStyle:      'campus',
    crownProbability:   0.4,
    greebleProbability: 0.5,
    windowLitRatio:     0.75,
    neonAccentColor:    '#44ffaa',
    baseHue:            0.48,
    hueSaturation:      0.30,
  },
  [DistrictType.Residential]: {
    type:               DistrictType.Residential,
    maxHeight:          90,
    minHeight:          20,
    density:            0.5,
    buildingStyle:      'lowrise',
    crownProbability:   0.05,
    greebleProbability: 0.7,
    windowLitRatio:     0.60,
    neonAccentColor:    '#aa44ff',
    baseHue:            0.72,
    hueSaturation:      0.25,
  },
  [DistrictType.GreenLung]: {
    type:               DistrictType.GreenLung,
    maxHeight:          45,
    minHeight:          10,
    density:            0.25,
    buildingStyle:      'lowrise',
    crownProbability:   0.02,
    greebleProbability: 0.4,
    windowLitRatio:     0.40,
    neonAccentColor:    '#22ff88',
    baseHue:            0.35,
    hueSaturation:      0.20,
  },
  [DistrictType.Industrial]: {
    type:               DistrictType.Industrial,
    maxHeight:          60,
    minHeight:          15,
    density:            0.55,
    buildingStyle:      'lowrise',
    crownProbability:   0.0,
    greebleProbability: 0.8,
    windowLitRatio:     0.30,
    neonAccentColor:    '#ff8822',
    baseHue:            0.10,
    hueSaturation:      0.20,
  },
  [DistrictType.Mixed]: {
    type:               DistrictType.Mixed,
    maxHeight:          200,
    minHeight:          25,
    density:            0.6,
    buildingStyle:      'midrise',
    crownProbability:   0.25,
    greebleProbability: 0.5,
    windowLitRatio:     0.65,
    neonAccentColor:    '#00f3ff',
    baseHue:            0.60,
    hueSaturation:      0.28,
  },
};
