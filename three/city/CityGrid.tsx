'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Public type (page.tsx info panel) ───────────────────────────────────────
export interface BuildingData {
  id:          number;
  name:        string;
  district:    string;
  population:  number;
  energyUsage: number;
  status:      'Online' | 'Maintenance' | 'Offline';
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const PARCEL  = 1.4;   // world units per building slot
const BLOCK   = 4;     // parcels per block side
const STREET  = 1.1;   // street gap between blocks
const NB      = 11;    // blocks per axis  (11×11 = 121 city blocks)
const BSTEP   = BLOCK * PARCEL + STREET; // = 6.7
const HALF    = (NB * BSTEP) / 2;       // ~36.85 — centres grid at origin

// ─── Seeded random (no deps) ──────────────────────────────────────────────────
function sr(s: number): number {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Internal building record ─────────────────────────────────────────────────
interface Bld {
  cx: number; cz: number;
  w:  number; d:  number;
  baseH:  number;
  shaftH: number;
  topH:   number;
  shaftW: number; shaftD: number; // pre-scaled shaft dims
  hasTop:    boolean;
  hasCyan:   boolean;
  hasPurple: boolean;
  data: BuildingData;
}

// ─── District names ───────────────────────────────────────────────────────────
const DN = [
  'Neo Sector','Quantum Hub','Data Nexus','Silicon Ridge','Neon District',
  'Cyber Vale','Pulse Tower','Grid Node','Arc Spire','Flux Terminal',
  'Ionic Core','Vertex Park','Prism Heights','Helix Bay','Zenith Plaza',
  'Aurora Blk','Meridian','Cascade Row','Solaris Ring','Polaris Gate',
];

// ─── Generate city (stable, pure fn) ─────────────────────────────────────────
function generateCity(): Bld[] {
  const out: Bld[] = [];
  let id = 0;

  for (let bx = 0; bx < NB; bx++) {
    for (let bz = 0; bz < NB; bz++) {
      // Normalised distance from city centre (0 = downtown, 1 = edge)
      const dbx = bx - NB * 0.5 + 0.5;
      const dbz = bz - NB * 0.5 + 0.5;
      const r   = Math.sqrt(dbx * dbx + dbz * dbz) / (NB * 0.5);

      for (let px = 0; px < BLOCK; px++) {
        for (let pz = 0; pz < BLOCK; pz++) {
          const seed = bx * 10007 + bz * 1009 + px * 101 + pz * 13;

          // ~18 % of parcels are plazas / gaps
          if (sr(seed * 2.73) < 0.18) continue;

          // World-space building centre
          const cx = -HALF + bx * BSTEP + px * PARCEL + PARCEL * 0.5;
          const cz = -HALF + bz * BSTEP + pz * PARCEL + PARCEL * 0.5;

          // Footprint — slightly smaller than parcel so tiny gap shows
          const w = PARCEL * (0.80 + sr(seed + 1) * 0.16);
          const d = PARCEL * (0.80 + sr(seed + 2) * 0.16);

          // Height profile — downtown centre = mega-towers
          const maxH =
            r < 0.10 ? 24
            : r < 0.22 ? 16
            : r < 0.40 ? 10
            : r < 0.60 ? 5.5
            : 2.8;
          const totalH = maxH * 0.18 + sr(seed + 3) * maxH * 0.82;

          // Compound geometry sections
          const baseH  = Math.min(totalH * 0.12, 0.65);
          const hasTop = totalH > 7 && sr(seed + 4) > 0.38;
          const topH   = hasTop ? 0.5 + sr(seed + 5) * 2.2 : 0;
          const shaftH = totalH - baseH - topH;

          // Shaft is 78 % of base footprint
          const shaftW = w * 0.78;
          const shaftD = d * 0.78;

          const hasCyan   = totalH > 5 && sr(seed + 6) > 0.48;
          const hasPurple = totalH > 6 && sr(seed + 7) > 0.54;

          const energy = Math.round(25 + sr(seed + 8) * 70);
          const roll   = sr(seed + 9);
          const status: BuildingData['status'] =
            roll < 0.06 ? 'Offline' : roll < 0.16 ? 'Maintenance' : 'Online';

          const ni = id % DN.length;
          out.push({
            cx, cz, w, d, baseH, shaftH, topH, shaftW, shaftD,
            hasTop, hasCyan, hasPurple,
            data: {
              id: id++,
              name:        `${DN[ni]} ${String.fromCharCode(65 + (id % 26))}-${(id % 9) + 1}`,
              district:    DN[(ni + 5) % DN.length],
              population:  Math.round(50_000 + sr(seed + 10) * 870_000),
              energyUsage: energy,
              status,
            },
          });
        }
      }
    }
  }
  return out;
}

// ─── Shared dummy Object3D for matrix math ────────────────────────────────────
const DUMMY = new THREE.Object3D();

// ─── Instanced city buildings ─────────────────────────────────────────────────
interface BldProps {
  buildings: Bld[];
  selected:  BuildingData | null;
  onSelect:  (d: BuildingData) => void;
}

function CityBuildings({ buildings, selected, onSelect }: BldProps) {
  const n = buildings.length;

  // InstancedMesh refs
  const baseRef  = useRef<THREE.InstancedMesh>(null!);
  const shaftRef = useRef<THREE.InstancedMesh>(null!);
  const spireRef = useRef<THREE.InstancedMesh>(null!);
  const cyanRef  = useRef<THREE.InstancedMesh>(null!);
  const purpRef  = useRef<THREE.InstancedMesh>(null!);

  // Pre-compute neon strip index lists (only for buildings that have them)
  const { cyanBldIdx, purpBldIdx } = useMemo(() => {
    const cyanBldIdx: number[] = [];
    const purpBldIdx: number[] = [];
    buildings.forEach((b, i) => {
      if (b.hasCyan)   cyanBldIdx.push(i);
      if (b.hasPurple) purpBldIdx.push(i);
    });
    return { cyanBldIdx, purpBldIdx };
  }, [buildings]);

  const nCyan = cyanBldIdx.length;
  const nPurp = purpBldIdx.length;

  // Materials — buildings slightly brighter so they catch neon light visibly
  const baseMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0E0E28', metalness: 0.82, roughness: 0.14 }), []);
  const shaftMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0C0C24', metalness: 0.88, roughness: 0.11 }), []);
  const spireMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0A0A20', metalness: 0.86, roughness: 0.14 }), []);
  const cyanMat  = useMemo(() => new THREE.MeshStandardMaterial({
    color:             '#00f3ff',
    emissive:          new THREE.Color('#00f3ff'),
    emissiveIntensity: 4.5,
    roughness: 0.9, metalness: 0.0, toneMapped: false,
  }), []);
  const purpMat  = useMemo(() => new THREE.MeshStandardMaterial({
    color:             '#b900ff',
    emissive:          new THREE.Color('#b900ff'),
    emissiveIntensity: 4.0,   // balanced to not overpower cyan
    roughness: 0.9, metalness: 0.0, toneMapped: false,
  }), []);

  // ── Build instance matrices ─────────────────────────────────────────────────
  useEffect(() => {
    if (!baseRef.current || !shaftRef.current || !spireRef.current) return;

    buildings.forEach((b, i) => {
      // ── Base: full-width short slab ──
      DUMMY.position.set(b.cx, b.baseH * 0.5, b.cz);
      DUMMY.scale.set(b.w, b.baseH, b.d);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.updateMatrix();
      baseRef.current.setMatrixAt(i, DUMMY.matrix);

      // ── Shaft: narrower tall box ──
      DUMMY.position.set(b.cx, b.baseH + b.shaftH * 0.5, b.cz);
      DUMMY.scale.set(b.shaftW, b.shaftH, b.shaftD);
      DUMMY.updateMatrix();
      shaftRef.current.setMatrixAt(i, DUMMY.matrix);

      // ── Spire / top ──
      if (b.hasTop) {
        // Position the cone so its flat base rests on top of the shaft
        // THREE.ConeGeometry: base at y = -height/2, tip at y = +height/2
        DUMMY.position.set(b.cx, b.baseH + b.shaftH + b.topH * 0.5, b.cz);
        DUMMY.scale.set(b.shaftW * 0.44, b.topH, b.shaftD * 0.44);
        DUMMY.updateMatrix();
      } else {
        // Hide — scale to near-zero
        DUMMY.scale.set(0.001, 0.001, 0.001);
        DUMMY.position.set(b.cx, 0, b.cz);
        DUMMY.updateMatrix();
      }
      spireRef.current.setMatrixAt(i, DUMMY.matrix);
    });

    baseRef.current.instanceMatrix.needsUpdate  = true;
    shaftRef.current.instanceMatrix.needsUpdate = true;
    spireRef.current.instanceMatrix.needsUpdate = true;
  }, [buildings]);

  // ── Neon cyan strips (on +X face of shaft) ─────────────────────────────────
  useEffect(() => {
    if (!cyanRef.current || nCyan === 0) return;
    cyanBldIdx.forEach((bi, j) => {
      const b = buildings[bi];
      DUMMY.position.set(
        b.cx + b.shaftW * 0.5 + 0.02,
        b.baseH + b.shaftH * 0.5,
        b.cz,
      );
      DUMMY.scale.set(0.035, b.shaftH * 0.92, b.shaftD * 0.86);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.updateMatrix();
      cyanRef.current.setMatrixAt(j, DUMMY.matrix);
    });
    cyanRef.current.instanceMatrix.needsUpdate = true;
  }, [buildings, cyanBldIdx, nCyan]);

  // ── Neon purple strips (on +Z face of shaft) ───────────────────────────────
  useEffect(() => {
    if (!purpRef.current || nPurp === 0) return;
    purpBldIdx.forEach((bi, j) => {
      const b = buildings[bi];
      DUMMY.position.set(
        b.cx,
        b.baseH + b.shaftH * 0.5,
        b.cz + b.shaftD * 0.5 + 0.02,
      );
      DUMMY.scale.set(b.shaftW * 0.86, b.shaftH * 0.92, 0.035);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.updateMatrix();
      purpRef.current.setMatrixAt(j, DUMMY.matrix);
    });
    purpRef.current.instanceMatrix.needsUpdate = true;
  }, [buildings, purpBldIdx, nPurp]);

  // ── Click handler — same index in base/shaft → buildings[i] ───────────────
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.instanceId;
    if (id !== undefined && buildings[id]) onSelect(buildings[id].data);
  };

  // ── Selection ring at clicked building's base ──────────────────────────────
  const sel = useMemo(
    () => (selected ? buildings.find(b => b.data.id === selected.id) ?? null : null),
    [selected, buildings],
  );

  return (
    <group>
      {/* ── Base slabs ── */}
      <instancedMesh
        ref={baseRef}
        args={[undefined, undefined, n]}
        onClick={handleClick}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={baseMat} attach="material" />
      </instancedMesh>

      {/* ── Shafts ── */}
      <instancedMesh
        ref={shaftRef}
        args={[undefined, undefined, n]}
        onClick={handleClick}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={shaftMat} attach="material" />
      </instancedMesh>

      {/* ── Spires / tops (cone) ── */}
      <instancedMesh
        ref={spireRef}
        args={[undefined, undefined, n]}
        frustumCulled={false}
      >
        {/* radiusBottom=0.5, height=1, sides=6 — hexagonal spire */}
        <coneGeometry args={[0.5, 1, 6]} />
        <primitive object={spireMat} attach="material" />
      </instancedMesh>

      {/* ── Neon cyan strips ── */}
      {nCyan > 0 && (
        <instancedMesh
          ref={cyanRef}
          args={[undefined, undefined, nCyan]}
          frustumCulled={false}
          raycast={() => null}          // non-interactive
        >
          <boxGeometry args={[1, 1, 1]} />
          <primitive object={cyanMat} attach="material" />
        </instancedMesh>
      )}

      {/* ── Neon purple strips ── */}
      {nPurp > 0 && (
        <instancedMesh
          ref={purpRef}
          args={[undefined, undefined, nPurp]}
          frustumCulled={false}
          raycast={() => null}
        >
          <boxGeometry args={[1, 1, 1]} />
          <primitive object={purpMat} attach="material" />
        </instancedMesh>
      )}

      {/* ── Selection ring ── */}
      {sel && (
        <SelectionRing building={sel} />
      )}
    </group>
  );
}

// ─── Selection ring ───────────────────────────────────────────────────────────
function SelectionRing({ building: b }: { building: Bld }) {
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45 + Math.sin(t * 3.0) * 0.20;
      ringRef.current.rotation.y = t * 0.6;
    }
  });

  const r0 = b.w * 0.65;
  const r1 = b.w * 1.05;

  return (
    <mesh
      ref={ringRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[b.cx, 0.06, b.cz]}
    >
      <ringGeometry args={[r0, r1, 40]} />
      <meshBasicMaterial
        color="#00f3ff"
        transparent opacity={0.45}
        toneMapped={false} depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── Traffic particles ────────────────────────────────────────────────────────
// Streets are the gaps between blocks: N_BLOCKS-1 streets per axis
const STREET_CENTRES = Array.from({ length: NB - 1 }, (_, i) =>
  -HALF + (i + 1) * BSTEP - STREET * 0.5,
);
const PPS  = 28;  // particles per street
const CITY = HALF;

function TrafficParticles() {
  const ref = useRef<THREE.Points>(null!);

  const { posArr, colArr, velArr, ewCount, total } = useMemo(() => {
    const NS = STREET_CENTRES.length; // streets per axis
    const total = NS * PPS * 2 * 2;  // EW streets + NS streets, 2 lanes each

    const posArr = new Float32Array(total * 3);
    const colArr = new Float32Array(total * 3);
    const velArr = new Float32Array(total);

    let p = 0;

    // ── East-West lanes (Z = streetCentre, move in X) ─────────────────────
    for (let s = 0; s < NS; s++) {
      const z = STREET_CENTRES[s];
      for (let lane = 0; lane < 2; lane++) {
        const laneZ = z + (lane === 0 ? 0.22 : -0.22);
        const dir   = lane === 0 ? 1 : -1;
        for (let i = 0; i < PPS; i++) {
          const seed = s * 1000 + lane * 100 + i;
          posArr[p * 3 + 0] = -CITY + sr(seed) * CITY * 2;
          posArr[p * 3 + 1] = 0.18;
          posArr[p * 3 + 2] = laneZ;
          const w = dir > 0;           // white = going right, red = going left
          colArr[p * 3 + 0] = w ? 0.92 : 1.00;
          colArr[p * 3 + 1] = w ? 0.92 : 0.18;
          colArr[p * 3 + 2] = w ? 0.92 : 0.12;
          velArr[p] = dir * (0.045 + sr(seed + 1) * 0.07);
          p++;
        }
      }
    }
    const ewCount = p;

    // ── North-South lanes (X = streetCentre, move in Z) ──────────────────
    for (let s = 0; s < NS; s++) {
      const x = STREET_CENTRES[s];
      for (let lane = 0; lane < 2; lane++) {
        const laneX = x + (lane === 0 ? 0.22 : -0.22);
        const dir   = lane === 0 ? 1 : -1;
        for (let i = 0; i < PPS; i++) {
          const seed = s * 2000 + lane * 100 + i + 50000;
          posArr[p * 3 + 0] = laneX;
          posArr[p * 3 + 1] = 0.18;
          posArr[p * 3 + 2] = -CITY + sr(seed) * CITY * 2;
          const w = dir > 0;
          colArr[p * 3 + 0] = w ? 0.92 : 1.00;
          colArr[p * 3 + 1] = w ? 0.92 : 0.18;
          colArr[p * 3 + 2] = w ? 0.92 : 0.12;
          velArr[p] = dir * (0.045 + sr(seed + 1) * 0.07);
          p++;
        }
      }
    }

    return { posArr, colArr, velArr, ewCount, total: p };
  }, []);

  useFrame(() => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;

    // EW particles — advance X
    for (let i = 0; i < ewCount; i++) {
      pos[i * 3] += velArr[i];
      if (pos[i * 3] >  CITY) pos[i * 3] = -CITY;
      if (pos[i * 3] < -CITY) pos[i * 3] =  CITY;
    }
    // NS particles — advance Z
    for (let i = ewCount; i < total; i++) {
      pos[i * 3 + 2] += velArr[i];
      if (pos[i * 3 + 2] >  CITY) pos[i * 3 + 2] = -CITY;
      if (pos[i * 3 + 2] < -CITY) pos[i * 3 + 2] =  CITY;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute args={[posArr, 3]} attach="attributes-position" />
        <bufferAttribute args={[colArr, 3]} attach="attributes-color"    />
      </bufferGeometry>
      <pointsMaterial
        size={0.09}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        toneMapped={false}
        depthWrite={false}
      />
    </points>
  );
}

// ─── CityGrid (public component) ─────────────────────────────────────────────
interface CityGridProps {
  selected: BuildingData | null;
  onSelect: (d: BuildingData) => void;
}

export function CityGrid({ selected, onSelect }: CityGridProps) {
  const buildings = useMemo(() => generateCity(), []);

  return (
    <group>
      <CityBuildings buildings={buildings} selected={selected} onSelect={onSelect} />
      <TrafficParticles />
    </group>
  );
}
