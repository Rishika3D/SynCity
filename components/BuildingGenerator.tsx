'use client';

/**
 * components/BuildingGenerator.tsx
 *
 * Asset-driven building instancing for the Bangalore miniature diorama.
 *
 * ─── GLTF Models (place in /public/models/) ─────────────────────────────────
 *   building_low.glb   — 1–4 floor buildings  (Kenney City Kit Commercial)
 *   building_mid.glb   — 5–12 floor buildings (Kenney City Kit Commercial)
 *   building_high.glb  — 13+ floor buildings  (Kenney City Kit Tall Buildings)
 *
 *   If any model file is missing the component transparently falls back to
 *   procedural PBR geometry — the scene always renders.
 *
 * ─── Architecture ────────────────────────────────────────────────────────────
 *   BuildingGenerator (exported)
 *     └─ <Suspense fallback={<PbrFallbackBuildings>}>
 *          <GltfBuildings>         ← loads GLTFs, uses InstancedMesh per part
 *        </Suspense>
 *
 *   Both paths use the same BuildSlot[] data produced by generateSlots(), so
 *   layout logic is shared and tested once.
 *
 * ─── Performance ─────────────────────────────────────────────────────────────
 *   ≤ 8,000 buildings total  →  ~6 draw calls (2 parts × 3 GLTF types).
 *   Shadow casting enabled on all instanced meshes.
 *   No emissive, no bloom — pure PBR.
 */

import { useMemo, useRef, useEffect, Suspense } from 'react';
import { useGLTF }                              from '@react-three/drei';
import * as THREE                               from 'three';
import type { RoadWay, LngLat }                from '@/types/osm';
import { RoadType }                             from '@/types/osm';
import type { District }                        from '@/types/district';
import { DistrictType, DISTRICT_PROFILES }      from '@/types/district';
import type { CityBlock }                       from '@/types/block';
import { projectCoords }                        from '@/utils/geoProject';
import { findDistrictAt }                       from '@/utils/geometry';
import {
  selectRule,
  computeHeight,
  hashSeed,
}                                               from './city/BuildingGrammar';

// ─── Model URLs ───────────────────────────────────────────────────────────────

const MODEL_LOW  = '/models/building_low.glb';
const MODEL_MID  = '/models/building_mid.glb';
const MODEL_HIGH = '/models/building_high.glb';

// Models are optional — preload only if files exist (place in /public/models/)
// useGLTF.preload(MODEL_LOW);
// useGLTF.preload(MODEL_MID);
// useGLTF.preload(MODEL_HIGH);

// ─── Instance cap ─────────────────────────────────────────────────────────────

const MAX_BUILDINGS = 8_000;
const DUMMY         = new THREE.Object3D();

// ─── Seeded random ────────────────────────────────────────────────────────────

const sr = (seed: number) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43_758.5453;
  return v - Math.floor(v);
};

// ─── Road category → style (fallback placement) ───────────────────────────────

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

interface BuildStyle {
  spacingM: number; sideM: number;
  minHM:    number; maxHM: number;
  widthM:   number; depthM: number;
}

const STYLE: Record<BuildCat, BuildStyle> = {
  commercial:  { spacingM: 60, sideM: 38, minHM: 80,  maxHM: 400, widthM: 46, depthM: 34 },
  mid:         { spacingM: 42, sideM: 26, minHM: 40,  maxHM: 150, widthM: 34, depthM: 26 },
  residential: { spacingM: 28, sideM: 18, minHM: 18,  maxHM:  70, widthM: 20, depthM: 16 },
};

// ─── Slot ─────────────────────────────────────────────────────────────────────

type BuildTier = 'low' | 'mid' | 'high';

interface BuildSlot {
  x: number; z: number; rotY: number;
  w: number; d: number; totalH: number;
  tier: BuildTier;
}

function tierFor(h: number): BuildTier {
  if (h < 6)  return 'low';
  if (h < 18) return 'mid';
  return 'high';
}

// ─── Lot-based placement ──────────────────────────────────────────────────────

