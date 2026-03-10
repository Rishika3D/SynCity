'use client';

/**
 * components/StreetProps.tsx
 *
 * Street-level detail props instanced along road splines:
 *   • Streetlights   — every ~20 m, alternating sides
 *   • Benches        — every ~45 m on secondary roads
 *   • People         — scattered near benches on pedestrian-friendly roads
 *
 * ─── GLTF Models (place in /public/models/) ─────────────────────────────────
 *   streetlight.glb   e.g. Kenney "City Kit" or poly.pizza search "street lamp"
 *   bench.glb         e.g. poly.pizza search "bench"
 *   person.glb        e.g. poly.pizza search "low poly person"
 *
 *   Falls back to procedural geometry (cylinder pole + box shade) if GLTFs
 *   are absent — the scene always renders.
 *
 * ─── Performance ─────────────────────────────────────────────────────────────
 *   MAX_LIGHTS  = 4,000  ─┐
 *   MAX_BENCHES = 1,500  ─┤ → up to ~9 draw calls for all props
 *   MAX_PEOPLE  = 3,000  ─┘
 *   All use InstancedMesh.  Shadow casting enabled on lights + benches.
 */

import { useMemo, useRef, useEffect, Suspense } from 'react';
import { useGLTF }                              from '@react-three/drei';
import * as THREE                               from 'three';
import type { RoadWay, LngLat }                from '@/types/osm';
import { RoadType }                             from '@/types/osm';
import { projectCoords }                        from '@/utils/geoProject';

// ─── Model URLs ───────────────────────────────────────────────────────────────

const MODEL_LIGHT  = '/models/streetlight.glb';
const MODEL_BENCH  = '/models/bench.glb';
const MODEL_PERSON = '/models/person.glb';

// Models are optional — preload only if files exist (placed in /public/models/)
// useGLTF.preload(MODEL_LIGHT);
// useGLTF.preload(MODEL_BENCH);
// useGLTF.preload(MODEL_PERSON);

// ─── Instance caps ────────────────────────────────────────────────────────────

const MAX_LIGHTS  = 4_000;
const MAX_BENCHES = 1_500;
const MAX_PEOPLE  = 3_000;

const DUMMY = new THREE.Object3D();

// ─── Road filters ─────────────────────────────────────────────────────────────

/** Roads that get streetlights */
function wantsLights(t: RoadType): boolean {
  return ![
    RoadType.Motorway,
    RoadType.MotorwayLink,
    RoadType.Cycleway,
  ].includes(t);
}

/** Roads that get benches + people */
function wantsFurniture(t: RoadType): boolean {
  return [
    RoadType.Secondary,
    RoadType.Tertiary,
    RoadType.Residential,
    RoadType.Footway,
    RoadType.Service,
  ].includes(t);
}

// ─── Seeded random ────────────────────────────────────────────────────────────

const sr = (seed: number) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43_758.5453;
  return v - Math.floor(v);
};

// ─── Prop placement records ───────────────────────────────────────────────────

interface PropInstance {
  x:    number;
  y:    number;
  z:    number;
  rotY: number;
  /** uniform scale factor */
  scale: number;
}

// ─── Placement computation ────────────────────────────────────────────────────

