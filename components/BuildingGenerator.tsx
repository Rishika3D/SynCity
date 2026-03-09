'use client';

/**
 * components/BuildingGenerator.tsx
 *
 * Prompt 4 — Grammar-based procedural building placement.
 *
 * ─── Placement Strategy ─────────────────────────────────────────────────────
 *   Primary:  Lot-based placement from CityBlock data (Phase 1 output).
 *             Each BuildingLot carries centre, frontageAngle, and maxFootprint.
 *             The BuildingGrammar selects a rule per lot based on district type.
 *
 *   Fallback: Road-spline walking (original algorithm) when no blocks/lots
 *             are available. Ensures backward compatibility with mock data.
 *
 * ─── Rendering ──────────────────────────────────────────────────────────────
 *   Five THREE.InstancedMesh groups — 5 draw calls for ≤ 12,000 buildings:
 *     ① baseMesh    — wide dark concrete plinth  (all buildings)
 *     ② shaftMesh   — WindowShader: lit windows, spandrel bands, fake AO
 *     ③ wireMesh    — faint cyan wireframe overlay ("blueprint" look)
 *     ④ crownMesh   — spire/antenna/helipad crowns (grammar-selected)
 *     ⑤ (reserved for GreebleLayer — separate component)
 *
 * ─── Window Shader ──────────────────────────────────────────────────────────
 *   Custom GLSL from components/city/WindowShader.ts:
 *     - 4 window bays × floor-counted rows via world-space Y
 *     - Per-window lit/unlit hash with slow flicker
 *     - Emissive × 5.5 → triggers Bloom glow
 *     - Horizontal spandrel bands + vertical corner accents
 *     - Fake AO at building base
 *     - uWetness uniform prepared for Phase 4 rain weather
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame }                   from '@react-three/fiber';
import * as THREE                     from 'three';
import type { RoadWay, LngLat }       from '@/types/osm';
import { RoadType }                   from '@/types/osm';
import type { District }              from '@/types/district';
import { DistrictType, DISTRICT_PROFILES } from '@/types/district';
import type { CityBlock }             from '@/types/block';
import { projectCoords }              from '@/utils/geoProject';
import { findDistrictAt }             from '@/utils/geometry';
import { useTimeOfDay }              from '@/contexts/TimeOfDayContext';
import { useWeather }               from '@/contexts/WeatherContext';
import {
  selectRule,
  computeHeight,
  hashSeed,
  type BuildingRule,
}                                     from './city/BuildingGrammar';
import { createWindowMaterial }       from './city/WindowShader';

// ─── Instance caps ────────────────────────────────────────────────────────────

const MAX_BUILDINGS   = 8_000;   // total building instances across all meshes
const MAX_CROWNS      = 3_000;   // buildings with decorative crowns

// Shared scratch Object3D for matrix computation (never rendered directly)
const DUMMY = new THREE.Object3D();

// ─── Seeded deterministic random ─────────────────────────────────────────────

/** sin-based hash — same seed always returns the same value in [0, 1). */
const sr = (seed: number): number => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43_758.5453;
  return v - Math.floor(v);
};

// ─── Road-type → building category (fallback placement) ────────────────────

type BuildCat = 'commercial' | 'mid' | 'residential';

function roadCat(t: RoadType): BuildCat | null {
  switch (t) {
    case RoadType.Motorway:
    case RoadType.MotorwayLink:
    case RoadType.Trunk:
    case RoadType.Service:
    case RoadType.Footway:
    case RoadType.Cycleway:      return null;
    case RoadType.TrunkLink:
    case RoadType.Primary:
    case RoadType.PrimaryLink:   return 'commercial';
    case RoadType.Secondary:
    case RoadType.Tertiary:      return 'mid';
    default:                     return 'residential';
  }
}

// ─── Style table (fallback — used when no blocks are available) ──────────────

interface BuildStyle {
  spacingM:   number;
  sideM:      number;
  minHM:      number;
  maxHM:      number;
  widthM:     number;
  depthM:     number;
  crownRatio: number;
}