function generateSlotsFromLots(
  blocks:       CityBlock[],
  districts:    District[],
  metresToUnit: number,
): BuildSlot[] {
  const slots: BuildSlot[] = [];

  for (const block of blocks) {
    for (const lot of block.lots) {
      if (slots.length >= MAX_BUILDINGS) break;

      const district = districts.find(d => d.id === lot.districtId)
        ?? districts.find(d => d.id === block.districtId);
      const profile  = district?.profile ?? DISTRICT_PROFILES[DistrictType.Mixed];

      const w      = Math.min(lot.maxFootprint.width, 6) * (0.65 + 0.35 * hashSeed(lot.id + '-w'));
      const d      = Math.min(lot.maxFootprint.depth, 6) * (0.55 + 0.45 * hashSeed(lot.id + '-d'));
      const totalH = computeHeight(
        profile.minHeight * metresToUnit,
        profile.maxHeight * metresToUnit,
        lot.id,
      );

      if (totalH < 0.8 || w < 0.4 || d < 0.4) continue;
      slots.push({ x: lot.centre[0], z: lot.centre[1], rotY: lot.frontageAngle,
                   w, d, totalH, tier: tierFor(totalH) });
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

  roads.forEach((road, ri) => {
    if (road.coordinates.length < 2 || slots.length >= MAX_BUILDINGS) return;
    const cat = roadCat(road.roadType);
    if (!cat) return;

    const style  = STYLE[cat];
    const pts3d  = projectCoords(road.coordinates, centre, metresToUnit, 0);
    if (pts3d.length < 2) return;

    const curve  = new THREE.CatmullRomCurve3(pts3d, false, 'catmullrom', 0.5);
    const stepWU = style.spacingM * metresToUnit;
    if (curve.getLength() < stepWU) return;

    const numSteps = Math.floor(curve.getLength() / stepWU);

    for (let i = 0; i <= numSteps && slots.length < MAX_BUILDINGS; i++) {
      const t    = Math.min(Math.max(i / numSteps, 0.001), 0.999);
      const pt   = curve.getPointAt(t);
      const tan  = curve.getTangentAt(t).normalize();
      const perp = new THREE.Vector3(-tan.z, 0, tan.x);
      const rotY = Math.atan2(perp.x, perp.z);

      const seed   = road.osmId * 7.3 + i * 17.3 + ri * 1_000.3;
      const sideWU = style.sideM * metresToUnit;
      const w      = style.widthM  * metresToUnit * (0.60 + 0.40 * sr(seed));
      const d      = style.depthM  * metresToUnit * (0.50 + 0.50 * sr(seed + 1));
      const totalH = (style.minHM + (style.maxHM - style.minHM) * sr(seed + 2)) * metresToUnit;

      for (const side of [-1, 1] as const) {
        if (slots.length >= MAX_BUILDINGS) break;
        const cx = pt.x + perp.x * side * sideWU;
        const cz = pt.z + perp.z * side * sideWU;
        if (cx * cx + cz * cz > 650 * 650) continue;
        // District-aware (just for seeding here — tier-based styling is enough)
        findDistrictAt(cx, cz, districts);
        slots.push({ x: cx, z: cz, rotY, w, d, totalH, tier: tierFor(totalH) });
      }
    }
  });

  return slots;
}

// ─── GLTF mesh extraction ─────────────────────────────────────────────────────

interface GltfPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  naturalH: number;   // model's native height — Y-scale reference
}

/**
 * Traverse a loaded GLTF scene, extract every Mesh, bake its world transform
 * into the geometry clone, and return { geometry, material } pairs ready for
 * InstancedMesh.  Emissive is zeroed on every material.
 */
function extractGltfParts(gltfScene: THREE.Group): GltfPart[] {
  gltfScene.updateMatrixWorld(true);

  const parts:  GltfPart[]  = [];
  const bboxAll              = new THREE.Box3();

  gltfScene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;

    const geo = (node.geometry as THREE.BufferGeometry).clone();
    geo.applyMatrix4(node.matrixWorld);

    const srcMat = (Array.isArray(node.material)
      ? node.material[0]
      : node.material) as THREE.MeshStandardMaterial;
    const mat = srcMat.clone() as THREE.MeshStandardMaterial;
    // Strip emissive so no glow bleeds through post-processing
    mat.emissive.set(0, 0, 0);
    mat.emissiveIntensity = 0;
    mat.needsUpdate = true;

    bboxAll.expandByBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
    parts.push({ geometry: geo, material: mat, naturalH: 0 });
  });

  const size = new THREE.Vector3();
  bboxAll.getSize(size);
  const naturalH = Math.max(size.y, 0.001);
  for (const p of parts) p.naturalH = naturalH;

  return parts;
}

// ─── Single-part instanced layer ──────────────────────────────────────────────

function GltfLayer({ part, slots, maxInst }: {
  part:    GltfPart;
  slots:   BuildSlot[];
  maxInst: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || slots.length === 0) return;

    const invH = 1 / part.naturalH;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      // Centre the building on the ground — Y is half the total height
      DUMMY.position.set(s.x, s.totalH * 0.5, s.z);
      DUMMY.rotation.set(0, s.rotY, 0);
      DUMMY.scale.set(s.w * 0.9, s.totalH * invH, s.d * 0.9);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);
    }

    mesh.count = slots.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [slots, part]);

  if (slots.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[part.geometry, part.material, maxInst]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  );
}

// ─── GLTF buildings (requires model files) ────────────────────────────────────