function computeProps(
  roads:        RoadWay[],
  centre:       LngLat,
  metresToUnit: number,
): { lights: PropInstance[]; benches: PropInstance[]; people: PropInstance[] } {
  const lights:  PropInstance[] = [];
  const benches: PropInstance[] = [];
  const people:  PropInstance[] = [];

  const LIGHT_SPACING  = 20 * metresToUnit;
  const BENCH_SPACING  = 45 * metresToUnit;
  const LIGHT_OFFSET   =  5 * metresToUnit;   // distance from road centreline
  const BENCH_OFFSET   =  4 * metresToUnit;

  roads.forEach((road, ri) => {
    if (road.coordinates.length < 2) return;
    if (lights.length >= MAX_LIGHTS) return;

    const pts3d = projectCoords(road.coordinates, centre, metresToUnit, 0);
    if (pts3d.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(pts3d, false, 'catmullrom', 0.5);
    const len   = curve.getLength();

    // ── Streetlights ──────────────────────────────────────────────────────
    if (wantsLights(road.roadType)) {
      const numLights = Math.floor(len / LIGHT_SPACING);

      for (let i = 0; i <= numLights && lights.length < MAX_LIGHTS; i++) {
        const t   = numLights > 0 ? i / numLights : 0;
        const pt  = curve.getPointAt(Math.min(t, 0.999));
        const tan = curve.getTangentAt(Math.min(t, 0.999)).normalize();
        const perp = new THREE.Vector3(-tan.z, 0, tan.x);

        // Alternate sides — left on even steps, right on odd
        const side = i % 2 === 0 ? 1 : -1;
        const px   = pt.x + perp.x * side * LIGHT_OFFSET;
        const pz   = pt.z + perp.z * side * LIGHT_OFFSET;

        if (px * px + pz * pz > 600 * 600) continue;

        lights.push({
          x: px, y: 0, z: pz,
          rotY:  Math.atan2(tan.x, tan.z),
          scale: 1 + sr(ri * 137.3 + i) * 0.15,
        });
      }
    }

    // ── Benches & people ──────────────────────────────────────────────────
    if (wantsFurniture(road.roadType)) {
      const numBenches = Math.floor(len / BENCH_SPACING);

      for (let i = 0; i <= numBenches && benches.length < MAX_BENCHES; i++) {
        const t    = numBenches > 0 ? i / numBenches : 0;
        const seed = ri * 999.7 + i * 73.3;
        const pt   = curve.getPointAt(Math.min(t, 0.999));
        const tan  = curve.getTangentAt(Math.min(t, 0.999)).normalize();
        const perp = new THREE.Vector3(-tan.z, 0, tan.x);

        // Bench always on the right-hand side
        const px = pt.x + perp.x * BENCH_OFFSET;
        const pz = pt.z + perp.z * BENCH_OFFSET;
        if (px * px + pz * pz > 600 * 600) continue;

        benches.push({
          x: px, y: 0, z: pz,
          rotY:  Math.atan2(tan.x, tan.z) + (sr(seed) - 0.5) * 0.3,
          scale: 0.9 + sr(seed + 1) * 0.2,
        });

        // 0–2 people near each bench
        const numP = sr(seed + 2) < 0.4 ? 0 : sr(seed + 2) < 0.75 ? 1 : 2;
        for (let p = 0; p < numP && people.length < MAX_PEOPLE; p++) {
          const jx = (sr(seed + 10 + p) - 0.5) * 1.5 * metresToUnit;
          const jz = (sr(seed + 20 + p) - 0.5) * 1.5 * metresToUnit;
          people.push({
            x:    px + jx,
            y:    0,
            z:    pz + jz,
            rotY: sr(seed + 30 + p) * Math.PI * 2,
            scale: 0.85 + sr(seed + 40 + p) * 0.3,
          });
        }
      }
    }
  });

  return { lights, benches, people };
}

// ─── GLTF part extraction (same helper as BuildingGenerator) ──────────────────

interface GltfPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  naturalH: number;
}

function extractGltfParts(scene: THREE.Group): GltfPart[] {
  scene.updateMatrixWorld(true);
  const parts: GltfPart[] = [];
  const bbox  = new THREE.Box3();

  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geo = (node.geometry as THREE.BufferGeometry).clone();
    geo.applyMatrix4(node.matrixWorld);
    const srcMat = (Array.isArray(node.material)
      ? node.material[0] : node.material) as THREE.MeshStandardMaterial;
    const mat = srcMat.clone() as THREE.MeshStandardMaterial;
    mat.emissive.set(0, 0, 0);
    mat.emissiveIntensity = 0;
    mat.needsUpdate = true;
    bbox.expandByBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
    parts.push({ geometry: geo, material: mat, naturalH: 0 });
  });

  const size = new THREE.Vector3();
  bbox.getSize(size);
  const h = Math.max(size.y, 0.001);
  for (const p of parts) p.naturalH = h;
  return parts;
}

// ─── Generic prop layer ───────────────────────────────────────────────────────