const STYLE: Record<BuildCat, BuildStyle> = {
  commercial:  { spacingM: 60, sideM: 38, minHM: 100, maxHM: 500, widthM: 48, depthM: 36, crownRatio: 0.55 },
  mid:         { spacingM: 42, sideM: 26, minHM:  50, maxHM: 200, widthM: 36, depthM: 28, crownRatio: 0.15 },
  residential: { spacingM: 28, sideM: 18, minHM:  25, maxHM:  90, widthM: 22, depthM: 18, crownRatio: 0.00 },
};

// ─── Building slot record ────────────────────────────────────────────────────

interface BuildSlot {
  x:      number;
  z:      number;
  rotY:   number;
  w:      number;
  d:      number;
  baseH:  number;
  shaftH: number;
  crownH: number;
  rule:   BuildingRule;
  districtType: DistrictType;
}

// ─── Lot-based placement (primary) ───────────────────────────────────────────

function generateSlotsFromLots(
  blocks:       CityBlock[],
  districts:    District[],
  metresToUnit: number,
): BuildSlot[] {
  const slots: BuildSlot[] = [];

  for (const block of blocks) {
    for (const lot of block.lots) {
      if (slots.length >= MAX_BUILDINGS) break;

      // Find district for this lot
      const district = districts.find(d => d.id === lot.districtId)
        ?? districts.find(d => d.id === block.districtId);
      const profile = district?.profile ?? DISTRICT_PROFILES[DistrictType.Mixed];
      const districtType = profile.type;

      // Select grammar rule
      const rule = selectRule(districtType, lot.id);

      // Compute building dimensions from lot + district constraints
      const w = Math.min(lot.maxFootprint.width, 6) * (0.65 + 0.35 * hashSeed(lot.id + '-w'));
      const d = Math.min(lot.maxFootprint.depth,  6) * (0.55 + 0.45 * hashSeed(lot.id + '-d'));

      // Height from district profile
      const totalH = computeHeight(
        profile.minHeight * metresToUnit,
        profile.maxHeight * metresToUnit,
        lot.id,
      );

      if (totalH < 1 || w < 0.5 || d < 0.5) continue;

      // Split height by grammar rule
      const baseH  = totalH * rule.baseHeightRatio;
      const crownH = hashSeed(lot.id + '-crown') < profile.crownProbability
        ? totalH * rule.crownHeightRatio
        : 0;
      const shaftH = totalH - baseH - crownH;

      slots.push({
        x:      lot.centre[0],
        z:      lot.centre[1],
        rotY:   lot.frontageAngle,
        w, d,
        baseH, shaftH, crownH,
        rule,
        districtType,
      });
    }
    if (slots.length >= MAX_BUILDINGS) break;
  }

  return slots;
}

// ─── Road-spline fallback placement ──────────────────────────────────────────

