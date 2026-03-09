/**
 * components/city/BuildingGrammar.ts
 *
 * Grammar-based building composition system.
 * Pure data module — no React or Three.js dependencies.
 *
 * Grammar:  Building = Base + Shaft + [Setback] + Crown + [Greebles]
 *
 * Each district type maps to a set of weighted rules that determine:
 *   - Base form: plinth width/height ratio
 *   - Shaft form: straight / tapered / stepped-back
 *   - Crown form: flat / spire / antenna / dome / helipad
 *   - Greeble types: AC units, water tanks, antennas
 *
 * The BuildingGenerator calls selectRule() with a district type and
 * a deterministic seed (lot ID hash) to get reproducible building forms.
 */

import { DistrictType } from '@/types/district';

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type ShaftForm = 'straight' | 'tapered' | 'stepped';
export type CrownForm = 'flat' | 'spire' | 'antenna' | 'dome' | 'helipad';
export type GreebleType = 'ac_unit' | 'water_tank' | 'antenna_mast';

// ─── Building Rule ────────────────────────────────────────────────────────────

export interface BuildingRule {
  // ── Base (ground-level podium) ──
  /** Base height as fraction of total height (0.05–0.15) */
  baseHeightRatio:   number;
  /** Base width multiplier relative to shaft (>= 1.0 for podium) */
  baseWidthMult:     number;

  // ── Shaft (main tower body) ──
  shaftForm:         ShaftForm;
  /** For tapered: how much to narrow at top (0–0.4) */
  taperRatio:        number;
  /** For stepped: number of setback levels (2–4) */
  setbackCount:      number;
  /** For stepped: width reduction per step (0.05–0.15) */
  setbackReduction:  number;

  // ── Crown (decorative top) ──
  crownForm:         CrownForm;
  /** Crown height as fraction of total height */
  crownHeightRatio:  number;
  /** Crown width multiplier relative to shaft top (usually <= 1.0) */
  crownWidthMult:    number;

  // ── Greebles ──
  greebleTypes:      GreebleType[];

  // ── Material hints ──
  /** Emissive intensity for windows (higher = more lit) */
  windowEmissive:    number;
  /** Fraction of windows that are lit (0–1) */
  windowLitRatio:    number;
  /** Building base colour hue offset (-0.1 to 0.1) */
  hueOffset:         number;
}

// ─── Default rules per district type ──────────────────────────────────────────

type RuleSet = BuildingRule[];

const CBD_RULES: RuleSet = [
  {
    baseHeightRatio: 0.08, baseWidthMult: 1.3,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'spire', crownHeightRatio: 0.06, crownWidthMult: 0.3,
    greebleTypes: ['antenna_mast'],
    windowEmissive: 5.5, windowLitRatio: 0.85, hueOffset: 0,
  },
  {
    baseHeightRatio: 0.10, baseWidthMult: 1.4,
    shaftForm: 'tapered', taperRatio: 0.15, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.03, crownWidthMult: 1.0,
    greebleTypes: ['antenna_mast', 'ac_unit'],
    windowEmissive: 5.0, windowLitRatio: 0.80, hueOffset: 0.02,
  },
  {
    baseHeightRatio: 0.12, baseWidthMult: 1.5,
    shaftForm: 'stepped', taperRatio: 0, setbackCount: 3, setbackReduction: 0.08,
    crownForm: 'helipad', crownHeightRatio: 0.04, crownWidthMult: 0.7,
    greebleTypes: ['antenna_mast'],
    windowEmissive: 6.0, windowLitRatio: 0.88, hueOffset: -0.02,
  },
];

const TECH_HUB_RULES: RuleSet = [
  {
    baseHeightRatio: 0.10, baseWidthMult: 1.2,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.02, crownWidthMult: 1.0,
    greebleTypes: ['ac_unit', 'water_tank'],
    windowEmissive: 4.5, windowLitRatio: 0.75, hueOffset: 0.04,
  },
  {
    baseHeightRatio: 0.08, baseWidthMult: 1.15,
    shaftForm: 'tapered', taperRatio: 0.10, setbackCount: 0, setbackReduction: 0,
    crownForm: 'antenna', crownHeightRatio: 0.05, crownWidthMult: 0.15,
    greebleTypes: ['ac_unit', 'antenna_mast'],
    windowEmissive: 5.0, windowLitRatio: 0.72, hueOffset: 0,
  },
];