function PropLayer({
  part, instances, maxInst, targetHeight,
}: {
  part:         GltfPart;
  instances:    PropInstance[];
  maxInst:      number;
  targetHeight: number;   // desired world-space height after scaling
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || instances.length === 0) return;

    const invH = 1 / part.naturalH;

    for (let i = 0; i < instances.length; i++) {
      const inst  = instances[i];
      const scale = targetHeight * invH * inst.scale;

      DUMMY.position.set(inst.x, inst.y, inst.z);
      DUMMY.rotation.set(0, inst.rotY, 0);
      DUMMY.scale.setScalar(scale);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);
    }

    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances, part, targetHeight]);

  if (instances.length === 0) return null;

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

// ─── GLTF prop renderer ───────────────────────────────────────────────────────

function GltfStreetProps({
  lights, benches, people, metresToUnit,
}: {
  lights:       PropInstance[];
  benches:      PropInstance[];
  people:       PropInstance[];
  metresToUnit: number;
}) {
  const { scene: lightScene  } = useGLTF(MODEL_LIGHT)  as { scene: THREE.Group };
  const { scene: benchScene  } = useGLTF(MODEL_BENCH)  as { scene: THREE.Group };
  const { scene: personScene } = useGLTF(MODEL_PERSON) as { scene: THREE.Group };

  const lightParts  = useMemo(() => extractGltfParts(lightScene),  [lightScene]);
  const benchParts  = useMemo(() => extractGltfParts(benchScene),  [benchScene]);
  const personParts = useMemo(() => extractGltfParts(personScene), [personScene]);

  useEffect(() => () => {
    [...lightParts, ...benchParts, ...personParts].forEach(p => {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    });
  }, [lightParts, benchParts, personParts]);

  // Target real-world heights mapped to scene units
  const lampH   = 4.5 * metresToUnit;
  const benchH  = 0.8 * metresToUnit;
  const personH = 1.7 * metresToUnit;

  return (
    <group name="street-props-gltf">
      {lightParts.map( (p, i) => <PropLayer key={`l${i}`} part={p} instances={lights}  maxInst={MAX_LIGHTS}  targetHeight={lampH}   />)}
      {benchParts.map( (p, i) => <PropLayer key={`b${i}`} part={p} instances={benches} maxInst={MAX_BENCHES} targetHeight={benchH}  />)}
      {personParts.map((p, i) => <PropLayer key={`p${i}`} part={p} instances={people}  maxInst={MAX_PEOPLE}  targetHeight={personH} />)}
    </group>
  );
}

// ─── Procedural fallback streetlights ────────────────────────────────────────
/**
 * Simple pole + lamp-head made from cylinders.
 * Used automatically when GLTF model files are absent.
 */