function generateSlotsFromRoads(
  roads:        RoadWay[],
  centre:       LngLat,
  metresToUnit: number,
  districts:    District[],
): BuildSlot[] {
  const slots: BuildSlot[] = [];

  roads.forEach((road, roadIndex) => {
    if (road.coordinates.length < 2) return;
    if (slots.length >= MAX_BUILDINGS) return;

    const cat = roadCat(road.roadType);
    if (!cat) return;

    const style = STYLE[cat];
    const pts3d = projectCoords(road.coordinates, centre, metresToUnit, 0);
    if (pts3d.length < 2) return;

    const curve    = new THREE.CatmullRomCurve3(pts3d, false, 'catmullrom', 0.5);
    const lengthWU = curve.getLength();
    const stepWU   = style.spacingM * metresToUnit;

    if (lengthWU < stepWU) return;

    const numSteps = Math.floor(lengthWU / stepWU);

    for (let i = 0; i <= numSteps; i++) {
      if (slots.length >= MAX_BUILDINGS) break;

      const t    = Math.min(Math.max(i / numSteps, 0.001), 0.999);
      const pt   = curve.getPointAt(t);
      const tan  = curve.getTangentAt(t).normalize();
      const perp = new THREE.Vector3(-tan.z, 0, tan.x);
      const rotY = Math.atan2(perp.x, perp.z);

      const seed = road.osmId * 7.3 + i * 17.3 + roadIndex * 1_000.3;
      const wM   = style.widthM * (0.60 + 0.40 * sr(seed));
      const dM   = style.depthM * (0.50 + 0.50 * sr(seed + 1));
      const hM   = style.minHM  + (style.maxHM - style.minHM) * sr(seed + 2);
      const sideWU = style.sideM * metresToUnit;

      const w = wM * metresToUnit;
      const d = dM * metresToUnit;
      const h = hM * metresToUnit;

      for (const side of [-1, 1] as const) {
        if (slots.length >= MAX_BUILDINGS) break;

        const cx = pt.x + perp.x * side * sideWU;
        const cz = pt.z + perp.z * side * sideWU;

        if (cx * cx + cz * cz > 650 * 650) continue;

        const district = findDistrictAt(cx, cz, districts);
        const profile = district?.profile ?? DISTRICT_PROFILES[DistrictType.Mixed];
        const districtType = profile.type;
        const rule = selectRule(districtType, `road-${road.osmId}-${i}-${side}`);

        const baseH  = h * rule.baseHeightRatio;
        const hasCrown = sr(seed + 3) < profile.crownProbability;
        const crownH   = hasCrown ? h * rule.crownHeightRatio : 0;
        const shaftH   = h - baseH - crownH;

        slots.push({ x: cx, z: cz, rotY, w, d, baseH, shaftH, crownH, rule, districtType });
      }
    }
  });

  return slots;
}

// ─── Matrix + instance colour upload ─────────────────────────────────────────

const TMP_COLOR = new THREE.Color();

