'use client';

import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { MousePosition } from '@/hooks/useMouseParallax';

type Shape = 'box' | 'cylinder' | 'prism';
interface Building {
  shape: Shape;
  pos: [number, number, number];
  size: [number, number, number];
}

const BUILDINGS: Building[] = [
  { shape: 'box',      pos: [0,    2.9,   0],    size: [0.78, 5.8,  0.78] },
  { shape: 'box',      pos: [0.35, 3.1,  -1.9],  size: [0.50, 6.2,  0.50] },
  { shape: 'box',      pos: [1.75, 2.1,   0.6],  size: [0.65, 4.2,  0.65] },
  { shape: 'box',      pos: [-1.6, 2.0,   0.4],  size: [0.68, 4.0,  0.68] },
  { shape: 'prism',    pos: [-0.3, 2.35,  1.3],  size: [0.42, 4.7,  0.42] },
  { shape: 'cylinder', pos: [-0.85,1.6,  -1.8],  size: [0.34, 3.2,  0.34] },
  { shape: 'box',      pos: [2.9,  1.15, -0.3],  size: [0.60, 2.3,  0.60] },
  { shape: 'box',      pos: [-2.5, 1.2,  -0.8],  size: [0.62, 2.4,  0.62] },
  { shape: 'prism',    pos: [2.4,  1.45, -1.65], size: [0.37, 2.9,  0.37] },
  { shape: 'cylinder', pos: [2.1,  1.15,  1.9],  size: [0.29, 2.3,  0.29] },
  { shape: 'box',      pos: [3.1,  0.65,  1.4],  size: [1.10, 1.3,  0.80] },
  { shape: 'box',      pos: [-2.9, 0.55,  1.5],  size: [0.95, 1.1,  0.95] },
  { shape: 'box',      pos: [0.5,  0.45,  3.4],  size: [0.42, 0.9,  0.42] },
  { shape: 'box',      pos: [-1.9, 0.6,   2.5],  size: [0.48, 1.2,  0.48] },
  { shape: 'cylinder', pos: [3.4,  0.65, -1.4],  size: [0.26, 1.3,  0.26] },
];

// Floor plate tint cycle — cyan / white-blue / violet
const PLATE_COLORS = ['#00EEFF', '#C8E8FF', '#AA44FF', '#C8E8FF'];

// ─── Data connection lines between spires ─────────────────────────────────────
const SPIRE_TOPS: [number, number, number][] = [
  [0,    5.8,   0  ],
  [0.35, 6.2,  -1.9],
  [1.75, 4.2,   0.6],
  [-1.6, 4.0,   0.4],
  [-0.3, 4.7,   1.3],
];
const LINE_PAIRS = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [1, 2], [1, 3], [2, 4], [3, 4],
];

function DataLines() {
  const linesRef = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    linesRef.current?.children.forEach((child, i) => {
      const mat = (child as THREE.Line).material as THREE.LineBasicMaterial;
      if (mat) mat.opacity = 0.10 + Math.sin(t * 0.75 + i * 0.9) * 0.10;
    });
  });
  const lines = useMemo(() =>
    LINE_PAIRS.map(([a, b]) => [SPIRE_TOPS[a], SPIRE_TOPS[b]] as [number, number, number][]),
  []);
  return (
    <group ref={linesRef}>
      {lines.map((pts, i) => (
        <Line key={i} points={pts}
          color={i % 2 === 0 ? '#00EEFF' : '#AA44FF'}
          lineWidth={0.6} transparent opacity={0.15} dashed={false}
        />
      ))}
    </group>
  );
}

// ─── Building with floor plates ────────────────────────────────────────────────
function ForegroundBuilding({ b, idx, mouse }: { b: Building; idx: number; mouse: MousePosition }) {
  const groupRef  = useRef<THREE.Group>(null!);
  const [hovered, setHovered] = useState(false);
  const phase     = idx * 0.73;

  // Evenly-spaced floor plates within the building height
  const floorOffsets = useMemo(() => {
    const count = Math.max(3, Math.floor(b.size[1] / 0.88));
    const step  = b.size[1] / count;
    return Array.from({ length: count - 1 }, (_, f) => -b.size[1] / 2 + (f + 1) * step);
  }, [b.size]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // float — y set in world-group space (parent is +0.8 world Y)
    groupRef.current.position.y = b.pos[1] + Math.sin(t * 0.38 + phase) * 0.10;

    const depth = 1 / (1 + Math.abs(b.pos[2]) * 0.25);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x, mouse.y * -0.09 * depth, 0.05,
    );
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z, mouse.x * -0.07 * depth, 0.05,
    );
    groupRef.current.scale.setScalar(
      THREE.MathUtils.lerp(groupRef.current.scale.x, hovered ? 1.055 : 1.0, 0.09),
    );
  });

  return (
    <group
      ref={groupRef}
      position={[b.pos[0], 0, b.pos[2]]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true);  document.body.style.cursor = 'pointer'; }}
      onPointerOut={()  => {                       setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {/* Frosted glass shell */}
      <mesh>
        {b.shape === 'box'      && <boxGeometry args={b.size} />}
        {b.shape === 'cylinder' && <cylinderGeometry args={[b.size[0], b.size[0] * 0.88, b.size[1], 8]} />}
        {b.shape === 'prism'    && <cylinderGeometry args={[b.size[0] * 0.55, b.size[0], b.size[1], 3]} />}
        <MeshTransmissionMaterial
          backside={false} samples={3} resolution={256}
          transmission={0.78} roughness={0.32}
          clearcoat={1.0} clearcoatRoughness={0.12}
          thickness={1.0} ior={1.45}
          chromaticAberration={0.05}
          color="#E8F2FF"
          attenuationDistance={5} attenuationColor="#C0E8FF"
          envMapIntensity={0.3} temporalDistortion={0.015}
        />
      </mesh>

      {/* Floor plates — glow inside the frosted glass */}
      {floorOffsets.map((yOff, f) => (
        <mesh key={f} position={[0, yOff, 0]}>
          {b.shape === 'box' && (
            <boxGeometry args={[b.size[0] * 1.02, 0.014, b.size[2] * 1.02]} />
          )}
          {b.shape !== 'box' && (
            <cylinderGeometry
              args={[b.size[0] * 1.04, b.size[0] * 1.04, 0.014, b.shape === 'prism' ? 3 : 10]}
            />
          )}
          <meshBasicMaterial
            color={PLATE_COLORS[f % PLATE_COLORS.length]}
            transparent
            opacity={0.24}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
export function GlassBuildings({ mouse }: { mouse: MousePosition }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.010 + Math.sin(t * 0.04) * 0.025;
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x, mouse.y * -0.04, 0.025,
    );
  });

  return (
    <group ref={groupRef} position={[0, 0.8, 0]}>
      {BUILDINGS.map((b, i) => (
        <ForegroundBuilding key={i} b={b} idx={i} mouse={mouse} />
      ))}
      <DataLines />
    </group>
  );
}