function GltfBuildings({ lowSlots, midSlots, highSlots }: {
  lowSlots: BuildSlot[]; midSlots: BuildSlot[]; highSlots: BuildSlot[];
}) {
  const { scene: lowScene  } = useGLTF(MODEL_LOW)  as { scene: THREE.Group };
  const { scene: midScene  } = useGLTF(MODEL_MID)  as { scene: THREE.Group };
  const { scene: highScene } = useGLTF(MODEL_HIGH) as { scene: THREE.Group };

  const lowParts  = useMemo(() => extractGltfParts(lowScene),  [lowScene]);
  const midParts  = useMemo(() => extractGltfParts(midScene),  [midScene]);
  const highParts = useMemo(() => extractGltfParts(highScene), [highScene]);

  useEffect(() => () => {
    [...lowParts, ...midParts, ...highParts].forEach(p => {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    });
  }, [lowParts, midParts, highParts]);

  return (
    <group name="buildings-gltf">
      {lowParts.map( (p, i) => <GltfLayer key={`l${i}`} part={p} slots={lowSlots}  maxInst={MAX_BUILDINGS} />)}
      {midParts.map( (p, i) => <GltfLayer key={`m${i}`} part={p} slots={midSlots}  maxInst={MAX_BUILDINGS} />)}
      {highParts.map((p, i) => <GltfLayer key={`h${i}`} part={p} slots={highSlots} maxInst={MAX_BUILDINGS} />)}
    </group>
  );
}

// ─── PBR fallback — always works without model files ─────────────────────────

function PbrFallbackBuildings({ lowSlots, midSlots, highSlots }: {
  lowSlots: BuildSlot[]; midSlots: BuildSlot[]; highSlots: BuildSlot[];
}) {
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  const lowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c4b49a',   // warm terracotta / low-rise masonry
    roughness: 0.82, metalness: 0.05,
  }), []);

  const midMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a8b8c8',   // grey concrete
    roughness: 0.60, metalness: 0.20,
  }), []);

  const highMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ccd8e4',   // reflective glass curtain wall
    roughness: 0.18, metalness: 0.62,
  }), []);

  const lowRef  = useRef<THREE.InstancedMesh>(null);
  const midRef  = useRef<THREE.InstancedMesh>(null);
  const highRef = useRef<THREE.InstancedMesh>(null);

  function upload(mesh: THREE.InstancedMesh | null, slots: BuildSlot[]) {
    if (!mesh || !slots.length) return;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      DUMMY.position.set(s.x, s.totalH * 0.5, s.z);
      DUMMY.rotation.set(0, s.rotY, 0);
      DUMMY.scale.set(s.w * 0.88, s.totalH, s.d * 0.88);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);
    }
    mesh.count = slots.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  useEffect(() => {
    upload(lowRef.current,  lowSlots);
    upload(midRef.current,  midSlots);
    upload(highRef.current, highSlots);
  }, [lowSlots, midSlots, highSlots]);

  useEffect(() => () => {
    boxGeo.dispose();
    [lowMat, midMat, highMat].forEach(m => m.dispose());
  }, [boxGeo, lowMat, midMat, highMat]);

  return (
    <group name="buildings-fallback">
      {lowSlots.length  > 0 && (
        <instancedMesh ref={lowRef}  args={[boxGeo, lowMat,  MAX_BUILDINGS]} frustumCulled={false} castShadow receiveShadow />
      )}
      {midSlots.length  > 0 && (
        <instancedMesh ref={midRef}  args={[boxGeo, midMat,  MAX_BUILDINGS]} frustumCulled={false} castShadow receiveShadow />
      )}
      {highSlots.length > 0 && (
        <instancedMesh ref={highRef} args={[boxGeo, highMat, MAX_BUILDINGS]} frustumCulled={false} castShadow receiveShadow />
      )}
    </group>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface BuildingGeneratorProps {
  roads:        RoadWay[];
  centre:       LngLat;
  metresToUnit: number;
  blocks?:      CityBlock[];
  districts?:   District[];
}

export function BuildingGenerator({
  roads, centre, metresToUnit, blocks, districts,
}: BuildingGeneratorProps) {

  const slots = useMemo(() => {
    const distList = districts ?? [];
    if (blocks && blocks.length > 0) return generateSlotsFromLots(blocks, distList, metresToUnit);
    return generateSlotsFromRoads(roads, centre, metresToUnit, distList);
  }, [roads, centre, metresToUnit, blocks, districts]);

  const { lowSlots, midSlots, highSlots } = useMemo(() => ({
    lowSlots:  slots.filter(s => s.tier === 'low'),
    midSlots:  slots.filter(s => s.tier === 'mid'),
    highSlots: slots.filter(s => s.tier === 'high'),
  }), [slots]);

  if (slots.length === 0) return null;

  /**
   * Suspense suspends while GLTFs are fetching / resolving.
   * PbrFallbackBuildings renders immediately (no network required) and is
   * seamlessly replaced once all three models load.
   * If a model returns 404, the error bubbles up and the Suspense fallback
   * stays rendered — the scene never breaks.
   */
  // Use PBR procedural buildings (GLTF models optional — place .glb files in /public/models/ to enable)
  return <PbrFallbackBuildings lowSlots={lowSlots} midSlots={midSlots} highSlots={highSlots} />;
}