function FallbackStreetProps({
  lights, benches, people, metresToUnit,
}: {
  lights:       PropInstance[];
  benches:      PropInstance[];
  people:       PropInstance[];
  metresToUnit: number;
}) {
  // Lamp pole: thin tall cylinder
  const poleGeo  = useMemo(() => new THREE.CylinderGeometry(0.04, 0.05, 1, 6), []);
  const headGeo  = useMemo(() => new THREE.BoxGeometry(0.3, 0.08, 0.15), []);
  const benchGeo = useMemo(() => new THREE.BoxGeometry(1, 0.1, 0.4), []);
  const personGeo = useMemo(() => new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), []);

  const poleMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#606878', roughness: 0.6, metalness: 0.5 }), []);
  const headMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d4c890', roughness: 0.3, metalness: 0.4 }), []);
  const benchMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8b7355', roughness: 0.9, metalness: 0.0 }), []);
  const personMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8a882', roughness: 0.8, metalness: 0.0 }), []);

  const poleRef  = useRef<THREE.InstancedMesh>(null);
  const headRef  = useRef<THREE.InstancedMesh>(null);
  const benchRef = useRef<THREE.InstancedMesh>(null);
  const personRef = useRef<THREE.InstancedMesh>(null);

  const lampH   = 4.5 * metresToUnit;
  const benchH  = 0.8 * metresToUnit;
  const personH = 1.7 * metresToUnit;

  useEffect(() => {
    // Upload poles
    if (poleRef.current && lights.length) {
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        DUMMY.position.set(l.x, lampH * 0.5, l.z);
        DUMMY.rotation.set(0, l.rotY, 0);
        DUMMY.scale.set(1, lampH, 1);
        DUMMY.updateMatrix();
        poleRef.current.setMatrixAt(i, DUMMY.matrix);
      }
      poleRef.current.count = lights.length;
      poleRef.current.instanceMatrix.needsUpdate = true;
      poleRef.current.computeBoundingSphere();
    }

    // Upload lamp heads (mounted at top of pole)
    if (headRef.current && lights.length) {
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        // Arm extends in road direction; head tilts slightly outward
        DUMMY.position.set(
          l.x + Math.sin(l.rotY) * 0.3 * metresToUnit,
          lampH + 0.1 * metresToUnit,
          l.z + Math.cos(l.rotY) * 0.3 * metresToUnit,
        );
        DUMMY.rotation.set(0, l.rotY, 0);
        DUMMY.scale.set(metresToUnit, metresToUnit, metresToUnit);
        DUMMY.updateMatrix();
        headRef.current.setMatrixAt(i, DUMMY.matrix);
      }
      headRef.current.count = lights.length;
      headRef.current.instanceMatrix.needsUpdate = true;
      headRef.current.computeBoundingSphere();
    }

    // Upload benches
    if (benchRef.current && benches.length) {
      for (let i = 0; i < benches.length; i++) {
        const b = benches[i];
        DUMMY.position.set(b.x, benchH * 0.5, b.z);
        DUMMY.rotation.set(0, b.rotY, 0);
        DUMMY.scale.set(benchH * 2, benchH, benchH);
        DUMMY.updateMatrix();
        benchRef.current.setMatrixAt(i, DUMMY.matrix);
      }
      benchRef.current.count = benches.length;
      benchRef.current.instanceMatrix.needsUpdate = true;
      benchRef.current.computeBoundingSphere();
    }

    // Upload people
    if (personRef.current && people.length) {
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        DUMMY.position.set(p.x, personH * 0.5, p.z);
        DUMMY.rotation.set(0, p.rotY, 0);
        DUMMY.scale.setScalar(personH * p.scale);
        DUMMY.updateMatrix();
        personRef.current.setMatrixAt(i, DUMMY.matrix);
      }
      personRef.current.count = people.length;
      personRef.current.instanceMatrix.needsUpdate = true;
      personRef.current.computeBoundingSphere();
    }
  }, [lights, benches, people, lampH, benchH, personH, metresToUnit]);

  useEffect(() => () => {
    [poleGeo, headGeo, benchGeo, personGeo].forEach(g => g.dispose());
    [poleMat, headMat, benchMat, personMat].forEach(m => m.dispose());
  }, [poleGeo, headGeo, benchGeo, personGeo, poleMat, headMat, benchMat, personMat]);

  return (
    <group name="street-props-fallback">
      {lights.length  > 0 && <instancedMesh ref={poleRef}  args={[poleGeo,   poleMat,   MAX_LIGHTS]}  frustumCulled={false} castShadow receiveShadow />}
      {lights.length  > 0 && <instancedMesh ref={headRef}  args={[headGeo,   headMat,   MAX_LIGHTS]}  frustumCulled={false} castShadow />}
      {benches.length > 0 && <instancedMesh ref={benchRef} args={[benchGeo,  benchMat,  MAX_BENCHES]} frustumCulled={false} castShadow receiveShadow />}
      {people.length  > 0 && <instancedMesh ref={personRef} args={[personGeo, personMat, MAX_PEOPLE]}  frustumCulled={false} castShadow />}
    </group>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface StreetPropsProps {
  roads:        RoadWay[];
  centre:       LngLat;
  metresToUnit: number;
}

export function StreetProps({ roads, centre, metresToUnit }: StreetPropsProps) {
  const { lights, benches, people } = useMemo(
    () => computeProps(roads, centre, metresToUnit),
    [roads, centre, metresToUnit],
  );

  if (lights.length === 0 && benches.length === 0) return null;

  const sharedProps = { lights, benches, people, metresToUnit };

  // Use procedural fallback (GLTF models are optional — place .glb files in /public/models/ to enable)
  return <FallbackStreetProps {...sharedProps} />;
}