function uploadInstances(
  baseMesh:    THREE.InstancedMesh | null,
  shaftMesh:   THREE.InstancedMesh | null,
  wireMesh:    THREE.InstancedMesh | null,
  crownMesh:   THREE.InstancedMesh | null,
  slots:       BuildSlot[],
): void {
  if (!baseMesh || !shaftMesh || !wireMesh || !crownMesh) return;

  let crownIdx = 0;

  for (let i = 0; i < slots.length; i++) {
    const b = slots[i];
    const profile = DISTRICT_PROFILES[b.districtType];

    // ── Plinth ──
    DUMMY.position.set(b.x, b.baseH * 0.5, b.z);
    DUMMY.rotation.set(0, b.rotY, 0);
    DUMMY.scale.set(b.w * (b.rule.baseWidthMult ?? 1.2), b.baseH, b.d * (b.rule.baseWidthMult ?? 1.2));
    DUMMY.updateMatrix();
    baseMesh.setMatrixAt(i, DUMMY.matrix);

    // ── Shaft ──
    const narrow = b.districtType === DistrictType.CBD ? 0.82 : 0.88;
    const sw = b.w * narrow;
    const sd = b.d * narrow;

    // Handle tapered: use average scale (subtle effect at InstancedMesh level)
    let avgScale = 1.0;
    if (b.rule.shaftForm === 'tapered') {
      avgScale = (1.0 + (1.0 - b.rule.taperRatio)) / 2;
    }

    DUMMY.position.set(b.x, b.baseH + b.shaftH * 0.5, b.z);
    DUMMY.rotation.set(0, b.rotY, 0);
    DUMMY.scale.set(sw * avgScale, b.shaftH, sd * avgScale);
    DUMMY.updateMatrix();

    shaftMesh.setMatrixAt(i, DUMMY.matrix);
    wireMesh.setMatrixAt(i, DUMMY.matrix);

    // ── Instance colour: district-driven hue with variation ──
    const variation = sr(b.x * 73.1 + b.z * 131.7);
    TMP_COLOR.setHSL(
      profile.baseHue + (b.rule.hueOffset ?? 0) + variation * 0.06,
      profile.hueSaturation,
      0.025 + variation * 0.015,
    );
    shaftMesh.setColorAt(i, TMP_COLOR);

    // ── Crown ──
    if (b.crownH > 0 && crownIdx < MAX_CROWNS) {
      const crownW = sw * (b.rule.crownWidthMult ?? 0.5);
      const crownD = sd * (b.rule.crownWidthMult ?? 0.5);

      DUMMY.position.set(b.x, b.baseH + b.shaftH + b.crownH * 0.5, b.z);
      DUMMY.rotation.set(0, b.rotY, 0);
      DUMMY.scale.set(crownW, b.crownH, crownD);
      DUMMY.updateMatrix();
      crownMesh.setMatrixAt(crownIdx++, DUMMY.matrix);
    }
  }

  // ── Set render counts ──
  baseMesh.count  = slots.length;
  shaftMesh.count = slots.length;
  wireMesh.count  = slots.length;
  crownMesh.count = crownIdx;

  // ── Mark dirty ──
  baseMesh.instanceMatrix.needsUpdate  = true;
  shaftMesh.instanceMatrix.needsUpdate = true;
  wireMesh.instanceMatrix.needsUpdate  = true;
  crownMesh.instanceMatrix.needsUpdate = true;

  if (shaftMesh.instanceColor) shaftMesh.instanceColor.needsUpdate = true;

  baseMesh.computeBoundingSphere();
  shaftMesh.computeBoundingSphere();
  wireMesh.computeBoundingSphere();
  crownMesh.computeBoundingSphere();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BuildingGeneratorProps {
  roads:        RoadWay[];
  centre:       LngLat;
  metresToUnit: number;
  /** Urban hierarchy data (Prompt 4) — optional for backward compat */
  blocks?:      CityBlock[];
  districts?:   District[];
}

export function BuildingGenerator({
  roads,
  centre,
  metresToUnit,
  blocks,
  districts,
}: BuildingGeneratorProps) {
  const { dayFactor } = useTimeOfDay();
  const { wetness }   = useWeather();

  // ── 1. Placement computation ───────────────────────────────────────────────
  const slots = useMemo(() => {
    const districtList = districts ?? [];

    // Primary: lot-based placement from block subdivision
    if (blocks && blocks.length > 0) {
      return generateSlotsFromLots(blocks, districtList, metresToUnit);
    }
    // Fallback: road-spline walking (backward compat)
    return generateSlotsFromRoads(roads, centre, metresToUnit, districtList);
  }, [roads, centre, metresToUnit, blocks, districts]);

  // ── 2. Shared geometry ─────────────────────────────────────────────────────
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  // ── 3. Materials ───────────────────────────────────────────────────────────

  // Shaft: custom WindowShader with lit windows, AO, spandrel bands
  const windowMat = useMemo(() => createWindowMaterial({
    wallColor:      '#0a0a14',
    windowColor:    '#e8dcc8',
    accentColor:    '#00f3ff',
    floorHeight:    1.8,
    windowLitRatio: 0.72,
    emissiveBoost:  5.5,
    aoHeight:       5.0,
    wallColorDay:   '#7a7e88',
    windowColorDay: '#ffffff',
    accentColorDay: '#8899aa',
  }), []);

  // Night/day colour temps for plinth/crown (lerped in useFrame)
  const plinthColorNight = useMemo(() => new THREE.Color('#05050A'), []);
  const plinthColorDay   = useMemo(() => new THREE.Color('#555560'), []);
  const crownColorNight  = useMemo(() => new THREE.Color('#0a1020'), []);
  const crownColorDay    = useMemo(() => new THREE.Color('#556070'), []);
  const crownEmNight     = useMemo(() => new THREE.Color('#00f3ff'), []);
  const crownEmDay       = useMemo(() => new THREE.Color('#8899aa'), []);
  const wireColorNight   = useMemo(() => new THREE.Color('#00f3ff'), []);
  const wireColorDay     = useMemo(() => new THREE.Color('#aabbcc'), []);
  const tmpColor         = useMemo(() => new THREE.Color(), []);

  // Plinth — dark concrete
  const plinthMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:     '#05050A',
    metalness: 0.6,
    roughness: 0.4,
  }), []);

  // Wireframe overlay — faint blueprint edges
  const wireMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       '#00f3ff',
    wireframe:   true,
    transparent: true,
    opacity:     0.07,
    depthWrite:  false,
  }), []);

  // Crown — emissive accent
  const crownMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:     '#0a1020',
    emissive:  '#00f3ff',
    emissiveIntensity: 0.4,
    metalness: 0.8,
    roughness: 0.2,
  }), []);

  // ── 4. InstancedMesh refs ──────────────────────────────────────────────────
  const baseMeshRef  = useRef<THREE.InstancedMesh>(null);
  const shaftMeshRef = useRef<THREE.InstancedMesh>(null);
  const wireMeshRef  = useRef<THREE.InstancedMesh>(null);
  const crownMeshRef = useRef<THREE.InstancedMesh>(null);

  // ── 5. Upload matrices + instance colours when slots change ────────────────
  useEffect(() => {
    uploadInstances(
      baseMeshRef.current,
      shaftMeshRef.current,
      wireMeshRef.current,
      crownMeshRef.current,
      slots,
    );
  }, [slots]);

  // ── 6. Animate window shader + day/night material lerping ─────────────────
  useFrame(({ clock }) => {
    const f = dayFactor;

    // Pass wetness from weather context to window shader
    windowMat.uniforms.uWetness.value = wetness;

    // Window shader uniforms
    windowMat.uniforms.uTime.value      = clock.getElapsedTime();
    windowMat.uniforms.uDayFactor.value = f;

    // Plinth colour: dark at night, concrete grey during day
    tmpColor.copy(plinthColorNight).lerp(plinthColorDay, f);
    plinthMat.color.copy(tmpColor);
    plinthMat.metalness = THREE.MathUtils.lerp(0.6, 0.3, f);
    plinthMat.roughness = THREE.MathUtils.lerp(0.4, 0.7, f);

    // Crown colour + emissive
    tmpColor.copy(crownColorNight).lerp(crownColorDay, f);
    crownMat.color.copy(tmpColor);
    tmpColor.copy(crownEmNight).lerp(crownEmDay, f);
    crownMat.emissive.copy(tmpColor);
    crownMat.emissiveIntensity = THREE.MathUtils.lerp(0.4, 0.08, f);

    // Wireframe: neon at night, subtle during day
    tmpColor.copy(wireColorNight).lerp(wireColorDay, f);
    wireMat.color.copy(tmpColor);
    wireMat.opacity = THREE.MathUtils.lerp(0.07, 0.02, f);
  });

  // ── 7. Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => () => {
    boxGeo.dispose();
    windowMat.dispose();
    plinthMat.dispose();
    wireMat.dispose();
    crownMat.dispose();
  }, [boxGeo, windowMat, plinthMat, wireMat, crownMat]);

  if (slots.length === 0) return null;

  return (
    <group name="building-generator">

      {/* ── Plinths ── */}
      <instancedMesh
        ref={baseMeshRef}
        args={[boxGeo, plinthMat, MAX_BUILDINGS]}
        frustumCulled={false}
        renderOrder={3}
        castShadow
        receiveShadow
      />

      {/* ── Building shafts — WindowShader with lit windows + AO ── */}
      <instancedMesh
        ref={shaftMeshRef}
        args={[boxGeo, windowMat, MAX_BUILDINGS]}
        frustumCulled={false}
        renderOrder={3}
        castShadow
        receiveShadow
      />

      {/* ── Wireframe overlay ── */}
      <instancedMesh
        ref={wireMeshRef}
        args={[boxGeo, wireMat, MAX_BUILDINGS]}
        frustumCulled={false}
        renderOrder={5}
      />

      {/* ── Crowns / spires ── */}
      <instancedMesh
        ref={crownMeshRef}
        args={[boxGeo, crownMat, MAX_CROWNS]}
        frustumCulled={false}
        renderOrder={4}
      />

    </group>
  );
}