const RESIDENTIAL_RULES: RuleSet = [
  {
    baseHeightRatio: 0.12, baseWidthMult: 1.1,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.02, crownWidthMult: 1.0,
    greebleTypes: ['water_tank', 'ac_unit'],
    windowEmissive: 3.5, windowLitRatio: 0.55, hueOffset: 0.05,
  },
  {
    baseHeightRatio: 0.15, baseWidthMult: 1.05,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.0, crownWidthMult: 1.0,
    greebleTypes: ['water_tank'],
    windowEmissive: 3.0, windowLitRatio: 0.50, hueOffset: 0.08,
  },
];

const GREEN_LUNG_RULES: RuleSet = [
  {
    baseHeightRatio: 0.15, baseWidthMult: 1.05,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.0, crownWidthMult: 1.0,
    greebleTypes: [],
    windowEmissive: 2.5, windowLitRatio: 0.35, hueOffset: 0.10,
  },
];

const INDUSTRIAL_RULES: RuleSet = [
  {
    baseHeightRatio: 0.20, baseWidthMult: 1.3,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.0, crownWidthMult: 1.0,
    greebleTypes: ['ac_unit', 'water_tank', 'antenna_mast'],
    windowEmissive: 2.0, windowLitRatio: 0.25, hueOffset: -0.05,
  },
];

const MIXED_RULES: RuleSet = [
  {
    baseHeightRatio: 0.10, baseWidthMult: 1.2,
    shaftForm: 'straight', taperRatio: 0, setbackCount: 0, setbackReduction: 0,
    crownForm: 'flat', crownHeightRatio: 0.02, crownWidthMult: 1.0,
    greebleTypes: ['ac_unit'],
    windowEmissive: 4.0, windowLitRatio: 0.65, hueOffset: 0.02,
  },
  {
    baseHeightRatio: 0.08, baseWidthMult: 1.3,
    shaftForm: 'tapered', taperRatio: 0.12, setbackCount: 0, setbackReduction: 0,
    crownForm: 'spire', crownHeightRatio: 0.04, crownWidthMult: 0.35,
    greebleTypes: ['antenna_mast'],
    windowEmissive: 5.0, windowLitRatio: 0.70, hueOffset: -0.01,
  },
];

// ─── Grammar table ────────────────────────────────────────────────────────────

export const GRAMMAR_TABLE: Record<DistrictType, RuleSet> = {
  [DistrictType.CBD]:         CBD_RULES,
  [DistrictType.TechHub]:     TECH_HUB_RULES,
  [DistrictType.Residential]: RESIDENTIAL_RULES,
  [DistrictType.GreenLung]:   GREEN_LUNG_RULES,
  [DistrictType.Industrial]:  INDUSTRIAL_RULES,
  [DistrictType.Mixed]:       MIXED_RULES,
};

// ─── Deterministic hash for seeded selection ──────────────────────────────────

/** Simple hash for strings → [0, 1) */
export function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 10000) / 10000;
}

// ─── Rule selection ───────────────────────────────────────────────────────────

/**
 * Select a building grammar rule for a given district type and seed.
 * Deterministic: same district + seed always returns the same rule.
 */
export function selectRule(
  districtType: DistrictType,
  seed: string,
): BuildingRule {
  const rules = GRAMMAR_TABLE[districtType] ?? MIXED_RULES;
  const hash = hashSeed(seed);
  const idx = Math.floor(hash * rules.length);
  return rules[Math.min(idx, rules.length - 1)];
}

/**
 * Compute building height within district constraints.
 * Uses seed for deterministic variation.
 */
export function computeHeight(
  minH: number,
  maxH: number,
  seed: string,
): number {
  const h = hashSeed(seed + '-height');
  // Use a distribution that favours shorter buildings (more realistic)
  // h^0.6 skews toward taller, (1-h^2) skews toward shorter
  const t = h * h; // quadratic distribution — most buildings are shorter
  return minH + t * (maxH - minH);
}
